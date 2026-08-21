const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const test = require("node:test");

const root = path.resolve(__dirname, "../..");

function loadFactory() {
  return import(pathToFileURL(path.join(root, "src/features/editor/editor-shell-presentation-controller.js")).href);
}

function createHarness(createEditorShellPresentationController, overrides = {}) {
  const calls = [];
  const failure = overrides.failure || new Error(`${overrides.failAt || "editor-shell"} failed`);
  const fail = (name) => {
    if (overrides.failAt === name) throw failure;
  };
  const makeToggleElement = (name) => ({
    classList: {
      add(value) {
        calls.push([`${name}.classList.add`, value]);
        fail(`${name}.classList.add`);
      },
      toggle(value, force) {
        calls.push([`${name}.classList.toggle`, value, force]);
        fail(`${name}.classList.toggle`);
      }
    }
  });
  const inspectorToggleButton =
    overrides.inspectorToggleButton === null
      ? null
      : {
          textContent: "",
          attributes: {},
          setAttribute(name, value) {
            calls.push(["inspectorToggleButton.setAttribute", name, value]);
            fail("inspectorToggleButton.setAttribute");
            this.attributes[name] = value;
          }
        };
  const elements = {
    workspace: makeToggleElement("workspace"),
    sidebar: makeToggleElement("sidebar"),
    projectsView: makeToggleElement("projectsView"),
    resourcesView: makeToggleElement("resourcesView"),
    projectHomeView: makeToggleElement("projectHomeView"),
    emptyState: makeToggleElement("emptyState"),
    editorView: makeToggleElement("editorView"),
    projectTitle: { textContent: "" },
    projectMeta: { textContent: "" },
    projectDomainEditInput: { value: "" },
    domainForm: makeToggleElement("domainForm"),
    projectInfo: { html: "" },
    inspectorToggleButton
  };
  const defaultNavigation = {
    view: "projects",
    projectId: "project-id",
    documentId: "document-id",
    segmentId: "segment-id",
    activeIndex: 4
  };
  const navigationReads = overrides.navigationReads || [overrides.navigation || defaultNavigation];
  let navigationRead = 0;
  const inspectorReads = overrides.inspectorReads || [overrides.inspectorOpen ?? false];
  let inspectorRead = 0;
  const application = {
    getNavigation() {
      const value = navigationReads[Math.min(navigationRead, navigationReads.length - 1)];
      navigationRead += 1;
      calls.push(["application.getNavigation", value]);
      fail(`application.getNavigation:${navigationRead}`);
      return value;
    },
    syncLegacy(value) {
      calls.push(["application.syncLegacy", value]);
      fail("application.syncLegacy");
    },
    dispatchLocale(value) {
      calls.push(["application.dispatchLocale", value]);
      fail("application.dispatchLocale");
    },
    getInspectorOpen() {
      const value = inspectorReads[Math.min(inspectorRead, inspectorReads.length - 1)];
      inspectorRead += 1;
      calls.push(["application.getInspectorOpen", value]);
      fail(`application.getInspectorOpen:${inspectorRead}`);
      return value;
    }
  };
  const projectReads = overrides.projectReads || [overrides.project ?? null];
  let projectRead = 0;
  const session = {
    getProject() {
      const value = projectReads[Math.min(projectRead, projectReads.length - 1)];
      projectRead += 1;
      calls.push(["session.getProject", value]);
      fail(`session.getProject:${projectRead}`);
      return value;
    },
    getSegments() {
      calls.push(["session.getSegments", overrides.segments || []]);
      fail("session.getSegments");
      return overrides.segments || [];
    },
    getActivityEvents() {
      calls.push(["session.getActivityEvents", overrides.activityEvents || []]);
      fail("session.getActivityEvents");
      return overrides.activityEvents || [];
    }
  };
  const verticalState = overrides.verticalState ?? null;
  const vertical = {
    getState() {
      calls.push(["vertical.getState", verticalState]);
      fail("vertical.getState");
      return verticalState;
    }
  };
  const localization = {
    locale() {
      calls.push(["localization.locale"]);
      fail("localization.locale");
      return overrides.locale;
    },
    source(value, variables) {
      calls.push(["localization.source", value, variables]);
      fail(`localization.source:${value}`);
      return `source:${value}`;
    },
    label(key, variables) {
      calls.push(["localization.label", key, variables]);
      fail(`localization.label:${key}`);
      return `label:${key}`;
    },
    sourceHtml(value, variables) {
      calls.push(["localization.sourceHtml", value, variables]);
      fail(`localization.sourceHtml:${value}`);
      return `sourceHtml:${value}`;
    },
    labelHtml(key, variables) {
      calls.push(["localization.labelHtml", key, variables]);
      fail(`localization.labelHtml:${key}`);
      return `labelHtml:${key}${variables?.count === undefined ? "" : `:${variables.count}`}`;
    }
  };
  const spellcheckResult = overrides.spellcheckResult;
  const language = {
    syncDesktopSpellcheck() {
      calls.push(["language.syncDesktopSpellcheck"]);
      fail("language.syncDesktopSpellcheck");
      return spellcheckResult;
    },
    display() {
      calls.push(["language.display"]);
      fail("language.display");
      return overrides.languageDisplay || "English → Turkish";
    }
  };
  const workspace = {
    renderStatus() {
      calls.push(["workspace.renderStatus"]);
      fail("workspace.renderStatus");
    },
    renderBackupReminder() {
      calls.push(["workspace.renderBackupReminder"]);
      fail("workspace.renderBackupReminder");
    }
  };
  const focus = {
    render() {
      calls.push(["focus.render"]);
      fail("focus.render");
    }
  };
  const resourceSummary = overrides.resourceSummary || {
    mainTm: "Main TM",
    tmLabel: "2 TMs",
    tbLabel: "1 TB",
    tmNames: ["Main TM", "Reference TM"],
    tbNames: ["Terms"]
  };
  const resources = {
    summary() {
      calls.push(["resources.summary", resourceSummary]);
      fail("resources.summary");
      return resourceSummary;
    }
  };
  const documentRecords = overrides.documents || [];
  const documents = {
    list() {
      calls.push(["documents.list", documentRecords]);
      fail("documents.list");
      return documentRecords;
    }
  };
  const text = {
    displaySafeText(value, fallback) {
      calls.push(["text.displaySafeText", value, fallback]);
      fail("text.displaySafeText");
      return `safeText:${value || fallback || ""}`;
    },
    displaySafeHtml(value) {
      calls.push(["text.displaySafeHtml", value]);
      fail("text.displaySafeHtml");
      return `safeHtml:${value}`;
    },
    escapeHtml(value) {
      calls.push(["text.escapeHtml", value]);
      fail("text.escapeHtml");
      return `escaped:${value}`;
    }
  };
  const normalizedSettings = overrides.normalizedSettings || { provider: "local" };
  const ai = {
    normalizeSettings(value) {
      calls.push(["ai.normalizeSettings", value]);
      fail("ai.normalizeSettings");
      return normalizedSettings;
    },
    storedKey() {
      calls.push(["ai.storedKey"]);
      fail("ai.storedKey");
      return overrides.storedKey || "stored-key";
    },
    openAiSnapshot() {
      calls.push(["ai.openAiSnapshot"]);
      fail("ai.openAiSnapshot");
      return overrides.openAiSnapshot || { local: "remembered" };
    },
    storageLabel() {
      calls.push(["ai.storageLabel"]);
      fail("ai.storageLabel");
      return overrides.storageLabel || "browser session";
    }
  };
  const presentation = {
    replaceSafeHtml(target, html) {
      calls.push(["presentation.replaceSafeHtml", target, html]);
      fail("presentation.replaceSafeHtml");
      target.html = html;
    },
    renderAiAdministration(model) {
      calls.push(["presentation.renderAiAdministration", model]);
      fail("presentation.renderAiAdministration");
      return overrides.aiAdministrationResult;
    },
    renderAiCommandCentre() {
      calls.push(["presentation.renderAiCommandCentre"]);
      fail("presentation.renderAiCommandCentre");
    },
    renderQualityWorkbench() {
      calls.push(["presentation.renderQualityWorkbench"]);
      fail("presentation.renderQualityWorkbench");
    },
    renderTermbaseSelect() {
      calls.push(["presentation.renderTermbaseSelect"]);
      fail("presentation.renderTermbaseSelect");
    }
  };
  const options = {
    elements,
    application,
    session,
    vertical,
    localization,
    language,
    workspace,
    focus,
    resources,
    documents,
    text,
    ai,
    presentation
  };
  return {
    calls,
    controller: createEditorShellPresentationController(options),
    elements,
    failure,
    normalizedSettings,
    options,
    presentation,
    resourceSummary
  };
}

