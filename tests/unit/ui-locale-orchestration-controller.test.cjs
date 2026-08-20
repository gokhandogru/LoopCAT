const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const test = require("node:test");

const root = path.resolve(__dirname, "../..");
const presentationActions = [
  "renderPanels",
  "renderFocusMode",
  "renderWorkspaceStatus",
  "renderProjectStorageStatus",
  "renderProjectsView",
  "renderResourcesView",
  "renderProjectHome",
  "renderProjectAnalysis",
  "renderEditor",
  "renderProgress",
  "renderReview",
  "renderWorkbench",
  "renderRevisionHistory",
  "renderQaResults",
  "refreshEditorContext"
];

function loadFactory() {
  return import(pathToFileURL(path.join(root, "src/i18n/ui-locale-orchestration-controller.js")).href);
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });
  return { promise, reject, resolve };
}

function createHarness(createUiLocaleOrchestrationController, overrides = {}) {
  const calls = [];
  const body = { name: "body" };
  const select = overrides.noSelect
    ? null
    : {
        value: overrides.selectedLocale || "",
        children: [],
        replaceChildren(...children) {
          calls.push(["select.replaceChildren", children.length]);
          this.children = children;
        }
      };
  const importInput = overrides.noImportInput
    ? null
    : {
        files: overrides.files || [],
        value: overrides.inputValue || "chosen.json"
      };
  let localeValue = overrides.localeValue ?? "ca-ES";
  const locale = {
    availableLocales: overrides.noAvailableLocales
      ? undefined
      : () => {
          calls.push(["locale.availableLocales"]);
          if (overrides.localeAfterAvailable !== undefined) localeValue = overrides.localeAfterAvailable;
          if (overrides.availableError) throw overrides.availableError;
          return (
            overrides.catalogs || [
              { locale: "en", label: "English" },
              { locale: "ca-ES", label: "Català", custom: true },
              { locale: "tr", label: "" }
            ]
          );
        },
    getLocale: overrides.noGetLocale
      ? undefined
      : () => {
          calls.push(["locale.getLocale", localeValue]);
          if (overrides.getLocaleError) throw overrides.getLocaleError;
          return localeValue;
        },
    localizeStaticDom: overrides.noLocalizeStaticDom
      ? undefined
      : (target) => {
          calls.push(["locale.localizeStaticDom", target]);
          if (overrides.localizeError) throw overrides.localizeError;
          return overrides.localizeResult;
        },
    saveCustomLocale: overrides.noSaveCustomLocale
      ? undefined
      : (catalog) => {
          calls.push(["locale.saveCustomLocale", catalog]);
          if (overrides.saveCustomError) throw overrides.saveCustomError;
          return overrides.importedLocale || "zz-Custom";
        },
    setLocale: overrides.noSetLocale
      ? undefined
      : (nextLocale) => {
          calls.push(["locale.setLocale", nextLocale]);
          if (overrides.setLocaleError) throw overrides.setLocaleError;
          localeValue = nextLocale;
          return overrides.setLocaleResult;
        },
    sourceCatalogJson: overrides.noSourceCatalog
      ? undefined
      : () => {
          calls.push(["locale.sourceCatalogJson"]);
          if (overrides.sourceCatalogError) throw overrides.sourceCatalogError;
          return overrides.sourceCatalog || '{"locale":"en"}';
        }
  };
  const localization = {
    source(value) {
      calls.push(["localization.source", value]);
      if (overrides.sourceError) throw overrides.sourceError;
      return overrides.customLabel || "customized";
    }
  };
  const dom = {
    body,
    createOption() {
      calls.push(["dom.createOption"]);
      if (overrides.createOptionError) throw overrides.createOptionError;
      return {};
    }
  };
  const views = overrides.views || ["other", "other", "other"];
  let viewIndex = 0;
  const application = {
    dispatchLocale(value) {
      calls.push(["application.dispatchLocale", value]);
      if (overrides.dispatchError) throw overrides.dispatchError;
      return overrides.dispatchResult;
    },
    getView() {
      const value = views[Math.min(viewIndex, views.length - 1)];
      viewIndex += 1;
      calls.push(["application.getView", value]);
      if (overrides.getViewError) throw overrides.getViewError;
      return value;
    }
  };
  const project = overrides.project || null;
  const session = {
    getProject() {
      calls.push(["session.getProject", project]);
      if (overrides.getProjectError) throw overrides.getProjectError;
      return project;
    }
  };
  const presentation = Object.fromEntries(
    presentationActions.map((action) => [
      action,
      () => {
        calls.push([`presentation.${action}`]);
        if (overrides.presentationError === action) throw new Error(`${action} failed`);
        return overrides.presentationResults?.[action];
      }
    ])
  );
  const downloads = {
    write(filename, content, type) {
      calls.push(["downloads.write", filename, content, type]);
      if (overrides.downloadError) throw overrides.downloadError;
      return overrides.downloadResult;
    }
  };
  const status = {
    set(message, mode) {
      calls.push(["status.set", message, mode]);
      if (overrides.statusError && (!overrides.statusErrorMode || overrides.statusErrorMode === mode)) {
        throw overrides.statusError;
      }
      return overrides.statusResult;
    }
  };
  const clock = {
    now() {
      calls.push(["clock.now"]);
      if (overrides.clockError) throw overrides.clockError;
      return new Date(overrides.now || "2026-08-20T12:34:56.000Z");
    }
  };
  const elements = { localeSelect: select, importInput };
  const controller = createUiLocaleOrchestrationController({
    elements,
    locale,
    localization,
    dom,
    application,
    session,
    presentation,
    downloads,
    status,
    clock
  });
  return {
    application,
    body,
    calls,
    clock,
    controller,
    dom,
    downloads,
    elements,
    locale,
    localization,
    presentation,
    session,
    status
  };
}

