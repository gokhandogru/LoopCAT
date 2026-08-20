const assert = require("node:assert/strict");
const path = require("node:path");
const test = require("node:test");
const { pathToFileURL } = require("node:url");

const rootPath = path.resolve(__dirname, "../..");

function loadFactory() {
  return import(pathToFileURL(path.join(rootPath, "src/features/projects/project-dialog-save-controller.js")).href);
}

function createHarness(createProjectDialogSaveController, overrides = {}) {
  const calls = [];
  let currentProject = Object.prototype.hasOwnProperty.call(overrides, "currentProject")
    ? overrides.currentProject
    : {
        id: "project-1",
        name: "Existing project",
        creatorOrigin: "imported",
        domain: "Old domain"
      };
  let projectList = overrides.projectList || [currentProject, { id: "project-2", name: "Other" }].filter(Boolean);
  let connected = overrides.connected ?? true;
  let saveToFolder = overrides.saveToFolder ?? false;
  const settings = overrides.settings || {
    sourceLang: "en",
    targetLang: "tr",
    tmNames: ["Main TM"],
    termBaseNames: ["Main TB"]
  };
  const createdProject = overrides.createdProject || { id: "project-created", name: " Raw project " };
  const options = {
    form: {
      hasValidityCheck() {
        calls.push(["hasValidityCheck"]);
        return overrides.hasValidityCheck ?? true;
      },
      checkValidity() {
        calls.push(["checkValidity"]);
        return overrides.valid ?? true;
      },
      reportValidity() {
        calls.push(["reportValidity"]);
      },
      name() {
        calls.push(["formName"]);
        return overrides.name ?? " Updated project ";
      },
      creator() {
        calls.push(["formCreator"]);
        return overrides.creatorName ?? " Creator ";
      },
      domain() {
        calls.push(["formDomain"]);
        return overrides.domain ?? " Updated domain ";
      },
      saveToFolder() {
        calls.push(["saveToFolder"]);
        return saveToFolder;
      },
      setSaveToFolder(value) {
        calls.push(["setSaveToFolder", value]);
        saveToFolder = value;
      },
      reset() {
        calls.push(["resetForm"]);
        if (overrides.resetError) throw overrides.resetError;
      },
      clearNewTmName() {
        calls.push(["clearNewTmName"]);
      },
      clearNewTermBaseName() {
        calls.push(["clearNewTermBaseName"]);
      },
      close() {
        calls.push(["closeDialog"]);
      }
    },
    mode: {
      get() {
        calls.push(["getMode"]);
        return overrides.mode || "edit";
      }
    },
    resources: {
      collect(project) {
        calls.push(["collectResources", project]);
        if (overrides.collectError) throw overrides.collectError;
        return settings;
      },
      mainTmName() {
        calls.push(["mainTmName"]);
        return overrides.mainTmName || "Main TM";
      },
      tmNames() {
        calls.push(["tmNames"]);
        return overrides.tmNames || ["Main TM", "Reference TM"];
      },
      termBaseNames() {
        calls.push(["termBaseNames"]);
        return overrides.termBaseNames || ["Main TB"];
      }
    },
    session: {
      getProject() {
        calls.push(["getProject"]);
        return currentProject;
      },
      getProjects() {
        calls.push(["getProjects"]);
        return projectList;
      },
      replaceProject(project) {
        calls.push(["replaceProject", project]);
        currentProject = project;
      },
      replaceProjects(projects) {
        calls.push(["replaceProjects", projects]);
        projectList = projects;
      }
    },
    projects: {
      update(project) {
        calls.push(["updateProject", project]);
        if (overrides.updateError) return Promise.reject(overrides.updateError);
        return Promise.resolve(overrides.updatedProject || project);
      },
      create(project) {
        calls.push(["createProject", project]);
        if (overrides.createError) return Promise.reject(overrides.createError);
        return Promise.resolve(createdProject);
      },
      load(selectFirst) {
        calls.push(["loadProjects", selectFirst]);
        if (overrides.loadError) return Promise.reject(overrides.loadError);
        return Promise.resolve();
      },
      open(projectId) {
        calls.push(["openProject", projectId]);
        if (overrides.openError) return Promise.reject(overrides.openError);
        return Promise.resolve();
      }
    },
    creator: {
      remember(name) {
        calls.push(["rememberCreator", name]);
        if (overrides.rememberError) throw overrides.rememberError;
        return String(name).trim();
      }
    },
    language: {
      setSource(value) {
        calls.push(["setSource", value]);
      },
      setTarget(value) {
        calls.push(["setTarget", value]);
      }
    },
    refresh: {
      terms(refreshOptions) {
        calls.push(["refreshTerms", refreshOptions]);
        if (overrides.termsError) return Promise.reject(overrides.termsError);
        return Promise.resolve();
      },
      summaries() {
        calls.push(["refreshSummaries"]);
        if (overrides.summariesError) return Promise.reject(overrides.summariesError);
        return Promise.resolve();
      },
      editorContext() {
        calls.push(["refreshEditorContext"]);
        if (overrides.editorContextError) return Promise.reject(overrides.editorContextError);
        return Promise.resolve();
      }
    },
    presentation: {
      renderAll() {
        calls.push(["renderAll"]);
      },
      renderStorageStatus() {
        calls.push(["renderStorageStatus"]);
      }
    },
    activity: {
      logProject(type, summary, detail) {
        calls.push(["logProjectActivity", type, summary, detail]);
        if (overrides.settingsActivityError) return Promise.reject(overrides.settingsActivityError);
        return Promise.resolve();
      },
      record(event) {
        calls.push(["recordActivity", event]);
        if (overrides.creationActivityError) return Promise.reject(overrides.creationActivityError);
        return Promise.resolve();
      }
    },
    workspace: {
      isSupported() {
        calls.push(["workspaceSupported"]);
        return overrides.workspaceSupported ?? true;
      },
      isConnected() {
        calls.push(["workspaceConnected"]);
        return connected;
      },
      chooseFolder() {
        calls.push(["chooseFolder"]);
        if (overrides.chooseError) return Promise.reject(overrides.chooseError);
        connected = overrides.connectedAfterChoose ?? true;
        return Promise.resolve();
      },
      markDirty(projectId) {
        calls.push(["markDirty", projectId]);
      },
      maybeSaveFromSettings(shouldSave) {
        calls.push(["maybeSaveFromSettings", shouldSave]);
        if (overrides.folderSaveError) return Promise.reject(overrides.folderSaveError);
        return Promise.resolve(overrides.savedToFolder || false);
      }
    },
    status: {
      set(message, statusMode) {
        calls.push(["status", message, statusMode]);
      }
    },
    test: {
      shouldFailSettingsActivity() {
        calls.push(["shouldFailSettingsActivity"]);
        return overrides.simulateSettingsActivityFailure || false;
      },
      shouldFailCreationActivity() {
        calls.push(["shouldFailCreationActivity"]);
        return overrides.simulateCreationActivityFailure || false;
      }
    },
    logger: {
      warn(...args) {
        calls.push(["warn", ...args]);
      }
    }
  };
  return {
    calls,
    controller: createProjectDialogSaveController(options),
    getProject: () => currentProject,
    getProjects: () => projectList,
    getSaveToFolder: () => saveToFolder
  };
}

