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
    const entries = isTm ? resourceState.tmEntries : resourceState.terms;
    const stableResources = (resourceState.resources || []).filter(
      (resource) => resource.type === (isTm ? "tm" : "termbase")
    );
    const summaries = stableResources.length
      ? stableResources
          .map((resource) => {
            const resourceEntries =
              resource.entryCount !== undefined || resource.catalogPending
                ? []
                : entries.filter(
                    (entry) =>
                      entry.resourceId === resource.id ||
                      (!entry.resourceId && entry[isTm ? "tmName" : "termBaseName"] === resource.name)
                  );
            const updatedAt = resourceEntries.reduce(
              (latest, entry) => {
                const timestamp = entry.updatedAt || entry.createdAt || "";
                return timestamp > latest ? timestamp : latest;
              },
              resource.updatedAt || resource.createdAt || ""
            );
            return {
              ...resource,
              key: resource.id,
              count: resource.catalogPending ? "…" : (resource.entryCount ?? resourceEntries.length),
              updatedAt,
              languagePair: resource.languagePair || `${resource.sourceLang || ""}::${resource.targetLang || ""}`
            };
          })
          .sort((a, b) => a.name.localeCompare(b.name))
      : summarizeResources(entries, isTm ? "tmName" : "termBaseName");
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
      card.className = `resource-card${resource.archived ? " archived" : ""}`;
      const usageBadges = [
        resource.usage?.main ? "Main" : "",
        resource.usage?.reference ? "Reference" : "",
        resource.usage?.lookup ? "Lookup" : "",
        resource.usage?.qa ? "QA" : "",
        resource.usage?.write ? "Write" : "",
        resource.archived ? "Archived" : ""
      ].filter(Boolean);
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
      <div class="resource-usage-badges">${usageBadges.map((badge) => `<span class="language-badge">${escapeHtml(badge)}</span>`).join("")}</div>
      <p>${escapeHtml(`${resource.linkedProjects?.length || 0} linked project${resource.linkedProjects?.length === 1 ? "" : "s"}`)}</p>
      <footer>
        <span>${localization.labelHtml("updatedAt", { date: formatDate(resource.updatedAt) })}</span>
        <div class="resource-card-actions"></div>
      </footer>
    `
      );
      const resourceLabel = displaySafeText(resource.name, localization.source("resource"));
      const actionButton = (action, label, className = "") => {
        const button = ownerDocument.createElement("button");
        button.type = "button";
        button.className = className;
        button.textContent = localization.source(label);
        button.setAttribute("aria-label", localization.source(`${label} resource {value1}`, { value1: resourceLabel }));
        button.dataset.resourceAction = action;
        button.dataset.resourceType = type;
        button.dataset.resourceKey = resource.key;
        button.dataset.resourceId = resource.id || "";
        return button;
      };
      const renameButton = actionButton("rename", "Rename");
      const duplicateButton = actionButton("duplicate", "Duplicate");
      const archiveButton = actionButton(
        resource.archived ? "restore" : "archive",
        resource.archived ? "Restore" : "Archive",
        resource.archived ? "" : "danger-small"
      );
      const legacyDeleteButton = actionButton("delete-resource", "Delete", "danger-small");
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
      exportButton.dataset.resourceId = resource.id || "";
      const openButton = ownerDocument.createElement("button");
      openButton.className = "primary";
      openButton.type = "button";
      openButton.textContent = localization.source("Open");
      openButton.setAttribute("aria-label", localization.source("Open resource {value1}", { value1: resourceLabel }));
      openButton.dataset.resourceAction = "open";
      openButton.dataset.resourceType = type;
      openButton.dataset.resourceKey = resource.key;
      openButton.dataset.resourceId = resource.id || "";
      if (resource.archived) card.querySelector(".resource-card-actions").append(archiveButton);
      else if (!resource.id)
        card.querySelector(".resource-card-actions").append(legacyDeleteButton, exportButton, openButton);
      else
        card
          .querySelector(".resource-card-actions")
          .append(renameButton, duplicateButton, archiveButton, exportButton, openButton);
      fragment.append(card);
    });
    dashboard.replaceChildren(fragment);
  }

  function replaceRows(table, rowItems, renderRow) {
    const fragment = ownerDocument.createDocumentFragment();
    rowItems.forEach((item) => fragment.append(renderRow(item)));
    table.replaceChildren(fragment);
  }

  function renderPaging(detail, state) {
    if (!state.page) return;
    const paging = ownerDocument.createElement("div");
    paging.className = "toolbar-actions resource-pagination";
    const status = ownerDocument.createElement("span");
    status.setAttribute("role", "status");
    status.textContent = state.page.loading
      ? localization.source("Loading…")
      : state.page.error || String(state.page.index + 1);
    paging.append(status);
    for (const [action, label, disabled] of [
      ["previous-page", "Previous", state.page.loading || state.page.index === 0],
      ["next-page", "Next", state.page.loading || !state.page.next],
      ...(state.page.error ? [["retry-page", "Retry", false]] : [])
    ]) {
      const button = ownerDocument.createElement("button");
      button.type = "button";
      button.textContent = localization.source(String(label));
      button.dataset.resourceAction = action;
      button.disabled = Boolean(disabled);
      paging.append(button);
    }
    detail.setAttribute("aria-busy", String(state.page.loading));
    detail.append(paging);
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
    const info =
      (resourceState.resources || []).find((resource) => resource.id === resourceState.openKey) ||
      labelFromKey(resourceState.openKey);
    const entries = items("tm", resourceState.openKey);
    tmDetail.classList.remove("hidden");
    replaceSafeHtml(
      tmDetail,
      `
    <div class="resource-detail-header">
      <div>
        <h3>${displaySafeHtml(info.name)}</h3>
        <p>${escapeHtml(languagePairDisplay(info.sourceLang, info.targetLang))} - ${localization.labelHtml("entryCount", { count: info.catalogPending ? "…" : (info.entryCount ?? entries.length) })}</p>
      </div>
      <div class="toolbar-actions">
        ${info.id ? `<button type="button" data-resource-action="add-entry" data-resource-type="tm" data-resource-key="${escapeHtml(resourceState.openKey)}" data-resource-id="${escapeHtml(info.id)}">${localization.sourceHtml("Add entry")}</button>` : ""}
        <button id="closeTmResourceBtn" type="button" data-resource-action="close-detail" data-resource-type="tm">${localization.sourceHtml("Close")}</button>
      </div>
    </div>
    <div class="resource-table"></div>
  `
    );
    replaceRows(tmDetail.querySelector(".resource-table"), entries, renderTmEntryRow);
    renderPaging(tmDetail, resourceState);
  }

  function renderTbDetail(resourceState) {
    if (resourceState.type !== "tb" || !resourceState.openKey) {
      tbDetail.classList.add("hidden");
      return;
    }
    const info =
      (resourceState.resources || []).find((resource) => resource.id === resourceState.openKey) ||
      labelFromKey(resourceState.openKey);
    const terms = items("tb", resourceState.openKey);
    tbDetail.classList.remove("hidden");
    replaceSafeHtml(
      tbDetail,
      `
    <div class="resource-detail-header">
      <div>
        <h3>${displaySafeHtml(info.name)}</h3>
        <p>${escapeHtml(languagePairDisplay(info.sourceLang, info.targetLang))} - ${localization.labelHtml("termCount", { count: info.catalogPending ? "…" : (info.entryCount ?? terms.length) })}</p>
      </div>
      <div class="toolbar-actions">
        ${info.id ? `<button type="button" data-resource-action="add-entry" data-resource-type="tb" data-resource-key="${escapeHtml(resourceState.openKey)}" data-resource-id="${escapeHtml(info.id)}">${localization.sourceHtml("Add term")}</button>` : ""}
        <button id="closeTbResourceBtn" type="button" data-resource-action="close-detail" data-resource-type="tb">${localization.sourceHtml("Close")}</button>
      </div>
    </div>
    <div class="resource-table"></div>
  `
    );
    replaceRows(tbDetail.querySelector(".resource-table"), terms, renderTermRow);
    renderPaging(tbDetail, resourceState);
  }

  function render(resourceState) {
    renderDashboard("tm", resourceState);
    renderDashboard("tb", resourceState);
    renderTmDetail(resourceState);
    renderTbDetail(resourceState);
  }

  return Object.freeze({ render });
}
