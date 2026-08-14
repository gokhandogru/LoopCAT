const MODE_LABELS = Object.freeze({
  pretranslate: "pre-translation",
  review: "review / QA",
  "tag-repair": "tag repair",
  polish: "draft polish",
  adapt: "draft adaptation",
  variants: "alternatives",
  "apply-terms": "terminology application",
  "extract-terms": "terminology extraction",
  "project-brief": "project brief"
});

const MODE_SYSTEMS = Object.freeze({
  review:
    "You are a senior translation reviewer inside LoopCAT. Return review notes only; do not translate, rewrite the full segment, or add generic encouragement.",
  "tag-repair": "You are a CAT-tool tag repair assistant. Return only the repaired target segment.",
  polish: "You are a CAT-tool style polishing assistant. Return only the improved target segment.",
  adapt: "You are a CAT-tool target adaptation assistant. Return only the adapted target segment.",
  variants: "You are a CAT-tool target alternatives assistant. Return only the requested alternatives.",
  "apply-terms": "You are a CAT-tool terminology application assistant. Return only the revised target segment.",
  "extract-terms": "You are a CAT-tool terminology extraction assistant. Return only the requested JSON array.",
  "project-brief": "You are a CAT-tool project brief assistant. Return only concise reusable translation instructions."
});

/**
 * Owns AI prompt-preview mode metadata, sample/segment synthesis, bounded term,
 * protected-token, style, surrounding/project context, prompt-builder routing,
 * and preview presentation. Form state, project/session records, prompt
 * builders, and administration rendering remain injected.
 *
 * @param {{
 *   administration: { readPromptState: () => { mode?: string, sample?: string }, renderPromptPreview: (prompt: string) => void },
 *   settings: { read: () => any },
 *   project: { get: () => any, getActiveSegment: () => any, getTerms: () => any[], getDocuments: () => any[], getSampleSegments: () => any[], getSurroundingSegments: (segment: any, options: object) => any[], getTags: (segment: any) => any[] },
 *   builders: { translate: (request: object) => string, review: (request: object) => string, tagRepair: (request: object) => string, polish: (request: object) => string, adapt: (request: object) => string, variants: (request: object) => string, applyTerms: (request: object) => string, extractTerms: (request: object) => string, projectBrief: (request: object) => string },
 *   normalize: { stableLower: (value: unknown) => string }
 * }} options
 */