test("ProjectDialogSaveController preserves invalid form reporting and false return", async () => {
  const { createProjectDialogSaveController } = await loadFactory();
  const harness = createHarness(createProjectDialogSaveController, { valid: false });
  assert.equal(await harness.controller.save(), false);
  assert.deepEqual(harness.calls, [
    ["hasValidityCheck"],
    ["checkValidity"],
    ["reportValidity"],
    ["status", "Complete required project fields.", "dirty"]
  ]);
});

test("ProjectDialogSaveController preserves workspace pre-connect cancellation and failure timing", async () => {
  const { createProjectDialogSaveController } = await loadFactory();
  const abort = Object.assign(new Error("canceled"), { name: "AbortError" });
  const canceled = createHarness(createProjectDialogSaveController, {
    saveToFolder: true,
    connected: false,
    chooseError: abort
  });
  await canceled.controller.save();
  assert.equal(canceled.getSaveToFolder(), false);
  assert.equal(
    canceled.calls.some(([name]) => name === "renderStorageStatus"),
    true
  );
  assert.deepEqual(
    canceled.calls.find(([name]) => name === "maybeSaveFromSettings"),
    ["maybeSaveFromSettings", true]
  );

  const chooseError = new Error("folder failed");
  const failed = createHarness(createProjectDialogSaveController, {
    saveToFolder: true,
    connected: false,
    chooseError
  });
  await assert.rejects(failed.controller.save(), chooseError);
  assert.equal(
    failed.calls.some(([name]) => name === "updateProject"),
    false
  );
});

