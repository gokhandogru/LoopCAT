function requireElement(value, name) {
  if (!value?.addEventListener) throw new TypeError(`QualityReviewController requires ${name}.`);
  return value;
}

function createElement(ownerDocument, tagName, { className = "", text = "" } = {}) {
  const element = ownerDocument.createElement(tagName);
  if (className) element.className = className;
  element.textContent = String(text ?? "");
  return element;
}

function emptyQueue() {
  return {
    totalRiskItems: 0,
    highRiskCount: 0,
    averageScore: 0,
    items: []
  };
}

/**
 * Owns Comments and Quality Workbench DOM state and event lifecycle. Quality
 * scoring, persistence, commands, QA, reporting, and workspace dirtiness stay
 * behind the injected application actions.
 *
 * @param {{
 *   elements: Record<string, any>,
 *   defaultProfile: (profile?: any) => any,
 *   source?: (text: string, values?: Record<string, unknown>) => string,
 *   label?: (key: string, values?: Record<string, unknown>) => string,
 *   profileLabel?: (value: string) => string,
 *   categoryLabel?: (value: string) => string,
 *   riskLevelLabel?: (value: string) => string,
 *   formatDate?: (value: string) => string,
 *   saveReview?: (values: any) => Promise<unknown> | unknown,
 *   saveProfile?: (values: any) => Promise<unknown> | unknown,
 *   saveDecision?: (values: any) => Promise<unknown> | unknown,
 *   refreshRisks?: () => Promise<unknown> | unknown,
 *   nextRisk?: () => Promise<unknown> | unknown,
 *   exportPassport?: () => Promise<unknown> | unknown,
 *   openRisk?: (item: { segmentId: string }) => Promise<unknown> | unknown,
 *   scheduleFrame?: (callback: () => void) => unknown,
 *   onError?: (error: unknown, context: { phase: string }) => void
 * }} options
 */
