export function createProjectsController({ root }) {
  if (!root?.replaceChildren) throw new TypeError("ProjectsController requires a root element.");
  let mounted = false;

  return Object.freeze({
    mount() {
      mounted = true;
    },
    unmount() {
      mounted = false;
      root.replaceChildren();
    },
    render({ projects = [], query = "", languagePair = "", createItem, createEmptyState }) {
      if (!mounted) mounted = true;
      const normalizedQuery = String(query || "")
        .trim()
        .toLocaleLowerCase("en-US");
      const visibleProjects = projects.filter((project) => {
        const searchText = String(project.searchText || "").toLocaleLowerCase("en-US");
        return (
          (!normalizedQuery || searchText.includes(normalizedQuery)) &&
          (!languagePair || project.languagePairKey === languagePair)
        );
      });
      if (!visibleProjects.length) {
        root.replaceChildren(createEmptyState({ hasProjects: projects.length > 0 }));
        return visibleProjects;
      }
      const fragment = document.createDocumentFragment();
      visibleProjects.forEach((project) => fragment.append(createItem(project)));
      root.replaceChildren(fragment);
      return visibleProjects;
    }
  });
}
