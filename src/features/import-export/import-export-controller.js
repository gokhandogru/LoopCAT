function requireElement(value, name) {
  if (!value?.addEventListener) throw new TypeError(`ImportExportController requires ${name}.`);
  return value;
}

function createElement(ownerDocument, tagName, { className = "", text = "" } = {}) {
  const element = ownerDocument.createElement(tagName);
  if (className) element.className = className;
  element.textContent = String(text ?? "");
  return element;
}

/**
 * Owns import/export/report control events, file-input lifecycle, shared import
 * busy state, and validation-report presentation. Parsing, format rebuilding,
 * package/backup mutation, pending-save flushing, report generation, downloads,
 * validation/redaction policy, activity history, and workspace dirtiness remain
 * behind injected application actions.
 *
 * @param {{
 *   elements: Record<string, any>,
 *   hasProject?: () => boolean,
 *   runImportTask?: (label: string, action: () => Promise<unknown>) => Promise<unknown>,
 *   importProjectFile?: (file: File) => Promise<unknown>,
 *   importProjectPackage?: (file: File) => Promise<unknown>,
 *   restoreBackup?: (file: File) => Promise<unknown>,
 *   importTmx?: (file: File) => Promise<unknown>,
 *   importTbx?: (file: File) => Promise<unknown>,
 *   importTermList?: (file: File) => Promise<unknown>,
 *   exportProjectPackage?: () => Promise<unknown> | unknown,
 *   exportTargetDocx?: () => Promise<unknown> | unknown,
 *   exportBilingualDocx?: () => Promise<unknown> | unknown,
 *   exportTargetText?: () => Promise<unknown> | unknown,
 *   exportLocalization?: () => Promise<unknown> | unknown,
 *   exportXliff12?: () => Promise<unknown> | unknown,
 *   exportXliff22?: () => Promise<unknown> | unknown,
 *   exportProjectReport?: () => Promise<unknown> | unknown,
 *   exportQualityPassport?: () => Promise<unknown> | unknown,
 *   exportAnonymizedReport?: () => Promise<unknown> | unknown,
 *   exportTmx?: () => Promise<unknown> | unknown,
 *   exportTbx?: () => Promise<unknown> | unknown,
 *   exportBackup?: () => Promise<unknown> | unknown,
 *   onValidationDismiss?: () => void,
 *   scheduleFrame?: (callback: () => void) => unknown,
 *   setTimer?: (callback: () => void, delay: number) => unknown,
 *   clearTimer?: (timer: unknown) => void,
 *   onError?: (error: unknown, context: { phase: string }) => void
 * }} options
 */
