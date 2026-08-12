const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const test = require("node:test");

const root = path.resolve(__dirname, "../..");
const moduleAt = (relativePath) => import(pathToFileURL(path.join(root, relativePath)).href);

function fakeDocument() {
  const document = {
    activeElement: null,
    createElement(tagName) {
      return fakeElement(document, tagName);
    },
    createDocumentFragment() {
      return fakeElement(document, "#fragment");
    },
    createTextNode(text) {
      return fakeTextNode(text);
    }
  };
  return document;
}

function fakeTextNode(text) {
  return { textContent: String(text || ""), parentElement: null };
}

function fakeElement(ownerDocument, tagName = "div") {
  const listeners = new Map();
  const classes = new Set();
  const attributes = new Map();
  let ownText = "";
  const element = {
    ownerDocument,
    tagName: tagName.toUpperCase(),
    children: [],
    parentElement: null,
    files: [],
    value: "",
    disabled: false,
    type: "",
    isConnected: true,
    classList: {
      add: (...names) => names.forEach((name) => classes.add(name)),
      remove: (...names) => names.forEach((name) => classes.delete(name)),
      contains: (name) => classes.has(name),
      toggle(name, force) {
        if (force === true || (force === undefined && !classes.has(name))) classes.add(name);
        else classes.delete(name);
      }
    },
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
        target: element,
        preventDefault() {
          this.defaultPrevented = true;
        },
        ...event
      };
      for (const listener of [...(listeners.get(type) || [])]) listener(dispatched);
      return dispatched;
    },
    click() {
      element.clicked = (element.clicked || 0) + 1;
      element.dispatch("click");
    },
    append(...nodes) {
      nodes.forEach((node) => {
        if (node?.tagName === "#FRAGMENT") {
          element.append(...node.children);
          node.children = [];
          return;
        }
        if (!node) return;
        node.parentElement = element;
        element.children.push(node);
      });
    },
    replaceChildren(...nodes) {
      element.children.forEach((child) => {
        child.parentElement = null;
      });
      element.children = [];
      ownText = "";
      element.append(...nodes);
    },
    contains(candidate) {
      return candidate === element || element.children.some((child) => child.contains?.(candidate));
    },
    closest(selector) {
      if (selector === ".validation-dismiss" && classes.has("validation-dismiss")) return element;
      return element.parentElement?.closest?.(selector) || null;
    },
    querySelector(selector) {
      if (selector === ".validation-dismiss" && classes.has("validation-dismiss")) return element;
      for (const child of element.children) {
        const match = child.querySelector?.(selector);
        if (match) return match;
      }
      return null;
    },
    setAttribute(name, value) {
      attributes.set(name, String(value));
    },
    getAttribute(name) {
      return attributes.get(name) ?? null;
    },
    toggleAttribute(name, force) {
      if (force === true || (force === undefined && !attributes.has(name))) attributes.set(name, "");
      else attributes.delete(name);
    },
    focus() {
      ownerDocument.activeElement = element;
      element.focused = (element.focused || 0) + 1;
    }
  };
  Object.defineProperty(element, "className", {
    get: () => [...classes].join(" "),
    set(value) {
      classes.clear();
      String(value || "")
        .split(/\s+/)
        .filter(Boolean)
        .forEach((name) => classes.add(name));
    }
  });
  Object.defineProperty(element, "textContent", {
    get: () => ownText + element.children.map((child) => child.textContent || "").join(""),
    set(value) {
      ownText = String(value ?? "");
      element.children = [];
    }
  });
  return element;
}

function importExportElements(ownerDocument) {
  const elements = Object.fromEntries(
    [
      "projectFileImportButton",
      "projectsImportProjectButton",
      "projectFileImportInput",
      "docxInput",
      "localizationInput",
      "projectPackageImportInput",
      "backupImportInput",
      "tmxImportInput",
      "tbxImportInput",
      "termListImportInput",
      "projectPackageExportButton",
      "exportTargetDocxButton",
      "exportBilingualDocxButton",
      "exportTargetTextButton",
      "exportLocalizationButton",
      "exportXliff12Button",
      "exportXliff22Button",
      "exportProjectReportButton",
      "exportQualityPassportButton",
      "exportAnonymizedReportButton",
      "tmxExportButton",
      "tbxExportButton",
      "backupExportButton",
      "validationPanel",
      "validationMeta",
      "validationList",
      "fileEncodingSelect",
      "resourceTmxImportInput",
      "resourceTbxImportInput",
      "resourceTermListImportInput"
    ].map((name) => [name, fakeElement(ownerDocument, name.includes("Input") ? "input" : "button")])
  );
  elements.validationPanel.append(elements.validationMeta, elements.validationList);
  return elements;
}

