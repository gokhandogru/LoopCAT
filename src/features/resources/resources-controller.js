function requireElement(value, name) {
  if (!value?.addEventListener) throw new TypeError(`ResourcesController requires ${name}.`);
  return value;
}

function resourceType(value) {
  return value === "tb" ? "tb" : "tm";
}

/**
 * Owns Resources view state and DOM event lifecycle. Persistence, parsing,
 * validation, exports, project linking, and workspace dirtiness stay behind
 * injected application actions.
 *
 * @param {{
 *   elements: Record<string, any>,
 *   render: (state: { type: "tm" | "tb", openKey: string | null, tmEntries: any[], terms: any[] }) => void,
 *   keyForItem: (item: any, type: "tm" | "tb") => string,
 *   navigate?: () => Promise<unknown> | unknown,
 *   normalizeLanguageInput?: (input: any) => unknown,
 *   runImportTask?: (label: string, task: () => Promise<unknown>) => Promise<unknown>,
 *   importTm?: (file: File) => Promise<unknown>,
 *   importTb?: (file: File) => Promise<unknown>,
 *   importTermList?: (file: File) => Promise<unknown>,
 *   deleteResource?: (type: "tm" | "tb", key: string) => Promise<boolean>,
 *   exportResource?: (type: "tm" | "tb", key: string) => Promise<unknown> | unknown,
 *   saveTmEntry?: (entry: any, values: { source: string, target: string }) => Promise<boolean>,
 *   deleteTmEntry?: (entry: any) => Promise<boolean>,
 *   saveTerm?: (term: any, values: { sourceTerm: string, targetTerm: string, notes: string, isForbidden: boolean }) => Promise<boolean>,
 *   deleteTerm?: (term: any) => Promise<boolean>,
 *   confirmEntryDelete?: (type: "tm" | "tb") => boolean,
 *   scheduleFrame?: (callback: () => void) => unknown,
 *   onError?: (error: unknown, context: { phase: string, type?: "tm" | "tb" }) => void
 * }} options
 */
