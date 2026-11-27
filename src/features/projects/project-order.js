/** Return projects in display order without changing the session's collection. */
export function sortProjects(projects, order = "newest", locale = undefined) {
  if (order === "name-asc" || order === "name-desc") {
    /** @type {Intl.CollatorOptions} */
    const options = { numeric: true, sensitivity: "accent" };
    let collator;
    try {
      collator = new Intl.Collator(locale || undefined, options);
    } catch {
      // Imported UI language packs may use an identifier that Intl cannot parse.
      collator = new Intl.Collator(undefined, options);
    }
    const direction = order === "name-desc" ? -1 : 1;
    return [...projects].sort((left, right) => direction * collator.compare(left.name || "", right.name || ""));
  }

  const dated = projects.map((project) => ({
    project,
    time: typeof project.createdAt === "number" ? project.createdAt : Date.parse(project.createdAt)
  }));
  dated.sort((left, right) => {
    // Legacy projects with no recorded creation date follow all dated projects in either direction.
    if (!Number.isFinite(left.time)) return Number.isFinite(right.time) ? 1 : 0;
    if (!Number.isFinite(right.time)) return -1;
    return order === "oldest" ? left.time - right.time : right.time - left.time;
  });
  return dated.map(({ project }) => project);
}
