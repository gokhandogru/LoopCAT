const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const test = require("node:test");

const rootPath = path.resolve(__dirname, "../..");

function loadFactory() {
  return import(pathToFileURL(path.join(rootPath, "src/features/editor/term-form-controller.js")).href);
}

function createHarness(createTermFormController, overrides = {}) {
  const calls = [];
  let project = Object.hasOwn(overrides, "project")
    ? overrides.project
    : { id: "p1", sourceLang: "en", targetLang: "tr" };
  const listeners = new Map();
  const elements = {
    source: { value: overrides.source ?? "  Source term  " },
    target: { value: overrides.target ?? "  Target term  " },
    notes: { value: overrides.notes ?? "  Context note  " },
    termbase: { value: overrides.termbase ?? "Selected TB" },
    forbidden: overrides.withoutForbidden ? null : { checked: overrides.forbidden ?? true },
    form: {
      addEventListener(type, listener) {
        calls.push(["addEventListener", type]);
        listeners.set(type, listener);
      },
      removeEventListener(type, listener) {
        calls.push(["removeEventListener", type, listeners.get(type) === listener]);
        if (listeners.get(type) === listener) listeners.delete(type);
      },
      reset() {
        calls.push(["reset"]);
        if (overrides.resetError) throw overrides.resetError;
        elements.source.value = "";
        elements.target.value = "";
        elements.notes.value = "";
        if (elements.forbidden) elements.forbidden.checked = false;
      }
    }
  };
  const savedTerm = overrides.savedTerm || { id: "term-1" };
  const controller = createTermFormController({
    elements,
    session: {
      getProject() {
        calls.push(["getProject", project?.id]);
        return project;
      }
    },
    resources: {
      primaryName() {
        calls.push(["primaryName"]);
        if (overrides.primaryNameError) throw overrides.primaryNameError;
        return overrides.primaryName || "Primary TB";
      },
      markProjectsUsingDirty(type, name, sourceLang, targetLang) {
        calls.push(["markProjectsUsingDirty", type, name, sourceLang, targetLang]);
        if (overrides.dirtyError) throw overrides.dirtyError;
      }
    },
    repository: {
      save(term) {
        calls.push(["saveTerm", structuredClone(term)]);
        if (overrides.saveError) throw overrides.saveError;
        return overrides.savePromise || Promise.resolve(savedTerm);
      }
    },
    presentation: {
      renderTermbaseSelect() {
        calls.push(["renderTermbaseSelect"]);
        if (overrides.renderError) throw overrides.renderError;
      },
      refreshProjectTerms(options) {
        calls.push(["refreshProjectTerms", structuredClone(options)]);
        if (overrides.projectRefreshError) throw overrides.projectRefreshError;
        return overrides.projectRefreshPromise;
      },
      refreshSuggestions() {
        calls.push(["refreshSuggestions"]);
        if (overrides.suggestionRefreshError) throw overrides.suggestionRefreshError;
        return overrides.suggestionRefreshPromise;
      }
    },
    status: {
      set(message, mode) {
        calls.push(["status", message, mode]);
        if (overrides.statusError) throw overrides.statusError;
      }
    },
    logger: {
      warn(message, error) {
        calls.push(["warn", message, error]);
        if (overrides.warnError) throw overrides.warnError;
      }
    },
    testHooks: {
      beforeSave() {
        calls.push(["beforeSave"]);
        if (overrides.beforeSaveError) throw overrides.beforeSaveError;
      }
    }
  });

  return {
    calls,
    controller,
    elements,
    listeners,
    savedTerm,
    setProject(value) {
      project = value;
    }
  };
}

test("TermFormController preserves project and required-field early returns with exact short-circuit effects", async () => {
  const { createTermFormController } = await loadFactory();
  const missingProject = createHarness(createTermFormController, { project: null });
  assert.equal(await missingProject.controller.save(), null);
  assert.deepEqual(missingProject.calls, [["getProject", undefined]]);

  const blankSource = createHarness(createTermFormController, { source: " \t " });
  assert.equal(await blankSource.controller.save(), null);
  assert.deepEqual(blankSource.calls, [["getProject", "p1"]]);

  const blankTarget = createHarness(createTermFormController, { target: " \n " });
  assert.equal(await blankTarget.controller.save(), null);
  assert.deepEqual(blankTarget.calls, [["getProject", "p1"]]);
  assert.equal(
    blankTarget.calls.some(([name]) => name === "primaryName"),
    false
  );
});