test("EditorShellPresentationController preserves navigation, locale, workspace, and legacy no-project rendering", async () => {
  const { createEditorShellPresentationController } = await loadFactory();
  const navigation = { view: "projects", projectId: "p", documentId: "d", segmentId: "s", activeIndex: 3 };
  const harness = createHarness(createEditorShellPresentationController, {
    navigation,
    locale: "",
    projectReads: [null, null],
    inspectorReads: [false, false]
  });
  assert.equal(harness.controller.render(), undefined);
  assert.deepEqual(harness.calls[1], ["application.syncLegacy", navigation]);
  assert.deepEqual(
    harness.calls.find(([name]) => name === "application.dispatchLocale"),
    ["application.dispatchLocale", ""]
  );
  assert.deepEqual(
    harness.calls
      .filter(([name]) => name.endsWith("classList.toggle"))
      .map(([name, value, force]) => [name, value, force]),
    [
      ["workspace.classList.toggle", "projects-mode", true],
      ["sidebar.classList.toggle", "hidden", true],
      ["projectsView.classList.toggle", "hidden", false],
      ["resourcesView.classList.toggle", "hidden", true],
      ["projectHomeView.classList.toggle", "hidden", true],
      ["emptyState.classList.toggle", "hidden", true],
      ["editorView.classList.toggle", "hidden", true]
    ]
  );
  assert.equal(harness.calls.filter(([name]) => name === "application.getNavigation").length, 8);
  assert.deepEqual(harness.elements.inspectorToggleButton.attributes, { "aria-expanded": "false" });
  assert.equal(harness.elements.inspectorToggleButton.textContent, "source:Show inspector");
  assert.equal(
    harness.calls.some(([name]) => name === "resources.summary"),
    false
  );
});

