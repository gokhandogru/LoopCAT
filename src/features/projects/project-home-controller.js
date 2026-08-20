export function createProjectHomeController({ elements, session, navigation, presentation, actions }) {
  if (!session?.getProject || !session?.getSegments || !presentation?.renderAll || !actions?.confirmDelete) {
    throw new TypeError("ProjectHomeController requires session, presentation, and project-delete boundaries.");
  }
  if (navigation?.openProject && typeof navigation.openProject !== "function") {
    throw new TypeError("ProjectHomeController requires a checked optional navigation boundary.");
  }
  for (const element of [elements?.projectFilesButton, elements?.deleteButton]) {
    if (!element?.addEventListener || !element?.removeEventListener) {
      throw new TypeError("ProjectHomeController requires checked project-home control elements.");
    }
  }

  let mounted = false;

  function show() {
    if (!session.getProject()) return;
    const activeIndex = session.getSegments().length ? 0 : -1;
    navigation?.openProject?.(session.getProject().id, activeIndex);
    presentation.renderAll();
  }

  const deleteClickListener = () => actions.confirmDelete();

  function mount() {
    if (mounted) return false;
    elements.projectFilesButton.addEventListener("click", show);
    elements.deleteButton.addEventListener("click", deleteClickListener);
    mounted = true;
    return true;
  }

  function unmount() {
    if (!mounted) return false;
    elements.projectFilesButton.removeEventListener("click", show);
    elements.deleteButton.removeEventListener("click", deleteClickListener);
    mounted = false;
    return true;
  }

  return Object.freeze({ show, mount, unmount });
}