export function createAiPromptPreviewController(options) {
  const administration = options?.administration;
  const settingsBoundary = options?.settings;
  const project = options?.project;
  const builders = options?.builders;
  const normalize = options?.normalize;
  if (
    typeof administration?.readPromptState !== "function" ||
    typeof administration?.renderPromptPreview !== "function" ||
    typeof settingsBoundary?.read !== "function"
  ) {
    throw new TypeError("AiPromptPreviewController requires administration and settings boundaries.");
  }
  for (const boundary of [
    "get",
    "getActiveSegment",
    "getTerms",
    "getDocuments",
    "getSampleSegments",
    "getSurroundingSegments",
    "getTags"
  ]) {
    if (typeof project?.[boundary] !== "function") {
      throw new TypeError(`AiPromptPreviewController requires ${boundary} project context.`);
    }
  }
  for (const boundary of [
    "translate",
    "review",
    "tagRepair",
    "polish",
    "adapt",
    "variants",
    "applyTerms",
    "extractTerms",
    "projectBrief"
  ]) {
    if (typeof builders?.[boundary] !== "function") {
      throw new TypeError(`AiPromptPreviewController requires the ${boundary} prompt builder.`);
    }
  }
  if (typeof normalize?.stableLower !== "function") {
    throw new TypeError("AiPromptPreviewController requires stable text normalization.");
  }

  function getMode() {
    return administration.readPromptState()?.mode || "pretranslate";
  }

  function getSampleText() {
    return administration.readPromptState()?.sample || project.getActiveSegment()?.source || "";
  }

  function getModeLabel(mode = getMode()) {
    return MODE_LABELS[mode] || "prompt";
  }

  function getSystem(mode = getMode()) {
    return (
      MODE_SYSTEMS[mode] || "You are a professional CAT-tool translation assistant. Return only the requested output."
    );
  }

  function getContextLabels(mode = getMode()) {
    const common = ["configured provider URL"];
    if (mode === "project-brief") {
      return ["project metadata", "document names", "sample segments", "termbase hints", ...common];
    }
    if (mode === "extract-terms") return ["sample source text", "current target draft", ...common];
    if (mode === "pretranslate") return ["sample source text", ...common];
    if (mode === "review") {
      return ["sample source text", "current target draft", "project glossary hints", ...common];
    }
    if (mode === "apply-terms") {
      return ["sample source text", "current target draft", "project terminology hints", ...common];
    }
    return [
      "sample source text",
      "current target draft",
      "project style instructions",
      "project glossary hints",
      ...common
    ];
  }

  function termsForSegment(segment = project.getActiveSegment()) {
    const projectTerms = project.getTerms();
    if (!projectTerms.length) return [];
    const source = normalize.stableLower(String(segment?.source || ""));
    const target = normalize.stableLower(String(segment?.target || ""));
    const matching = projectTerms.filter((term) => {
      const sourceTerm = normalize.stableLower(term.sourceTerm || "");
      const targetTerm = normalize.stableLower(term.targetTerm || "");
      return Boolean((sourceTerm && source.includes(sourceTerm)) || (targetTerm && target.includes(targetTerm)));
    });
    return (matching.length ? matching : projectTerms).slice(0, 12);
  }

  function createRequest(settings = settingsBoundary.read(), mode = getMode()) {
    const activeSegment = project.getActiveSegment();
    const sourceText = String(getSampleText() || activeSegment?.source || "");
    const previewSegment = {
      ...(activeSegment || {}),
      source: sourceText,
      target: activeSegment?.target || "",
      tags: activeSegment ? project.getTags(activeSegment) : []
    };
    const glossaryTerms = termsForSegment(previewSegment);
    const currentProject = project.get();
    const common = {
      project: currentProject,
      segment: previewSegment,
      sourceLanguage: settings.sourceLanguage,
      sourceCode: settings.sourceCode,
      targetLanguage: settings.targetLanguage,
      targetCode: settings.targetCode,
      sourceText,
      targetText: previewSegment.target,
      protectedTokens: previewSegment.tags.map((tag) => tag.text || tag.label || "").filter(Boolean),
      glossaryTerms,
      terms: glossaryTerms,
      tmMatches: [],
      styleGuide: currentProject?.aiSettings?.styleGuide || "",
      variantMode: settings.variantMode,
      adaptMode: settings.adaptMode,
      surroundingSegments:
        settings.includeNearbyContext && activeSegment
          ? project.getSurroundingSegments(activeSegment, { settings })
          : []
    };
    const prompt =
      {
        review: () => builders.review(common),
        "tag-repair": () => builders.tagRepair(common),
        polish: () => builders.polish(common),
        adapt: () => builders.adapt(common),
        variants: () => builders.variants(common),
        "apply-terms": () => builders.applyTerms(common),
        "extract-terms": () => builders.extractTerms(common),
        "project-brief": () =>
          builders.projectBrief({
            ...common,
            documents: project.getDocuments(),
            sampleSegments: project.getSampleSegments(),
            terms: project.getTerms().slice(0, 12)
          })
      }[mode]?.() || builders.translate({ ...common, text: sourceText });
    return {
      mode,
      label: getModeLabel(mode),
      prompt,
      sourceText,
      segment: previewSegment,
      glossaryTerms,
      system: getSystem(mode)
    };
  }

  function render() {
    const settings = settingsBoundary.read();
    administration.renderPromptPreview(createRequest(settings).prompt);
  }

  return Object.freeze({
    createRequest,
    getContextLabels,
    getMode,
    getModeLabel,
    getSampleText,
    getSystem,
    render,
    termsForSegment
  });
}
