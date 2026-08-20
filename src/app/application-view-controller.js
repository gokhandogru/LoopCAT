export function createApplicationViewController({ elements, navigation, context, presentation, refresh }) {
  if (
    !elements?.brandHomeLink?.addEventListener ||
    !elements.brandHomeLink.removeEventListener ||
    !elements?.projectsButton?.addEventListener ||
    !elements.projectsButton.removeEventListener ||
    !navigation?.openProjects ||
    !navigation?.openResources ||
    !navigation?.openProject ||
    !navigation?.openEditor ||
    !context?.getProjectId ||
    !context?.getNavigation ||
    !presentation?.renderEditor ||
    !refresh?.projects ||
    !refresh?.resources
  ) {
    throw new TypeError(
      "ApplicationViewController requires navigation elements, navigation, context, presentation, and refresh boundaries."
    );
  }

  let mounted = false;

  function show(view) {
    if (view === "projects") navigation.openProjects();
    else if (view === "resources") navigation.openResources();
    else if (view === "project") {
      navigation.openProject(context.getProjectId(), context.getNavigation().activeIndex);
    } else {
      navigation.openEditor({ ...context.getNavigation(), view: "editor" });
    }
    presentation.renderEditor();
    if (view === "projects") refresh.projects();
    if (view === "resources") refresh.resources();
  }

  const brandClickListener = (event) => {
    event.preventDefault();
    show("projects");
  };
  const projectsClickListener = () => show("projects");

  function mount() {
    if (mounted) return false;
    elements.brandHomeLink.addEventListener("click", brandClickListener);
    elements.projectsButton.addEventListener("click", projectsClickListener);
    mounted = true;
    return true;
  }

  function unmount() {
    if (!mounted) return false;
    elements.brandHomeLink.removeEventListener("click", brandClickListener);
    elements.projectsButton.removeEventListener("click", projectsClickListener);
    mounted = false;
    return true;
  }

  return Object.freeze({ mount, show, unmount });
}