test("UiLocaleOrchestrationController preserves locale-option guards, captured selection, and custom labels", async () => {
  const { createUiLocaleOrchestrationController } = await loadFactory();
  const absent = createHarness(createUiLocaleOrchestrationController, { noSelect: true });
  assert.equal(absent.controller.renderOptions(), undefined);
  assert.deepEqual(absent.calls, []);

  const unavailable = createHarness(createUiLocaleOrchestrationController, { noAvailableLocales: true });
  assert.equal(unavailable.controller.renderOptions(), undefined);
  assert.deepEqual(unavailable.calls, []);

  const harness = createHarness(createUiLocaleOrchestrationController, {
    localeValue: "ca-ES",
    localeAfterAvailable: "en"
  });
  assert.equal(harness.controller.renderOptions(), undefined);
  assert.equal(harness.elements.localeSelect.value, "ca-ES");
  assert.deepEqual(harness.elements.localeSelect.children, [
    { value: "en", textContent: "English" },
    { value: "ca-ES", textContent: "Català (customized)" },
    { value: "tr", textContent: "tr" }
  ]);
  assert.deepEqual(harness.calls, [
    ["locale.getLocale", "ca-ES"],
    ["locale.availableLocales"],
    ["dom.createOption"],
    ["dom.createOption"],
    ["localization.source", "custom"],
    ["dom.createOption"],
    ["select.replaceChildren", 3]
  ]);
});

test("UiLocaleOrchestrationController preserves no-project localized refresh order and view branches", async () => {
  const { createUiLocaleOrchestrationController } = await loadFactory();
  const projects = createHarness(createUiLocaleOrchestrationController, {
    noAvailableLocales: true,
    views: ["projects", "other"]
  });
  assert.equal(projects.controller.refresh(), undefined);
  assert.deepEqual(projects.calls, [
    ["locale.getLocale", "ca-ES"],
    ["application.dispatchLocale", "ca-ES"],
    ["locale.localizeStaticDom", projects.body],
    ["presentation.renderPanels"],
    ["presentation.renderFocusMode"],
    ["presentation.renderWorkspaceStatus"],
    ["presentation.renderProjectStorageStatus"],
    ["application.getView", "projects"],
    ["presentation.renderProjectsView"],
    ["application.getView", "other"],
    ["session.getProject", null]
  ]);

  const resources = createHarness(createUiLocaleOrchestrationController, {
    noAvailableLocales: true,
    noGetLocale: true,
    noLocalizeStaticDom: true,
    views: ["other", "resources"]
  });
  resources.controller.refresh();
  assert.deepEqual(resources.calls, [
    ["application.dispatchLocale", ""],
    ["presentation.renderPanels"],
    ["presentation.renderFocusMode"],
    ["presentation.renderWorkspaceStatus"],
    ["presentation.renderProjectStorageStatus"],
    ["application.getView", "other"],
    ["application.getView", "resources"],
    ["presentation.renderResourcesView"],
    ["session.getProject", null]
  ]);
});