function createController(createImportExportController, elements, overrides = {}) {
  return createImportExportController({
    elements,
    hasProject: () => true,
    scheduleFrame: (callback) => callback(),
    ...overrides
  });
}

test("ImportExportController owns project, package, backup, TM, termbase, and report actions", async () => {
  const { createImportExportController } = await moduleAt("src/features/import-export/import-export-controller.js");
  const ownerDocument = fakeDocument();
  const elements = importExportElements(ownerDocument);
  const calls = [];
  const action = (name) => () => calls.push(name);
  const controller = createController(createImportExportController, elements, {
    exportProjectPackage: action("project-package"),
    exportTargetDocx: action("target-docx"),
    exportBilingualDocx: action("bilingual-docx"),
    exportTargetText: action("target-text"),
    exportLocalization: action("localization"),
    exportXliff12: action("xliff-12"),
    exportXliff22: action("xliff-22"),
    exportProjectReport: action("project-report"),
    exportQualityPassport: action("passport"),
    exportAnonymizedReport: action("anonymized"),
    exportTmx: action("tmx"),
    exportTbx: action("tbx"),
    exportBackup: action("backup")
  });
  controller.mount();
  assert.equal(controller.mount(), false);

  [
    elements.projectPackageExportButton,
    elements.exportTargetDocxButton,
    elements.exportBilingualDocxButton,
    elements.exportTargetTextButton,
    elements.exportLocalizationButton,
    elements.exportXliff12Button,
    elements.exportXliff22Button,
    elements.exportProjectReportButton,
    elements.exportQualityPassportButton,
    elements.exportAnonymizedReportButton,
    elements.tmxExportButton,
    elements.tbxExportButton,
    elements.backupExportButton
  ].forEach((button) => button.click());
  await Promise.resolve();

  assert.deepEqual(calls, [
    "project-package",
    "target-docx",
    "bilingual-docx",
    "target-text",
    "localization",
    "xliff-12",
    "xliff-22",
    "project-report",
    "passport",
    "anonymized",
    "tmx",
    "tbx",
    "backup"
  ]);
  assert.equal(controller.unmount(), true);
  elements.backupExportButton.click();
  assert.equal(calls.length, 13);
});

test("ImportExportController sequences project files and always resets input values", async () => {
  const { createImportExportController } = await moduleAt("src/features/import-export/import-export-controller.js");
  const ownerDocument = fakeDocument();
  const elements = importExportElements(ownerDocument);
  const calls = [];
  const controller = createController(createImportExportController, elements, {
    runImportTask: (label, task) => {
      calls.push(`task:${label}`);
      return task();
    },
    importProjectFile: (file) => calls.push(`file:${file.name}`),
    importProjectPackage: (file) => calls.push(`package:${file.name}`),
    restoreBackup: (file) => calls.push(`restore:${file.name}`),
    importTmx: (file) => calls.push(`tmx:${file.name}`),
    importTbx: (file) => calls.push(`tbx:${file.name}`),
    importTermList: (file) => calls.push(`terms:${file.name}`)
  });
  controller.mount();
  elements.projectFileImportInput.files = [{ name: "one.docx" }, { name: "two.html" }];
  elements.projectFileImportInput.value = "chosen";
  elements.projectFileImportInput.dispatch("change");
  await new Promise((resolve) => {
    setImmediate(resolve);
  });
  assert.deepEqual(calls.slice(0, 4), [
    "task:Project file import",
    "file:one.docx",
    "task:Project file import",
    "file:two.html"
  ]);
  assert.equal(elements.projectFileImportInput.value, "");

  const cases = [
    [elements.projectPackageImportInput, "project.loopcat", "package:project.loopcat"],
    [elements.backupImportInput, "backup.json", "restore:backup.json"],
    [elements.tmxImportInput, "memory.tmx", "tmx:memory.tmx"],
    [elements.tbxImportInput, "terms.tbx", "tbx:terms.tbx"],
    [elements.termListImportInput, "terms.csv", "terms:terms.csv"]
  ];
  for (const [input, name, expected] of cases) {
    input.files = [{ name }];
    input.value = "chosen";
    input.dispatch("change");
    await new Promise((resolve) => {
      setImmediate(resolve);
    });
    assert.equal(calls.includes(expected), true);
    assert.equal(input.value, "");
  }
});

