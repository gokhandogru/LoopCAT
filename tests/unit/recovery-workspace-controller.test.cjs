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
    }
  };
  return document;
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
    value: "",
    checked: false,
    disabled: false,
    open: false,
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
    hasAttribute(name) {
      return attributes.has(name);
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

function workspaceElements(ownerDocument) {
  const elements = Object.fromEntries(
    [
      "menu",
      "menuSummary",
      "health",
      "chooseWorkspaceButton",
      "saveProjectButton",
      "syncWorkspaceButton",
      "exportWorkspaceBackupButton",
      "repairWorkspaceButton",
      "recoveryPanel",
      "recoveryMessage",
      "recoveryList",
      "saveRecoveryButton",
      "openRecoveryButton",
      "dismissRecoveryButton",
      "backupReminderPanel",
      "backupReminderMessage",
      "exportRecoveryCopyButton",
      "dismissBackupReminderButton",
      "projectStorageStatus",
      "saveProjectToFolderInput",
      "projectChooseWorkspaceButton"
    ].map((name) => [name, fakeElement(ownerDocument, name === "menu" ? "details" : "div")])
  );
  elements.recoveryPanel.append(
    elements.recoveryMessage,
    elements.recoveryList,
    elements.saveRecoveryButton,
    elements.openRecoveryButton,
    elements.dismissRecoveryButton
  );
  elements.backupReminderPanel.append(
    elements.backupReminderMessage,
    elements.exportRecoveryCopyButton,
    elements.dismissBackupReminderButton
  );
  return elements;
}

function createController(createRecoveryWorkspaceController, elements, overrides = {}) {
  const translations = {
    "workspace.menu.summary": "Workspace",
    "workspace.menu.summaryDirty": ({ count }) => `Workspace (${count} unsaved)`,
    "workspace.status.folderTitle": "Workspace folder",
    "workspace.status.localTitle": "Local browser storage",
    "workspace.status.localDetail": "Your work stays in this browser.",
    "workspace.status.unsupportedDetail": "Folder storage unavailable.",
    "workspace.status.workspaceFolder": "Workspace folder",
    "workspace.status.folderDetail": ({ name }) => `Folder: ${name}`,
    "workspace.status.lastSync": ({ date }) => `Last sync: ${date}`,
    "workspace.status.folderContents": ({ packages, resources, backups }) =>
      `${packages} packages, ${resources} resources, ${backups} backups`,
    "workspace.status.dirtyWarning": ({ count }) => `${count} project packages need saving`
  };
  return createRecoveryWorkspaceController({
    elements,
    translate: (key, values = {}) => {
      const value = translations[key];
      return typeof value === "function" ? value(values) : value || key;
    },
    source: (text) => String(text || ""),
    label: (key, values = {}) =>
      key === "projectStorageFolder" ? `Project folder: ${values.name}` : "Default folder: Documents",
    formatDateTime: (value) => `date:${value}`,
    safeText: (value, fallback = "") => String(value || fallback).replace(/sk-[A-Za-z0-9_-]+/g, "[redacted]"),
    scheduleFrame: (callback) => callback(),
    ...overrides
  });
}

test("RecoveryWorkspaceController renders connected health, recovery, project storage, and backup state", async () => {
  const { createRecoveryWorkspaceController } = await moduleAt(
    "src/features/workspace/recovery-workspace-controller.js"
  );
  const ownerDocument = fakeDocument();
  const elements = workspaceElements(ownerDocument);
  const controller = createController(createRecoveryWorkspaceController, elements);
  const status = {
    supported: true,
    connected: true,
    name: "Client sk-secret folder",
    lastSyncedAt: "2026-08-12",
    projectCount: 2,
    resourceCount: 3,
    backupCount: 4,
    warnings: ["One package was skipped", "Another warning"]
  };

  controller.renderStatus({
    status,
    dirtyCount: 2,
    storageLine: "Storage: persistent - 10 MB used",
    storageWarnings: ["Local storage is nearly full"],
    hasProject: true
  });
  controller.renderRecovery({
    status,
    projects: [
      { id: "project-1", name: "First project" },
      { id: "project-2", name: "Second sk-secret project" }
    ]
  });
  controller.renderBackupReminder({ info: { reason: "This project has no recovery copy." } });

  assert.equal(elements.menuSummary.textContent, "Workspace (2 unsaved)");
  assert.match(elements.health.textContent, /Workspace folderFolder: Client \[redacted\] folder/);
  assert.match(elements.health.textContent, /2 packages, 3 resources, 4 backups/);
  assert.match(elements.health.textContent, /One package was skipped \(2 total\)/);
  assert.equal(elements.saveProjectButton.disabled, false);
  assert.equal(elements.syncWorkspaceButton.disabled, false);
  assert.equal(elements.projectStorageStatus.textContent, "Project folder: Client [redacted] folder");
  assert.match(elements.recoveryList.textContent, /First projectSecond \[redacted\] project/);
  assert.match(elements.backupReminderMessage.textContent, /no recovery copy/);
  assert.deepEqual(controller.getState(), {
    supported: true,
    connected: true,
    dirtyCount: 2,
    importBusy: false,
    recoveryDismissed: false
  });
});

test("RecoveryWorkspaceController exposes deterministic unsupported and busy states", async () => {
  const { createRecoveryWorkspaceController } = await moduleAt(
    "src/features/workspace/recovery-workspace-controller.js"
  );
  const ownerDocument = fakeDocument();
  const elements = workspaceElements(ownerDocument);
  const controller = createController(createRecoveryWorkspaceController, elements);

  controller.renderStatus({ status: { supported: false, connected: false }, importBusy: true });
  controller.renderRecovery({
    status: { supported: false, connected: false },
    projects: [{ id: "project-1", name: "Project" }],
    autosaving: true
  });

  assert.equal(elements.chooseWorkspaceButton.disabled, true);
  assert.equal(elements.saveProjectButton.disabled, true);
  assert.equal(elements.syncWorkspaceButton.disabled, true);
  assert.equal(elements.syncWorkspaceButton.getAttribute("aria-busy"), "true");
  assert.equal(elements.saveProjectToFolderInput.checked, false);
  assert.equal(elements.saveProjectToFolderInput.disabled, true);
  assert.equal(elements.projectChooseWorkspaceButton.disabled, true);
  assert.equal(elements.recoveryPanel.classList.contains("hidden"), true);
});

test("RecoveryWorkspaceController owns workspace actions without owning storage or recovery policy", async () => {
  const { createRecoveryWorkspaceController } = await moduleAt(
    "src/features/workspace/recovery-workspace-controller.js"
  );
  const ownerDocument = fakeDocument();
  const elements = workspaceElements(ownerDocument);
  const calls = [];
  const controller = createController(createRecoveryWorkspaceController, elements, {
    chooseWorkspace: () => calls.push("choose"),
    saveProject: () => calls.push("save"),
    syncWorkspace: () => calls.push("sync"),
    exportWorkspaceBackup: () => calls.push("backup"),
    repairWorkspace: () => calls.push("repair"),
    saveRecovery: () => calls.push("recover"),
    exportRecoveryCopy: () => calls.push("copy"),
    dismissBackupReminder: () => calls.push("dismiss-reminder")
  });
  controller.mount();
  assert.equal(controller.mount(), false);

  elements.chooseWorkspaceButton.click();
  elements.saveProjectButton.click();
  elements.syncWorkspaceButton.click();
  elements.exportWorkspaceBackupButton.click();
  elements.repairWorkspaceButton.click();
  elements.saveRecoveryButton.click();
  elements.exportRecoveryCopyButton.click();
  elements.dismissBackupReminderButton.click();
  await Promise.resolve();

  assert.deepEqual(calls, ["choose", "save", "sync", "backup", "repair", "recover", "copy", "dismiss-reminder"]);
  assert.equal(controller.unmount(), true);
  elements.chooseWorkspaceButton.click();
  assert.equal(calls.length, 8);
});

test("RecoveryWorkspaceController owns recovery dismissal and restores visible focus", async () => {
  const { createRecoveryWorkspaceController } = await moduleAt(
    "src/features/workspace/recovery-workspace-controller.js"
  );
  const ownerDocument = fakeDocument();
  const elements = workspaceElements(ownerDocument);
  const controller = createController(createRecoveryWorkspaceController, elements);
  const context = {
    status: { supported: true, connected: false },
    projects: [{ id: "project-1", name: "Recoverable project" }]
  };
  controller.mount();
  controller.renderRecovery(context);
  elements.dismissRecoveryButton.focus();
  elements.dismissRecoveryButton.click();
  assert.equal(elements.recoveryPanel.classList.contains("hidden"), true);
  assert.equal(ownerDocument.activeElement, elements.menuSummary);
  assert.equal(controller.getState().recoveryDismissed, true);

  controller.resetRecoveryDismissal({ render: true });
  assert.equal(elements.recoveryPanel.classList.contains("hidden"), false);
  elements.openRecoveryButton.click();
  assert.equal(elements.menu.open, true);
  assert.equal(ownerDocument.activeElement, elements.menuSummary);

  elements.exportRecoveryCopyButton.focus();
  controller.renderBackupReminder({ info: null });
  assert.equal(ownerDocument.activeElement, elements.menuSummary);
});

test("RecoveryWorkspaceController reports rejected application actions with a phase", async () => {
  const { createRecoveryWorkspaceController } = await moduleAt(
    "src/features/workspace/recovery-workspace-controller.js"
  );
  const ownerDocument = fakeDocument();
  const elements = workspaceElements(ownerDocument);
  const failures = [];
  const controller = createController(createRecoveryWorkspaceController, elements, {
    syncWorkspace: () => Promise.reject(new Error("Sync failed")),
    onError: (error, context) => failures.push([error.message, context.phase])
  });
  controller.mount();
  elements.syncWorkspaceButton.click();
  await new Promise((resolve) => {
    setImmediate(resolve);
  });
  assert.deepEqual(failures, [["Sync failed", "sync-workspace"]]);
});
