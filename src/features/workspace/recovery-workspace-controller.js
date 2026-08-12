function requireElement(value, name) {
  if (!value?.addEventListener) throw new TypeError(`RecoveryWorkspaceController requires ${name}.`);
  return value;
}

function createElement(ownerDocument, tagName, { className = "", text = "" } = {}) {
  const element = ownerDocument.createElement(tagName);
  if (className) element.className = className;
  element.textContent = String(text ?? "");
  return element;
}

/**
 * @typedef {Object} WorkspaceStatusView
 * @property {boolean} [supported]
 * @property {boolean} [connected]
 * @property {string} [name]
 * @property {string} [lastSyncedAt]
 * @property {number} [projectCount]
 * @property {number} [resourceCount]
 * @property {number} [backupCount]
 * @property {string[]} [warnings]
 */

/**
 * Owns workspace status, recovery, and backup-reminder DOM state and event
 * lifecycle. Directory handles, manifests, packages, validation, dirty-marker
 * persistence, autosave, import policy, jobs, and status reporting remain behind
 * injected application actions.
 *
 * @param {{
 *   elements: Record<string, any>,
 *   translate?: (key: string, values?: Record<string, unknown>) => string,
 *   source?: (text: string, values?: Record<string, unknown>) => string,
 *   label?: (key: string, values?: Record<string, unknown>) => string,
 *   formatDateTime?: (value: string) => string,
 *   safeText?: (value: unknown, fallback?: string) => string,
 *   chooseWorkspace?: () => Promise<unknown> | unknown,
 *   saveProject?: () => Promise<unknown> | unknown,
 *   syncWorkspace?: () => Promise<unknown> | unknown,
 *   exportWorkspaceBackup?: () => Promise<unknown> | unknown,
 *   repairWorkspace?: () => Promise<unknown> | unknown,
 *   saveRecovery?: () => Promise<unknown> | unknown,
 *   exportRecoveryCopy?: () => Promise<unknown> | unknown,
 *   dismissBackupReminder?: () => Promise<unknown> | unknown,
 *   scheduleFrame?: (callback: () => void) => unknown,
 *   onError?: (error: unknown, context: { phase: string }) => void
 * }} options
 */
