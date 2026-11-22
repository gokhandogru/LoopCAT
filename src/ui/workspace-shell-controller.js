const iconPaths = {
  projects: "M3 7V5a1 1 0 0 1 1-1h5l2 3h9a1 1 0 0 1 1 1v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z",
  resources: "M3 5.5c3.4-1.5 6.4-1 9 1 2.6-2 5.6-2.5 9-1v13c-3.4-1.5-6.4-1-9 1-2.6-2-5.6-2.5-9-1ZM12 6.5v13",
  exchange: "M3 7h16m-4-4 4 4-4 4M21 17H5m4-4-4 4 4 4",
  files: "M6 3h8l4 4v13a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Zm8 0v5h4M8 12h7m-7 4h5",
  editor: "M3 4h18v16H3Zm9 0v16M6 8h3m-3 4h3m6-4h3m-3 4h3",
  statistics: "M3 3v17h18M7 16v-4m5 4V7m5 9V4",
  menu: "M3 6h18M3 12h18M3 18h18",
  close: "m6 6 12 12M18 6 6 18",
  search: "M18 10a7 7 0 1 1-14 0 7 7 0 0 1 14 0Zm-2 5 5 6"
};

/** Integrates navigation with the existing project session and command owners. */
export function installWorkspaceShell({
  document,
  window,
  store,
  session,
  translate,
  show,
  resumeEditor,
  openCommands,
  openStatistics
}) {
  const find = (id) => document.getElementById(id);
  const rail = find("shellNavigation");
  const drawer = find("shellNavigationDialog");
  const toggle = find("shellNavToggle");
  const slot = find("shellRailSlot");
  const crumbs = find("shellBreadcrumbs");
  const narrow = window.matchMedia("(max-width: 799px)");
  const buttons = {
    projects: find("projectsViewBtn"),
    resources: find("resourcesViewBtn"),
    project: find("shellFilesBtn"),
    editor: find("shellEditorBtn")
  };
  const viewLabels = { projects: "Projects", resources: "Resources", project: "Files", editor: "Editor" };
  let lastEditor = null;
  let lastCrumbs = null;

  for (const control of document.querySelectorAll("[data-shell-icon]")) {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    for (const [attribute, value] of Object.entries({
      viewBox: "0 0 24 24",
      fill: "none",
      stroke: "currentColor",
      "stroke-width": "1.7",
      "stroke-linecap": "round",
      "stroke-linejoin": "round",
      "aria-hidden": "true",
      focusable: "false"
    })) {
      svg.setAttribute(attribute, value);
    }
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", iconPaths[control.dataset.shellIcon]);
    svg.append(path);
    control.prepend(svg);
  }

  function closeDrawer() {
    if (!drawer.open) return;
    drawer.close();
    slot.append(rail);
    toggle.setAttribute("aria-expanded", "false");
    if (narrow.matches) toggle.focus();
  }
  toggle.addEventListener("click", () => {
    drawer.append(rail);
    drawer.showModal();
    toggle.setAttribute("aria-expanded", "true");
    find("shellNavClose").focus();
  });
  find("shellNavClose").addEventListener("click", closeDrawer);
  drawer.addEventListener("cancel", (event) => {
    event.preventDefault();
    closeDrawer();
  });
  drawer.addEventListener("click", (event) => {
    if (event.target === drawer) closeDrawer();
  });
  drawer.addEventListener("keydown", (event) => {
    if (event.key === "F2" || ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toLowerCase() === "p")) {
      closeDrawer();
    }
  });
  narrow.addEventListener("change", closeDrawer);

  rail.addEventListener(
    "click",
    (event) => {
      if (
        event.target.closest("#brandHomeLink, #projectsViewBtn, #resourcesViewBtn, #shellFilesBtn, #shellEditorBtn")
      ) {
        closeDrawer();
      }
    },
    true
  );
  buttons.project.addEventListener("click", () => show("project"));
  buttons.editor.addEventListener("click", () => {
    const project = session.getProject();
    if (!project || !session.getSegments().length) return;
    resumeEditor(lastEditor?.projectId === project.id ? lastEditor : null);
  });
  find("shellStatsBtn").addEventListener("click", openStatistics);
  find("shellCommandsBtn").addEventListener("click", openCommands);

  function render() {
    const nav = store.getState().navigation;
    if (nav.view === "editor") lastEditor = nav;
    const project = session.getProject();
    const active = ["project", "editor"].includes(nav.view) && project;
    const projectName = active ? String(project.name || translate("Project")) : "";
    const fileName =
      nav.view === "editor" ? project?.documents?.find((file) => file.id === nav.documentId)?.name || "" : "";
    const canEdit = Boolean(session.getSegments().length);
    const label = fileName || translate(viewLabels[nav.view] || "Projects");
    const parts = [nav.view, projectName, label, document.documentElement.lang, Boolean(project), canEdit];
    if (lastCrumbs?.every((value, index) => value === parts[index])) return;
    lastCrumbs = parts;
    find("shellProjectNavigation").hidden = !project;
    buttons.editor.disabled = !canEdit;
    for (const [view, control] of Object.entries(buttons)) {
      if (view === nav.view) control.setAttribute("aria-current", "page");
      else control.removeAttribute("aria-current");
    }
    const fragment = document.createDocumentFragment();
    const ancestor = (text, dest) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.textContent = text;
      btn.dir = "auto";
      btn.dataset.i18nSkip = "";
      btn.addEventListener("click", () => show(dest));
      const separator = document.createElement("span");
      separator.setAttribute("aria-hidden", "true");
      separator.textContent = "/";
      fragment.append(btn, separator);
    };
    if (active) ancestor(translate("Projects"), "projects");
    if (active && nav.view === "editor") ancestor(projectName, "project");
    const current = document.createElement("strong");
    current.setAttribute("aria-current", "page");
    current.dir = "auto";
    current.dataset.i18nSkip = "";
    current.textContent = active && nav.view === "project" ? projectName : label;
    fragment.append(current);
    crumbs.replaceChildren(fragment);
  }
  store.subscribe((next, previous) => {
    const nav = next.navigation;
    const prior = previous.navigation;
    if (nav.view === "editor") lastEditor = nav;
    if (
      nav.view !== prior.view ||
      nav.projectId !== prior.projectId ||
      nav.documentId !== prior.documentId ||
      next.interface.locale !== previous.interface.locale
    )
      render();
  });
  session.subscribe((next, previous) => {
    if (next.project !== previous.project || Boolean(next.segments.length) !== Boolean(previous.segments.length))
      render();
  });
  window.addEventListener("loopcat:localechange", render);
  render();
}