test("UiLocaleOrchestrationController preserves project refresh order and unawaited analysis", async () => {
  const { createUiLocaleOrchestrationController } = await loadFactory();
  const analysis = deferred();
  const project = { id: "project-1" };
  const harness = createHarness(createUiLocaleOrchestrationController, {
    noAvailableLocales: true,
    project,
    views: ["other", "other", "project"],
    presentationResults: { renderProjectAnalysis: analysis.promise }
  });
  assert.equal(harness.controller.refresh(), undefined);
  assert.deepEqual(harness.calls.slice(7), [
    ["application.getView", "other"],
    ["application.getView", "other"],
    ["session.getProject", project],
    ["application.getView", "project"],
    ["presentation.renderProjectHome"],
    ["presentation.renderProjectAnalysis"],
    ["presentation.renderEditor"],
    ["presentation.renderProgress"],
    ["presentation.renderReview"],
    ["presentation.renderWorkbench"],
    ["presentation.renderRevisionHistory"],
    ["presentation.renderQaResults"],
    ["presentation.refreshEditorContext"]
  ]);
  analysis.resolve({ ignored: true });
  await analysis.promise;
});

test("UiLocaleOrchestrationController preserves custom-catalog import guards and successful sequencing", async () => {
  const { createUiLocaleOrchestrationController } = await loadFactory();
  const noFile = createHarness(createUiLocaleOrchestrationController, { inputValue: "keep.json" });
  assert.equal(await noFile.controller.importCatalog({ ignored: true }), undefined);
  assert.equal(noFile.elements.importInput.value, "keep.json");
  assert.deepEqual(noFile.calls, []);

  const fileWithoutCapability = { text: () => Promise.resolve("{}") };
  const noCapability = createHarness(createUiLocaleOrchestrationController, {
    files: [fileWithoutCapability],
    inputValue: "keep-too.json",
    noSaveCustomLocale: true
  });
  assert.equal(await noCapability.controller.importCatalog(), undefined);
  assert.equal(noCapability.elements.importInput.value, "keep-too.json");
  assert.deepEqual(noCapability.calls, []);

  const read = deferred();
  let successful;
  const file = {
    text() {
      successful.calls.push(["file.text"]);
      return read.promise;
    }
  };
  successful = createHarness(createUiLocaleOrchestrationController, {
    files: [file],
    noAvailableLocales: true,
    views: ["other", "other"],
    inputValue: "custom.json"
  });
  const result = successful.controller.importCatalog({ ignored: true });
  assert.deepEqual(successful.calls, [["file.text"]]);
  read.resolve('{"locale":"zz","messages":{"Save":"Store"}}');
  assert.equal(await result, undefined);
  assert.equal(successful.elements.importInput.value, "");
  assert.deepEqual(successful.calls, [
    ["file.text"],
    ["locale.saveCustomLocale", { locale: "zz", messages: { Save: "Store" } }],
    ["locale.setLocale", "zz-Custom"],
    ["locale.getLocale", "zz-Custom"],
    ["application.dispatchLocale", "zz-Custom"],
    ["locale.localizeStaticDom", successful.body],
    ["presentation.renderPanels"],
    ["presentation.renderFocusMode"],
    ["presentation.renderWorkspaceStatus"],
    ["presentation.renderProjectStorageStatus"],
    ["application.getView", "other"],
    ["application.getView", "other"],
    ["session.getProject", null],
    ["status.set", "Interface translation imported", "saved"]
  ]);
});

