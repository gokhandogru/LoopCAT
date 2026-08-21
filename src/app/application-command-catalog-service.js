/**
 * Owns command-palette catalog composition. Palette search, rendering,
 * persistence, focus, and execution remain in PaletteController; feature
 * actions and live application state remain injected owners.
 */
export function createApplicationCommandCatalogService({
  command,
  history,
  trash,
  session,
  application,
  selection,
  ai,
  features
}) {
  const requiredFeatureMethods = [
    [features?.history, ["undo", "redo"]],
    [features?.trash, ["open"]],
    [features?.confirmation, ["confirm"]],
    [features?.navigation, ["nextOpen"]],
    [features?.focus, ["toggle"]],
    [features?.targetProducer, ["copySourceToTarget"]],
    [features?.structural, ["split", "merge", "canSplit", "canMerge", "nextForMerge"]],
    [features?.tm, ["saveActive"]],
    [features?.qa, ["run"]],
    [features?.reports, ["exportQualityPassport", "exportProjectReport", "exportAnonymizedReport"]],
    [features?.quality, ["nextRisk"]],
    [features?.concordance, ["open"]],
    [features?.replacement, ["open"]],
    [features?.filterPreset, ["apply"]],
    [features?.aiPretranslation, ["pretranslate"]],
    [features?.aiReview, ["reviewActive", "reviewBatch"]],
    [features?.aiTagRepair, ["repairActive", "repairBatch"]],
    [features?.aiDraftEditing, ["polishActive", "polishBatch", "adaptActive", "adaptBatch"]],
    [features?.aiAlternatives, ["suggestActive", "suggestBatch"]],
    [features?.aiTerminologyApplication, ["applyActive", "applyBatch"]],
    [features?.aiTerminologyExtraction, ["extractActive", "extractBatch"]],
    [features?.aiProjectBrief, ["generate"]],
    [features?.aiOpenAiSuggestion, ["create"]]
  ];
  if (
    typeof command?.getProjectId !== "function" ||
    typeof history?.canUndo !== "function" ||
    typeof history?.canRedo !== "function" ||
    typeof trash?.isAvailable !== "function" ||
    typeof session?.getProject !== "function" ||
    typeof session?.getSegments !== "function" ||
    typeof application?.getState !== "function" ||
    typeof selection?.getActiveSegment !== "function" ||
    typeof ai?.getState !== "function" ||
    typeof features?.projectDialog !== "function" ||
    requiredFeatureMethods.some(([owner, methods]) => methods.some((name) => typeof owner?.[name] !== "function"))
  ) {
    throw new TypeError("ApplicationCommandCatalogService requires checked state, capability, and action boundaries.");
  }

  function list() {
    const commandProjectId = command.getProjectId() || session.getProject()?.id || null;
    const commands = [
      {
        id: "undo",
        label: "Undo last action",
        run: features.history.undo,
        enabled: Boolean(history.canUndo(commandProjectId))
      },
      {
        id: "redo",
        label: "Redo last action",
        run: features.history.redo,
        enabled: Boolean(history.canRedo(commandProjectId))
      },
      { id: "trash", label: "Open Trash", run: features.trash.open, enabled: Boolean(trash.isAvailable()) },
      {
        id: "confirm",
        label: "Confirm segment",
        run: features.confirmation.confirm,
        enabled: Boolean(selection.getActiveSegment()?.target?.trim())
      },
      {
        id: "next-open",
        label: "Next open segment",
        run: features.navigation.nextOpen,
        enabled: Boolean(session.getSegments().length)
      },
      {
        id: "focus-mode",
        label: application.getState().interface.focusMode ? "Exit Focus view" : "Enter Focus view",
        run: features.focus.toggle,
        enabled: Boolean(application.getState().navigation.view === "editor" && session.getProject())
      },
      {
        id: "copy-source",
        label: "Copy source",
        run: features.targetProducer.copySourceToTarget,
        enabled: Boolean(selection.getActiveSegment())
      },
      {
        id: "split-segment",
        label: "Split segment",
        group: "Segment",
        keywords: ["divide", "cursor", "structure"],
        run: features.structural.split,
        enabled: Boolean(selection.getActiveSegment() && features.structural.canSplit(selection.getActiveSegment()))
      },
      {
        id: "merge-segments",
        label: "Merge with next segment",
        group: "Segment",
        keywords: ["join", "combine", "structure"],
        run: features.structural.merge,
        enabled: Boolean(
          selection.getActiveSegment() &&
          features.structural.canMerge(
            selection.getActiveSegment(),
            features.structural.nextForMerge(selection.getActiveSegment())
          )
        )
      },
      {
        id: "save-tm",
        label: "Save segment to TM",
        run: features.tm.saveActive,
        enabled: Boolean(selection.getActiveSegment()?.target?.trim())
      },
      {
        id: "project-settings",
        label: "Project settings",
        run: () => features.projectDialog("edit"),
        enabled: Boolean(session.getProject())
      },
      { id: "qa", label: "Run QA checks", run: features.qa.run, enabled: Boolean(session.getProject()) },
      {
        id: "quality-passport",
        label: "Export Quality Passport",
        run: features.reports.exportQualityPassport,
        enabled: Boolean(session.getProject())
      },
      {
        id: "next-quality-risk",
        label: "Next quality risk",
        run: features.quality.nextRisk,
        enabled: Boolean(session.getProject())
      },
      {
        id: "concordance",
        label: "Open concordance",
        run: features.concordance.open,
        enabled: Boolean(session.getProject())
      },
      {
        id: "replace-target",
        label: "Find and replace target text",
        run: features.replacement.open,
        enabled: Boolean(session.getProject())
      },
      {
        id: "preset-translate",
        label: "Use Translate filter preset",
        group: "Filters",
        keywords: ["open", "segments", "matches"],
        run: () => features.filterPreset.apply("translate"),
        enabled: Boolean(session.getProject())
      },
      {
        id: "preset-review",
        label: "Use Review filter preset",
        group: "Filters",
        keywords: ["needs review", "comments"],
        run: () => features.filterPreset.apply("review"),
        enabled: Boolean(session.getProject())
      },
      {
        id: "preset-qa-fixes",
        label: "Use QA fixes filter preset",
        group: "Filters",
        keywords: ["quality", "blocked", "fixes"],
        run: () => features.filterPreset.apply("qa-fixes"),
        enabled: Boolean(session.getProject())
      },
      {
        id: "preset-ai-review",
        label: "Use AI review filter preset",
        group: "Filters",
        keywords: ["AI", "risk", "suggestions"],
        run: () => features.filterPreset.apply("ai-review"),
        enabled: Boolean(session.getProject())
      },
      {
        id: "project-report",
        label: "Export project report",
        run: features.reports.exportProjectReport,
        enabled: Boolean(session.getProject())
      },
      {
        id: "anonymized-report",
        label: "Export anonymized report",
        run: features.reports.exportAnonymizedReport,
        enabled: Boolean(session.getProject())
      },
      {
        id: "local-ai-pretranslate",
        label: "Local AI pre-translate",
        run: features.aiPretranslation.pretranslate,
        enabled: Boolean(session.getProject() && !ai.getState().running)
      },
      {
        id: "local-ai-review",
        label: "AI review active segment",
        run: features.aiReview.reviewActive,
        enabled: Boolean(selection.getActiveSegment() && !ai.getState().running && !ai.getState().promptBusy)
      },
      {
        id: "local-ai-review-batch",
        label: "AI QA batch",
        run: features.aiReview.reviewBatch,
        enabled: Boolean(session.getProject() && !ai.getState().running && !ai.getState().promptBusy)
      },
      {
        id: "local-ai-tag-repair",
        label: "Suggest AI tag repair",
        run: features.aiTagRepair.repairActive,
        enabled: Boolean(selection.getActiveSegment() && !ai.getState().running && !ai.getState().promptBusy)
      },
      {
        id: "local-ai-tag-repair-batch",
        label: "Repair AI tags batch",
        run: features.aiTagRepair.repairBatch,
        enabled: Boolean(session.getProject() && !ai.getState().running && !ai.getState().promptBusy)
      },
      {
        id: "local-ai-polish-draft",
        label: "Polish active draft with AI",
        run: features.aiDraftEditing.polishActive,
        enabled: Boolean(selection.getActiveSegment() && !ai.getState().running && !ai.getState().promptBusy)
      },
      {
        id: "local-ai-polish-batch",
        label: "Polish AI drafts batch",
        run: features.aiDraftEditing.polishBatch,
        enabled: Boolean(session.getProject() && !ai.getState().running && !ai.getState().promptBusy)
      },
      {
        id: "local-ai-adapt-draft",
        label: "Adapt active draft with AI",
        run: features.aiDraftEditing.adaptActive,
        enabled: Boolean(selection.getActiveSegment() && !ai.getState().running && !ai.getState().promptBusy)
      },
      {
        id: "local-ai-adapt-batch",
        label: "Adapt AI drafts batch",
        run: features.aiDraftEditing.adaptBatch,
        enabled: Boolean(session.getProject() && !ai.getState().running && !ai.getState().promptBusy)
      },
      {
        id: "local-ai-variants",
        label: "Suggest AI alternatives",
        run: features.aiAlternatives.suggestActive,
        enabled: Boolean(selection.getActiveSegment() && !ai.getState().running && !ai.getState().promptBusy)
      },
      {
        id: "local-ai-variants-batch",
        label: "Suggest AI alternatives batch",
        run: features.aiAlternatives.suggestBatch,
        enabled: Boolean(session.getProject() && !ai.getState().running && !ai.getState().promptBusy)
      },
      {
        id: "local-ai-apply-terms",
        label: "Apply AI terminology",
        run: features.aiTerminologyApplication.applyActive,
        enabled: Boolean(selection.getActiveSegment() && !ai.getState().running && !ai.getState().promptBusy)
      },
      {
        id: "local-ai-apply-terms-batch",
        label: "Apply AI terminology batch",
        run: features.aiTerminologyApplication.applyBatch,
        enabled: Boolean(session.getProject() && !ai.getState().running && !ai.getState().promptBusy)
      },
      {
        id: "local-ai-terms",
        label: "Extract AI terms",
        run: features.aiTerminologyExtraction.extractActive,
        enabled: Boolean(selection.getActiveSegment() && !ai.getState().running && !ai.getState().promptBusy)
      },
      {
        id: "local-ai-terms-batch",
        label: "Extract AI terms batch",
        run: features.aiTerminologyExtraction.extractBatch,
        enabled: Boolean(session.getProject() && !ai.getState().running && !ai.getState().promptBusy)
      },
      {
        id: "local-ai-project-brief",
        label: "Generate AI project brief",
        run: features.aiProjectBrief.generate,
        enabled: Boolean(session.getProject() && !ai.getState().running && !ai.getState().promptBusy)
      },
      {
        id: "openai-ai",
        label: "Create OpenAI suggestion",
        run: features.aiOpenAiSuggestion.create,
        enabled: Boolean(selection.getActiveSegment())
      }
    ];
    const shortcuts = {
      undo: "Ctrl/Cmd+Z",
      redo: "Ctrl/Cmd+Shift+Z",
      concordance: "Ctrl/Cmd+Alt+K",
      "focus-mode": "Ctrl/Cmd+Shift+F"
    };
    return commands.map((entry) => ({
      ...entry,
      shortcut: shortcuts[entry.id] || "",
      disabledReason: entry.enabled ? "" : "Unavailable in the current context."
    }));
  }

  return Object.freeze({ list });
}
