const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const test = require("node:test");

const root = path.resolve(__dirname, "../..");
const moduleAt = (relativePath) => import(pathToFileURL(path.join(root, relativePath)).href);

function fakeElement(properties = {}) {
  const listeners = new Map();
  return Object.assign(
    {
      value: "",
      checked: false,
      open: false,
      textContent: "",
      dataset: {},
      tagName: "DIV",
      addEventListener(type, listener) {
        const values = listeners.get(type) || [];
        values.push(listener);
        listeners.set(type, values);
      },
      removeEventListener(type, listener) {
        listeners.set(
          type,
          (listeners.get(type) || []).filter((value) => value !== listener)
        );
      },
      dispatch(type, event = {}) {
        const dispatched = {
          type,
          target: this,
          preventDefault() {
            this.defaultPrevented = true;
          },
          ...event
        };
        for (const listener of [...(listeners.get(type) || [])]) listener(dispatched);
        return dispatched;
      },
      contains: () => true,
      querySelectorAll: () => []
    },
    properties
  );
}

function projectElements() {
  return {
    dialog: fakeElement(),
    form: fakeElement(),
    title: fakeElement(),
    saveButton: fakeElement(),
    cancelButton: fakeElement({ tagName: "BUTTON" }),
    nameInput: fakeElement({ tagName: "INPUT" }),
    creatorInput: fakeElement({ tagName: "INPUT" }),
    domainInput: fakeElement({ tagName: "INPUT" }),
    sourceLanguageInput: fakeElement({ tagName: "INPUT" }),
    targetLanguageInput: fakeElement({ tagName: "INPUT" }),
    advancedOptions: fakeElement(),
    saveToFolderInput: fakeElement({ tagName: "INPUT" }),
    chooseWorkspaceButton: fakeElement({ tagName: "BUTTON" }),
    tmResourceList: fakeElement(),
    tbResourceList: fakeElement(),
    newTmNameInput: fakeElement({ tagName: "INPUT" }),
    newTermBaseNameInput: fakeElement({ tagName: "INPUT" }),
    frequentPairs: fakeElement(),
    aiSettingsForm: fakeElement(),
    aiOptions: fakeElement(),
    aiPresetSelect: fakeElement({
      focus() {
        this.focused = true;
      }
    })
  };
}

function fakeDialogLifecycle() {
  const definitions = new Map();
  const openCalls = [];
  return {
    definitions,
    openCalls,
    register(definition) {
      definitions.set(definition.id, definition);
      return definition.id;
    },
    async open(id, options) {
      const definition = definitions.get(id);
      openCalls.push({ id, options });
      await definition.beforeOpen?.();
      definition.dialog.open = true;
      await definition.afterOpen?.();
      return true;
    },
    close(id) {
      const definition = definitions.get(id);
      definition.dialog.open = false;
      definition.onClose?.();
      return true;
    }
  };
}

test("ProjectDialogController prepares create mode asynchronously and delegates form save", async () => {
  const { createProjectDialogController } = await moduleAt("src/features/projects/project-dialog-controller.js");
  const elements = projectElements();
  const opener = fakeElement({ tagName: "BUTTON" });
  const dialogLifecycle = fakeDialogLifecycle();
  const calls = [];
  let saves = 0;
  const controller = createProjectDialogController({
    dialogLifecycle,
    elements,
    openers: [{ element: opener, mode: "create" }],
    getActiveElement: () => {
      throw new Error("explicit opener must take precedence");
    },
    refreshResources: () => {
      calls.push("refresh");
      return Promise.resolve();
    },
    suggestedCreatorName: () => Promise.resolve("Local translator"),
    setLanguageValue: (input, value) => {
      input.value = value;
      calls.push(`language:${value}`);
    },
    renderStorageStatus: () => calls.push("storage"),
    renderResourcePickers: (project) => calls.push(["resources", project]),
    renderFrequentPairs: () => calls.push("pairs"),
    save: () => {
      saves += 1;
      return Promise.resolve();
    }
  });
  controller.mount();

  opener.dispatch("click");
  await new Promise((resolve) => {
    setImmediate(resolve);
  });

  assert.equal(controller.getMode(), "create");
  assert.equal(elements.dialog.open, true);
  assert.equal(elements.title.textContent, "New project");
  assert.equal(elements.saveButton.textContent, "Create");
  assert.equal(elements.creatorInput.value, "Local translator");
  assert.equal(elements.nameInput.value, "");
  assert.equal(elements.sourceLanguageInput.value, "en");
  assert.equal(elements.targetLanguageInput.value, "tr");
  assert.equal(elements.advancedOptions.open, false);
  assert.equal(elements.saveToFolderInput.checked, false);
  assert.deepEqual(dialogLifecycle.openCalls[0], {
    id: "project",
    options: { initialFocus: elements.nameInput, returnTarget: opener }
  });
  assert.deepEqual(calls, ["refresh", "language:en", "language:tr", "storage", ["resources", null], "pairs"]);

  const submit = elements.form.dispatch("submit");
  await Promise.resolve();
  assert.equal(submit.defaultPrevented, true);
  assert.equal(saves, 1, "the controller must delegate rather than persist project data itself");
});

