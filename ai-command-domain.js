(function () {
  const ai = window.CatHan?.ai;
  const runtime = ai?.__commandDomainRuntime;
  if (!ai || !runtime) throw new TypeError("AI command domain requires the LoopCAT AI compatibility runtime.");

  const {
    LOCAL_AI_ADAPT_MODES,
    OPENAI_DEFAULT_MODEL,
    OPENAI_REQUEST_TIMEOUT_MS,
    OPENAI_RESPONSES_URL,
    aiContextRecords,
    aiProviderRegistry,
    applyAiPretranslation,
    browserAppearsOffline,
    buildAiReviewPrompt,
    buildDraftAdaptationPrompt,
    buildProjectBriefPrompt,
    buildStylePolishPrompt,
    buildTagRepairPrompt,
    buildTargetVariantsPrompt,
    buildTerminologyApplicationPrompt,
    buildTerminologyExtractionPrompt,
    cleanModelTranslationOutput,
    defaultLocalAiSettings,
    externalAiSourceSharingAllowed,
    extractResponseText,
    filteredAiContext,
    isLockedSegment,
    isOpenAiProvider,
    makeId,
    normalizeAiReviewRiskLevel,
    normalizedPositiveInteger,
    parseAiReviewRisk,
    parseTargetVariantSuggestions,
    parseTerminologyExtractionSuggestions,
    protectedTokenList,
    redactSensitiveText,
    segmentSkipReason,
    selectPretranslationSegments,
    stripModelWrapper,
    suggestionPrompt
  } = runtime;

  function openAiProviderErrorMessage(data, status) {
    const message = data?.error?.message || `OpenAI request failed with status ${status}.`;
    return redactSensitiveText(message).trim() || "OpenAI request failed.";
  }

  function normalizedOpenAiTimeoutMs(value) {
    const timeoutMs = Number(value);
    return Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : OPENAI_REQUEST_TIMEOUT_MS;
  }

  async function fetchOpenAiResponse(request, timeoutMs) {
    if (browserAppearsOffline()) {
      throw new Error("OpenAI suggestions need an internet connection. LoopCAT appears to be offline.");
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), normalizedOpenAiTimeoutMs(timeoutMs));
    try {
      return await fetch(OPENAI_RESPONSES_URL, { ...request, signal: controller.signal });
    } catch (error) {
      if (error?.name === "AbortError") {
        throw new Error("OpenAI request timed out. Check your connection or try again later.");
      }
      throw new Error(
        "OpenAI request could not connect. Check your internet connection or provider access and try again."
      );
    } finally {
      clearTimeout(timer);
    }
  }

  async function openAiSuggestion({
    apiKey,
    segment,
    tmMatches = [],
    terms = [],
    project = null,
    timeoutMs = OPENAI_REQUEST_TIMEOUT_MS
  }) {
    if (!segment?.source?.trim()) throw new Error("The active segment has no source text.");
    if (!externalAiSourceSharingAllowed(project)) {
      throw new Error("OpenAI suggestions require AI helpers and source sharing to be enabled for this project.");
    }
    if (!isOpenAiProvider(project)) {
      throw new Error("Choose OpenAI as the provider before requesting an OpenAI suggestion.");
    }
    if (browserAppearsOffline()) {
      throw new Error("OpenAI suggestions need an internet connection. LoopCAT appears to be offline.");
    }
    if (!apiKey) throw new Error("Add your OpenAI API key first.");
    const context = filteredAiContext({ tmMatches, terms, project });
    const model = redactSensitiveText(project?.aiSettings?.model || "").trim() || OPENAI_DEFAULT_MODEL;
    const response = await fetchOpenAiResponse(
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model,
          store: false,
          instructions:
            "You are a professional translation assistant inside LoopCAT. Produce accurate, fluent target-language translations for individual CAT-tool segments.",
          input: suggestionPrompt({ segment, tmMatches: context.tmMatches, terms: context.terms, project }),
          max_output_tokens: 900
        })
      },
      timeoutMs
    );
    const data = await response.json().catch(() => null);
    if (!response.ok) {
      throw new Error(openAiProviderErrorMessage(data, response.status));
    }
    const suggestedTarget = extractResponseText(data).trim();
    if (!suggestedTarget) throw new Error("OpenAI returned an empty suggestion.");
    return {
      id: makeId("ai-suggestion"),
      provider: "OpenAI",
      model,
      segmentId: segment.id || "",
      suggestedTarget,
      confidence: 0,
      explanation: [
        "Generated through the OpenAI Responses API.",
        context.tmMatches.length
          ? `Included ${Math.min(context.tmMatches.length, 3)} TM match${Math.min(context.tmMatches.length, 3) === 1 ? "" : "es"}.`
          : "No TM context was included.",
        context.terms.length
          ? `Included ${Math.min(context.terms.length, 12)} termbase hit${Math.min(context.terms.length, 12) === 1 ? "" : "s"}.`
          : "No termbase context was included.",
        project?.aiSettings?.styleGuide ? "Project style instructions were included." : ""
      ].filter(Boolean),
      status: "review",
      createdAt: new Date().toISOString()
    };
  }

  async function pretranslateSegments(options = {}) {
    const provider = options.provider || aiProviderRegistry.get(options.providerId || options.settings?.providerId);
    if (!provider?.translateSegment) throw new Error("No local AI translation provider is available.");
    const settings = defaultLocalAiSettings(options.settings || options.config || {}, options.project);
    const selection = selectPretranslationSegments(options.segments || [], {
      ...options,
      settings,
      mode: options.mode || settings.mode
    });
    const summary = {
      total: selection.candidates.length,
      completed: 0,
      failed: 0,
      skipped: selection.skipped.length,
      failures: [],
      skippedSegments: selection.skipped,
      updatedSegmentIds: [],
      canceled: false
    };
    let cursor = 0;
    const concurrency = normalizedPositiveInteger(options.concurrency || settings.concurrency, 1, 1, 2);
    const nextCandidate = () => {
      if (options.signal?.aborted) return null;
      if (cursor >= selection.candidates.length) return null;
      const segment = selection.candidates[cursor];
      cursor += 1;
      return segment;
    };
    const runOne = async (segment) => {
      try {
        const glossaryTerms =
          typeof options.glossaryTermsForSegment === "function"
            ? await options.glossaryTermsForSegment(segment, { project: options.project, settings })
            : options.glossaryTerms || [];
        const tmMatches =
          typeof options.tmMatchesForSegment === "function"
            ? await options.tmMatchesForSegment(segment, { project: options.project, settings })
            : options.tmMatches || [];
        const surroundingSegments =
          typeof options.surroundingSegmentsForSegment === "function"
            ? await options.surroundingSegmentsForSegment(segment, {
                project: options.project,
                settings,
                segments: options.segments || []
              })
            : options.surroundingSegments || [];
        const result = await provider.translateSegment(
          { ...settings, ...(options.config || {}), signal: options.signal },
          {
            project: options.project,
            segment,
            text: segment.source || "",
            sourceLanguage: options.sourceLanguage || settings.sourceLanguage,
            sourceCode: options.sourceCode || settings.sourceCode,
            targetLanguage: options.targetLanguage || settings.targetLanguage,
            targetCode: options.targetCode || settings.targetCode,
            glossaryTerms,
            tmMatches,
            surroundingSegments,
            signal: options.signal
          }
        );
        applyAiPretranslation(segment, result);
        await options.onSegmentResult?.({ segment, result });
        summary.completed += 1;
        summary.updatedSegmentIds.push(segment.id || "");
      } catch (error) {
        if (options.signal?.aborted || String(error?.message || "").includes("canceled")) {
          summary.canceled = true;
          return;
        }
        summary.failed += 1;
        summary.failures.push({
          segmentId: segment.id || "",
          message: redactSensitiveText(error?.message || "Local AI translation failed.")
        });
        options.onSegmentFailure?.({ segment, error });
      } finally {
        options.onProgress?.({ ...summary });
      }
    };
    const workers = Array.from(
      { length: Math.max(1, Math.min(concurrency, selection.candidates.length || 1)) },
      async () => {
        while (!options.signal?.aborted) {
          const segment = nextCandidate();
          if (!segment) return;
          await runOne(segment);
        }
      }
    );
    options.onProgress?.({ ...summary });
    await Promise.all(workers);
    if (options.signal?.aborted) summary.canceled = true;
    return summary;
  }

  async function reviewSegmentWithAi(options = {}) {
    const provider = options.provider || aiProviderRegistry.get(options.providerId || options.settings?.providerId);
    if (!provider?.completePrompt) throw new Error("This AI provider cannot run review commands.");
    const settings = defaultLocalAiSettings(options.settings || options.config || {}, options.project);
    const segment = options.segment || {};
    const sourceText = String(options.sourceText ?? segment.source ?? "");
    const targetText = String(options.targetText ?? segment.target ?? "");
    if (!sourceText.trim()) throw new Error("The active segment has no source text.");
    if (!targetText.trim()) throw new Error("The active segment has no target text to review.");
    const glossaryTerms = options.glossaryTerms || [];
    const prompt =
      options.prompt ||
      buildAiReviewPrompt({
        sourceLanguage: options.sourceLanguage || settings.sourceLanguage,
        sourceCode: options.sourceCode || settings.sourceCode,
        targetLanguage: options.targetLanguage || settings.targetLanguage,
        targetCode: options.targetCode || settings.targetCode,
        sourceText,
        targetText,
        segment,
        glossaryTerms
      });
    const result = await provider.completePrompt(
      { ...settings, ...(options.config || {}), signal: options.signal },
      {
        project: options.project,
        prompt,
        system:
          "You are a senior translation reviewer inside LoopCAT. Return review notes only; do not translate, rewrite the full segment, or add generic encouragement.",
        model: options.model || settings.model,
        signal: options.signal
      }
    );
    const reviewText = String(result.text || result.rawOutput || "").trim();
    return {
      ...result,
      reviewText,
      reviewRisk: parseAiReviewRisk(reviewText),
      prompt
    };
  }

  async function repairSegmentTagsWithAi(options = {}) {
    const provider = options.provider || aiProviderRegistry.get(options.providerId || options.settings?.providerId);
    if (!provider?.completePrompt) throw new Error("This AI provider cannot run tag repair commands.");
    const settings = defaultLocalAiSettings(options.settings || options.config || {}, options.project);
    const segment = options.segment || {};
    const sourceText = String(options.sourceText ?? segment.source ?? "");
    const targetText = String(options.targetText ?? segment.target ?? "");
    if (!sourceText.trim()) throw new Error("The active segment has no source text.");
    if (!targetText.trim()) throw new Error("The active segment has no target text to repair.");
    const protectedTokens = protectedTokenList({
      protectedTokens: options.protectedTokens,
      segment,
      sourceText
    });
    const prompt =
      options.prompt ||
      buildTagRepairPrompt({
        sourceLanguage: options.sourceLanguage || settings.sourceLanguage,
        sourceCode: options.sourceCode || settings.sourceCode,
        targetLanguage: options.targetLanguage || settings.targetLanguage,
        targetCode: options.targetCode || settings.targetCode,
        sourceText,
        targetText,
        protectedTokens,
        segment
      });
    const result = await provider.completePrompt(
      { ...settings, ...(options.config || {}), signal: options.signal },
      {
        project: options.project,
        prompt,
        system:
          "You are a CAT-tool tag repair assistant. Return only the corrected target segment and preserve protected tokens exactly.",
        model: options.model || settings.model,
        signal: options.signal
      }
    );
    const suggestedTarget = cleanModelTranslationOutput(result.text || result.rawOutput || "", targetText);
    if (!suggestedTarget.trim()) throw new Error("The AI provider returned an empty tag repair suggestion.");
    const missingTokens = protectedTokens.filter((token) => !suggestedTarget.includes(token));
    return {
      ...result,
      suggestedTarget,
      protectedTokens,
      warnings: missingTokens.map((token) => `Suggested target may still be missing protected token ${token}.`),
      prompt
    };
  }

  async function suggestSegmentVariantsWithAi(options = {}) {
    const provider = options.provider || aiProviderRegistry.get(options.providerId || options.settings?.providerId);
    if (!provider?.completePrompt) throw new Error("This AI provider cannot suggest translation alternatives.");
    const settings = defaultLocalAiSettings(options.settings || options.config || {}, options.project);
    const segment = options.segment || {};
    const sourceText = String(options.sourceText ?? segment.source ?? "");
    const targetText = String(options.targetText ?? segment.target ?? "");
    if (!sourceText.trim()) throw new Error("The active segment has no source text.");
    const protectedTokens = protectedTokenList({
      protectedTokens: options.protectedTokens,
      segment,
      sourceText
    });
    const glossaryTerms = options.glossaryTerms || [];
    const prompt =
      options.prompt ||
      buildTargetVariantsPrompt({
        sourceLanguage: options.sourceLanguage || settings.sourceLanguage,
        sourceCode: options.sourceCode || settings.sourceCode,
        targetLanguage: options.targetLanguage || settings.targetLanguage,
        targetCode: options.targetCode || settings.targetCode,
        sourceText,
        targetText,
        protectedTokens,
        segment,
        glossaryTerms,
        variantMode: options.variantMode || settings.variantMode
      });
    const result = await provider.completePrompt(
      { ...settings, ...(options.config || {}), signal: options.signal },
      {
        project: options.project,
        prompt,
        system:
          "You are a CAT-tool translation alternatives assistant. Return only the requested labelled target alternatives and preserve protected tokens exactly.",
        model: options.model || settings.model,
        signal: options.signal
      }
    );
    const variants = parseTargetVariantSuggestions(result.text || result.rawOutput || "", sourceText);
    if (!variants.length) throw new Error("The AI provider returned no usable translation alternatives.");
    const warnings = [];
    const variantsWithWarnings = variants.map((variant) => {
      const missingTokens = protectedTokens.filter((token) => !variant.suggestedTarget.includes(token));
      const variantWarnings = missingTokens.map((token) => `${variant.label} may be missing protected token ${token}.`);
      warnings.push(...variantWarnings);
      return { ...variant, warnings: variantWarnings };
    });
    return {
      ...result,
      variants: variantsWithWarnings,
      protectedTokens,
      warnings,
      prompt
    };
  }

  async function polishSegmentStyleWithAi(options = {}) {
    const provider = options.provider || aiProviderRegistry.get(options.providerId || options.settings?.providerId);
    if (!provider?.completePrompt) throw new Error("This AI provider cannot polish target drafts.");
    const settings = defaultLocalAiSettings(options.settings || options.config || {}, options.project);
    const segment = options.segment || {};
    const sourceText = String(options.sourceText ?? segment.source ?? "");
    const targetText = String(options.targetText ?? segment.target ?? "");
    if (!sourceText.trim()) throw new Error("The active segment has no source text.");
    if (!targetText.trim()) throw new Error("The active segment has no target text to polish.");
    const protectedTokens = protectedTokenList({
      protectedTokens: options.protectedTokens,
      segment,
      sourceText
    });
    const glossaryTerms = options.glossaryTerms || [];
    const tmMatches = options.tmMatches || [];
    const prompt =
      options.prompt ||
      buildStylePolishPrompt({
        sourceLanguage: options.sourceLanguage || settings.sourceLanguage,
        sourceCode: options.sourceCode || settings.sourceCode,
        targetLanguage: options.targetLanguage || settings.targetLanguage,
        targetCode: options.targetCode || settings.targetCode,
        sourceText,
        targetText,
        protectedTokens,
        segment,
        project: options.project,
        styleGuide: options.styleGuide,
        glossaryTerms,
        tmMatches
      });
    const result = await provider.completePrompt(
      { ...settings, ...(options.config || {}), signal: options.signal },
      {
        project: options.project,
        prompt,
        system:
          "You are a CAT-tool style and terminology polishing assistant. Return only the improved target segment and preserve protected tokens exactly.",
        model: options.model || settings.model,
        signal: options.signal
      }
    );
    const suggestedTarget = cleanModelTranslationOutput(result.text || result.rawOutput || "", targetText);
    if (!suggestedTarget.trim()) throw new Error("The AI provider returned an empty polish suggestion.");
    const missingTokens = protectedTokens.filter((token) => !suggestedTarget.includes(token));
    return {
      ...result,
      suggestedTarget,
      protectedTokens,
      warnings: missingTokens.map((token) => `Polished target may be missing protected token ${token}.`),
      prompt
    };
  }

  async function adaptSegmentDraftWithAi(options = {}) {
    const provider = options.provider || aiProviderRegistry.get(options.providerId || options.settings?.providerId);
    if (!provider?.completePrompt) throw new Error("This AI provider cannot adapt target drafts.");
    const settings = defaultLocalAiSettings(options.settings || options.config || {}, options.project);
    const segment = options.segment || {};
    const sourceText = String(options.sourceText ?? segment.source ?? "");
    const targetText = String(options.targetText ?? segment.target ?? "");
    if (!sourceText.trim()) throw new Error("The active segment has no source text.");
    if (!targetText.trim()) throw new Error("The active segment has no target draft to adapt.");
    const protectedTokens = protectedTokenList({
      protectedTokens: options.protectedTokens,
      segment,
      sourceText
    });
    const glossaryTerms = options.glossaryTerms || [];
    const tmMatches = options.tmMatches || [];
    const adaptMode = options.adaptMode || settings.adaptMode;
    const prompt =
      options.prompt ||
      buildDraftAdaptationPrompt({
        sourceLanguage: options.sourceLanguage || settings.sourceLanguage,
        sourceCode: options.sourceCode || settings.sourceCode,
        targetLanguage: options.targetLanguage || settings.targetLanguage,
        targetCode: options.targetCode || settings.targetCode,
        sourceText,
        targetText,
        protectedTokens,
        segment,
        project: options.project,
        styleGuide: options.styleGuide,
        glossaryTerms,
        tmMatches,
        adaptMode
      });
    const result = await provider.completePrompt(
      { ...settings, ...(options.config || {}), signal: options.signal },
      {
        project: options.project,
        prompt,
        system:
          "You are a CAT-tool target adaptation assistant. Return only the adapted target segment and preserve protected tokens exactly.",
        model: options.model || settings.model,
        signal: options.signal
      }
    );
    const suggestedTarget = cleanModelTranslationOutput(result.text || result.rawOutput || "", targetText);
    if (!suggestedTarget.trim()) throw new Error("The AI provider returned an empty adaptation suggestion.");
    const missingTokens = protectedTokens.filter((token) => !suggestedTarget.includes(token));
    return {
      ...result,
      suggestedTarget,
      protectedTokens,
      adaptMode: LOCAL_AI_ADAPT_MODES.has(String(adaptMode || "").trim()) ? String(adaptMode).trim() : "simplify",
      warnings: missingTokens.map((token) => `Adapted target may be missing protected token ${token}.`),
      prompt
    };
  }

  async function extractSegmentTermsWithAi(options = {}) {
    const provider = options.provider || aiProviderRegistry.get(options.providerId || options.settings?.providerId);
    if (!provider?.completePrompt) throw new Error("This AI provider cannot extract terminology.");
    const settings = defaultLocalAiSettings(options.settings || options.config || {}, options.project);
    const segment = options.segment || {};
    const sourceText = String(options.sourceText ?? segment.source ?? "");
    const targetText = String(options.targetText ?? segment.target ?? "");
    if (!sourceText.trim()) throw new Error("The active segment has no source text.");
    const prompt =
      options.prompt ||
      buildTerminologyExtractionPrompt({
        sourceLanguage: options.sourceLanguage || settings.sourceLanguage,
        sourceCode: options.sourceCode || settings.sourceCode,
        targetLanguage: options.targetLanguage || settings.targetLanguage,
        targetCode: options.targetCode || settings.targetCode,
        sourceText,
        targetText,
        segment
      });
    const result = await provider.completePrompt(
      { ...settings, ...(options.config || {}), signal: options.signal },
      {
        project: options.project,
        prompt,
        system:
          "You are a CAT-tool terminology extraction assistant. Return only the requested JSON array of concise termbase candidates.",
        model: options.model || settings.model,
        signal: options.signal
      }
    );
    return {
      ...result,
      terms: parseTerminologyExtractionSuggestions(result.text || result.rawOutput || ""),
      prompt
    };
  }

  async function applyTerminologyWithAi(options = {}) {
    const provider = options.provider || aiProviderRegistry.get(options.providerId || options.settings?.providerId);
    if (!provider?.completePrompt) throw new Error("This AI provider cannot apply terminology.");
    const settings = defaultLocalAiSettings(options.settings || options.config || {}, options.project);
    const segment = options.segment || {};
    const sourceText = String(options.sourceText ?? segment.source ?? "");
    const targetText = String(options.targetText ?? segment.target ?? "");
    if (!sourceText.trim()) throw new Error("The active segment has no source text.");
    if (!targetText.trim()) throw new Error("The active segment has no target draft to revise.");
    const glossaryTerms = aiContextRecords(options.glossaryTerms || options.terms || []).filter(
      (term) => term.sourceTerm && term.targetTerm
    );
    if (!glossaryTerms.length) {
      throw new Error("No matching project terminology is available for this segment.");
    }
    const protectedTokens = protectedTokenList({
      protectedTokens: options.protectedTokens,
      segment,
      sourceText
    });
    const prompt =
      options.prompt ||
      buildTerminologyApplicationPrompt({
        sourceLanguage: options.sourceLanguage || settings.sourceLanguage,
        sourceCode: options.sourceCode || settings.sourceCode,
        targetLanguage: options.targetLanguage || settings.targetLanguage,
        targetCode: options.targetCode || settings.targetCode,
        sourceText,
        targetText,
        protectedTokens,
        segment,
        glossaryTerms
      });
    const result = await provider.completePrompt(
      { ...settings, ...(options.config || {}), signal: options.signal },
      {
        project: options.project,
        prompt,
        system:
          "You are a CAT-tool terminology application assistant. Return only the revised target segment and preserve protected tokens exactly.",
        model: options.model || settings.model,
        signal: options.signal
      }
    );
    const suggestedTarget = cleanModelTranslationOutput(result.text || result.rawOutput || "", targetText);
    if (!suggestedTarget.trim()) throw new Error("The AI provider returned an empty terminology suggestion.");
    const warnings = [];
    protectedTokens
      .filter((token) => !suggestedTarget.includes(token))
      .forEach((token) => warnings.push(`Terminology suggestion may be missing protected token ${token}.`));
    glossaryTerms.forEach((term) => {
      const targetTerm = String(term.targetTerm || "");
      if (!targetTerm) return;
      if (term.isForbidden && suggestedTarget.includes(targetTerm)) {
        warnings.push(`Terminology suggestion may still contain forbidden term ${targetTerm}.`);
      } else if (!term.isForbidden && !suggestedTarget.includes(targetTerm)) {
        warnings.push(`Terminology suggestion may still be missing approved term ${targetTerm}.`);
      }
    });
    return {
      ...result,
      suggestedTarget,
      protectedTokens,
      glossaryTerms,
      warnings,
      prompt
    };
  }

  async function generateProjectBriefWithAi(options = {}) {
    const provider = options.provider || aiProviderRegistry.get(options.providerId || options.settings?.providerId);
    if (!provider?.completePrompt) throw new Error("This AI provider cannot generate project briefs.");
    const settings = defaultLocalAiSettings(options.settings || options.config || {}, options.project);
    const project = options.project || {};
    const prompt =
      options.prompt ||
      buildProjectBriefPrompt({
        project,
        sourceLanguage: options.sourceLanguage || settings.sourceLanguage,
        sourceCode: options.sourceCode || settings.sourceCode || project.sourceLang,
        targetLanguage: options.targetLanguage || settings.targetLanguage,
        targetCode: options.targetCode || settings.targetCode || project.targetLang,
        documents: options.documents || [],
        sampleSegments: options.sampleSegments || [],
        terms: options.terms || []
      });
    const result = await provider.completePrompt(
      { ...settings, ...(options.config || {}), signal: options.signal },
      {
        project,
        prompt,
        system:
          "You are a CAT-tool project brief assistant. Return only concise reusable translation instructions with no secrets or generic filler.",
        model: options.model || settings.model,
        signal: options.signal
      }
    );
    const brief = stripModelWrapper(result.text || result.rawOutput || "", "").trim();
    if (!brief) throw new Error("The AI provider returned an empty project brief.");
    return {
      ...result,
      brief,
      prompt
    };
  }

  const preTranslationService = {
    isLockedSegment,
    segmentSkipReason,
    selectSegments: selectPretranslationSegments,
    applyAiPretranslation,
    pretranslateSegments
  };

  const aiCommandService = {
    buildAiReviewPrompt,
    buildTagRepairPrompt,
    buildTargetVariantsPrompt,
    buildStylePolishPrompt,
    buildDraftAdaptationPrompt,
    buildTerminologyExtractionPrompt,
    buildTerminologyApplicationPrompt,
    parseAiReviewRisk,
    normalizeAiReviewRiskLevel,
    extractSegmentTerms: extractSegmentTermsWithAi,
    applyTerminology: applyTerminologyWithAi,
    generateProjectBrief: generateProjectBriefWithAi,
    adaptSegmentDraft: adaptSegmentDraftWithAi,
    polishSegmentStyle: polishSegmentStyleWithAi,
    repairSegmentTags: repairSegmentTagsWithAi,
    suggestSegmentVariants: suggestSegmentVariantsWithAi,
    reviewSegment: reviewSegmentWithAi
  };

  Object.assign(ai, { openAiSuggestion, preTranslationService, aiCommandService });
})();