test("UiLocaleOrchestrationController preserves import failure status, fallback copy, and final reset", async () => {
  const { createUiLocaleOrchestrationController } = await loadFactory();
  for (const [thrown, expected] of [
    [new Error("read failed"), "read failed"],
    [{}, "Interface translation import failed"]
  ]) {
    const file = { text: () => Promise.reject(thrown) };
    const harness = createHarness(createUiLocaleOrchestrationController, {
      files: [file],
      inputValue: "broken.json"
    });
    assert.equal(await harness.controller.importCatalog(), undefined);
    assert.equal(harness.elements.importInput.value, "");
    assert.deepEqual(harness.calls, [["status.set", expected, "dirty"]]);
  }

  const statusError = new Error("status failed");
  const statusHarness = createHarness(createUiLocaleOrchestrationController, {
    files: [{ text: () => Promise.reject(new Error("read failed")) }],
    inputValue: "broken.json",
    statusError,
    statusErrorMode: "dirty"
  });
  await assert.rejects(statusHarness.controller.importCatalog(), statusError);
  assert.equal(statusHarness.elements.importInput.value, "");

  const savedStatusError = new Error("saved status failed");
  const lateHarness = createHarness(createUiLocaleOrchestrationController, {
    files: [{ text: () => Promise.resolve("{}") }],
    noAvailableLocales: true,
    views: ["other", "other"],
    statusError: savedStatusError,
    statusErrorMode: "saved"
  });
  assert.equal(await lateHarness.controller.importCatalog(), undefined);
  assert.deepEqual(lateHarness.calls.slice(-2), [
    ["status.set", "Interface translation imported", "saved"],
    ["status.set", "saved status failed", "dirty"]
  ]);
  assert.equal(lateHarness.elements.importInput.value, "");
});

test("UiLocaleOrchestrationController preserves source-catalog export guard, construction, and failure timing", async () => {
  const { createUiLocaleOrchestrationController } = await loadFactory();
  const unavailable = createHarness(createUiLocaleOrchestrationController, { noSourceCatalog: true });
  assert.equal(unavailable.controller.exportSource({ ignored: true }), undefined);
  assert.deepEqual(unavailable.calls, []);

  const harness = createHarness(createUiLocaleOrchestrationController);
  assert.equal(harness.controller.exportSource({ ignored: true }), undefined);
  assert.deepEqual(harness.calls, [
    ["clock.now"],
    ["locale.sourceCatalogJson"],
    ["downloads.write", "loopcat-ui-source-2026-08-20.json", '{"locale":"en"}', "application/json"],
    ["status.set", "UI source exported", "saved"]
  ]);

  const downloadError = new Error("download failed");
  const failed = createHarness(createUiLocaleOrchestrationController, { downloadError });
  assert.throws(() => failed.controller.exportSource(), downloadError);
  assert.equal(
    failed.calls.some(([name]) => name === "status.set"),
    false
  );
});

test("UiLocaleOrchestrationController validates boundaries and exposes an immutable API", async () => {
  const { createUiLocaleOrchestrationController } = await loadFactory();
  const valid = createHarness(createUiLocaleOrchestrationController);
  assert.equal(Object.isFrozen(valid.controller), true);
  assert.deepEqual(Object.keys(valid.controller), ["renderOptions", "refresh", "importCatalog", "exportSource"]);

  const create = (changes = {}) =>
    createUiLocaleOrchestrationController({
      elements: valid.elements,
      locale: valid.locale,
      localization: valid.localization,
      dom: valid.dom,
      application: valid.application,
      session: valid.session,
      presentation: valid.presentation,
      downloads: valid.downloads,
      status: valid.status,
      clock: valid.clock,
      ...changes
    });
  for (const changes of [
    { localization: {} },
    { dom: { ...valid.dom, createOption: null } },
    { application: { ...valid.application, getView: null } },
    { session: {} },
    { downloads: {} },
    { status: {} },
    { clock: {} }
  ]) {
    assert.throws(() => create(changes), /UiLocaleOrchestrationController requires checked/);
  }
  for (const action of presentationActions) {
    assert.throws(
      () => create({ presentation: { ...valid.presentation, [action]: null } }),
      /UiLocaleOrchestrationController requires checked presentation actions\./
    );
  }
  for (const action of [
    "availableLocales",
    "getLocale",
    "localizeStaticDom",
    "saveCustomLocale",
    "setLocale",
    "sourceCatalogJson"
  ]) {
    assert.throws(
      () => create({ locale: { ...valid.locale, [action]: true } }),
      /UiLocaleOrchestrationController requires checked optional locale actions\./
    );
  }
  assert.throws(
    () => create({ elements: { ...valid.elements, localeSelect: {} } }),
    /UiLocaleOrchestrationController requires a checked optional locale select\./
  );
});