test("ProjectDialogController prepares edit mode and opens the requested AI settings context", async () => {
  const { createProjectDialogController } = await moduleAt("src/features/projects/project-dialog-controller.js");
  const elements = projectElements();
  const dialogLifecycle = fakeDialogLifecycle();
  const project = {
    id: "project-1",
    name: "Medical project",
    creatorName: "  Ada  ",
    domain: "Medical",
    sourceLang: "ca",
    targetLang: "tr"
  };
  let renderedProject = null;
  const activeElement = fakeElement({ tagName: "BUTTON" });
  const controller = createProjectDialogController({
    dialogLifecycle,
    elements,
    getProject: () => project,
    refreshResources: () => Promise.resolve(),
    cleanCreatorName: (value) => String(value || "").trim(),
    setLanguageValue: (input, value) => {
      input.value = value;
    },
    renderResourcePickers: (value) => {
      renderedProject = value;
    },
    workspaceSupported: () => true,
    getActiveElement: () => activeElement,
    scheduleFrame: (callback) => callback()
  });

  assert.equal(await controller.open("edit", { focusAi: true }), true);
  assert.equal(controller.isEditing(), true);
  assert.equal(elements.title.textContent, "Project settings");
  assert.equal(elements.saveButton.textContent, "Save settings");
  assert.equal(elements.nameInput.value, "Medical project");
  assert.equal(elements.creatorInput.value, "Ada");
  assert.equal(elements.domainInput.value, "Medical");
  assert.equal(elements.sourceLanguageInput.value, "ca");
  assert.equal(elements.targetLanguageInput.value, "tr");
  assert.equal(elements.advancedOptions.open, true);
  assert.equal(elements.aiOptions.open, true);
  assert.equal(elements.aiPresetSelect.focused, true);
  assert.equal(elements.saveToFolderInput.checked, true);
  assert.equal(renderedProject, project);
  assert.equal(dialogLifecycle.openCalls[0].options.returnTarget, activeElement);
});

test("ProjectDialogController preserves default mode and call-time active return targets", async () => {
  const { createProjectDialogController } = await moduleAt("src/features/projects/project-dialog-controller.js");
  const elements = projectElements();
  const dialogLifecycle = fakeDialogLifecycle();
  const firstActive = fakeElement({ tagName: "BUTTON" });
  const secondActive = fakeElement({ tagName: "BUTTON" });
  const explicit = fakeElement({ tagName: "BUTTON" });
  let activeElement = firstActive;
  let activeReads = 0;
  const controller = createProjectDialogController({
    dialogLifecycle,
    elements,
    getActiveElement: () => {
      activeReads += 1;
      return activeElement;
    }
  });

  assert.equal(await controller.open(), true);
  assert.equal(controller.getMode(), "create");
  assert.equal(dialogLifecycle.openCalls[0].options.returnTarget, firstActive);

  activeElement = secondActive;
  assert.equal(await controller.open("unknown"), true);
  assert.equal(controller.getMode(), "create");
  assert.equal(dialogLifecycle.openCalls[1].options.returnTarget, secondActive);

  assert.equal(await controller.open("edit", { returnTarget: explicit }), true);
  assert.equal(controller.getMode(), "edit");
  assert.equal(dialogLifecycle.openCalls[2].options.returnTarget, explicit);
  assert.equal(activeReads, 2);

  assert.equal(await controller.open("edit", { returnTarget: null }), true);
  assert.equal(dialogLifecycle.openCalls[3].options.returnTarget, null);
  assert.equal(activeReads, 2);
});

