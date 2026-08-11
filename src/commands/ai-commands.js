export function createApplyAiSuggestionCommand({
  projectId,
  segmentId,
  suggestion,
  beforeSnapshot,
  applyFirst,
  restoreSnapshot
}) {
  if (
    !projectId ||
    !segmentId ||
    !suggestion?.id ||
    typeof applyFirst !== "function" ||
    typeof restoreSnapshot !== "function"
  ) {
    throw new TypeError("ApplyAiSuggestion requires project, segment, suggestion, apply, and restore boundaries.");
  }
  let appliedSnapshot = null;
  return {
    id: "apply-ai-suggestion",
    label: "Apply AI suggestion",
    undoLabel: "Undo AI suggestion",
    projectId,
    scope: "segment",
    affectedIds: [segmentId],
    provenance: {
      origin: "ai-suggestion",
      provider: String(suggestion.provider || "AI"),
      model: String(suggestion.model || ""),
      suggestionId: suggestion.id
    },
    async execute() {
      if (appliedSnapshot) {
        await restoreSnapshot(structuredClone(appliedSnapshot), { direction: "redo" });
        return { recoveryToken: suggestion.id };
      }
      const result = await applyFirst();
      appliedSnapshot = structuredClone(result.snapshot);
      return { ...result, recoveryToken: suggestion.id };
    },
    undo() {
      return restoreSnapshot(structuredClone(beforeSnapshot), { direction: "undo" });
    }
  };
}