export function createResourcesController(options) {
  const elements = /** @type {any} */ (options?.elements || {});
  const viewButton = requireElement(elements.viewButton, "the Resources navigation button");
  const tmTab = requireElement(elements.tmTab, "the translation-memory tab");
  const tbTab = requireElement(elements.tbTab, "the termbase tab");
  const tmPanel = requireElement(elements.tmPanel, "the translation-memory panel");
  const tbPanel = requireElement(elements.tbPanel, "the termbase panel");
  const tmDashboard = requireElement(elements.tmDashboard, "the translation-memory dashboard");
  const tbDashboard = requireElement(elements.tbDashboard, "the termbase dashboard");
  const tmDetail = requireElement(elements.tmDetail, "the translation-memory detail");
  const tbDetail = requireElement(elements.tbDetail, "the termbase detail");
  const tmImportInput = requireElement(elements.tmImportInput, "the TMX resource input");
  const tbImportInput = requireElement(elements.tbImportInput, "the TBX resource input");
  const termListImportInput = requireElement(elements.termListImportInput, "the term-list resource input");
  const renderView = typeof options?.render === "function" ? options.render : null;
  const keyForItem = typeof options?.keyForItem === "function" ? options.keyForItem : null;
  if (!renderView || !keyForItem)
    throw new TypeError("ResourcesController requires render and resource-key boundaries.");

  const scheduleFrame = typeof options?.scheduleFrame === "function" ? options.scheduleFrame : (callback) => callback();
  const reportError = typeof options?.onError === "function" ? options.onError : () => {};
  const listeners = [];
  let mounted = false;
  let type = /** @type {"tm" | "tb"} */ ("tm");
  let openKey = null;
  let tmEntries = [];
  let terms = [];

  function listen(target, eventType, listener) {
    if (!target?.addEventListener) return;
    target.addEventListener(eventType, listener);
    listeners.push({ target, eventType, listener });
  }

  function snapshot() {
    return Object.freeze({ type, openKey, tmEntries: [...tmEntries], terms: [...terms] });
  }

  function syncTabs() {
    const isTm = type === "tm";
    tmTab.classList?.toggle?.("active", isTm);
    tbTab.classList?.toggle?.("active", !isTm);
    tmTab.setAttribute?.("aria-selected", String(isTm));
    tbTab.setAttribute?.("aria-selected", String(!isTm));
    tmTab.setAttribute?.("tabindex", isTm ? "0" : "-1");
    tbTab.setAttribute?.("tabindex", isTm ? "-1" : "0");
    tmPanel.classList?.toggle?.("hidden", !isTm);
    tbPanel.classList?.toggle?.("hidden", isTm);
    tmPanel.toggleAttribute?.("hidden", !isTm);
    tbPanel.toggleAttribute?.("hidden", isTm);
  }

  function focusedAction() {
    const ownerDocument =
      tmDashboard.ownerDocument || tbDashboard.ownerDocument || tmDetail.ownerDocument || tbDetail.ownerDocument;
    const activeElement = ownerDocument?.activeElement;
    const roots = [tmDashboard, tbDashboard, tmDetail, tbDetail];
    if (!activeElement || !roots.some((root) => root.contains?.(activeElement))) return null;
    const button = activeElement.closest?.("[data-resource-action]");
    if (!button) return null;
    return {
      action: String(button.dataset?.resourceAction || ""),
      type: resourceType(button.dataset?.resourceType || type),
      key: String(button.dataset?.resourceKey || ""),
      id: String(button.dataset?.resourceId || "")
    };
  }

  function restoreFocusedAction(descriptor) {
    if (!descriptor) return;
    if (descriptor.action === "close-detail") {
      if (!openKey || descriptor.type !== type) return;
      const detail = type === "tm" ? tmDetail : tbDetail;
      detail.querySelector?.('[data-resource-action="close-detail"]')?.focus?.();
      return;
    }
    const dashboard = descriptor.type === "tm" ? tmDashboard : tbDashboard;
    actionButton(dashboard, descriptor.action, descriptor.key, descriptor.id)?.focus?.();
  }

  function render() {
    const focusDescriptor = focusedAction();
    syncTabs();
    renderView(snapshot());
    if (focusDescriptor) scheduleFrame(() => restoreFocusedAction(focusDescriptor));
  }

  function setResources(resources = {}, renderAfter = true) {
    tmEntries = Array.isArray(resources.tmEntries) ? resources.tmEntries : [];
    terms = Array.isArray(resources.terms) ? resources.terms : [];
    if (renderAfter) render();
    return snapshot();
  }

  function selectType(nextType, options = {}) {
    type = resourceType(nextType);
    openKey = null;
    if (options.render !== false) render();
    if (options.focus) {
      const focusTab = () => (type === "tm" ? tmTab : tbTab).focus?.();
      focusTab();
      scheduleFrame(focusTab);
    }
    return snapshot();
  }

  function openResource(nextType, key, options = {}) {
    type = resourceType(nextType);
    openKey = String(key || "") || null;
    if (options.render !== false) render();
    if (options.focus !== false) {
      const focusClose = () => {
        const detail = type === "tm" ? tmDetail : tbDetail;
        detail.querySelector?.('[data-resource-action="close-detail"]')?.focus?.();
      };
      focusClose();
      scheduleFrame(focusClose);
    }
    return snapshot();
  }

  function actionButton(root, action, key = "", id = "") {
    return Array.from(root?.querySelectorAll?.("[data-resource-action]") || []).find(
      (button) =>
        button.dataset?.resourceAction === action &&
        (!key || button.dataset?.resourceKey === key) &&
        (!id || button.dataset?.resourceId === id)
    );
  }

  function closeResource(options = {}) {
    const closingType = type;
    const closingKey = openKey || "";
    openKey = null;
    if (options.render !== false) render();
    if (options.focus !== false) {
      const restoreDashboardFocus = () => {
        const dashboard = closingType === "tm" ? tmDashboard : tbDashboard;
        (actionButton(dashboard, "open", closingKey) || (closingType === "tm" ? tmTab : tbTab)).focus?.();
      };
      restoreDashboardFocus();
      scheduleFrame(restoreDashboardFocus);
    }
    return snapshot();
  }

  function items(nextType, key = openKey) {
    if (!key) return [];
    const normalizedType = resourceType(nextType);
    const source = normalizedType === "tm" ? tmEntries : terms;
    return source
      .filter((item) => keyForItem(item, normalizedType) === key)
      .sort((left, right) =>
        String(left.source || left.sourceTerm || "").localeCompare(String(right.source || right.sourceTerm || ""))
      );
  }

  function itemById(nextType, id) {
    const source = resourceType(nextType) === "tm" ? tmEntries : terms;
    return source.find((item) => String(item.id || "") === String(id || "")) || null;
  }

  function actionFromEvent(event, root) {
    const button = event.target?.closest?.("[data-resource-action]");
    if (!button || (root.contains && !root.contains(button))) return null;
    return button;
  }

  async function handleDashboardAction(event, root) {
    const button = actionFromEvent(event, root);
    if (!button) return;
    const action = button.dataset.resourceAction;
    const actionType = resourceType(button.dataset.resourceType);
    const key = String(button.dataset.resourceKey || "");
    try {
      if (action === "open") {
        openResource(actionType, key);
        return;
      }
      if (action === "import") {
        (actionType === "tm" ? tmImportInput : tbImportInput).click?.();
        return;
      }
      if (action === "export") {
        await options.exportResource?.(actionType, key);
        return;
      }
      if (action === "delete-resource") {
        const deleted = await options.deleteResource?.(actionType, key);
        if (deleted) scheduleFrame(() => (actionType === "tm" ? tmTab : tbTab).focus?.());
      }
    } catch (error) {
      reportError(error, { phase: `dashboard-${action || "unknown"}`, type: actionType });
    }
  }

  /** @returns {any} */
  function rowValues(row, actionType) {
    if (actionType === "tm") {
      return {
        source: row.querySelector?.('[data-field="source"]')?.value || "",
        target: row.querySelector?.('[data-field="target"]')?.value || ""
      };
    }
    return {
      sourceTerm: row.querySelector?.('[data-field="sourceTerm"]')?.value || "",
      targetTerm: row.querySelector?.('[data-field="targetTerm"]')?.value || "",
      notes: row.querySelector?.('[data-field="notes"]')?.value || "",
      isForbidden: Boolean(row.querySelector?.('[data-field="isForbidden"]')?.checked)
    };
  }

  async function handleDetailAction(event, root) {
    const button = actionFromEvent(event, root);
    if (!button) return;
    const action = button.dataset.resourceAction;
    const actionType = resourceType(button.dataset.resourceType || type);
    if (action === "close-detail") {
      closeResource();
      return;
    }
    const row = button.closest?.("[data-resource-row]");
    const id = String(button.dataset.resourceId || row?.dataset?.resourceId || "");
    const item = itemById(actionType, id);
    if (!row || !item) return;
    try {
      if (action === "save-entry") {
        const saved =
          actionType === "tm"
            ? await options.saveTmEntry?.(item, rowValues(row, actionType))
            : await options.saveTerm?.(item, rowValues(row, actionType));
        if (saved) {
          scheduleFrame(() => {
            const detail = actionType === "tm" ? tmDetail : tbDetail;
            (
              actionButton(detail, "save-entry", "", id) ||
              detail.querySelector?.('[data-resource-action="close-detail"]')
            )?.focus?.();
          });
        }
        return;
      }
      if (action === "delete-entry") {
        if (options.confirmEntryDelete && !options.confirmEntryDelete(actionType)) return;
        const deleted = actionType === "tm" ? await options.deleteTmEntry?.(item) : await options.deleteTerm?.(item);
        if (deleted) {
          scheduleFrame(() => {
            const detail = actionType === "tm" ? tmDetail : tbDetail;
            (
              detail.querySelector?.('[data-resource-action="delete-entry"]') ||
              detail.querySelector?.('[data-resource-action="close-detail"]')
            )?.focus?.();
          });
        }
      }
    } catch (error) {
      reportError(error, { phase: `detail-${action || "unknown"}`, type: actionType });
    }
  }

  async function handleImport(input, label, importer, actionType) {
    const file = input.files?.[0];
    try {
      if (!file || typeof importer !== "function") return;
      const task = () => importer(file);
      if (typeof options.runImportTask === "function") await options.runImportTask(label, task);
      else await task();
    } catch (error) {
      reportError(error, { phase: "import", type: actionType });
    } finally {
      input.value = "";
    }
  }

  function handleTabKeydown(event) {
    if (!new Set(["ArrowLeft", "ArrowRight", "Home", "End"]).has(event.key)) return;
    event.preventDefault?.();
    const currentType = (event.currentTarget || event.target) === tbTab ? "tb" : "tm";
    let nextType;
    if (event.key === "Home") nextType = "tm";
    else if (event.key === "End") nextType = "tb";
    else nextType = currentType === "tm" ? "tb" : "tm";
    selectType(nextType, { focus: true });
  }

  function mount() {
    if (mounted) return false;
    listen(viewButton, "click", () => {
      void Promise.resolve(options.navigate?.()).catch((error) => reportError(error, { phase: "navigate" }));
    });
    listen(tmTab, "click", () => selectType("tm"));
    listen(tbTab, "click", () => selectType("tb"));
    listen(tmTab, "keydown", handleTabKeydown);
    listen(tbTab, "keydown", handleTabKeydown);
    listen(tmDashboard, "click", (event) => void handleDashboardAction(event, tmDashboard));
    listen(tbDashboard, "click", (event) => void handleDashboardAction(event, tbDashboard));
    listen(tmDetail, "click", (event) => void handleDetailAction(event, tmDetail));
    listen(tbDetail, "click", (event) => void handleDetailAction(event, tbDetail));
    for (const input of [
      elements.tmSourceLanguageInput,
      elements.tmTargetLanguageInput,
      elements.tbSourceLanguageInput,
      elements.tbTargetLanguageInput
    ].filter(Boolean)) {
      listen(input, "change", () => options.normalizeLanguageInput?.(input));
      listen(input, "blur", () => options.normalizeLanguageInput?.(input));
    }
    listen(
      tmImportInput,
      "change",
      () => void handleImport(tmImportInput, "TMX resource import", options.importTm, "tm")
    );
    listen(
      tbImportInput,
      "change",
      () => void handleImport(tbImportInput, "TBX resource import", options.importTb, "tb")
    );
    listen(
      termListImportInput,
      "change",
      () => void handleImport(termListImportInput, "Term list resource import", options.importTermList, "tb")
    );
    mounted = true;
    syncTabs();
    return true;
  }

  function unmount() {
    if (!mounted) return false;
    for (const { target, eventType, listener } of listeners.splice(0)) {
      target.removeEventListener(eventType, listener);
    }
    mounted = false;
    return true;
  }

  return Object.freeze({
    mount,
    unmount,
    render,
    getState: snapshot,
    setResources,
    selectType,
    openResource,
    closeResource,
    getItems: items
  });
}