test("TermFormController preserves selected-termbase payload, project reads, effects, and success order", async () => {
  const { createTermFormController } = await loadFactory();
  const harness = createHarness(createTermFormController);
  assert.equal(await harness.controller.save(), harness.savedTerm);
  assert.deepEqual(
    harness.calls.find(([name]) => name === "saveTerm"),
    [
      "saveTerm",
      {
        sourceTerm: "  Source term  ",
        targetTerm: "  Target term  ",
        notes: "  Context note  ",
        sourceLang: "en",
        targetLang: "tr",
        termBaseName: "Selected TB",
        isForbidden: true
      }
    ]
  );
  assert.equal(harness.calls.filter(([name]) => name === "getProject").length, 5);
  assert.equal(
    harness.calls.some(([name]) => name === "primaryName"),
    false
  );
  assert.deepEqual(
    harness.calls
      .filter(([name]) =>
        [
          "beforeSave",
          "saveTerm",
          "markProjectsUsingDirty",
          "reset",
          "renderTermbaseSelect",
          "refreshProjectTerms",
          "refreshSuggestions",
          "status"
        ].includes(name)
      )
      .map(([name]) => name),
    [
      "beforeSave",
      "saveTerm",
      "markProjectsUsingDirty",
      "reset",
      "renderTermbaseSelect",
      "refreshProjectTerms",
      "refreshSuggestions",
      "status"
    ]
  );
  assert.deepEqual(
    harness.calls.find(([name]) => name === "markProjectsUsingDirty"),
    ["markProjectsUsingDirty", "termbase", "Selected TB", "en", "tr"]
  );
  assert.deepEqual(
    harness.calls.find(([name]) => name === "refreshProjectTerms"),
    ["refreshProjectTerms", { rerender: true }]
  );
  assert.deepEqual(harness.calls.at(-1), ["status", "Term saved", "saved"]);
});

test("TermFormController preserves primary-termbase fallback and absent forbidden input", async () => {
  const { createTermFormController } = await loadFactory();
  const harness = createHarness(createTermFormController, { termbase: "", withoutForbidden: true });
  assert.equal(await harness.controller.save(), harness.savedTerm);
  assert.equal(harness.calls.filter(([name]) => name === "primaryName").length, 1);
  assert.deepEqual(harness.calls.find(([name]) => name === "saveTerm")[1], {
    sourceTerm: "  Source term  ",
    targetTerm: "  Target term  ",
    notes: "  Context note  ",
    sourceLang: "en",
    targetLang: "tr",
    termBaseName: "Primary TB",
    isForbidden: undefined
  });
});

test("TermFormController preserves durable success and exact warning after either refresh failure", async () => {
  const { createTermFormController } = await loadFactory();
  const projectRefreshError = new Error("project terms failed");
  const projectFailure = createHarness(createTermFormController, { projectRefreshError });
  assert.equal(await projectFailure.controller.save(), projectFailure.savedTerm);
  assert.equal(
    projectFailure.calls.some(([name]) => name === "refreshSuggestions"),
    false
  );
  assert.deepEqual(
    projectFailure.calls.find(([name]) => name === "warn"),
    ["warn", "Term refresh failed after save.", projectRefreshError]
  );
  assert.deepEqual(projectFailure.calls.at(-1), ["status", "Term saved", "saved"]);

  const suggestionRefreshError = new Error("suggestions failed");
  const suggestionFailure = createHarness(createTermFormController, { suggestionRefreshError });
  assert.equal(await suggestionFailure.controller.save(), suggestionFailure.savedTerm);
  assert.equal(
    suggestionFailure.calls.some(([name]) => name === "refreshProjectTerms"),
    true
  );
  assert.deepEqual(
    suggestionFailure.calls.find(([name]) => name === "warn"),
    ["warn", "Term refresh failed after save.", suggestionRefreshError]
  );
  assert.deepEqual(suggestionFailure.calls.at(-1), ["status", "Term saved", "saved"]);
});

test("TermFormController preserves pre-save and repository failure containment without clearing form values", async () => {
  const { createTermFormController } = await loadFactory();
  const beforeSaveError = new Error("simulated test failure");
  const hookFailure = createHarness(createTermFormController, { beforeSaveError });
  assert.equal(await hookFailure.controller.save(), null);
  assert.equal(
    hookFailure.calls.some(([name]) => name === "saveTerm"),
    false
  );
  assert.equal(hookFailure.elements.source.value, "  Source term  ");
  assert.deepEqual(hookFailure.calls.at(-1), ["status", "simulated test failure", "dirty"]);

  const saveError = new Error("");
  const repositoryFailure = createHarness(createTermFormController, { saveError });
  assert.equal(await repositoryFailure.controller.save(), null);
  assert.equal(
    repositoryFailure.calls.some(([name]) => name === "markProjectsUsingDirty"),
    false
  );
  assert.equal(
    repositoryFailure.calls.some(([name]) => name === "reset"),
    false
  );
  assert.equal(repositoryFailure.elements.target.value, "  Target term  ");
  assert.deepEqual(repositoryFailure.calls.at(-1), ["status", "Term save failed", "dirty"]);
});