export function createQualityReviewController(options) {
  const elements = /** @type {any} */ (options?.elements || {});
  const reviewForm = requireElement(elements.reviewForm, "the review form");
  const reviewStateSelect = requireElement(elements.reviewStateSelect, "the review-state field");
  const reviewNoteInput = requireElement(elements.reviewNoteInput, "the review-note field");
  const reviewCommentInput = requireElement(elements.reviewCommentInput, "the review-comment field");
  const reviewCommentsList = requireElement(elements.reviewCommentsList, "the review comments list");
  const qualityForm = requireElement(elements.qualityForm, "the quality-profile form");
  const qualityStandardSelect = requireElement(elements.qualityStandardSelect, "the quality-standard field");
  const qualityReviewDepthSelect = requireElement(elements.qualityReviewDepthSelect, "the review-depth field");
  const qualityRiskToleranceSelect = requireElement(elements.qualityRiskToleranceSelect, "the risk-tolerance field");
  const qualityTerminologyStrictnessSelect = requireElement(
    elements.qualityTerminologyStrictnessSelect,
    "the terminology-strictness field"
  );
  const qualityAiDisclosureSelect = requireElement(elements.qualityAiDisclosureSelect, "the AI-disclosure field");
  const qualityAudienceInput = requireElement(elements.qualityAudienceInput, "the quality-audience field");
  const qualityToneInput = requireElement(elements.qualityToneInput, "the quality-tone field");
  const qualitySummary = requireElement(elements.qualitySummary, "the quality summary");
  const qualityActiveEvidence = requireElement(elements.qualityActiveEvidence, "the active quality evidence");
  const qualityDecisionForm = requireElement(elements.qualityDecisionForm, "the quality-decision form");
  const qualityIssueCategorySelect = requireElement(elements.qualityIssueCategorySelect, "the decision-category field");
  const qualityIssueSeveritySelect = requireElement(elements.qualityIssueSeveritySelect, "the decision-severity field");
  const qualityDecisionNoteInput = requireElement(elements.qualityDecisionNoteInput, "the decision-note field");
  const saveQualityDecisionBtn = requireElement(elements.saveQualityDecisionBtn, "the save-decision button");
  const refreshQualityRiskBtn = requireElement(elements.refreshQualityRiskBtn, "the refresh-risks button");
  const nextQualityRiskBtn = requireElement(elements.nextQualityRiskBtn, "the next-risk button");
  const exportQualityPassportBtn = requireElement(elements.exportQualityPassportBtn, "the Quality Passport button");
  const qualityRiskList = requireElement(elements.qualityRiskList, "the quality risk list");
  if (typeof options?.defaultProfile !== "function") {
    throw new TypeError("QualityReviewController requires the quality-profile normalizer.");
  }

  const ownerDocument =
    reviewForm.ownerDocument || qualityForm.ownerDocument || qualityRiskList.ownerDocument || globalThis.document;
  const source = typeof options?.source === "function" ? options.source : (text) => String(text || "");
  const label = typeof options?.label === "function" ? options.label : (key) => String(key || "");
  const profileLabel =
    typeof options?.profileLabel === "function" ? options.profileLabel : (value) => String(value || "");
  const categoryLabel =
    typeof options?.categoryLabel === "function" ? options.categoryLabel : (value) => String(value || "Review");
  const riskLevelLabel =
    typeof options?.riskLevelLabel === "function" ? options.riskLevelLabel : (value) => String(value || "Risk");
  const formatDate = typeof options?.formatDate === "function" ? options.formatDate : (value) => String(value || "");
  const scheduleFrame = typeof options?.scheduleFrame === "function" ? options.scheduleFrame : (callback) => callback();
  const reportError = typeof options?.onError === "function" ? options.onError : () => {};
  const listeners = [];
  let mounted = false;
  let reviewSegmentId = "";
  /** @type {Readonly<{ projectId: string, segmentId: string, riskCount: number }>} */
  let currentState = Object.freeze({ projectId: "", segmentId: "", riskCount: 0 });

  function listen(target, eventType, listener) {
    target.addEventListener(eventType, listener);
    listeners.push({ target, eventType, listener });
  }

  function runAction(phase, action) {
    try {
      return Promise.resolve(action?.()).catch((error) => reportError(error, { phase }));
    } catch (error) {
      reportError(error, { phase });
      return Promise.resolve();
    }
  }

  function readReview() {
    return {
      reviewState: String(reviewStateSelect.value || ""),
      reviewNote: String(reviewNoteInput.value || "").trim(),
      commentBody: String(reviewCommentInput.value || "").trim()
    };
  }

  function readProfile() {
    return options.defaultProfile({
      standard: qualityStandardSelect.value,
      reviewDepth: qualityReviewDepthSelect.value,
      riskTolerance: qualityRiskToleranceSelect.value,
      terminologyStrictness: qualityTerminologyStrictnessSelect.value,
      aiDisclosure: qualityAiDisclosureSelect.value,
      audience: qualityAudienceInput.value,
      tone: qualityToneInput.value
    });
  }

  function readDecision() {
    return {
      category: String(qualityIssueCategorySelect.value || ""),
      severity: String(qualityIssueSeveritySelect.value || ""),
      note: String(qualityDecisionNoteInput.value || "").trim()
    };
  }

  function clearDecisionNote() {
    qualityDecisionNoteInput.value = "";
  }

  function syncReviewState(reviewState) {
    reviewStateSelect.value = String(reviewState || "");
  }

  function renderReview({ segment = null, force = false } = {}) {
    const nextSegmentId = String(segment?.id || "");
    if (!segment) {
      reviewStateSelect.value = "";
      reviewNoteInput.value = "";
      reviewCommentInput.value = "";
      reviewCommentsList.replaceChildren();
      reviewForm.classList.add("empty-review");
      reviewSegmentId = "";
      currentState = Object.freeze({ ...currentState, segmentId: "" });
      return;
    }

    reviewForm.classList.remove("empty-review");
    const editingCurrentSegment =
      !force && reviewSegmentId === nextSegmentId && reviewForm.contains(ownerDocument?.activeElement);
    if (!editingCurrentSegment) {
      reviewStateSelect.value = segment.reviewState || "";
      reviewNoteInput.value = segment.reviewNote || "";
      reviewCommentInput.value = "";
    }
    reviewSegmentId = nextSegmentId;
    currentState = Object.freeze({ ...currentState, segmentId: nextSegmentId });

    const comments = Array.isArray(segment.comments) ? segment.comments : [];
    if (!comments.length) {
      reviewCommentsList.replaceChildren(
        createElement(ownerDocument, "div", { className: "muted", text: label("noStructuredComments") })
      );
      return;
    }
    const fragment = ownerDocument.createDocumentFragment();
    comments.forEach((comment) => {
      const card = createElement(ownerDocument, "article", { className: "comment-card" });
      const header = createElement(ownerDocument, "header");
      header.append(
        createElement(ownerDocument, "strong", { text: source(comment.state || "open") }),
        createElement(ownerDocument, "span", { text: formatDate(comment.updatedAt || comment.createdAt) })
      );
      card.append(header, createElement(ownerDocument, "div", { text: comment.body || "" }));
      fragment.append(card);
    });
    reviewCommentsList.replaceChildren(fragment);
  }

  function renderProfile(profile) {
    const normalized = options.defaultProfile(profile);
    qualityStandardSelect.value = normalized.standard;
    qualityReviewDepthSelect.value = normalized.reviewDepth;
    qualityRiskToleranceSelect.value = normalized.riskTolerance;
    qualityTerminologyStrictnessSelect.value = normalized.terminologyStrictness;
    qualityAiDisclosureSelect.value = normalized.aiDisclosure;
    qualityAudienceInput.value = normalized.audience || "";
    qualityToneInput.value = normalized.tone || "";
  }

  function renderActiveEvidence({ project = null, segment = null, activeIndex = -1, evidence = null } = {}) {
    if (!project || !segment) {
      qualityActiveEvidence.textContent = source("No active segment.");
      qualityActiveEvidence.classList.add("muted");
      saveQualityDecisionBtn.disabled = true;
      return;
    }
    saveQualityDecisionBtn.disabled = false;
    qualityActiveEvidence.classList.remove("muted");
    const categories = Object.entries(evidence?.categoryCounts || {}).sort(
      (left, right) => right[1] - left[1] || categoryLabel(left[0]).localeCompare(categoryLabel(right[0]))
    );
    const fragment = ownerDocument.createDocumentFragment();
    const header = createElement(ownerDocument, "header");
    header.append(
      createElement(ownerDocument, "strong", { text: `#${String((evidence?.index ?? activeIndex) + 1)}` }),
      createElement(ownerDocument, "span", {
        text: `${riskLevelLabel(evidence?.level)} ${evidence?.score || 0}`
      })
    );
    fragment.append(header);
    const categoryRow = createElement(ownerDocument, "div", { className: "quality-category-row" });
    if (categories.length) {
      categories.forEach(([category, count]) => {
        categoryRow.append(
          createElement(ownerDocument, "span", {
            className: "quality-category-pill",
            text: `${categoryLabel(category)} ${count}`
          })
        );
      });
    } else {
      categoryRow.append(
        createElement(ownerDocument, "span", { className: "quality-category-pill", text: source("Clear") })
      );
    }
    fragment.append(categoryRow);
    const reasons = (evidence?.reasons || []).slice(0, 4);
    if (reasons.length) {
      const list = createElement(ownerDocument, "ul");
      reasons.forEach((reason) => {
        list.append(createElement(ownerDocument, "li", { text: `${categoryLabel(reason.category)}: ${reason.label}` }));
      });
      fragment.append(list);
    } else {
      fragment.append(createElement(ownerDocument, "p", { className: "muted", text: label("noActiveQualitySignals") }));
    }
    qualityActiveEvidence.replaceChildren(fragment);
  }

  function focusedRiskSegmentId() {
    const activeElement = ownerDocument?.activeElement;
    if (!activeElement || !qualityRiskList.contains(activeElement)) return "";
    return String(activeElement.closest?.("[data-quality-risk-segment-id]")?.dataset?.qualityRiskSegmentId || "");
  }

  function restoreRiskFocus(segmentId) {
    if (!segmentId) return;
    const button = Array.from(qualityRiskList.querySelectorAll("[data-quality-risk-segment-id]")).find(
      (candidate) => candidate.dataset?.qualityRiskSegmentId === segmentId
    );
    button?.focus?.();
  }

  function renderQuality({
    project = null,
    segment = null,
    activeIndex = -1,
    profile = null,
    queue = null,
    evidence = null
  } = {}) {
    const activeRiskSegmentId = focusedRiskSegmentId();
    if (!project) {
      qualitySummary.textContent = source("No project.");
      qualitySummary.classList.add("muted");
      qualityRiskList.textContent = source("No risk queue yet.");
      qualityRiskList.classList.add("muted");
      renderActiveEvidence({ project, segment, activeIndex, evidence });
      currentState = Object.freeze({ ...currentState, projectId: "", riskCount: 0 });
      return;
    }

    if (!qualityForm.contains(ownerDocument?.activeElement)) renderProfile(profile || project.qualityProfile);
    const riskQueue = queue || emptyQueue();
    currentState = Object.freeze({
      ...currentState,
      projectId: String(project.id || ""),
      riskCount: Number(riskQueue.totalRiskItems || 0)
    });
    qualitySummary.classList.remove("muted");
    const summaryFragment = ownerDocument.createDocumentFragment();
    const grid = createElement(ownerDocument, "div", { className: "quality-summary-grid" });
    [
      [riskQueue.totalRiskItems, label("riskItems")],
      [riskQueue.highRiskCount, label("highRisk")],
      [riskQueue.averageScore, label("avgRisk")]
    ].forEach(([value, text]) => {
      const item = createElement(ownerDocument, "div");
      item.append(
        createElement(ownerDocument, "strong", { text: String(value || 0) }),
        createElement(ownerDocument, "span", { text })
      );
      grid.append(item);
    });
    const normalizedProfile = options.defaultProfile(profile || project.qualityProfile);
    summaryFragment.append(
      grid,
      createElement(ownerDocument, "p", {
        text: `${profileLabel(normalizedProfile.standard)} - ${profileLabel(normalizedProfile.reviewDepth)} - ${profileLabel(normalizedProfile.riskTolerance)}`
      })
    );
    qualitySummary.replaceChildren(summaryFragment);
    renderActiveEvidence({ project, segment, activeIndex, evidence });

    const items = Array.isArray(riskQueue.items) ? riskQueue.items : [];
    if (!items.length) {
      qualityRiskList.textContent = source("No unresolved quality risks in this scope.");
      qualityRiskList.classList.add("muted");
      return;
    }
    qualityRiskList.classList.remove("muted");
    const riskFragment = ownerDocument.createDocumentFragment();
    items.slice(0, 8).forEach((item) => {
      const card = createElement(ownerDocument, "article", {
        className: `quality-risk-card ${item.level || ""}`.trim()
      });
      const header = createElement(ownerDocument, "header");
      header.append(
        createElement(ownerDocument, "strong", { text: `${riskLevelLabel(item.level)} ${item.score || 0}` }),
        createElement(ownerDocument, "span", { text: `#${item.label || ""}` })
      );
      const categoryText =
        Object.entries(item.categoryCounts || {})
          .sort((left, right) => right[1] - left[1] || categoryLabel(left[0]).localeCompare(categoryLabel(right[0])))
          .map(([category]) => categoryLabel(category))
          .slice(0, 3)
          .join(", ") || categoryLabel(item.category);
      const reasonText = (item.reasons || [])
        .slice(0, 2)
        .map((reason) => reason.label)
        .join(" ");
      const button = createElement(ownerDocument, "button", { text: label("go") });
      button.type = "button";
      button.dataset.qualityRiskSegmentId = String(item.segmentId || "");
      card.append(
        header,
        createElement(ownerDocument, "p", { text: item.documentName || label("document") }),
        createElement(ownerDocument, "p", {
          className: "muted",
          text: `${categoryText}: ${reasonText || label("riskSignalRecorded")}`
        }),
        button
      );
      riskFragment.append(card);
    });
    qualityRiskList.replaceChildren(riskFragment);
    if (activeRiskSegmentId) {
      restoreRiskFocus(activeRiskSegmentId);
      scheduleFrame(() => restoreRiskFocus(activeRiskSegmentId));
    }
  }

  function render(context = {}) {
    renderReview(context);
    renderQuality(context);
  }

  function mount() {
    if (mounted) return false;
    listen(reviewForm, "submit", (event) => {
      event.preventDefault?.();
      void runAction("save-review", () => options.saveReview?.(readReview()));
    });
    listen(qualityForm, "submit", (event) => {
      event.preventDefault?.();
      void runAction("save-profile", () => options.saveProfile?.(readProfile()));
    });
    listen(qualityDecisionForm, "submit", (event) => {
      event.preventDefault?.();
      void runAction("save-decision", () => options.saveDecision?.(readDecision()));
    });
    listen(refreshQualityRiskBtn, "click", () => void runAction("refresh-risks", options.refreshRisks));
    listen(nextQualityRiskBtn, "click", () => void runAction("next-risk", options.nextRisk));
    listen(exportQualityPassportBtn, "click", () => void runAction("export-passport", options.exportPassport));
    listen(qualityRiskList, "click", (event) => {
      const button = event.target?.closest?.("[data-quality-risk-segment-id]");
      if (!button || !qualityRiskList.contains(button)) return;
      const segmentId = String(button.dataset?.qualityRiskSegmentId || "");
      if (segmentId) void runAction("open-risk", () => options.openRisk?.({ segmentId }));
    });
    mounted = true;
    return true;
  }

  function unmount() {
    listeners.splice(0).forEach(({ target, eventType, listener }) => target.removeEventListener(eventType, listener));
    mounted = false;
  }

  return Object.freeze({
    clearDecisionNote,
    getState: () => currentState,
    mount,
    readDecision,
    readProfile,
    readReview,
    render,
    renderQuality,
    renderReview,
    syncReviewState,
    unmount
  });
}
