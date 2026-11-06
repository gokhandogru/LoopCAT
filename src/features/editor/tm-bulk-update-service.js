export function eligibleForTmUpdate(segment) {
  return segment.status === "confirmed" && Boolean(segment.source?.trim() && segment.target?.trim());
}

export function tmUpdateLanguageMatches(segment, project) {
  const language = (value) =>
    String(value || "")
      .trim()
      .toLowerCase()
      .replace(/_/g, "-");
  return ["sourceLang", "targetLang"].every(
    (key) => !segment.structure?.[key] || language(segment.structure[key]) === language(project[key])
  );
}

/** Runs serial atomic writes; cancellation retains completed contributions. @param {any} options */
export function createTmBulkUpdateService(options) {
  let busy = false;
  /** @param {any} request */
  async function run({ project, segments, canceled = () => false, progress = () => {} }) {
    if (busy) throw new Error("A TM update is already running.");
    busy = true;
    const result = { added: 0, existing: 0, skipped: 0, failed: 0, canceled: false, errors: [] };
    try {
      await options.flush(project.id);
      await options.validate(project);
      // Retain full document neighbors, including untranslated segments.
      const contexts = new Map();
      const documents = new Map();
      for (const segment of segments) {
        if (!documents.has(segment.documentId)) documents.set(segment.documentId, []);
        documents.get(segment.documentId).push(segment);
      }
      for (const rows of documents.values()) {
        rows.forEach((segment, index) =>
          contexts.set(segment.id, {
            documentKey:
              segment.contextKey || `${segment.documentName || segment.documentId}#${segment.index ?? index}`,
            previousSource: rows[index - 1]?.source || "",
            nextSource: rows[index + 1]?.source || "",
            previousBoundary: index === 0,
            nextBoundary: index === rows.length - 1
          })
        );
      }
      for (const segment of segments) {
        if (canceled()) {
          result.canceled = true;
          break;
        }
        if (
          segment.projectId !== project.id ||
          !eligibleForTmUpdate(segment) ||
          !tmUpdateLanguageMatches(segment, project) ||
          options.missingTags(segment).length
        ) {
          result.skipped++;
        } else {
          try {
            const saved = await options.save(project, segment, contexts.get(segment.id));
            if (saved.created) result.added++;
            else result.existing++;
          } catch (error) {
            result.failed++;
            result.errors.push({ segmentId: segment.id, message: error.message || String(error) });
            // Stop on persistence failure: a full disk or stale record needs attention before retrying.
            break;
          }
        }
        progress({ ...result, total: segments.length });
        await options.yieldToUi();
      }
      return result;
    } finally {
      busy = false;
    }
  }
  return { run };
}
