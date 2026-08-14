function requireElement(value, name) {
  if (!value?.replaceChildren || !value?.classList) {
    throw new TypeError(`ResourcesPresentationService requires ${name}.`);
  }
  return value;
}

/**
 * Owns Resources dashboard, detail, and editable-row DOM construction. Resources
 * state, focus restoration, event delegation, persistence, and project linking
 * remain behind injected application boundaries.
 *
 * @param {{
 *   elements: {
 *     tmDashboard: any,
 *     tbDashboard: any,
 *     tmDetail: any,
 *     tbDetail: any
 *   },
 *   document: { createElement: (name: string) => any, createDocumentFragment: () => any },
 *   summarizeResources: (items: any[], nameField: string) => any[],
 *   labelFromKey: (key: string) => { name: string, sourceLang: string, targetLang: string },
 *   items: (type: "tm" | "tb", key: string) => any[],
 *   localization: {
 *     label: (key: string, values?: Record<string, unknown>) => string,
 *     labelHtml: (key: string, values?: Record<string, unknown>) => string,
 *     source: (text: string, values?: Record<string, unknown>) => string,
 *     sourceHtml: (text: string, values?: Record<string, unknown>) => string
 *   },
 *   languagePairDisplay: (sourceLang: string, targetLang: string) => string,
 *   formatDate: (value: unknown) => string,
 *   displaySafeHtml: (value: unknown, fallback?: string) => string,
 *   displaySafeText: (value: unknown, fallback?: string) => string,
 *   escapeHtml: (value: unknown) => string,
 *   replaceSafeHtml: (element: any, html: string) => void
 * }} options
 */