export function createImportExportController(options) {
  const elements = /** @type {any} */ (options?.elements || {});
  const projectFileImportButton = requireElement(elements.projectFileImportButton, "the project-file import button");
  const projectsImportProjectButton = requireElement(
    elements.projectsImportProjectButton,
    "the Projects package-import button"
  );
  const projectFileImportInput = requireElement(elements.projectFileImportInput, "the project-file input");
  const docxInput = requireElement(elements.docxInput, "the DOCX input");
  const localizationInput = requireElement(elements.localizationInput, "the localization-file input");
  const projectPackageImportInput = requireElement(elements.projectPackageImportInput, "the project-package input");
  const backupImportInput = requireElement(elements.backupImportInput, "the backup input");
  const tmxImportInput = requireElement(elements.tmxImportInput, "the project TMX input");
  const tbxImportInput = requireElement(elements.tbxImportInput, "the project TBX input");
  const termListImportInput = requireElement(elements.termListImportInput, "the project term-list input");
  const projectPackageExportButton = requireElement(
    elements.projectPackageExportButton,
    "the project-package export button"
  );
  const exportTargetDocxButton = requireElement(elements.exportTargetDocxButton, "the target DOCX button");
  const exportBilingualDocxButton = requireElement(elements.exportBilingualDocxButton, "the bilingual DOCX button");
  const exportTargetTextButton = requireElement(elements.exportTargetTextButton, "the target TXT button");
  const exportLocalizationButton = requireElement(elements.exportLocalizationButton, "the current-file export button");
  const exportXliff12Button = requireElement(elements.exportXliff12Button, "the XLIFF 1.2 button");
  const exportXliff22Button = requireElement(elements.exportXliff22Button, "the XLIFF 2.2 button");
  const exportProjectReportButton = requireElement(elements.exportProjectReportButton, "the project-report button");
  const exportQualityPassportButton = requireElement(
    elements.exportQualityPassportButton,
    "the Quality Passport menu button"
  );
  const exportAnonymizedReportButton = requireElement(
    elements.exportAnonymizedReportButton,
    "the anonymized-report button"
  );
  const tmxExportButton = requireElement(elements.tmxExportButton, "the TMX export button");
  const tbxExportButton = requireElement(elements.tbxExportButton, "the TBX export button");
  const backupExportButton = requireElement(elements.backupExportButton, "the browser-backup export button");
  const validationPanel = requireElement(elements.validationPanel, "the validation panel");
  const validationMeta = requireElement(elements.validationMeta, "the validation summary");
  const validationList = requireElement(elements.validationList, "the validation list");

  const ownerDocument = validationPanel.ownerDocument || projectFileImportInput.ownerDocument || globalThis.document;
  const hasProject = typeof options?.hasProject === "function" ? options.hasProject : () => false;
  const scheduleFrame = typeof options?.scheduleFrame === "function" ? options.scheduleFrame : (callback) => callback();
  const setTimer = typeof options?.setTimer === "function" ? options.setTimer : globalThis.setTimeout;
  const clearTimer = typeof options?.clearTimer === "function" ? options.clearTimer : globalThis.clearTimeout;
  const reportError = typeof options?.onError === "function" ? options.onError : () => {};
  const listeners = [];
  const importControls = [
    elements.projectFileImportButton,
    docxInput,
    localizationInput,
    projectFileImportInput,
    elements.fileEncodingSelect,
    tmxImportInput,
    tbxImportInput,
    termListImportInput,
    elements.resourceTmxImportInput,
    elements.resourceTbxImportInput,
    elements.resourceTermListImportInput,
    projectPackageImportInput,
    backupImportInput
  ].filter(Boolean);
  let mounted = false;
  let validationTimer = null;
  let validationReturnTarget = null;
  /** @type {Readonly<{ busy: boolean, validationVisible: boolean, validationCount: number }>} */
  let currentState = Object.freeze({ busy: false, validationVisible: false, validationCount: 0 });

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

  function runImport(label, action) {
    if (typeof options?.runImportTask === "function") return options.runImportTask(label, action);
    return Promise.resolve().then(action);
  }

  async function importSingle(input, label, importer, requireProject = false) {
    const file = input.files?.[0];
    try {
      if (!file || typeof importer !== "function" || (requireProject && !hasProject())) return;
      await runImport(label, () => importer(file));
    } catch (error) {
      reportError(error, { phase: `import-${label.toLowerCase().replace(/\s+/g, "-")}` });
    } finally {
      input.value = "";
    }
  }

  async function importManyProjectFiles() {
    const files = Array.from(projectFileImportInput.files || []);
    try {
      if (!hasProject() || typeof options?.importProjectFile !== "function") return;
      for (const file of files) {
        await runImport("Project file import", () => options.importProjectFile(file));
      }
    } catch (error) {
      reportError(error, { phase: "import-project-files" });
    } finally {
      projectFileImportInput.value = "";
    }
  }

  function renderBusy(busy) {
    const active = Boolean(busy);
    importControls.forEach((control) => {
      control.disabled = active;
      control.setAttribute?.("aria-busy", String(active));
    });
    currentState = Object.freeze({ ...currentState, busy: active });
  }

  function clearValidationTimer() {
    if (validationTimer === null) return;
    clearTimer(validationTimer);
    validationTimer = null;
  }

  function restoreValidationFocus() {
    if (!validationReturnTarget?.focus || validationReturnTarget?.isConnected === false) return;
    validationReturnTarget.focus();
    scheduleFrame(() => validationReturnTarget?.focus?.());
  }

  function dismissValidation({ notify = true } = {}) {
    const focusWasInside = validationPanel.contains?.(ownerDocument?.activeElement);
    clearValidationTimer();
    validationPanel.classList.toggle("hidden", true);
    validationPanel.toggleAttribute?.("hidden", true);
    validationMeta.replaceChildren();
    validationList.replaceChildren();
    currentState = Object.freeze({ ...currentState, validationVisible: false, validationCount: 0 });
    if (notify) options?.onValidationDismiss?.();
    if (focusWasInside) restoreValidationFocus();
  }

  /**
   * @param {{
   *   report?: Record<string, string[]> | null,
   *   summary?: string,
   *   groups?: Array<{ key: string, label: string }>,
   *   dismissLabel?: string,
   *   dismissText?: string,
   *   emptyLabel?: string,
   *   autoDismissMs?: number
   * }} context
   */
  function renderValidation({
    report = null,
    summary = "",
    groups = [],
    dismissLabel = "Dismiss validation report",
    dismissText = "Dismiss",
    emptyLabel = "No validation issues.",
    autoDismissMs = 0
  } = {}) {
    clearValidationTimer();
    if (!report) {
      dismissValidation({ notify: false });
      return;
    }
    if (!validationPanel.contains?.(ownerDocument?.activeElement)) {
      validationReturnTarget = ownerDocument?.activeElement || validationReturnTarget;
    }
    validationPanel.classList.toggle("hidden", false);
    validationPanel.toggleAttribute?.("hidden", false);
    const summaryText = createElement(ownerDocument, "span", { text: summary });
    const dismissButton = createElement(ownerDocument, "button", { text: dismissText });
    dismissButton.type = "button";
    dismissButton.className = "validation-dismiss";
    dismissButton.setAttribute("aria-label", dismissLabel);
    validationMeta.replaceChildren(summaryText, dismissButton);

    const items = [];
    for (const group of groups) {
      for (const message of report[group.key] || []) items.push({ label: group.label, message });
    }
    if (!items.length) {
      validationList.replaceChildren(createElement(ownerDocument, "div", { className: "muted", text: emptyLabel }));
    } else {
      const list = createElement(ownerDocument, "div", { className: "validation-items" });
      items.forEach((item) => {
        const row = createElement(ownerDocument, "div", { className: "validation-item" });
        row.append(
          createElement(ownerDocument, "strong", { text: item.label }),
          ownerDocument.createTextNode?.(`: ${item.message}`) ||
            createElement(ownerDocument, "span", { text: `: ${item.message}` })
        );
        list.append(row);
      });
      validationList.replaceChildren(list);
    }
    currentState = Object.freeze({
      ...currentState,
      validationVisible: true,
      validationCount: items.length
    });
    if (autoDismissMs > 0) {
      validationTimer = setTimer(() => dismissValidation(), autoDismissMs);
    }
  }

  function mount() {
    if (mounted) return false;
    listen(projectFileImportButton, "click", () => projectFileImportInput.click?.());
    listen(projectsImportProjectButton, "click", () => projectPackageImportInput.click?.());
    listen(
      docxInput,
      "change",
      () => void importSingle(docxInput, "Project file import", options.importProjectFile, true)
    );
    listen(
      localizationInput,
      "change",
      () => void importSingle(localizationInput, "Project file import", options.importProjectFile, true)
    );
    listen(projectFileImportInput, "change", () => void importManyProjectFiles());
    listen(
      projectPackageImportInput,
      "change",
      () => void importSingle(projectPackageImportInput, "Project package import", options.importProjectPackage)
    );
    listen(
      backupImportInput,
      "change",
      () => void importSingle(backupImportInput, "Backup restore", options.restoreBackup)
    );
    listen(tmxImportInput, "change", () => void importSingle(tmxImportInput, "TMX import", options.importTmx));
    listen(tbxImportInput, "change", () => void importSingle(tbxImportInput, "TBX import", options.importTbx));
    listen(
      termListImportInput,
      "change",
      () => void importSingle(termListImportInput, "Term list import", options.importTermList)
    );

    const actions = [
      [projectPackageExportButton, "export-project-package", options.exportProjectPackage],
      [exportTargetDocxButton, "export-target-docx", options.exportTargetDocx],
      [exportBilingualDocxButton, "export-bilingual-docx", options.exportBilingualDocx],
      [exportTargetTextButton, "export-target-text", options.exportTargetText],
      [exportLocalizationButton, "export-localization", options.exportLocalization],
      [exportXliff12Button, "export-xliff-12", options.exportXliff12],
      [exportXliff22Button, "export-xliff-22", options.exportXliff22],
      [exportProjectReportButton, "export-project-report", options.exportProjectReport],
      [exportQualityPassportButton, "export-quality-passport", options.exportQualityPassport],
      [exportAnonymizedReportButton, "export-anonymized-report", options.exportAnonymizedReport],
      [tmxExportButton, "export-tmx", options.exportTmx],
      [tbxExportButton, "export-tbx", options.exportTbx],
      [backupExportButton, "export-backup", options.exportBackup]
    ];
    actions.forEach(([button, phase, action]) => {
      listen(button, "click", () => void runAction(phase, action));
    });
    listen(validationMeta, "click", (event) => {
      if (!event.target?.closest?.(".validation-dismiss")) return;
      dismissValidation();
    });
    mounted = true;
    return true;
  }

  function unmount() {
    if (!mounted) return false;
    clearValidationTimer();
    listeners.splice(0).forEach(({ target, eventType, listener }) => target.removeEventListener(eventType, listener));
    mounted = false;
    return true;
  }

  return Object.freeze({
    dismissValidation,
    getState: () => currentState,
    mount,
    renderBusy,
    renderValidation,
    unmount
  });
}