test("TermFormController preserves completed effects and outer containment for downstream failures", async () => {
  const { createTermFormController } = await loadFactory();
  const dirtyError = new Error("dirty failed");
  const dirtyFailure = createHarness(createTermFormController, { dirtyError });
  assert.equal(await dirtyFailure.controller.save(), null);
  assert.equal(
    dirtyFailure.calls.some(([name]) => name === "reset"),
    false
  );
  assert.deepEqual(dirtyFailure.calls.at(-1), ["status", "dirty failed", "dirty"]);

  const renderError = new Error("render failed");
  const renderFailure = createHarness(createTermFormController, { renderError });
  assert.equal(await renderFailure.controller.save(), null);
  assert.equal(
    renderFailure.calls.some(([name]) => name === "reset"),
    true
  );
  assert.equal(renderFailure.elements.source.value, "");
  assert.equal(
    renderFailure.calls.some(([name]) => name === "refreshProjectTerms"),
    false
  );
  assert.deepEqual(renderFailure.calls.at(-1), ["status", "render failed", "dirty"]);
});

test("TermFormController owns idempotent submit lifecycle and awaits save without returning its result", async () => {
  const { createTermFormController } = await loadFactory();
  let resolveSave;
  const harness = createHarness(createTermFormController, {
    savePromise: new Promise((resolve) => {
      resolveSave = resolve;
    })
  });
  assert.equal(harness.controller.mount(), undefined);
  assert.equal(harness.controller.mount(), undefined);
  assert.equal(harness.calls.filter(([name]) => name === "addEventListener").length, 1);
  const event = {
    prevented: false,
    preventDefault() {
      harness.calls.push(["preventDefault"]);
      this.prevented = true;
    }
  };
  const action = harness.listeners.get("submit")(event);
  assert.equal(event.prevented, true);
  assert.ok(
    harness.calls.findIndex(([name]) => name === "preventDefault") <
      harness.calls.findIndex(([name]) => name === "saveTerm")
  );
  let settled = false;
  action.finally(() => {
    settled = true;
  });
  await Promise.resolve();
  assert.equal(settled, false);
  resolveSave(harness.savedTerm);
  assert.equal(await action, undefined);
  assert.equal(harness.controller.unmount(), undefined);
  assert.equal(harness.controller.unmount(), undefined);
  assert.deepEqual(
    harness.calls.find(([name]) => name === "removeEventListener"),
    ["removeEventListener", "submit", true]
  );
});

test("TermFormController validates boundaries, preserves status failures, and exposes an immutable API", async () => {
  const { createTermFormController } = await loadFactory();
  assert.throws(() => createTermFormController({}), /requires form elements and a project session boundary/);
  const form = {
    addEventListener() {},
    removeEventListener() {},
    reset() {}
  };
  const base = {
    elements: {
      form,
      source: { value: "" },
      target: { value: "" },
      notes: { value: "" },
      termbase: { value: "" },
      forbidden: null
    },
    session: { getProject: () => null },
    resources: { primaryName: () => "", markProjectsUsingDirty: () => undefined },
    repository: { save: () => Promise.resolve(null) },
    presentation: {
      renderTermbaseSelect: () => undefined,
      refreshProjectTerms: () => undefined,
      refreshSuggestions: () => undefined
    },
    status: { set: () => undefined },
    logger: { warn: () => undefined },
    testHooks: { beforeSave: () => undefined }
  };
  assert.throws(
    () => createTermFormController({ ...base, resources: null }),
    /requires termbase resource and repository boundaries/
  );
  assert.throws(
    () => createTermFormController({ ...base, presentation: null }),
    /requires presentation, status, logger, and test-hook boundaries/
  );
  assert.equal(Object.isFrozen(createHarness(createTermFormController).controller), true);

  const statusError = new Error("status failed");
  const failing = createHarness(createTermFormController, { beforeSaveError: new Error("save failed"), statusError });
  await assert.rejects(failing.controller.save(), statusError);
});
