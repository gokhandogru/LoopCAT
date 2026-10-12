/** Owns stable presentation slots; existing controls keep their handlers and IDs. */
export function createWorkspaceToolbarController({ document: doc, translate: t, getProject }) {
  const find = (selector) => doc.querySelector(selector);
  const node = (tag, className, parent, text = "") => {
    const element = doc.createElement(tag);
    element.className = className;
    if (text) element.textContent = t(text);
    parent?.append(element);
    return element;
  };
  const menu = (label, parent, id) => {
    const root = node("details", "menu action-menu", parent);
    if (id) root.id = id;
    node("summary", "", root, label);
    return node("div", "menu-panel", root);
  };
  const move = (parent, ...selectors) =>
    selectors.forEach((selector) => {
      const element = find(selector);
      if (element) parent.append(element);
    });
  const editor = find("#editorView");
  editor.classList.add("coordinated-editor");
  const context = find("#editorView .project-toolbar");
  const title = find("#projectTitle");
  const metadata = find("#projectMeta");
  const oldActions = context.querySelector(".toolbar-actions");
  const identity = node("div", "editor-identity");
  move(identity, "#projectFilesBtn");
  const heading = node("div", "editor-heading", identity);
  heading.append(title);
  const pair = node("span", "editor-language-pair", heading);
  const information = menu("Project details", heading, "editorProjectDetails");
  information.append(metadata);
  const fileContext = node("div", "editor-file-context");
  move(fileContext, "#documentFilter");
  const fileActions = node("div", "action-group", fileContext);
  fileActions.id = "editorFileActions";
  const contextActions = node("div", "action-group editor-context-actions");
  const statisticsMenu = menu("Statistics", contextActions, "editorStatisticsMenu");
  const exportMenu = find("#exportLocalizationBtn").closest("details");
  contextActions.append(exportMenu);
  const projectMenu = menu("Project", contextActions, "editorProjectMenu");
  move(projectMenu, "#editorProjectSettingsBtn", "#editorImportMenu");
  const translation = find("#editorView .segment-controls");
  const search = node("div", "editor-search");
  move(search, "#segmentSearchInput");
  const searchMenu = menu("Search tools", search, "editorSearchMenu");
  move(searchMenu, "#segmentSearchOptionsMenu", "#replaceMenu");
  const status = find("#segmentStatusFilter");
  const secondary = node("div", "action-group editor-secondary");
  move(secondary, "#segmentFiltersMenu");
  secondary.append(find("#segmentToolsMenuSummary").closest("details"));
  const viewMenu = menu("View", secondary, "editorViewMenu");
  move(viewMenu, "#focusModeBtn", "#inspectorToggleBtn");
  const overflow = menu("Tools", null, "editorOverflowMenu");
  const overflowRoot = overflow.parentElement;
  const commands = node("div", "action-group editor-confirm-actions");
  move(commands, "#nextOpenBtn", "#confirmBtn");
  translation.replaceChildren(search, status, secondary, overflowRoot, commands);
  context.replaceChildren(identity, fileContext, contextActions);
  oldActions?.remove();
  const progress = find("#editorView .progress-wrap");
  translation.after(progress);
  const selectionHost = node("div", "selection-bar", progress);
  selectionHost.id = "editorSelectionActions";
  selectionHost.hidden = true;
  const headingCell = find("#editorView .segment-grid thead .num-col");
  const selectAll = node("input", "", headingCell);
  selectAll.type = "checkbox";
  selectAll.id = "selectFilteredSegments";
  selectAll.setAttribute("aria-label", t("Select filtered segments"));
  // Controls move as a group at a measured editor width; they are never cloned.
  let lastNarrow;
  const resize = () => {
    const narrow = editor.getBoundingClientRect().width < 1100;
    if (lastNarrow === narrow) return;
    lastNarrow = narrow;
    const destination = narrow ? overflow : secondary;
    for (const element of [...secondary.children, ...overflow.children]) destination.append(element);
    secondary.hidden = narrow;
    overflowRoot.hidden = !narrow;
  };
  const observer = new ResizeObserver(resize);
  observer.observe(editor);
  const updateMetadata = () => {
    const full = metadata.textContent.split(" - ")[0];
    const codes = [...full.matchAll(/\(([^)]+)\)/g)].map((match) => match[1]);
    const project = getProject?.();
    const value =
      project?.sourceLang && project?.targetLang
        ? `${project.sourceLang} → ${project.targetLang}`
        : codes.length === 2
          ? codes.join(" → ")
          : full;
    if (pair.textContent !== value) pair.textContent = value;
    pair.title = full;
    title.title = title.textContent;
  };
  new MutationObserver(updateMetadata).observe(metadata, { childList: true, characterData: true, subtree: true });
  const documentFilter = find("#documentFilter");
  const updateFilename = () => {
    documentFilter.title = documentFilter.selectedOptions[0]?.textContent || "";
  };
  documentFilter.addEventListener("change", updateFilename);
  new MutationObserver(updateFilename).observe(documentFilter, { childList: true, subtree: true });
  const homeActions = find("#projectHomeView .toolbar-actions");
  const projectActions = menu("Project", homeActions, "projectHomeMenu");
  move(projectActions, "#projectSettingsBtn", "#projectHomeDeleteBtn");
  find("#projectFileImportBtn").classList.add("primary");
  const projectStatistics = node("span", "action-group");
  homeActions.insertBefore(projectStatistics, find("#projectPackageExportBtn"));
  const filesHeader = find(".file-list-header");
  const projectTrash = node("span", "action-group", filesHeader);
  filesHeader.insertBefore(projectTrash, find('[data-collection-scope="files"]'));
  const fileSelection = node("div", "selection-bar", filesHeader);
  fileSelection.hidden = true;
  updateMetadata();
  resize();
  return { fileActions, statisticsMenu, selectionHost, selectAll, projectStatistics, projectTrash, fileSelection };
}