export function createRecoveryWorkspaceController(options) {
  const elements = /** @type {any} */ (options?.elements || {});
  const menu = requireElement(elements.menu, "the workspace menu");
  const menuSummary = requireElement(elements.menuSummary, "the workspace menu summary");
  const health = requireElement(elements.health, "the workspace health summary");
  const chooseWorkspaceButton = requireElement(elements.chooseWorkspaceButton, "the choose-folder button");
  const saveProjectButton = requireElement(elements.saveProjectButton, "the save-project button");
  const syncWorkspaceButton = requireElement(elements.syncWorkspaceButton, "the workspace-sync button");
  const exportWorkspaceBackupButton = requireElement(elements.exportWorkspaceBackupButton, "the folder-backup button");
  const repairWorkspaceButton = requireElement(elements.repairWorkspaceButton, "the workspace-repair button");
  const recoveryPanel = requireElement(elements.recoveryPanel, "the workspace recovery panel");
  const recoveryMessage = requireElement(elements.recoveryMessage, "the workspace recovery message");
  const recoveryList = requireElement(elements.recoveryList, "the workspace recovery list");
  const saveRecoveryButton = requireElement(elements.saveRecoveryButton, "the recovery-save button");
  const openRecoveryButton = requireElement(elements.openRecoveryButton, "the recovery-open button");
  const dismissRecoveryButton = requireElement(elements.dismissRecoveryButton, "the recovery-dismiss button");
  const backupReminderPanel = requireElement(elements.backupReminderPanel, "the backup reminder panel");
  const backupReminderMessage = requireElement(elements.backupReminderMessage, "the backup reminder message");
  const exportRecoveryCopyButton = requireElement(elements.exportRecoveryCopyButton, "the recovery-copy button");
  const dismissBackupReminderButton = requireElement(
    elements.dismissBackupReminderButton,
    "the backup-reminder dismiss button"
  );
  const projectStorageStatus = requireElement(elements.projectStorageStatus, "the project storage status");
  const saveProjectToFolderInput = requireElement(elements.saveProjectToFolderInput, "the save-to-folder input");
  const projectChooseWorkspaceButton = requireElement(
    elements.projectChooseWorkspaceButton,
    "the project choose-folder button"
  );

  const ownerDocument =
    menu.ownerDocument || recoveryPanel.ownerDocument || backupReminderPanel.ownerDocument || globalThis.document;
  const translate = typeof options?.translate === "function" ? options.translate : (key) => String(key || "");
  const source = typeof options?.source === "function" ? options.source : (text) => String(text || "");
  const label = typeof options?.label === "function" ? options.label : (key) => String(key || "");
  const formatDateTime =
    typeof options?.formatDateTime === "function" ? options.formatDateTime : (value) => String(value || "");
  const safeText =
    typeof options?.safeText === "function" ? options.safeText : (value, fallback = "") => String(value || fallback);
  const scheduleFrame = typeof options?.scheduleFrame === "function" ? options.scheduleFrame : (callback) => callback();
  const reportError = typeof options?.onError === "function" ? options.onError : () => {};
  const listeners = [];
  let mounted = false;
  let recoveryDismissed = false;
  /** @type {Readonly<{ status: WorkspaceStatusView, projects: Array<{ id?: string, name?: string }>, autosaving: boolean }>} */
  let lastRecoveryContext = Object.freeze({ status: {}, projects: [], autosaving: false });
  /** @type {Readonly<{ supported: boolean, connected: boolean, dirtyCount: number, importBusy: boolean, recoveryDismissed: boolean }>} */
  let lastState = Object.freeze({
    supported: false,
    connected: false,
    dirtyCount: 0,
    importBusy: false,
    recoveryDismissed
  });

  function listen(target, eventType, listener) {
    target.addEventListener(eventType, listener);
    listeners.push({ target, eventType, listener });
  }

  function runAction(phase, action) {
    try {
      return Promise.resolve(action?.()).catch((error) => reportError(error, { phase }));
    } catch (error) {
      reportError(error, { phase });
      return Promise.resolve();
    }
  }

  function restoreMenuFocus() {
    menuSummary.focus?.();
    scheduleFrame(() => menuSummary.focus?.());
  }

  function warningNode(text) {
    return createElement(ownerDocument, "span", { className: "workspace-warning", text });
  }

  /** @param {{ status?: WorkspaceStatusView }} [context] */
  function renderProjectStorage({ status = {} } = {}) {
    if (!status.supported) {
      projectStorageStatus.textContent = source(
        "Folder saving is unavailable in this browser. Project packages can still be imported and exported manually."
      );
      saveProjectToFolderInput.checked = false;
      saveProjectToFolderInput.disabled = true;
      projectChooseWorkspaceButton.disabled = true;
      return;
    }
    saveProjectToFolderInput.disabled = false;
    projectChooseWorkspaceButton.disabled = false;
    projectStorageStatus.textContent = status.connected
      ? label("projectStorageFolder", {
          name: safeText(status.name, translate("workspace.status.workspaceFolder"))
        })
      : label("projectStorageDefault");
  }

  /** @param {{ busy?: boolean, status?: WorkspaceStatusView }} [context] */
  function renderBusy({ busy = false, status = {} } = {}) {
    syncWorkspaceButton.disabled = Boolean(busy) || !status.supported || !status.connected;
    syncWorkspaceButton.setAttribute("aria-busy", String(Boolean(busy)));
    lastState = Object.freeze({ ...lastState, importBusy: Boolean(busy) });
  }

  /**
   * @param {{
   *   status?: WorkspaceStatusView,
   *   dirtyCount?: number,
   *   storageLine?: string,
   *   storageWarnings?: string[],
   *   importBusy?: boolean,
   *   hasProject?: boolean
   * }} [context]
   */
  function renderStatus({
    status = {},
    dirtyCount = 0,
    storageLine = "",
    storageWarnings = [],
    importBusy = false,
    hasProject = false
  } = {}) {
    menuSummary.textContent = dirtyCount
      ? translate("workspace.menu.summaryDirty", { count: dirtyCount })
      : translate("workspace.menu.summary");
    const mode = status.connected
      ? translate("workspace.status.folderTitle")
      : translate("workspace.status.localTitle");
    const folderSupport = status.supported
      ? translate("workspace.status.localDetail")
      : translate("workspace.status.unsupportedDetail");
    const folderName = safeText(status.name, translate("workspace.status.workspaceFolder"));
    const fragment = ownerDocument.createDocumentFragment();
    fragment.append(
      createElement(ownerDocument, "strong", { text: mode }),
      createElement(ownerDocument, "span", {
        text: status.connected ? translate("workspace.status.folderDetail", { name: folderName }) : folderSupport
      }),
      createElement(ownerDocument, "span", { text: source(storageLine) })
    );
    if (status.connected) {
      fragment.append(
        createElement(ownerDocument, "span", {
          text: translate("workspace.status.lastSync", { date: formatDateTime(status.lastSyncedAt) })
        }),
        createElement(ownerDocument, "span", {
          text: translate("workspace.status.folderContents", {
            packages: status.projectCount || 0,
            resources: status.resourceCount || 0,
            backups: status.backupCount || 0
          })
        })
      );
    }
    if (dirtyCount) {
      fragment.append(warningNode(translate("workspace.status.dirtyWarning", { count: dirtyCount })));
    }
    for (const warning of storageWarnings || []) fragment.append(warningNode(source(warning)));
    if (status.warnings?.length) {
      fragment.append(
        warningNode(
          `${safeText(status.warnings[0])}${status.warnings.length > 1 ? ` (${status.warnings.length} total)` : ""}`
        )
      );
    }
    health.replaceChildren(fragment);
    chooseWorkspaceButton.disabled = !status.supported;
    saveProjectButton.disabled = !status.supported || !status.connected || !hasProject;
    exportWorkspaceBackupButton.disabled = !status.supported || !status.connected;
    repairWorkspaceButton.disabled = !status.supported || !status.connected;
    renderBusy({ busy: importBusy, status });
    renderProjectStorage({ status });
    lastState = Object.freeze({
      ...lastState,
      supported: Boolean(status.supported),
      connected: Boolean(status.connected),
      dirtyCount: Number(dirtyCount || 0)
    });
  }

  /**
   * @param {{
   *   status?: WorkspaceStatusView,
   *   projects?: Array<{ id?: string, name?: string }>,
   *   autosaving?: boolean
   * }} [context]
   */
  function renderRecovery({ status = {}, projects = [], autosaving = false } = {}) {
    const context = Object.freeze({ status, projects: [...projects], autosaving: Boolean(autosaving) });
    lastRecoveryContext = context;
    const hadFocus = recoveryPanel.contains?.(ownerDocument?.activeElement);
    const shouldShow = Boolean(status.supported) && !recoveryDismissed && projects.length > 0;
    recoveryPanel.classList.toggle("hidden", !shouldShow);
    recoveryPanel.toggleAttribute?.("hidden", !shouldShow);
    if (!shouldShow) {
      recoveryList.replaceChildren();
      if (hadFocus) restoreMenuFocus();
      lastState = Object.freeze({ ...lastState, recoveryDismissed });
      return;
    }
    recoveryMessage.textContent = status.connected
      ? source("Your edits are saved in LoopCAT but have not yet been copied to your workspace folder.")
      : source("Your edits are saved in this browser. Choose your workspace folder to keep a visible recovery copy.");
    const fragment = ownerDocument.createDocumentFragment();
    projects.forEach((project) => {
      fragment.append(createElement(ownerDocument, "li", { text: safeText(project.name || project.id) }));
    });
    recoveryList.replaceChildren(fragment);
    saveRecoveryButton.disabled = !status.supported || Boolean(autosaving);
    saveRecoveryButton.setAttribute("aria-busy", String(Boolean(autosaving)));
    lastState = Object.freeze({ ...lastState, recoveryDismissed });
  }

  function resetRecoveryDismissal({ render = false } = {}) {
    recoveryDismissed = false;
    lastState = Object.freeze({ ...lastState, recoveryDismissed });
    if (render) renderRecovery(lastRecoveryContext);
  }

  function dismissRecovery() {
    recoveryDismissed = true;
    renderRecovery(lastRecoveryContext);
  }

  function openWorkspaceForRecovery() {
    menu.open = true;
    restoreMenuFocus();
  }

  /** @param {{ info?: { reason?: string } | null }} [context] */
  function renderBackupReminder({ info = null } = {}) {
    const hadFocus = backupReminderPanel.contains?.(ownerDocument?.activeElement);
    backupReminderPanel.classList.toggle("hidden", !info);
    backupReminderPanel.toggleAttribute?.("hidden", !info);
    if (!info) {
      backupReminderMessage.textContent = "";
      if (hadFocus) restoreMenuFocus();
      return;
    }
    backupReminderMessage.textContent = source(
      `${info.reason} Export a portable project package so this work can be recovered outside this browser profile.`
    );
  }

  function mount() {
    if (mounted) return false;
    listen(chooseWorkspaceButton, "click", () => void runAction("choose-workspace", options.chooseWorkspace));
    listen(saveProjectButton, "click", () => void runAction("save-project", options.saveProject));
    listen(syncWorkspaceButton, "click", () => void runAction("sync-workspace", options.syncWorkspace));
    listen(
      exportWorkspaceBackupButton,
      "click",
      () => void runAction("export-workspace-backup", options.exportWorkspaceBackup)
    );
    listen(repairWorkspaceButton, "click", () => void runAction("repair-workspace", options.repairWorkspace));
    listen(saveRecoveryButton, "click", () => void runAction("save-recovery", options.saveRecovery));
    listen(openRecoveryButton, "click", (event) => {
      event.stopPropagation?.();
      openWorkspaceForRecovery();
    });
    listen(dismissRecoveryButton, "click", dismissRecovery);
    listen(exportRecoveryCopyButton, "click", () => void runAction("export-recovery-copy", options.exportRecoveryCopy));
    listen(
      dismissBackupReminderButton,
      "click",
      () => void runAction("dismiss-backup-reminder", options.dismissBackupReminder)
    );
    mounted = true;
    return true;
  }

  function unmount() {
    if (!mounted) return false;
    listeners.splice(0).forEach(({ target, eventType, listener }) => target.removeEventListener(eventType, listener));
    mounted = false;
    return true;
  }

  return Object.freeze({
    dismissRecovery,
    getState: () => lastState,
    mount,
    openWorkspaceForRecovery,
    renderBackupReminder,
    renderBusy,
    renderProjectStorage,
    renderRecovery,
    renderStatus,
    resetRecoveryDismissal,
    unmount
  });
}