test("ProjectDialogController preserves active-target and dialog failure timing", async () => {
  const { createProjectDialogController } = await moduleAt("src/features/projects/project-dialog-controller.js");
  const activeError = new Error("active target failed");
  const activeLifecycle = fakeDialogLifecycle();
  let activeReported = false;
  const activeFailure = createProjectDialogController({
    dialogLifecycle: activeLifecycle,
    elements: projectElements(),
    getActiveElement: () => {
      throw activeError;
    },
    onError: () => {
      activeReported = true;
    }
  });
  await assert.rejects(activeFailure.open(), activeError);
  assert.equal(activeLifecycle.openCalls.length, 0);
  assert.equal(activeReported, false);

  const dialogError = new Error("dialog failed");
  const dialogLifecycle = fakeDialogLifecycle();
  dialogLifecycle.open = () => Promise.reject(dialogError);
  const reports = [];
  const dialogFailure = createProjectDialogController({
    dialogLifecycle,
    elements: projectElements(),
    getActiveElement: () => null,
    onError: (error, context) => reports.push([error, context])
  });
  assert.equal(await dialogFailure.open(), false);
  assert.deepEqual(reports, [[dialogError, { phase: "open" }]]);
});

test("ProjectDialogController owns delegated language, resource, workspace, and Enter-key events", async () => {
  const { createProjectDialogController } = await moduleAt("src/features/projects/project-dialog-controller.js");
  const elements = projectElements();
  const dialogLifecycle = fakeDialogLifecycle();
  const checkbox = fakeElement({ checked: false, dataset: { resourceType: "tm", resourceName: "Main TM" } });
  const radio = fakeElement({ checked: true, dataset: { mainTm: "Main TM" } });
  elements.tmResourceList.querySelectorAll = (selector) => (selector.includes("main-tm") ? [radio] : [checkbox]);
  const languageValues = [];
  let normalizations = 0;
  let workspaceChoices = 0;
  let renders = 0;
  const controller = createProjectDialogController({
    dialogLifecycle,
    elements,
    normalizeLanguageValue: () => {
      normalizations += 1;
    },
    setLanguageValue: (input, value) => {
      input.value = value;
      languageValues.push(value);
    },
    renderResourcePickers: () => {
      renders += 1;
    },
    renderFrequentPairs: () => {
      renders += 1;
    },
    chooseWorkspace: () => {
      workspaceChoices += 1;
      return Promise.resolve();
    }
  });
  controller.mount();

  elements.sourceLanguageInput.dispatch("change");
  assert.equal(normalizations, 2);
  assert.equal(renders, 2);

  const pairButton = {
    dataset: { sourceLang: "ca", targetLang: "tr" },
    closest: () => pairButton
  };
  elements.frequentPairs.dispatch("click", { target: pairButton });
  assert.deepEqual(languageValues, ["ca", "tr"]);

  elements.tmResourceList.dispatch("change", { target: checkbox });
  assert.equal(radio.checked, false, "unchecking a linked TM must also clear its main-TM selection");
  radio.checked = true;
  checkbox.checked = false;
  elements.newTmNameInput.value = "Draft TM";
  elements.tmResourceList.dispatch("change", { target: radio });
  assert.equal(checkbox.checked, true);
  assert.equal(elements.newTmNameInput.value, "");

  elements.chooseWorkspaceButton.dispatch("click");
  await Promise.resolve();
  assert.equal(workspaceChoices, 1);
  assert.equal(elements.saveToFolderInput.checked, true);

  const enter = elements.aiSettingsForm.dispatch("keydown", {
    key: "Enter",
    target: fakeElement({ tagName: "INPUT" })
  });
  assert.equal(enter.defaultPrevented, true);

  assert.equal(controller.unmount(), true);
  elements.sourceLanguageInput.dispatch("change");
  assert.equal(normalizations, 2, "unmounted forms must not retain project-dialog listeners");
});
