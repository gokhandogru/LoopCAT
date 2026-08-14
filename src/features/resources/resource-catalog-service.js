/**
 * Owns resource identity, descriptor, grouped-summary, and project-dialog
 * matching policy. Resource state ownership, item sorting, presentation,
 * persistence, and project linking remain outside this service.
 *
 * @param {{ getState: () => { tmEntries?: any[], terms?: any[] } | null | undefined }} options
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
    const resourceState = getState() || { tmEntries: [], terms: [] };
    const summaries = summarize(
      isTm ? resourceState.tmEntries || [] : resourceState.terms || [],
      isTm ? "tmName" : "termBaseName"
    ).filter((resource) => resource.sourceLang === sourceLang && resource.targetLang === targetLang);
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
