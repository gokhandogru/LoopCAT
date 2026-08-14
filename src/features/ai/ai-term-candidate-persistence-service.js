/**
 * Owns AI term-candidate lookup, stable deduplication, record construction,
 * sequential persistence, aggregation, and linked-project dirtiness. Term
 * storage, project records, resource identity, and text normalization remain
 * injected.
 *
 * @param {{
 *   project: { get: () => any },
 *   termbase: { list: (query: object) => Promise<any[]>, save: (term: object) => Promise<any> },
 *   normalize: { stableLower: (value: unknown) => string },
 *   workspace: { markProjectsUsingResourceDirty: (type: string, name: string, sourceLang: string, targetLang: string) => void }
 * }} options
 */
export function createAiTermCandidatePersistenceService(options) {
  const project = options?.project;
  const termbase = options?.termbase;
  const normalize = options?.normalize;
  const workspace = options?.workspace;
  if (typeof project?.get !== "function") {
    throw new TypeError("AiTermCandidatePersistenceService requires a project boundary.");
  }
  if (
    typeof termbase?.list !== "function" ||
    typeof termbase?.save !== "function" ||
    typeof normalize?.stableLower !== "function" ||
    typeof workspace?.markProjectsUsingResourceDirty !== "function"
  ) {
    throw new TypeError(
      "AiTermCandidatePersistenceService requires termbase, normalization, and workspace boundaries."
    );
  }

  function termKey(term = {}) {
    return `${normalize.stableLower(term.sourceTerm)}::${normalize.stableLower(term.targetTerm)}`;
  }

  async function saveCandidates(terms = [], termBaseName) {
    const existingTerms = await termbase.list({
      sourceLang: project.get().sourceLang,
      targetLang: project.get().targetLang,
      termBaseNames: [termBaseName]
    });
    const existingKeys = new Set(existingTerms.map(termKey));
    const candidates = (terms || []).filter((term) => {
      const key = termKey(term);
      if (existingKeys.has(key)) return false;
      existingKeys.add(key);
      return true;
    });
    const savedTerms = [];
    for (const term of candidates) {
      const saved = await termbase.save({
        sourceTerm: term.sourceTerm,
        targetTerm: term.targetTerm,
        notes: ["AI extracted term candidate. Review before relying on it.", term.note].filter(Boolean).join(" "),
        sourceLang: project.get().sourceLang,
        targetLang: project.get().targetLang,
        termBaseName,
        isForbidden: false
      });
      savedTerms.push(saved);
    }
    if (savedTerms.length) {
      workspace.markProjectsUsingResourceDirty(
        "termbase",
        termBaseName,
        project.get().sourceLang,
        project.get().targetLang
      );
    }
    return {
      savedTerms,
      duplicateCount: Math.max(0, (terms || []).length - savedTerms.length)
    };
  }

  return Object.freeze({ saveCandidates });
}
