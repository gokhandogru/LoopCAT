/**
 * Owns project-home statistics, empty/file-card presentation, and per-document
 * actions. Project/session state, catalog/statistics/resource policy, language,
 * text safety, localization, DOM roots, safe HTML, deletion, and opening remain
 * injected owners.
 *
 * @param {any} options
 */
export function createProjectHomePresentationController(options) {
  const elements = options?.elements;
  const session = options?.session;
  const documents = options?.documents;
  const statistics = options?.statistics;
  const resources = options?.resources;
  const language = options?.language;
  const text = options?.text;
  const localization = options?.localization;
  const dom = options?.dom;
  const presentation = options?.presentation;
  const actions = options?.actions;

  if (!elements?.title || !elements.meta || !elements.stats || !elements.fileCount || !elements.fileList) {
    throw new TypeError("ProjectHomePresentationController requires project-home elements.");
  }
  if (typeof elements.fileList.replaceChildren !== "function") {
    throw new TypeError("ProjectHomePresentationController requires a file-list root.");
  }
  if (typeof session?.getProject !== "function" || typeof session.getSegments !== "function") {
    throw new TypeError("ProjectHomePresentationController requires session boundaries.");
  }
  if (typeof documents?.list !== "function") {
    throw new TypeError("ProjectHomePresentationController requires a document catalog boundary.");
  }
  if (
    typeof statistics?.byDocument !== "function" ||
    typeof statistics.aggregate !== "function" ||
    typeof statistics.empty !== "function"
  ) {
    throw new TypeError("ProjectHomePresentationController requires document-statistics boundaries.");
  }
  if (typeof resources?.summary !== "function" || typeof language?.display !== "function") {
    throw new TypeError("ProjectHomePresentationController requires resource and language boundaries.");
  }
  if (
    typeof text?.displaySafeText !== "function" ||
    typeof text.displaySafeHtml !== "function" ||
    typeof text.escapeHtml !== "function"
  ) {
    throw new TypeError("ProjectHomePresentationController requires text-safety boundaries.");
  }
  if (
    typeof localization?.source !== "function" ||
    typeof localization.label !== "function" ||
    typeof localization.sourceHtml !== "function" ||
    typeof localization.labelHtml !== "function"
  ) {
    throw new TypeError("ProjectHomePresentationController requires localization boundaries.");
  }
  if (typeof dom?.createElement !== "function" || typeof dom.createDocumentFragment !== "function") {
    throw new TypeError("ProjectHomePresentationController requires DOM creation boundaries.");
  }
  if (typeof presentation?.replaceSafeHtml !== "function") {
    throw new TypeError("ProjectHomePresentationController requires a safe-presentation boundary.");
  }
  if (typeof actions?.deleteDocument !== "function" || typeof actions.openDocument !== "function") {
    throw new TypeError("ProjectHomePresentationController requires document action boundaries.");
  }

  function render() {
    if (!session.getProject()) return;
    const documentRecords = documents.list();
    const documentStatsById = statistics.byDocument(documentRecords);
    const total = statistics.aggregate(documentStatsById);
    const sourceWords = total.words;
    const resourceSummary = resources.summary();
    elements.title.textContent = text.displaySafeText(session.getProject().name);
    elements.meta.textContent = `${language.display()} - ${text.displaySafeText(session.getProject().domain || localization.label("noDomain"))} - ${localization.label("mainTm")}: ${text.displaySafeText(resourceSummary.mainTm, localization.label("none"))} - ${text.displaySafeText(localization.source(resourceSummary.tmLabel))} - ${text.displaySafeText(localization.source(resourceSummary.tbLabel))}`;
    presentation.replaceSafeHtml(
      elements.stats,
      `
    <div><strong>${total.percent}%</strong><span>${localization.labelHtml("confirmed")}</span></div>
    <div><strong>${documentRecords.length}</strong><span>${localization.labelHtml("files")}</span></div>
    <div><strong>${session.getSegments().length}</strong><span>${localization.labelHtml("segments")}</span></div>
    <div><strong>${sourceWords}</strong><span>${localization.labelHtml("sourceWords")}</span></div>
  `
    );
    elements.fileCount.textContent = documentRecords.length
      ? localization.label("fileCount", { count: documentRecords.length })
      : localization.source("No files imported");
    if (!documentRecords.length) {
      presentation.replaceSafeHtml(
        elements.fileList,
        `<div class="empty-file-state">${localization.sourceHtml("Import a DOCX or other format file to start translating this project.")}</div>`
      );
      return;
    }
    const fragment = dom.createDocumentFragment();
    documentRecords.forEach((documentInfo) => {
      const stats = documentStatsById.get(documentInfo.id) || statistics.empty();
      const card = dom.createElement("article");
      card.className = "file-card";
      presentation.replaceSafeHtml(
        card,
        `
      <header>
        <div>
          <h4>${text.displaySafeHtml(documentInfo.name)}</h4>
          <p>${text.escapeHtml((documentInfo.type || "file").toUpperCase())}</p>
        </div>
      </header>
      <div class="project-stats">
        <div><strong>${stats.words}</strong><span>${localization.labelHtml("words")}</span></div>
        <div><strong>${stats.segments}</strong><span>${localization.labelHtml("segments")}</span></div>
      </div>
      <div class="file-progress"><span>${stats.percent}% ${localization.labelHtml("confirmed")}</span><div class="progress-bar"><div style="width:${stats.percent}%"></div></div><small>${localization.labelHtml("emptyDraftCount", { empty: stats.empty, draft: stats.draft })}</small></div>
      <footer>
        <div class="file-card-actions"></div>
      </footer>
    `
      );
      card.querySelector(".progress-bar > div").style.width = `${stats.percent}%`;
      const filename = card.querySelector("h4");
      if (filename) filename.title = text.displaySafeText(documentInfo.name);
      const deleteButton = dom.createElement("button");
      const fileLabel = text.displaySafeText(documentInfo.name, localization.source("file"));
      deleteButton.className = "danger-small";
      deleteButton.type = "button";
      deleteButton.textContent = localization.source("Delete");
      deleteButton.setAttribute("aria-label", localization.source("Delete file {value1}", { value1: fileLabel }));
      deleteButton.addEventListener("click", () => actions.deleteDocument(documentInfo));
      const openButton = dom.createElement("button");
      openButton.className = "file-open";
      openButton.type = "button";
      openButton.textContent = localization.source("Open");
      openButton.setAttribute("aria-label", localization.source("Open file {value1}", { value1: fileLabel }));
      openButton.addEventListener("click", () => actions.openDocument(documentInfo.id));
      if (actions.mountMenu) {
        card.querySelector(".file-card-actions").append(openButton);
        actions.mountMenu(card.querySelector(".file-card-actions"), documentInfo);
      } else card.querySelector(".file-card-actions").append(deleteButton, openButton);
      fragment.append(card);
    });
    elements.fileList.replaceChildren(fragment);
  }

  return Object.freeze({ render });
}
