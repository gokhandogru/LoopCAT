const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const test = require("node:test");

const root = path.resolve(__dirname, "../..");

function loadFactory() {
  return import(pathToFileURL(path.join(root, "src/features/ai/ai-local-settings-persistence-controller.js")).href);
}

function harness(createController, overrides = {}) {
  const originalProject = {
    id: "project-1",
    name: "Project",
    aiSettings: { enabled: true, provider: "OpenAI", preserved: "yes" }
  };
  let project = overrides.noProject ? null : structuredClone(originalProject);
  let projects = [structuredClone(originalProject), { id: "project-2", aiSettings: { untouched: true } }];
  const localSettings = { providerId: "ollama", baseUrl: "http://localhost:11434", model: "model-a" };
  const calls = [];
  const controller = createController({
    editorSessionStore: {
      getProject: () => project,
      getProjects: () => projects,
      replaceProject: (value) => {
        calls.push(["replaceProject", value]);
        project = value;
      },
      replaceProjects: (value) => {
        calls.push(["replaceProjects", value]);
        projects = value;
      }
    },
    form: {
      readSettings: () => {
        calls.push(["readSettings"]);
        return localSettings;
      }
    },
    settings: {
      normalize: (value) => {
        calls.push(["normalize", value]);
        return { ...value, normalized: true };
      },
      projectUpdateFields: (settings, selectedProject) => {
        calls.push(["projectUpdateFields", settings, selectedProject.id]);
        return { localProvider: settings.providerId, localModel: settings.model };
      }
    },
    endpoint: {
      assertAllowed: (settings) => {
        calls.push(["assertAllowed", settings]);
        if (overrides.endpointError) throw overrides.endpointError;
      }
    },
    localStore: {
      save: (settings) => {
        calls.push(["saveLocal", settings]);
        if (overrides.localSaveError) throw overrides.localSaveError;
      }
    },
    persistence: {
      updateProject: (value) => {
        calls.push(["updateProject", value]);
        if (overrides.updateError) return Promise.reject(overrides.updateError);
        return Promise.resolve(structuredClone(value));
      }
    },
    workspace: { markDirty: () => calls.push(["markDirty"]) },
    status: { set: (...args) => calls.push(["status", ...args]) }
  });
  return {
    calls,
    controller,
    localSettings,
    project: () => project,
    projects: () => projects
  };
}

test("local AI settings persistence requires checked session and effect boundaries", async () => {
  const { createAiLocalSettingsPersistenceController } = await loadFactory();
  assert.throws(() => createAiLocalSettingsPersistenceController({}), /EditorSessionStore boundaries/);
  assert.throws(
    () =>
      createAiLocalSettingsPersistenceController({
        editorSessionStore: {
          getProject() {},
          getProjects() {},
          replaceProject() {},
          replaceProjects() {}
        }
      }),
    /form, settings, endpoint, local-store, persistence, workspace, and status boundaries/
  );
});

test("local AI settings persistence returns form settings without effects when no project is selected", async () => {
  const { createAiLocalSettingsPersistenceController } = await loadFactory();
  const item = harness(createAiLocalSettingsPersistenceController, { noProject: true });

  assert.equal(await item.controller.persist(), item.localSettings);
  assert.deepEqual(item.calls, [["readSettings"]]);
});

test("local AI settings persistence preserves the non-throwing unsaved endpoint rejection", async () => {
  const { createAiLocalSettingsPersistenceController } = await loadFactory();
  const item = harness(createAiLocalSettingsPersistenceController, {
    endpointError: new Error("endpoint blocked")
  });

  assert.equal(await item.controller.persist(), item.localSettings);
  assert.deepEqual(
    item.calls.map(([name]) => name),
    ["readSettings", "assertAllowed"]
  );
  assert.equal(item.project().aiSettings.preserved, "yes");
});

test("local AI settings persistence preserves store, project, list, workspace, and visible status order", async () => {
  const { createAiLocalSettingsPersistenceController } = await loadFactory();
  const item = harness(createAiLocalSettingsPersistenceController);

  assert.equal(await item.controller.persist(), item.localSettings);
  assert.deepEqual(
    item.calls.map(([name]) => name),
    [
      "readSettings",
      "assertAllowed",
      "saveLocal",
      "projectUpdateFields",
      "normalize",
      "updateProject",
      "replaceProject",
      "replaceProjects",
      "markDirty",
      "status"
    ]
  );
  assert.deepEqual(item.project().aiSettings, {
    enabled: true,
    provider: "OpenAI",
    preserved: "yes",
    localProvider: "ollama",
    localModel: "model-a",
    normalized: true
  });
  assert.equal(item.projects()[0], item.project());
  assert.equal(item.projects()[1].aiSettings.untouched, true);
  assert.deepEqual(item.calls.at(-1), ["status", "Local AI settings saved", "saved"]);
});

test("silent local AI settings persistence omits status and propagates downstream failures in order", async () => {
  const { createAiLocalSettingsPersistenceController } = await loadFactory();
  const silent = harness(createAiLocalSettingsPersistenceController);
  assert.equal(await silent.controller.persistSilently(), silent.localSettings);
  assert.equal(
    silent.calls.some(([name]) => name === "status"),
    false
  );

  const updateError = new Error("project unavailable");
  const failed = harness(createAiLocalSettingsPersistenceController, { updateError });
  await assert.rejects(failed.controller.persistSilently(), updateError);
  assert.deepEqual(
    failed.calls.map(([name]) => name),
    ["readSettings", "assertAllowed", "saveLocal", "projectUpdateFields", "normalize", "updateProject"]
  );
  assert.equal(failed.project().aiSettings.preserved, "yes");
});

test("local settings-store failures propagate before project persistence", async () => {
  const { createAiLocalSettingsPersistenceController } = await loadFactory();
  const localSaveError = new Error("local settings unavailable");
  const item = harness(createAiLocalSettingsPersistenceController, { localSaveError });

  await assert.rejects(item.controller.persist(), localSaveError);
  assert.deepEqual(
    item.calls.map(([name]) => name),
    ["readSettings", "assertAllowed", "saveLocal"]
  );
});
