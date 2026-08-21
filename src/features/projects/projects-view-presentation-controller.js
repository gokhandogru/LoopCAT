/**
 * Owns Projects dashboard summary mapping, optional vertical/fallback routing,
 * project-tile construction, actionable empty states, and dashboard replacement.
 * Project summaries, search/language policy, localization, text safety, dates,
 * DOM construction, vertical rendering, actions, and roots remain injected owners.
 *
 * @param {any} options
 */
export function createProjectsViewPresentationController(options) {
  const elements = options?.elements;
  const session = options?.session;
  const search = options?.search;
  const language = options?.language;
  const text = options?.text;
  const localization = options?.localization;
  const date = options?.date;
  const dom = options?.dom;
  const presentation = options?.presentation;
  const vertical = options?.vertical;
  const actions = options?.actions;

  if (
    typeof elements?.dashboard?.replaceChildren !== "function" ||
    !elements.searchInput ||
    !elements.languagePairFilter
  ) {
    throw new TypeError("ProjectsViewPresentationController requires Projects view elements.");
  }
  if (typeof session?.getProjectSummaries !== "function") {
    throw new TypeError("ProjectsViewPresentationController requires a project-summary boundary.");
  }
  if (typeof search?.build !== "function") {
    throw new TypeError("ProjectsViewPresentationController requires a project-search boundary.");
  }
  if (typeof language?.key !== "function" || typeof language.display !== "function") {
    throw new TypeError("ProjectsViewPresentationController requires language boundaries.");
  }
  if (
    typeof text?.stableLower !== "function" ||
    typeof text.displaySafeHtml !== "function" ||
    typeof text.displaySafeText !== "function" ||
    typeof text.escapeHtml !== "function"
  ) {
    throw new TypeError("ProjectsViewPresentationController requires text-safety boundaries.");
  }
  if (
    typeof localization?.source !== "function" ||
    typeof localization.label !== "function" ||
    typeof localization.labelHtml !== "function"
  ) {
    throw new TypeError("ProjectsViewPresentationController requires localization boundaries.");
  }
  if (typeof date?.format !== "function") {
    throw new TypeError("ProjectsViewPresentationController requires a date boundary.");
  }
  if (typeof dom?.createElement !== "function") {
    throw new TypeError("ProjectsViewPresentationController requires a DOM creation boundary.");
  }
  if (typeof presentation?.replaceSafeHtml !== "function" || typeof vertical?.getProjects !== "function") {
    throw new TypeError("ProjectsViewPresentationController requires presentation boundaries.");
  }
  if (
    typeof actions?.deleteProject !== "function" ||
    typeof actions.open !== "function" ||
    typeof actions.clearFilters !== "function" ||
    typeof actions.importPackage !== "function"
  ) {
    throw new TypeError("ProjectsViewPresentationController requires action boundaries.");
  }

  function createProjectTile(project) {
    const tile = dom.createElement("article");
    tile.className = "project-tile";
    presentation.replaceSafeHtml(
      tile,
      `
    <header>
      <div>
        <h3>${text.displaySafeHtml(project.name)}</h3>
        <p>${text.displaySafeHtml(project.domain ? `${project.domain} - ${project.sourceFileName || localization.label("noSourceFileImported")}` : project.sourceFileName || localization.label("noSourceFileImported"))}</p>
      </div>
      <span class="language-badge">${text.escapeHtml(language.display(project))}</span>
    </header>
    <div class="project-stats">
      <div><strong>${project.progress.percent}%</strong><span>${localization.labelHtml("confirmed")}</span></div>
      <div><strong>${project.progress.total}</strong><span>${localization.labelHtml("segments")}</span></div>
      <div><strong>${project.wordCount}</strong><span>${localization.labelHtml("words")}</span></div>
    </div>
    <div class="progress-bar"><div style="width:${project.progress.percent}%"></div></div>
    <footer>
      <span>${localization.labelHtml("updatedAt", { date: date.format(project.updatedAt) })}</span>
    </footer>
  `
    );
    tile.querySelector(".progress-bar > div").style.width = `${project.progress.percent}%`;
    const deleteButton = dom.createElement("button");
    const projectLabel = text.displaySafeText(project.name, localization.source("project"));
    deleteButton.className = "danger-small";
    deleteButton.type = "button";
    deleteButton.textContent = localization.source("Delete");
    deleteButton.setAttribute("aria-label", localization.source("Delete project {value1}", { value1: projectLabel }));
    deleteButton.addEventListener("click", () => actions.deleteProject(project.id));
    const openButton = dom.createElement("button");
    openButton.className = "primary";
    openButton.type = "button";
    openButton.textContent = localization.source("Open");
    openButton.setAttribute("aria-label", localization.source("Open project {value1}", { value1: projectLabel }));
    openButton.addEventListener("click", () => actions.open(project.id));
    tile.querySelector("footer").append(deleteButton, openButton);
    return tile;
  }

  function projectEmptyState({ hasProjects }) {
    const empty = dom.createElement("div");
    empty.className = "actionable-empty-state";
    const heading = dom.createElement("h3");
    const message = dom.createElement("p");
    const action = dom.createElement("button");
    action.type = "button";
    if (hasProjects) {
      heading.textContent = localization.source("No matching projects");
      message.textContent = localization.source("Clear the search and language filters to see every local project.");
      action.textContent = localization.source("Clear filters");
      action.addEventListener("click", actions.clearFilters);
    } else {
      heading.textContent = localization.source("Start your first translation");
      message.textContent = localization.source(
        "Choose New project above, or bring in an existing LoopCAT project package."
      );
      action.textContent = localization.source("Import project package");
      action.addEventListener("click", actions.importPackage);
    }
    empty.append(heading, message, action);
    return empty;
  }

  function render() {
    const query = text.stableLower(elements.searchInput.value.trim());
    const pair = elements.languagePairFilter.value;
    const summaries = session.getProjectSummaries().map((project) => ({
      ...project,
      searchText: project.searchText || search.build(project),
      languagePairKey: project.languagePairKey || language.key(project)
    }));
    const projectsRenderer = vertical.getProjects();
    if (projectsRenderer) {
      projectsRenderer.render({
        projects: summaries,
        query,
        languagePair: pair,
        createItem: createProjectTile,
        createEmptyState: projectEmptyState
      });
      return;
    }
    const visible = summaries.filter(
      (project) => (!query || project.searchText.includes(query)) && (!pair || project.languagePairKey === pair)
    );
    elements.dashboard.replaceChildren(
      ...(visible.length ? visible.map(createProjectTile) : [projectEmptyState({ hasProjects: summaries.length > 0 })])
    );
  }

  return Object.freeze({ render });
}