test("EditorShellPresentationController preserves vertical feature reads and live inspector state", async () => {
  const { createEditorShellPresentationController } = await loadFactory();
  const verticalCalls = [];
  const verticalState = {
    editor: {
      renderShell(model) {
        verticalCalls.push(["editor.renderShell", model]);
      }
    },
    inspector: {
      setVisible(value) {
        verticalCalls.push(["inspector.setVisible", value]);
      }
    },
    dashboard: {
      setVisible(value) {
        verticalCalls.push(["dashboard.setVisible", value]);
      }
    }
  };
  const initial = { view: "projects", projectId: "p", documentId: "", segmentId: "", activeIndex: 0 };
  const editor = { ...initial, view: "editor" };
  const project = { ...initial, view: "project" };
  const harness = createHarness(createEditorShellPresentationController, {
    verticalState,
    navigationReads: [initial, editor, editor, project],
    inspectorReads: [true, true, false, true],
    projectReads: [{ id: "p" }, null]
  });
  harness.controller.render();
  assert.deepEqual(verticalCalls, [
    ["editor.renderShell", { view: "editor", hasProject: true, inspectorOpen: true }],
    ["inspector.setVisible", true],
    ["dashboard.setVisible", true]
  ]);
  assert.equal(
    harness.calls.some(([name]) => name.endsWith("classList.toggle")),
    false
  );
  assert.equal(harness.elements.inspectorToggleButton.attributes["aria-expanded"], "false");
  assert.equal(harness.elements.inspectorToggleButton.textContent, "source:Hide inspector");
});

test("EditorShellPresentationController preserves the second live project guard", async () => {
  const { createEditorShellPresentationController } = await loadFactory();
  const project = { id: "project" };
  const harness = createHarness(createEditorShellPresentationController, {
    projectReads: [project, null],
    inspectorToggleButton: null
  });
  harness.controller.render();
  assert.equal(
    harness.calls.some(([name]) => name === "focus.render"),
    true
  );
  assert.equal(harness.calls.filter(([name]) => name === "session.getProject").length, 2);
  assert.equal(
    harness.calls.some(([name]) => name === "resources.summary"),
    false
  );
});

test("EditorShellPresentationController preserves safe project metadata and information markup", async () => {
  const { createEditorShellPresentationController } = await loadFactory();
  const project = {
    id: "project",
    name: "Project <name>",
    creatorName: "Creator",
    domain: "Legal",
    workspaceId: "workspace-1",
    sourceFileName: "source.docx",
    aiSettings: { provider: "ollama" }
  };
  const harness = createHarness(createEditorShellPresentationController, {
    project,
    segments: [{ id: 1 }, { id: 2 }, { id: 3 }],
    activityEvents: [{ id: 1 }, { id: 2 }],
    documents: [{ id: "a" }, { id: "b" }],
    inspectorToggleButton: null
  });
  harness.controller.render();
  assert.equal(harness.elements.projectTitle.textContent, "safeText:Project <name>");
  assert.equal(
    harness.elements.projectMeta.textContent,
    "English → Turkish - label:mainTm: safeText:Main TM - safeText:2 TMs - safeText:1 TB"
  );
  assert.equal(harness.elements.projectDomainEditInput.value, "Legal");
  assert.equal(harness.elements.projectInfo.html.includes("safeHtml:Project <name>"), true);
  assert.equal(harness.elements.projectInfo.html.includes("escaped:workspace-1"), true);
  assert.equal(harness.elements.projectInfo.html.includes("<dd>2</dd>"), true);
  assert.equal(harness.elements.projectInfo.html.includes("<dd>3</dd>"), true);
  assert.equal(harness.elements.projectInfo.html.includes("labelHtml:eventCount:2"), true);
});