test("ProjectDialogSaveController edits with exact payload, synchronization, refresh, and activity detail", async () => {
  const { createProjectDialogSaveController } = await loadFactory();
  const existing = {
    id: "project-1",
    name: "Existing",
    creatorOrigin: "imported",
    retained: true
  };
  const harness = createHarness(createProjectDialogSaveController, {
    currentProject: existing,
    projectList: [existing, { id: "project-2", name: "Other" }]
  });
  const result = await harness.controller.save();
  const updateCall = harness.calls.find(([name]) => name === "updateProject");
  assert.deepEqual(updateCall[1], {
    ...existing,
    name: "Updated project",
    creatorName: "Creator",
    creatorOrigin: "imported",
    domain: "Updated domain",
    sourceLang: "en",
    targetLang: "tr",
    tmNames: ["Main TM"],
    termBaseNames: ["Main TB"]
  });
  assert.equal(result, harness.getProject());
  assert.equal(harness.getProjects()[0], harness.getProject());
  assert.deepEqual(
    harness.calls.find(([name]) => name === "refreshTerms"),
    ["refreshTerms", { rerender: true }]
  );
  assert.deepEqual(
    harness.calls.find(([name]) => name === "logProjectActivity"),
    [
      "logProjectActivity",
      "project-settings",
      "Project resource settings updated",
      { mainTmName: "Main TM", creatorName: "Creator", tmCount: 2, termbaseCount: 1 }
    ]
  );
  assert.deepEqual(harness.calls.at(-1), ["getProject"]);
  assert.deepEqual(harness.calls.at(-2), ["status", "Project settings saved", "saved"]);
});

test("ProjectDialogSaveController preserves edit activity warnings and folder-save status suppression", async () => {
  const { createProjectDialogSaveController } = await loadFactory();
  const activityError = new Error("activity failed");
  const warning = createHarness(createProjectDialogSaveController, { settingsActivityError: activityError });
  await warning.controller.save();
  assert.deepEqual(
    warning.calls.find(([name]) => name === "warn"),
    ["warn", "Project settings activity log failed.", activityError]
  );
  assert.equal(warning.calls.filter(([name]) => name === "markDirty").length, 2);
  assert.deepEqual(warning.calls.at(-2), ["status", "Project settings saved; activity log failed", "dirty"]);

  const folder = createHarness(createProjectDialogSaveController, {
    saveToFolder: true,
    savedToFolder: true,
    simulateSettingsActivityFailure: true
  });
  await folder.controller.save();
  assert.equal(
    folder.calls.some(([name]) => name === "logProjectActivity"),
    false
  );
  assert.equal(
    folder.calls.some(([name]) => name === "status"),
    false
  );
});

test("ProjectDialogSaveController preserves completed edit effects before late refresh failure", async () => {
  const { createProjectDialogSaveController } = await loadFactory();
  const summariesError = new Error("summary failed");
  const harness = createHarness(createProjectDialogSaveController, { summariesError });
  await assert.rejects(harness.controller.save(), summariesError);
  assert.equal(
    harness.calls.some(([name]) => name === "replaceProject"),
    true
  );
  assert.equal(
    harness.calls.some(([name]) => name === "replaceProjects"),
    true
  );
  assert.equal(
    harness.calls.some(([name]) => name === "renderAll"),
    false
  );
  assert.equal(
    harness.calls.some(([name]) => name === "closeDialog"),
    false
  );
  assert.equal(
    harness.calls.some(([name]) => name === "markDirty"),
    false
  );
});

