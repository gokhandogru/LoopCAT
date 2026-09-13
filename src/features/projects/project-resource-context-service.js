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
        const name = String(link.cachedName || link.name || "").trim();
        if (!RESOURCE_LINK_TYPES.has(type) || !name) return null;
        const hasPolicy = Boolean(
          link.resourceId ||
          link.cachedName ||
          ["lookup", "priority", "penalty", "qa", "contribute"].some((key) =>
            Object.prototype.hasOwnProperty.call(link, key)
          )
        );
        return {
          ...link,
          id: typeof link.id === "string" && link.id.trim() ? link.id : "",
          type,
          name,
          ...(hasPolicy
            ? {
                resourceId: typeof link.resourceId === "string" ? link.resourceId.trim() : "",
                cachedName: name,
                lookup: link.lookup !== false,
                priority: Math.max(0, Math.round(Number(link.priority) || 0)),
                ...(type === "tm" ? { penalty: Math.max(0, Math.min(30, Math.round(Number(link.penalty) || 0))) } : {}),
                ...(type === "termbase" ? { qa: link.qa !== false, contribute: Boolean(link.contribute) } : {})
              }
            : {})
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
          ...(project.termBaseName === "" || project.activeTermBaseId === null
            ? []
            : [{ type: "termbase", name: names.clean(project.termBaseName, "Default TB") }])
        ];
    const pendingLegacyTermbase =
      clean.length &&
      project.termBaseName &&
      !Object.prototype.hasOwnProperty.call(project, "activeTermBaseId") &&
      !raw.some((link) => link.type === "termbase")
        ? { type: "termbase", name: names.clean(project.termBaseName) }
        : null;
    const hasNamedMain = raw.some((link) => link.type === "tm" && link.name === main);
    const result = [];
    raw.forEach((link) => {
      if (result.some((item) => item.type === link.type && item.name === link.name)) return;
      const hasPolicy =
        Object.prototype.hasOwnProperty.call(link, "resourceId") ||
        ["lookup", "priority", "penalty", "qa", "contribute", "cachedName"].some((key) =>
          Object.prototype.hasOwnProperty.call(link, key)
        );
      result.push({
        id: link.id || ids.make("resource-link"),
        type: link.type,
        name: link.name,
        role:
          link.type === "tm" && (link.name === main || (!hasNamedMain && link.role === "main"))
            ? "main"
            : link.type === "tm"
              ? "reference"
              : link.role,
        ...(hasPolicy
          ? {
              resourceId: link.resourceId || "",
              cachedName: link.name,
              role:
                link.type === "tm" && (link.name === main || (!hasNamedMain && link.role === "main"))
                  ? "main"
                  : link.type === "tm"
                    ? "reference"
                    : "termbase",
              lookup: link.lookup !== false,
              priority: link.priority ?? result.filter((item) => item.type === link.type).length,
              ...(link.type === "tm"
                ? { penalty: link.penalty || 0 }
                : { qa: link.qa !== false, contribute: Boolean(link.contribute) })
            }
          : {})
      });
    });
    if (!result.some((link) => link.type === "tm" && link.name === main)) {
      result.unshift({ id: ids.make("resource-link"), type: "tm", name: main, role: "main" });
    }
    if (pendingLegacyTermbase) result.push({ id: ids.make("resource-link"), ...pendingLegacyTermbase });
    const tmLinks = result.filter((link) => link.type === "tm").sort((a, b) => a.priority - b.priority);
    if (tmLinks.length && !tmLinks.some((link) => link.role === "main")) tmLinks[0].role = "main";
    let mainSeen = false;
    tmLinks.forEach((link) => {
      if (link.role !== "main") return;
      if (mainSeen) link.role = "reference";
      mainSeen = true;
    });
    return [...tmLinks, ...result.filter((link) => link.type === "termbase").sort((a, b) => a.priority - b.priority)];
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
    const projectLinks = links(project);
    const active = projectLinks.find(
      (link) => link.type === "termbase" && link.resourceId === project?.activeTermBaseId
    );
    return (
      active?.name ||
      projectLinks.find((link) => link.type === "termbase" && link.contribute)?.name ||
      termBaseNames(project)[0] ||
      ""
    );
  }

  function mainTmLink(project = session.getProject()) {
    return links(project).find((link) => link.type === "tm" && link.role === "main") || null;
  }

  function lookupTmLinks(project = session.getProject()) {
    return links(project).filter((link) => link.type === "tm" && link.lookup !== false);
  }

  function lookupTermbaseLinks(project = session.getProject()) {
    return links(project).filter((link) => link.type === "termbase" && link.lookup !== false);
  }

  function qaTermbaseLinks(project = session.getProject()) {
    return links(project).filter((link) => link.type === "termbase" && link.qa !== false);
  }

  function contributionTermbaseLinks(project = session.getProject()) {
    return links(project).filter((link) => link.type === "termbase" && link.contribute);
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

  return Object.freeze({
    cleanLinks,
    links,
    mainTm,
    mainTmLink,
    tmNames,
    termBaseNames,
    primaryTermBase,
    lookupTmLinks,
    lookupTermbaseLinks,
    qaTermbaseLinks,
    contributionTermbaseLinks,
    summary
  });
}
