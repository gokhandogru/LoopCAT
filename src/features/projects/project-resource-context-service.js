const RESOURCE_LINK_TYPES = new Set(["tm", "termbase"]);

/**
 * Owns project resource-link normalization, legacy fallback completion, stable
 * resource-name selection, and compact TM/termbase summary policy.
 *
 * @param {{
 *   session: { getProject: () => any },
 *   names: {
 *     clean: (value: unknown, fallback?: any) => any,
 *     unique: (values: unknown[]) => string[]
 *   },
 *   ids: { make: (prefix: string) => string }
 * }} options
 */
export function createProjectResourceContextService(options) {
  const session = options?.session;
  const names = options?.names;
  const ids = options?.ids;

  if (typeof session?.getProject !== "function") {
    throw new TypeError("ProjectResourceContextService requires a current-project boundary.");
  }
  if (typeof names?.clean !== "function" || typeof names?.unique !== "function") {
    throw new TypeError("ProjectResourceContextService requires project-name boundaries.");
  }
  if (typeof ids?.make !== "function") {
    throw new TypeError("ProjectResourceContextService requires an ID boundary.");
  }

  function cleanLinks(resourceLinks = []) {
    return (Array.isArray(resourceLinks) ? resourceLinks : [])
      .map((link) => {
        if (!link || typeof link !== "object" || Array.isArray(link)) return null;
        const type = String(link.type || "").trim();
        const name = String(link.name || "").trim();
        if (!RESOURCE_LINK_TYPES.has(type) || !name) return null;
        return {
          ...link,
          id: typeof link.id === "string" && link.id.trim() ? link.id : "",
          type,
          name
        };
      })
      .filter(Boolean);
  }

  function links(project) {
    if (!project) return [];
    const main = names.clean(project.mainTmName, names.clean(project.tmName, "Default TM"));
    const clean = cleanLinks(project.resourceLinks);
    const raw = clean.length
      ? clean
      : [
          { type: "tm", name: main, role: "main" },
          { type: "termbase", name: names.clean(project.termBaseName, "Default TB") }
        ];
    const result = [];
    raw.forEach((link) => {
      if (result.some((item) => item.type === link.type && item.name === link.name)) return;
      result.push({
        id: link.id || ids.make("resource-link"),
        type: link.type,
        name: link.name,
        role: link.type === "tm" && link.name === main ? "main" : link.type === "tm" ? "reference" : link.role
      });
    });
    if (!result.some((link) => link.type === "tm" && link.name === main)) {
      result.unshift({ id: ids.make("resource-link"), type: "tm", name: main, role: "main" });
    }
    if (!result.some((link) => link.type === "termbase")) {
      result.push({
        id: ids.make("resource-link"),
        type: "termbase",
        name: names.clean(project.termBaseName, "Default TB")
      });
    }
    return result;
  }

  function mainTm(project = session.getProject()) {
    return (
      links(project).find((link) => link.type === "tm" && link.role === "main")?.name ||
      names.clean(project?.mainTmName, names.clean(project?.tmName, "Default TM"))
    );
  }

  function tmNames(project = session.getProject()) {
    return names.unique([
      mainTm(project),
      ...links(project)
        .filter((link) => link.type === "tm")
        .map((link) => link.name)
    ]);
  }

  function termBaseNames(project = session.getProject()) {
    return names.unique(
      links(project)
        .filter((link) => link.type === "termbase")
        .map((link) => link.name)
    );
  }

  function primaryTermBase(project = session.getProject()) {
    return termBaseNames(project)[0] || names.clean(project?.termBaseName, "Default TB");
  }

  function summary(project = session.getProject()) {
    const tmNamesValue = tmNames(project);
    const termBaseNamesValue = termBaseNames(project);
    return {
      mainTm: mainTm(project),
      tmNames: tmNamesValue,
      tbNames: termBaseNamesValue,
      tmLabel: `${tmNamesValue.length} TM${tmNamesValue.length === 1 ? "" : "s"}`,
      tbLabel: `${termBaseNamesValue.length} TB${termBaseNamesValue.length === 1 ? "" : "s"}`
    };
  }

  return Object.freeze({ cleanLinks, links, mainTm, tmNames, termBaseNames, primaryTermBase, summary });
}
