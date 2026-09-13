/**
 * Owns resource identity, descriptor, grouped-summary, and project-dialog
 * matching policy. Resource state ownership, item sorting, presentation,
 * persistence, and project linking remain outside this service.
 *
 * @param {{ getState: () => { tmEntries?: any[], terms?: any[], resources?: any[] } | null | undefined }} options
 */
export function createResourceCatalogService(options) {
  const getState = options?.getState;
  if (typeof getState !== "function") {
    throw new TypeError("ResourceCatalogService requires a resource-state boundary.");
  }

  function key(item, nameField) {
    return `${item[nameField] || "Unnamed resource"}::${item.languagePair || `${item.sourceLang || ""}::${item.targetLang || ""}`}`;
  }

  function labelFromKey(resourceKey) {
    const parts = String(resourceKey || "").split("::");
    const targetLang = parts.pop() || "";
    const sourceLang = parts.pop() || "";
    const name = parts.join("::") || "Unnamed resource";
    return {
      name,
      sourceLang: sourceLang || "",
      targetLang: targetLang || "",
      languagePair: `${sourceLang || ""}::${targetLang || ""}`
    };
  }

  function summarize(items, nameField) {
    const map = new Map();
    items.forEach((item) => {
      const resourceKey = key(item, nameField);
      if (!map.has(resourceKey)) {
        map.set(resourceKey, {
          key: resourceKey,
          name: item[nameField] || "Unnamed resource",
          sourceLang: item.sourceLang,
          targetLang: item.targetLang,
          languagePair: item.languagePair,
          count: 0,
          updatedAt: item.updatedAt || item.createdAt || ""
        });
      }
      const summary = map.get(resourceKey);
      summary.count += 1;
      if (new Date(item.updatedAt || item.createdAt || 0) > new Date(summary.updatedAt || 0)) {
        summary.updatedAt = item.updatedAt || item.createdAt || "";
      }
    });
    return Array.from(map.values()).sort(
      (a, b) => a.name.localeCompare(b.name) || String(a.languagePair || "").localeCompare(String(b.languagePair || ""))
    );
  }

  function matching(type, sourceLang, targetLang, selectedNames = []) {
    const isTm = type === "tm";
    const resourceState = getState() || { tmEntries: [], terms: [], resources: [] };
    const items = isTm ? resourceState.tmEntries || [] : resourceState.terms || [];
    const resourceType = isTm ? "tm" : "termbase";
    const stableResources = (resourceState.resources || []).filter((resource) => {
      if (resource.type !== resourceType || resource.archived) return false;
      return isTm
        ? resource.sourceLang === sourceLang && resource.targetLang === targetLang
        : Array.isArray(resource.languages)
          ? resource.languages.includes(sourceLang) && resource.languages.includes(targetLang)
          : resource.sourceLang === sourceLang && resource.targetLang === targetLang;
    });
    /** @type {any[]} */
    const summaries = stableResources.map((resource) => ({
      key: resource.id,
      id: resource.id,
      resourceId: resource.id,
      name: resource.name,
      sourceLang: resource.sourceLang,
      targetLang: resource.targetLang,
      languages: resource.languages || [resource.sourceLang, resource.targetLang],
      languagePair: resource.languagePair || `${resource.sourceLang}::${resource.targetLang}`,
      count: items.filter(
        (item) =>
          item.resourceId === resource.id ||
          (!item.resourceId && item[isTm ? "tmName" : "termBaseName"] === resource.name)
      ).length,
      updatedAt: resource.updatedAt || resource.createdAt || ""
    }));
    if (!stableResources.length) {
      summaries.push(
        ...summarize(items, isTm ? "tmName" : "termBaseName").filter(
          (resource) => resource.sourceLang === sourceLang && resource.targetLang === targetLang
        )
      );
    }
    selectedNames.forEach((name) => {
      if (summaries.some((resource) => resource.name === name)) return;
      summaries.push({
        key: `${name}::${sourceLang}::${targetLang}`,
        name,
        sourceLang,
        targetLang,
        languagePair: `${sourceLang}::${targetLang}`,
        count: 0,
        updatedAt: ""
      });
    });
    return summaries.sort((a, b) => a.name.localeCompare(b.name));
  }

  return Object.freeze({ key, labelFromKey, summarize, matching });
}
