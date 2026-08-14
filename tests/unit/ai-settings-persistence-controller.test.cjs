const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const test = require("node:test");

const root = path.resolve(__dirname, "../..");

function loadFactory() {
  return import(pathToFileURL(path.join(root, "src/features/ai/ai-settings-persistence-controller.js")).href);
}

function createHarness(createAiSettingsPersistenceController, overrides = {}) {
  const originalProject = { id: "p1", aiSettings: { provider: "OpenAI", model: "original" } };
  let project = structuredClone(originalProject);
  let projects = [project, { id: "p2", aiSettings: {} }];
  const calls = [];
  const statuses = [];
  let updateCount = 0;
  const globalForm = {
    enabled: true,
    provider: overrides.provider || "OpenAI",
    model: "new-model",
    sendSourceToAi: true,
    useTmContext: true,
    useTermbaseContext: false,
    styleGuide: "Style"
  };
  const secrets = {
    openAiKey: overrides.openAiKey === undefined ? "openai-key" : overrides.openAiKey,
    rememberOpenAiKey: true,
    localAiKey: overrides.localKey === undefined ? "local-key" : overrides.localKey,
    rememberLocalAiKey: false
  };
  const localSettings = { providerId: "ollama", model: "local-model" };
  const controller = createAiSettingsPersistenceController({
    editorSessionStore: {
      getProject: () => (overrides.noProject ? null : project),
      getProjects: () => projects,
      replaceProject: (value) => {
        calls.push(["replaceProject", value.aiSettings?.model]);
        project = value;
      },
      replaceProjects: (value) => {
        calls.push(["replaceProjects", value.map((item) => item.aiSettings?.model || "")]);
        projects = value;
      }
    },
    forms: {
      readGlobal: () => globalForm,
      readSecrets: () => secrets,
      readLocalSettings: () => localSettings
    },
    settings: {
      normalize: (value) => ({ ...value, normalized: true }),
      projectUpdateFields: (settings, value) => ({
        localProvider: settings.providerId,
        localModel: settings.model,
        projectSeen: value.id
      })
    },
    endpoint: {
      assertAllowed: (settings) => {
        calls.push(["assertAllowed", settings.providerId]);
        if (overrides.endpointError) throw overrides.endpointError;
      }
    },
    provider: { isOpenAi: (settings) => settings.provider === "OpenAI" },
    keys: {
      openAi: {
        snapshot: () => ({ local: "old-openai", session: null }),
        save: (value, remember) => {
          calls.push(["saveOpenAi", value, remember]);
          if (overrides.openAiSaveError) throw overrides.openAiSaveError;
        },
        restore: (snapshot) => calls.push(["restoreOpenAi", snapshot.local]),
        storageLabel: () => "Saved in browser"
      },
      local: {
        snapshot: (settings) => ({ providerId: settings.providerId, local: "old-local" }),
        save: (value, remember, settings) => {
          calls.push(["saveLocal", value, remember, settings.providerId]);
          if (overrides.localSaveError) throw overrides.localSaveError;
        },
        restore: (snapshot) => calls.push(["restoreLocal", snapshot.local]),
        storageLabel: (settings) => `Saved for ${settings.providerId}`
      }
    },
    persistence: {
      updateProject: (value) => {
        updateCount += 1;
        calls.push(["updateProject", updateCount, value.aiSettings?.model]);
        if (updateCount === 1 && overrides.updateError) return Promise.reject(overrides.updateError);
        if (updateCount > 1 && overrides.rollbackError) return Promise.reject(overrides.rollbackError);
        return Promise.resolve(structuredClone(value));
      }
    },
    activity: {
      log: (details) => {
        calls.push(["activity", details]);
        return overrides.activityError ? Promise.reject(overrides.activityError) : Promise.resolve();
      }
    },
    presentation: { renderEditor: () => calls.push(["renderEditor"]) },
    workspace: {
      markDirty: () => calls.push(["markDirty"]),
      markActivityWarningDirty: () => calls.push(["markActivityWarningDirty"]),
      markRollbackDirty: (projectId) => calls.push(["markRollbackDirty", projectId])
    },
    status: { set: (message, mode) => statuses.push([message, mode]) },
    defaults: { model: "default-model" },
    testHooks: {
      beforeSave: () => {
        if (overrides.beforeSaveError) throw overrides.beforeSaveError;
      },
      beforeActivity: () => {
        if (overrides.beforeActivityError) throw overrides.beforeActivityError;
      }
    },
    logger: { warn: (...values) => calls.push(["warn", ...values]) }
  });
  return { calls, controller, originalProject, project: () => project, projects: () => projects, statuses };
}

test("AI settings persistence is inert without a selected project", async () => {
  const { createAiSettingsPersistenceController } = await loadFactory();
  const harness = createHarness(createAiSettingsPersistenceController, { noProject: true });
  assert.equal(await harness.controller.save(), undefined);
  assert.equal(harness.calls.length, 0);
  assert.equal(harness.statuses.length, 0);
});