export function createResourcesPresentationService(options) {
  const elements = /** @type {any} */ (options?.elements || {});
  const tmDashboard = requireElement(elements.tmDashboard, "the translation-memory dashboard");
  const tbDashboard = requireElement(elements.tbDashboard, "the termbase dashboard");
  const tmDetail = requireElement(elements.tmDetail, "the translation-memory detail");
  const tbDetail = requireElement(elements.tbDetail, "the termbase detail");
  const ownerDocument = options?.document;
  const summarizeResources = options?.summarizeResources;
  const labelFromKey = options?.labelFromKey;
  const items = options?.items;
  const localization = options?.localization;
  const languagePairDisplay = options?.languagePairDisplay;
  const formatDate = options?.formatDate;
  const displaySafeHtml = options?.displaySafeHtml;
  const displaySafeText = options?.displaySafeText;
  const escapeHtml = options?.escapeHtml;
  const replaceSafeHtml = options?.replaceSafeHtml;
  if (
    typeof ownerDocument?.createElement !== "function" ||
    typeof ownerDocument?.createDocumentFragment !== "function" ||
    typeof summarizeResources !== "function" ||
    typeof labelFromKey !== "function" ||
    typeof items !== "function" ||
    typeof localization?.label !== "function" ||
    typeof localization?.labelHtml !== "function" ||
    typeof localization?.source !== "function" ||
    typeof localization?.sourceHtml !== "function" ||
    typeof languagePairDisplay !== "function" ||
    typeof formatDate !== "function" ||
    typeof displaySafeHtml !== "function" ||
    typeof displaySafeText !== "function" ||
    typeof escapeHtml !== "function" ||
    typeof replaceSafeHtml !== "function"
  ) {
    throw new TypeError(
      "ResourcesPresentationService requires resource lookup, localization, formatting, safe-display, and DOM boundaries."
    );
  }

  function renderDashboard(type, resourceState) {
    const isTm = type === "tm";
    const dashboard = isTm ? tmDashboard : tbDashboard;
    const summaries = summarizeResources(
      isTm ? resourceState.tmEntries : resourceState.terms,
      isTm ? "tmName" : "termBaseName"
    );
    if (!summaries.length) {
      const empty = ownerDocument.createElement("div");
      empty.className = "empty-file-state actionable-empty-state";
      const message = ownerDocument.createElement("p");
      message.textContent = localization.label(isTm ? "noTranslationMemories" : "noTermbases");
      const action = ownerDocument.createElement("button");
      action.type = "button";
      action.className = "primary";
      action.textContent = localization.source(isTm ? "Import a TMX file" : "Import a TBX or term-list file");
      action.dataset.resourceAction = "import";
      action.dataset.resourceType = type;
      empty.append(message, action);
      dashboard.replaceChildren(empty);
      return;
    }
    const fragment = ownerDocument.createDocumentFragment();
    summaries.forEach((resource) => {
      const card = ownerDocument.createElement("article");
      card.className = "resource-card";
      replaceSafeHtml(
        card,
        `
      <header>
        <div>
          <h3>${displaySafeHtml(resource.name)}</h3>
          <p>${escapeHtml(languagePairDisplay(resource.sourceLang, resource.targetLang))}</p>
        </div>
        <span class="language-badge">${resource.count}</span>
      </header>
      <div class="project-stats">
        <div><strong>${resource.count}</strong><span>${localization.labelHtml(isTm ? "entries" : "terms")}</span></div>
        <div><strong>${escapeHtml(resource.sourceLang || "-")}</strong><span>${localization.labelHtml("source")}</span></div>
        <div><strong>${escapeHtml(resource.targetLang || "-")}</strong><span>${localization.labelHtml("target")}</span></div>
      </div>
      <footer>
        <span>${localization.labelHtml("updatedAt", { date: formatDate(resource.updatedAt) })}</span>
        <div class="resource-card-actions"></div>
      </footer>
    `
      );
      const deleteButton = ownerDocument.createElement("button");
      const resourceLabel = displaySafeText(resource.name, localization.source("resource"));
      deleteButton.className = "danger-small";
      deleteButton.type = "button";
      deleteButton.textContent = localization.source("Delete");
      deleteButton.setAttribute(
        "aria-label",
        localization.source("Delete resource {value1}", { value1: resourceLabel })
      );
      deleteButton.dataset.resourceAction = "delete-resource";
      deleteButton.dataset.resourceType = type;
      deleteButton.dataset.resourceKey = resource.key;
      const exportButton = ownerDocument.createElement("button");
      exportButton.type = "button";
      exportButton.textContent = localization.source("Export");
      exportButton.setAttribute(
        "aria-label",
        localization.source("Export resource {value1}", { value1: resourceLabel })
      );
      exportButton.dataset.resourceAction = "export";
      exportButton.dataset.resourceType = type;
      exportButton.dataset.resourceKey = resource.key;
      const openButton = ownerDocument.createElement("button");
      openButton.className = "primary";
      openButton.type = "button";
      openButton.textContent = localization.source("Open");
      openButton.setAttribute("aria-label", localization.source("Open resource {value1}", { value1: resourceLabel }));
      openButton.dataset.resourceAction = "open";
      openButton.dataset.resourceType = type;
      openButton.dataset.resourceKey = resource.key;
      card.querySelector(".resource-card-actions").append(deleteButton, exportButton, openButton);
      fragment.append(card);
    });
    dashboard.replaceChildren(fragment);
  }

  function replaceRows(table, rowItems, renderRow) {
    const fragment = ownerDocument.createDocumentFragment();
    rowItems.forEach((item) => fragment.append(renderRow(item)));
    table.replaceChildren(fragment);
  }

  function renderTmEntryRow(entry) {
    const row = ownerDocument.createElement("article");
    row.className = "resource-row";
    row.dataset.resourceRow = "tm";
    row.dataset.resourceId = entry.id;
    replaceSafeHtml(
      row,
      `
    <textarea data-field="source" aria-label="${localization.sourceHtml("Source")}">${escapeHtml(entry.source)}</textarea>
    <textarea data-field="target" aria-label="${localization.sourceHtml("Target")}">${escapeHtml(entry.target)}</textarea>
    <div class="resource-row-actions"></div>
  `
    );
    const actions = row.querySelector(".resource-row-actions");
    const saveButton = ownerDocument.createElement("button");
    saveButton.type = "button";
    saveButton.textContent = localization.source("Save");
    saveButton.dataset.resourceAction = "save-entry";
    saveButton.dataset.resourceType = "tm";
    saveButton.dataset.resourceId = entry.id;
    const deleteButton = ownerDocument.createElement("button");
    deleteButton.className = "danger-small";
    deleteButton.type = "button";
    deleteButton.textContent = localization.source("Delete");
    deleteButton.dataset.resourceAction = "delete-entry";
    deleteButton.dataset.resourceType = "tm";
    deleteButton.dataset.resourceId = entry.id;
    actions.append(saveButton, deleteButton);
    return row;
  }

  function renderTermRow(term) {
    const row = ownerDocument.createElement("article");
    row.className = "resource-row term-resource-row";
    row.dataset.resourceRow = "tb";
    row.dataset.resourceId = term.id;
    replaceSafeHtml(
      row,
      `
    <input data-field="sourceTerm" aria-label="${localization.sourceHtml("Source term")}" value="${escapeHtml(term.sourceTerm)}">
    <input data-field="targetTerm" aria-label="${localization.sourceHtml("Target term")}" value="${escapeHtml(term.targetTerm)}">
    <input data-field="notes" aria-label="${localization.sourceHtml("Notes")}" value="${escapeHtml(term.notes || "")}">
    <label class="checkbox-row resource-checkbox"><input data-field="isForbidden" type="checkbox" ${term.isForbidden ? "checked" : ""}>${localization.labelHtml("forbidden")}</label>
    <div class="resource-row-actions"></div>
  `
    );
    const actions = row.querySelector(".resource-row-actions");
    const saveButton = ownerDocument.createElement("button");
    saveButton.type = "button";
    saveButton.textContent = localization.source("Save");
    saveButton.dataset.resourceAction = "save-entry";
    saveButton.dataset.resourceType = "tb";
    saveButton.dataset.resourceId = term.id;
    const deleteButton = ownerDocument.createElement("button");
    deleteButton.className = "danger-small";
    deleteButton.type = "button";
    deleteButton.textContent = localization.source("Delete");
    deleteButton.dataset.resourceAction = "delete-entry";
    deleteButton.dataset.resourceType = "tb";
    deleteButton.dataset.resourceId = term.id;
    actions.append(saveButton, deleteButton);
    return row;
  }

  function renderTmDetail(resourceState) {
    if (resourceState.type !== "tm" || !resourceState.openKey) {
      tmDetail.classList.add("hidden");
      return;
    }
    const info = labelFromKey(resourceState.openKey);
    const entries = items("tm", resourceState.openKey);
    tmDetail.classList.remove("hidden");
    replaceSafeHtml(
      tmDetail,
      `
    <div class="resource-detail-header">
      <div>
        <h3>${displaySafeHtml(info.name)}</h3>
        <p>${escapeHtml(languagePairDisplay(info.sourceLang, info.targetLang))} - ${localization.labelHtml("entryCount", { count: entries.length })}</p>
      </div>
      <button id="closeTmResourceBtn" type="button" data-resource-action="close-detail" data-resource-type="tm">${localization.sourceHtml("Close")}</button>
    </div>
    <div class="resource-table"></div>
  `
    );
    replaceRows(tmDetail.querySelector(".resource-table"), entries, renderTmEntryRow);
  }

  function renderTbDetail(resourceState) {
    if (resourceState.type !== "tb" || !resourceState.openKey) {
      tbDetail.classList.add("hidden");
      return;
    }
    const info = labelFromKey(resourceState.openKey);
    const terms = items("tb", resourceState.openKey);
    tbDetail.classList.remove("hidden");
    replaceSafeHtml(
      tbDetail,
      `
    <div class="resource-detail-header">
      <div>
        <h3>${displaySafeHtml(info.name)}</h3>
        <p>${escapeHtml(languagePairDisplay(info.sourceLang, info.targetLang))} - ${localization.labelHtml("termCount", { count: terms.length })}</p>
      </div>
      <button id="closeTbResourceBtn" type="button" data-resource-action="close-detail" data-resource-type="tb">${localization.sourceHtml("Close")}</button>
    </div>
    <div class="resource-table"></div>
  `
    );
    replaceRows(tbDetail.querySelector(".resource-table"), terms, renderTermRow);
  }

  function render(resourceState) {
    renderDashboard("tm", resourceState);
    renderDashboard("tb", resourceState);
    renderTmDetail(resourceState);
    renderTbDetail(resourceState);
  }

  return Object.freeze({ render });
}