test("EditorShellPresentationController preserves AI, command-centre, quality, and termbase order", async () => {
  const { createEditorShellPresentationController } = await loadFactory();
  const project = { id: "project", name: "P", domain: "", aiSettings: { enabled: true } };
  const harness = createHarness(createEditorShellPresentationController, {
    project,
    inspectorToggleButton: null,
    storageLabel: "session storage"
  });
  harness.controller.render();
  const administration = harness.calls.find(([name]) => name === "presentation.renderAiAdministration");
  assert.deepEqual(administration[1], {
    settings: harness.normalizedSettings,
    storedKey: "stored-key",
    rememberKey: true,
    storageText:
      "OpenAI key: session storage. API keys stay in this browser and are never exported with project packages."
  });
  assert.deepEqual(
    harness.calls.filter(([name]) => name.startsWith("presentation.render")).map(([name]) => name),
    [
      "presentation.renderAiAdministration",
      "presentation.renderAiCommandCentre",
      "presentation.renderQualityWorkbench",
      "presentation.renderTermbaseSelect"
    ]
  );
});

test("EditorShellPresentationController does not await desktop spellcheck synchronization", async () => {
  const { createEditorShellPresentationController } = await loadFactory();
  let resolveSpellcheck;
  const spellcheckResult = new Promise((resolve) => {
    resolveSpellcheck = resolve;
  });
  const harness = createHarness(createEditorShellPresentationController, {
    projectReads: [null, null],
    spellcheckResult,
    inspectorToggleButton: null
  });
  assert.equal(harness.controller.render(), undefined);
  assert.equal(
    harness.calls.some(([name]) => name === "workspace.renderStatus"),
    true
  );
  resolveSpellcheck("done");
  assert.equal(await spellcheckResult, "done");
});

test("EditorShellPresentationController preserves representative failure short circuiting", async () => {
  const { createEditorShellPresentationController } = await loadFactory();
  for (const failAt of [
    "application.getNavigation:1",
    "application.syncLegacy",
    "localization.locale",
    "application.dispatchLocale",
    "session.getProject:1",
    "language.syncDesktopSpellcheck",
    "workspace.renderStatus",
    "workspace.renderBackupReminder",
    "vertical.getState",
    "focus.render",
    "session.getProject:2"
  ]) {
    const failure = new Error(`${failAt} boundary`);
    const harness = createHarness(createEditorShellPresentationController, { failAt, failure });
    assert.throws(() => harness.controller.render(), failure);
  }
  const project = { id: "p", name: "P", domain: "", aiSettings: {} };
  for (const failAt of [
    "resources.summary",
    "text.displaySafeText",
    "presentation.replaceSafeHtml",
    "ai.normalizeSettings",
    "ai.storedKey",
    "ai.openAiSnapshot",
    "ai.storageLabel",
    "presentation.renderAiAdministration",
    "presentation.renderAiCommandCentre",
    "presentation.renderQualityWorkbench",
    "presentation.renderTermbaseSelect"
  ]) {
    const failure = new Error(`${failAt} boundary`);
    const harness = createHarness(createEditorShellPresentationController, {
      failAt,
      failure,
      project,
      inspectorToggleButton: null
    });
    assert.throws(() => harness.controller.render(), failure);
  }
});

test("EditorShellPresentationController validates every owner and exposes an immutable API", async () => {
  const { createEditorShellPresentationController } = await loadFactory();
  const valid = createHarness(createEditorShellPresentationController);
  assert.equal(Object.isFrozen(valid.controller), true);
  assert.deepEqual(Object.keys(valid.controller), ["render"]);
  assert.throws(() => createEditorShellPresentationController(), TypeError);
  for (const options of [
    { ...valid.options, elements: { ...valid.options.elements, workspace: null } },
    { ...valid.options, elements: { ...valid.options.elements, projectInfo: null } },
    { ...valid.options, application: { ...valid.options.application, getNavigation: null } },
    { ...valid.options, session: { ...valid.options.session, getProject: null } },
    { ...valid.options, vertical: { getState: null } },
    { ...valid.options, localization: { ...valid.options.localization, source: null } },
    { ...valid.options, language: { ...valid.options.language, display: null } },
    { ...valid.options, workspace: { ...valid.options.workspace, renderStatus: null } },
    { ...valid.options, focus: { render: null } },
    { ...valid.options, resources: { summary: null } },
    { ...valid.options, documents: { list: null } },
    { ...valid.options, text: { ...valid.options.text, displaySafeHtml: null } },
    { ...valid.options, ai: { ...valid.options.ai, normalizeSettings: null } },
    { ...valid.options, presentation: { ...valid.options.presentation, renderTermbaseSelect: null } }
  ]) {
    assert.throws(() => createEditorShellPresentationController(options), TypeError);
  }
});
