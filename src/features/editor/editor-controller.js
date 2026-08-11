export function createEditorController({
  workspace,
  sidebar,
  projectsView,
  resourcesView,
  dashboardView,
  emptyView,
  editorView
}) {
  if (!workspace?.classList || !editorView?.classList)
    throw new TypeError("EditorController requires workspace roots.");
  return Object.freeze({
    mount() {},
    unmount() {},
    renderShell({ view, hasProject, inspectorOpen = true }) {
      workspace.classList.toggle("projects-mode", view !== "editor");
      workspace.classList.toggle("inspector-closed", view === "editor" && !inspectorOpen);
      sidebar?.classList.toggle("hidden", view !== "editor" || !inspectorOpen);
      projectsView?.classList.toggle("hidden", view !== "projects");
      resourcesView?.classList.toggle("hidden", view !== "resources");
      dashboardView?.classList.toggle("hidden", view !== "project" || !hasProject);
      emptyView?.classList.toggle("hidden", view !== "editor" || hasProject);
      editorView.classList.toggle("hidden", view !== "editor" || !hasProject);
    }
  });
}