test("ProjectDialogSaveController creates with raw fields, reset defaults, navigation, and exact status", async () => {
  const { createProjectDialogSaveController } = await loadFactory();
  const harness = createHarness(createProjectDialogSaveController, {
    mode: "create",
    name: " Raw project ",
    domain: " Raw domain "
  });
  const result = await harness.controller.save();
  assert.deepEqual(
    harness.calls.find(([name]) => name === "collectResources"),
    ["collectResources", null]
  );
  assert.deepEqual(
    harness.calls.find(([name]) => name === "createProject"),
    [
      "createProject",
      {
        name: " Raw project ",
        creatorName: "Creator",
        creatorOrigin: "manual",
        domain: " Raw domain ",
        sourceLang: "en",
        targetLang: "tr",
        tmNames: ["Main TM"],
        termBaseNames: ["Main TB"]
      }
    ]
  );
  assert.equal(result.id, "project-created");
  assert.deepEqual(
    harness.calls.filter(([name]) =>
      [
        "resetForm",
        "setSource",
        "setTarget",
        "clearNewTmName",
        "clearNewTermBaseName",
        "closeDialog",
        "recordActivity",
        "markDirty",
        "loadProjects",
        "openProject",
        "maybeSaveFromSettings",
        "status"
      ].includes(name)
    ),
    [
      ["resetForm"],
      ["setSource", "en"],
      ["setTarget", "tr"],
      ["clearNewTmName"],
      ["clearNewTermBaseName"],
      ["closeDialog"],
      ["recordActivity", { projectId: "project-created", type: "create-project", summary: "Project created" }],
      ["markDirty", "project-created"],
      ["loadProjects", false],
      ["openProject", "project-created"],
      ["maybeSaveFromSettings", false],
      ["status", "Project created", "saved"]
    ]
  );
});

test("ProjectDialogSaveController preserves creation activity warning and folder-save outcome", async () => {
  const { createProjectDialogSaveController } = await loadFactory();
  const activityError = new Error("create activity failed");
  const warning = createHarness(createProjectDialogSaveController, {
    mode: "create",
    creationActivityError: activityError
  });
  await warning.controller.save();
  assert.deepEqual(
    warning.calls.find(([name]) => name === "warn"),
    ["warn", "Project creation activity log failed.", activityError]
  );
  assert.deepEqual(warning.calls.at(-1), ["status", "Project created; activity log failed", "dirty"]);

  const folder = createHarness(createProjectDialogSaveController, {
    mode: "create",
    saveToFolder: true,
    savedToFolder: true,
    simulateCreationActivityFailure: true
  });
  await folder.controller.save();
  assert.equal(
    folder.calls.some(([name]) => name === "recordActivity"),
    false
  );
  assert.equal(
    folder.calls.some(([name]) => name === "status"),
    false
  );
  assert.equal(
    folder.calls.some(([name, projectId]) => name === "markDirty" && projectId === "project-created"),
    true
  );
});

test("ProjectDialogSaveController falls back from edit mode to create when the project is absent", async () => {
  const { createProjectDialogSaveController } = await loadFactory();
  const harness = createHarness(createProjectDialogSaveController, {
    mode: "edit",
    currentProject: null,
    projectList: []
  });
  const result = await harness.controller.save();
  assert.equal(result.id, "project-created");
  assert.deepEqual(
    harness.calls.find(([name]) => name === "collectResources"),
    ["collectResources", null]
  );
  assert.equal(
    harness.calls.some(([name]) => name === "updateProject"),
    false
  );
});

test("ProjectDialogSaveController propagates primary creation failures before reset effects", async () => {
  const { createProjectDialogSaveController } = await loadFactory();
  const createError = new Error("create failed");
  const harness = createHarness(createProjectDialogSaveController, {
    mode: "create",
    createError
  });
  await assert.rejects(harness.controller.save(), createError);
  assert.equal(
    harness.calls.some(([name]) => name === "resetForm"),
    false
  );
  assert.equal(
    harness.calls.some(([name]) => name === "markDirty"),
    false
  );
});

test("ProjectDialogSaveController validates boundaries and exposes an immutable API", async () => {
  const { createProjectDialogSaveController } = await loadFactory();
  const harness = createHarness(createProjectDialogSaveController);
  assert.equal(Object.isFrozen(harness.controller), true);
  harness.controller.extra = true;
  assert.equal(harness.controller.extra, undefined);
  assert.deepEqual(Object.keys(harness.controller), ["save"]);
  assert.throws(
    () => createProjectDialogSaveController({}),
    /ProjectDialogSaveController requires form, mode, resource, session, project, creator, language, refresh, presentation, activity, workspace, status, test, and logger boundaries/
  );
});