test("ImportExportController exposes one shared import busy state", async () => {
  const { createImportExportController } = await moduleAt("src/features/import-export/import-export-controller.js");
  const ownerDocument = fakeDocument();
  const elements = importExportElements(ownerDocument);
  const controller = createController(createImportExportController, elements);
  controller.renderBusy(true);
  for (const element of [
    elements.projectFileImportButton,
    elements.docxInput,
    elements.localizationInput,
    elements.projectFileImportInput,
    elements.projectPackageImportInput,
    elements.backupImportInput,
    elements.tmxImportInput,
    elements.tbxImportInput,
    elements.termListImportInput,
    elements.resourceTmxImportInput
  ]) {
    assert.equal(element.disabled, true);
    assert.equal(element.getAttribute("aria-busy"), "true");
  }
  assert.equal(controller.getState().busy, true);
  controller.renderBusy(false);
  assert.equal(elements.backupImportInput.disabled, false);
});

test("ImportExportController renders validation safely and restores focus on dismissal", async () => {
  const { createImportExportController } = await moduleAt("src/features/import-export/import-export-controller.js");
  const ownerDocument = fakeDocument();
  const elements = importExportElements(ownerDocument);
  const dismissals = [];
  const controller = createController(createImportExportController, elements, {
    onValidationDismiss: () => dismissals.push("dismissed")
  });
  controller.mount();
  elements.exportProjectReportButton.focus();
  controller.renderValidation({
    report: {
      errors: ["<img src=x onerror=alert(1)>"],
      warnings: ["Warning text"],
      preserved: []
    },
    summary: "2 validation notes",
    groups: [
      { key: "errors", label: "Errors" },
      { key: "warnings", label: "Warnings" },
      { key: "preserved", label: "Preserved" }
    ],
    dismissLabel: "Dismiss validation report",
    emptyLabel: "No validation issues."
  });
  assert.equal(elements.validationPanel.classList.contains("hidden"), false);
  assert.match(elements.validationList.textContent, /<img src=x onerror=alert\(1\)>/);
  assert.equal(elements.validationList.querySelector("img"), null);
  const dismiss = elements.validationMeta.querySelector(".validation-dismiss");
  dismiss.focus();
  elements.validationMeta.dispatch("click", { target: dismiss });
  assert.equal(elements.validationPanel.classList.contains("hidden"), true);
  assert.equal(ownerDocument.activeElement, elements.exportProjectReportButton);
  assert.deepEqual(dismissals, ["dismissed"]);
  assert.equal(controller.getState().validationVisible, false);
});

test("ImportExportController owns validation timeout and reports rejected actions", async () => {
  const { createImportExportController } = await moduleAt("src/features/import-export/import-export-controller.js");
  const ownerDocument = fakeDocument();
  const elements = importExportElements(ownerDocument);
  const failures = [];
  const timers = [];
  const controller = createController(createImportExportController, elements, {
    exportBackup: () => Promise.reject(new Error("Backup failed")),
    setTimer: (callback, delay) => {
      timers.push({ callback, delay, cleared: false });
      return timers.length - 1;
    },
    clearTimer: (timer) => {
      timers[timer].cleared = true;
    },
    onError: (error, context) => failures.push([error.message, context.phase])
  });
  controller.mount();
  controller.renderValidation({
    report: { preserved: [] },
    summary: "Clear",
    groups: [{ key: "preserved", label: "Preserved" }],
    autoDismissMs: 7000
  });
  assert.equal(timers[0].delay, 7000);
  timers[0].callback();
  assert.equal(elements.validationPanel.classList.contains("hidden"), true);
  elements.backupExportButton.click();
  await new Promise((resolve) => {
    setImmediate(resolve);
  });
  assert.deepEqual(failures, [["Backup failed", "export-backup"]]);
});