test("AI settings persistence normalizes forms, saves project and credentials, and logs storage labels", async () => {
  const { createAiSettingsPersistenceController } = await loadFactory();
  const harness = createHarness(createAiSettingsPersistenceController);
  assert.equal(await harness.controller.save(), true);
  assert.equal(harness.project().aiSettings.model, "new-model");
  assert.equal(harness.project().aiSettings.localProvider, "ollama");
  assert.equal(harness.project().aiSettings.projectSeen, "p1");
  assert.equal(harness.projects()[0].aiSettings.model, "new-model");
  assert.ok(harness.calls.some(([name]) => name === "saveOpenAi"));
  assert.ok(harness.calls.some(([name]) => name === "saveLocal"));
  const details = harness.calls.find(([name]) => name === "activity")[1];
  assert.equal(details.keyStorage, "Saved in browser");
  assert.equal(details.localAiKeyStorage, "Saved for ollama");
  assert.deepEqual(harness.statuses.at(-1), ["AI settings saved", "saved"]);
});

test("blank credentials preserve existing keys and non-OpenAI settings suppress OpenAI storage labels", async () => {
  const { createAiSettingsPersistenceController } = await loadFactory();
  const harness = createHarness(createAiSettingsPersistenceController, {
    provider: "Anthropic",
    openAiKey: "",
    localKey: ""
  });
  assert.equal(await harness.controller.save(), true);
  assert.equal(
    harness.calls.some(([name]) => name === "saveOpenAi"),
    false
  );
  assert.equal(
    harness.calls.some(([name]) => name === "saveLocal"),
    false
  );
  const details = harness.calls.find(([name]) => name === "activity")[1];
  assert.equal(details.keyStorage, "Not applicable");
  assert.equal(details.localAiKeyStorage, "Not changed");
});

test("AI settings validation and primary persistence failures restore exact project, list, and key snapshots", async () => {
  const { createAiSettingsPersistenceController } = await loadFactory();
  for (const options of [
    { endpointError: new Error("endpoint blocked") },
    { updateError: new Error("project unavailable") }
  ]) {
    const harness = createHarness(createAiSettingsPersistenceController, options);
    assert.equal(await harness.controller.save(), false);
    assert.deepEqual(harness.project(), harness.originalProject);
    assert.equal(harness.projects()[0].aiSettings.model, "original");
    assert.ok(harness.calls.some(([name]) => name === "restoreOpenAi"));
    assert.ok(harness.calls.some(([name]) => name === "restoreLocal"));
    assert.equal(
      harness.calls.some(([name]) => name === "activity"),
      false
    );
  }
});

test("AI settings credential failure rolls persisted project settings back before restoring keys", async () => {
  const { createAiSettingsPersistenceController } = await loadFactory();
  const harness = createHarness(createAiSettingsPersistenceController, {
    localSaveError: new Error("local key unavailable")
  });
  assert.equal(await harness.controller.save(), false);
  assert.equal(harness.calls.filter(([name]) => name === "updateProject").length, 2);
  assert.deepEqual(harness.project(), harness.originalProject);
  assert.equal(harness.projects()[0].aiSettings.model, "original");
  assert.ok(harness.calls.some(([name]) => name === "restoreOpenAi"));
  assert.ok(harness.calls.some(([name]) => name === "restoreLocal"));
  assert.deepEqual(harness.statuses.at(-1), ["local key unavailable", "dirty"]);
});

test("AI settings rollback-write failure restores memory and marks the original project dirty", async () => {
  const { createAiSettingsPersistenceController } = await loadFactory();
  const harness = createHarness(createAiSettingsPersistenceController, {
    openAiSaveError: new Error("openai key unavailable"),
    rollbackError: new Error("rollback unavailable")
  });
  assert.equal(await harness.controller.save(), false);
  assert.deepEqual(harness.project(), harness.originalProject);
  assert.ok(harness.calls.some(([name]) => name === "warn"));
  assert.ok(harness.calls.some(([name, projectId]) => name === "markRollbackDirty" && projectId === "p1"));
});

test("secondary AI settings activity failure keeps project and keys durable and reports dirty", async () => {
  const { createAiSettingsPersistenceController } = await loadFactory();
  const harness = createHarness(createAiSettingsPersistenceController, {
    activityError: new Error("activity unavailable")
  });
  assert.equal(await harness.controller.save(), true);
  assert.equal(harness.project().aiSettings.model, "new-model");
  assert.ok(harness.calls.some(([name]) => name === "saveOpenAi"));
  assert.ok(harness.calls.some(([name]) => name === "saveLocal"));
  assert.ok(harness.calls.some(([name]) => name === "markActivityWarningDirty"));
  assert.deepEqual(harness.statuses.at(-1), ["AI settings saved; activity log failed", "dirty"]);
});
