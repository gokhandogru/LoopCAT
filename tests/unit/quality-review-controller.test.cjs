const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const test = require("node:test");

const root = path.resolve(__dirname, "../..");
const moduleAt = (relativePath) => import(pathToFileURL(path.join(root, relativePath)).href);

function fakeDocument() {
  const document = {
    activeElement: null,
    createElement(tagName) {
      return fakeElement(document, tagName);
    },
    createDocumentFragment() {
      return fakeElement(document, "#fragment");
    }
  };
  return document;
}

function fakeElement(ownerDocument, tagName = "div") {
  const listeners = new Map();
  const classes = new Set();
  let ownText = "";
  const element = {
    ownerDocument,
    tagName: tagName.toUpperCase(),
    dataset: {},
    children: [],
    parentElement: null,
    value: "",
    disabled: false,
    type: "",
    classList: {
      add: (...names) => names.forEach((name) => classes.add(name)),
      remove: (...names) => names.forEach((name) => classes.delete(name)),
      contains: (name) => classes.has(name),
      toggle(name, force) {
        if (force === true || (force === undefined && !classes.has(name))) classes.add(name);
        else classes.delete(name);
      }
    },
    addEventListener(type, listener) {
      const values = listeners.get(type) || [];
      values.push(listener);
      listeners.set(type, values);
    },
    removeEventListener(type, listener) {
      listeners.set(
        type,
        (listeners.get(type) || []).filter((value) => value !== listener)
      );
    },
    dispatch(type, event = {}) {
      const dispatched = {
        type,
        target: element,
        preventDefault() {
          this.defaultPrevented = true;
        },
        ...event
      };
      for (const listener of [...(listeners.get(type) || [])]) listener(dispatched);
      return dispatched;
    },
    append(...nodes) {
      nodes.forEach((node) => {
        if (node?.tagName === "#FRAGMENT") {
          element.append(...node.children);
          node.children = [];
          return;
        }
        if (!node) return;
        node.parentElement = element;
        element.children.push(node);
      });
    },
    replaceChildren(...nodes) {
      element.children.forEach((child) => {
        child.parentElement = null;
      });
      element.children = [];
      ownText = "";
      element.append(...nodes);
    },
    contains(candidate) {
      return candidate === element || element.children.some((child) => child.contains?.(candidate));
    },
    closest(selector) {
      if (selector === "[data-quality-risk-segment-id]" && element.dataset.qualityRiskSegmentId !== undefined) {
        return element;
      }
      return element.parentElement?.closest?.(selector) || null;
    },
    querySelectorAll(selector) {
      const matches = [];
      if (selector === "[data-quality-risk-segment-id]" && element.dataset.qualityRiskSegmentId !== undefined) {
        matches.push(element);
      }
      element.children.forEach((child) => matches.push(...(child.querySelectorAll?.(selector) || [])));
      return matches;
    },
    focus() {
      ownerDocument.activeElement = element;
      element.focused = (element.focused || 0) + 1;
    }
  };
  Object.defineProperty(element, "className", {
    get: () => [...classes].join(" "),
    set(value) {
      classes.clear();
      String(value || "")
        .split(/\s+/)
        .filter(Boolean)
        .forEach((name) => classes.add(name));
    }
  });
  Object.defineProperty(element, "textContent", {
    get: () => ownText + element.children.map((child) => child.textContent || "").join(""),
    set(value) {
      ownText = String(value ?? "");
      element.children = [];
    }
  });
  return element;
}

function qualityElements(ownerDocument) {
  const names = [
    "reviewForm",
    "reviewStateSelect",
    "reviewNoteInput",
    "reviewCommentInput",
    "reviewCommentsList",
    "qualityForm",
    "qualityStandardSelect",
    "qualityReviewDepthSelect",
    "qualityRiskToleranceSelect",
    "qualityTerminologyStrictnessSelect",
    "qualityAiDisclosureSelect",
    "qualityAudienceInput",
    "qualityToneInput",
    "qualitySummary",
    "qualityActiveEvidence",
    "qualityDecisionForm",
    "qualityIssueCategorySelect",
    "qualityIssueSeveritySelect",
    "qualityDecisionNoteInput",
    "saveQualityDecisionBtn",
    "refreshQualityRiskBtn",
    "nextQualityRiskBtn",
    "exportQualityPassportBtn",
    "qualityRiskList"
  ];
  const elements = Object.fromEntries(
    names.map((name) => [name, fakeElement(ownerDocument, name.endsWith("Form") ? "form" : "div")])
  );
  elements.reviewForm.append(elements.reviewStateSelect, elements.reviewNoteInput, elements.reviewCommentInput);
  elements.qualityForm.append(
    elements.qualityStandardSelect,
    elements.qualityReviewDepthSelect,
    elements.qualityRiskToleranceSelect,
    elements.qualityTerminologyStrictnessSelect,
    elements.qualityAiDisclosureSelect,
    elements.qualityAudienceInput,
    elements.qualityToneInput
  );
  elements.qualityDecisionForm.append(
    elements.qualityIssueCategorySelect,
    elements.qualityIssueSeveritySelect,
    elements.qualityDecisionNoteInput,
    elements.saveQualityDecisionBtn
  );
  return elements;
}

function defaultProfile(profile = {}) {
  return {
    standard: profile.standard || "freelance-delivery",
    reviewDepth: profile.reviewDepth || "targeted",
    riskTolerance: profile.riskTolerance || "balanced",
    terminologyStrictness: profile.terminologyStrictness || "standard",
    aiDisclosure: profile.aiDisclosure || "local-only",
    audience: String(profile.audience || "").trim(),
    tone: String(profile.tone || "Neutral").trim()
  };
}

function createController(createQualityReviewController, elements, overrides = {}) {
  return createQualityReviewController({
    elements,
    defaultProfile,
    source: (text) => String(text || ""),
    label: (key) =>
      ({
        noStructuredComments: "No structured comments yet.",
        noActiveQualitySignals: "No active quality signals.",
        riskItems: "Risk items",
        highRisk: "High risk",
        avgRisk: "Avg risk",
        go: "Go",
        document: "Document",
        riskSignalRecorded: "Risk signal recorded"
      })[key] || key,
    profileLabel: (value) => `profile:${value}`,
    categoryLabel: (value) => `category:${value}`,
    riskLevelLabel: (value) => `risk:${value}`,
    formatDate: (value) => `date:${value}`,
    scheduleFrame: (callback) => callback(),
    ...overrides
  });
}

test("QualityReviewController renders comments, profile, evidence, and a bounded risk queue", async () => {
  const { createQualityReviewController } = await moduleAt("src/features/quality/quality-review-controller.js");
  const ownerDocument = fakeDocument();
  const elements = qualityElements(ownerDocument);
  const controller = createController(createQualityReviewController, elements);
  const project = {
    id: "project-1",
    qualityProfile: { standard: "regulated", reviewDepth: "lqa", riskTolerance: "strict" }
  };
  const segment = {
    id: "segment-1",
    reviewState: "needs-review",
    reviewNote: "Check terminology",
    comments: [{ state: "open", body: "Private comment", createdAt: "2026-08-12" }]
  };
  const queue = {
    totalRiskItems: 1,
    highRiskCount: 1,
    averageScore: 64,
    items: [
      {
        segmentId: "segment-1",
        level: "high",
        score: 64,
        label: "1",
        documentName: "Document one",
        category: "accuracy",
        categoryCounts: { accuracy: 2 },
        reasons: [{ category: "accuracy", label: "Number mismatch" }]
      }
    ]
  };

  controller.render({
    project,
    segment,
    activeIndex: 0,
    profile: project.qualityProfile,
    queue,
    evidence: queue.items[0]
  });

  assert.equal(elements.reviewStateSelect.value, "needs-review");
  assert.equal(elements.reviewNoteInput.value, "Check terminology");
  assert.match(elements.reviewCommentsList.textContent, /Private comment/);
  assert.match(elements.qualitySummary.textContent, /1High risk64Avg risk/);
  assert.match(elements.qualitySummary.textContent, /profile:regulated - profile:lqa - profile:strict/);
  assert.match(elements.qualityActiveEvidence.textContent, /risk:high 64/);
  assert.match(elements.qualityActiveEvidence.textContent, /category:accuracy 2/);
  const riskButtons = elements.qualityRiskList.querySelectorAll("[data-quality-risk-segment-id]");
  assert.equal(riskButtons.length, 1);
  assert.equal(riskButtons[0].dataset.qualityRiskSegmentId, "segment-1");
  assert.deepEqual(controller.getState(), { projectId: "project-1", segmentId: "segment-1", riskCount: 1 });
});

test("QualityReviewController owns form and action events without owning domain mutations", async () => {
  const { createQualityReviewController } = await moduleAt("src/features/quality/quality-review-controller.js");
  const ownerDocument = fakeDocument();
  const elements = qualityElements(ownerDocument);
  const calls = [];
  const controller = createController(createQualityReviewController, elements, {
    saveReview: (values) => calls.push(["review", values]),
    saveProfile: (values) => calls.push(["profile", values]),
    saveDecision: (values) => calls.push(["decision", values]),
    refreshRisks: () => calls.push(["refresh"]),
    nextRisk: () => calls.push(["next"]),
    exportPassport: () => calls.push(["export"]),
    openRisk: (item) => calls.push(["open", item])
  });
  controller.mount();
  assert.equal(controller.mount(), false);
  elements.reviewStateSelect.value = "reviewed";
  elements.reviewNoteInput.value = " Note ";
  elements.reviewCommentInput.value = " Comment ";
  elements.qualityStandardSelect.value = "regulated";
  elements.qualityReviewDepthSelect.value = "lqa";
  elements.qualityRiskToleranceSelect.value = "strict";
  elements.qualityTerminologyStrictnessSelect.value = "strict";
  elements.qualityAiDisclosureSelect.value = "client-approved";
  elements.qualityAudienceInput.value = " Legal ";
  elements.qualityToneInput.value = " Formal ";
  elements.qualityIssueCategorySelect.value = "accuracy";
  elements.qualityIssueSeveritySelect.value = "critical";
  elements.qualityDecisionNoteInput.value = " Evidence ";
  elements.reviewForm.dispatch("submit");
  elements.qualityForm.dispatch("submit");
  elements.qualityDecisionForm.dispatch("submit");
  elements.refreshQualityRiskBtn.dispatch("click");
  elements.nextQualityRiskBtn.dispatch("click");
  elements.exportQualityPassportBtn.dispatch("click");
  controller.renderQuality({
    project: { id: "project-1", qualityProfile: {} },
    segment: { id: "segment-1" },
    queue: {
      totalRiskItems: 1,
      highRiskCount: 0,
      averageScore: 10,
      items: [
        {
          segmentId: "segment-1",
          level: "low",
          score: 10,
          label: "1",
          category: "review",
          categoryCounts: {},
          reasons: []
        }
      ]
    }
  });
  const riskButton = elements.qualityRiskList.querySelectorAll("[data-quality-risk-segment-id]")[0];
  elements.qualityRiskList.dispatch("click", { target: riskButton });
  await Promise.resolve();

  assert.deepEqual(calls, [
    ["review", { reviewState: "reviewed", reviewNote: "Note", commentBody: "Comment" }],
    [
      "profile",
      {
        standard: "regulated",
        reviewDepth: "lqa",
        riskTolerance: "strict",
        terminologyStrictness: "strict",
        aiDisclosure: "client-approved",
        audience: "Legal",
        tone: "Formal"
      }
    ],
    ["decision", { category: "accuracy", severity: "critical", note: "Evidence" }],
    ["refresh"],
    ["next"],
    ["export"],
    ["open", { segmentId: "segment-1" }]
  ]);
  controller.unmount();
  elements.refreshQualityRiskBtn.dispatch("click");
  assert.equal(calls.length, 7, "unmount removes the controller's delegated listeners");
});

test("QualityReviewController preserves active form edits and restores risk focus across rendering", async () => {
  const { createQualityReviewController } = await moduleAt("src/features/quality/quality-review-controller.js");
  const ownerDocument = fakeDocument();
  const elements = qualityElements(ownerDocument);
  const controller = createController(createQualityReviewController, elements);
  controller.renderReview({ segment: { id: "segment-1", reviewState: "needs-review", reviewNote: "Stored" } });
  elements.reviewNoteInput.value = "Unsaved local edit";
  elements.reviewNoteInput.focus();
  controller.renderReview({ segment: { id: "segment-1", reviewState: "reviewed", reviewNote: "Background value" } });
  assert.equal(elements.reviewNoteInput.value, "Unsaved local edit");
  controller.renderReview({ segment: { id: "segment-2", reviewState: "reviewed", reviewNote: "Next segment" } });
  assert.equal(elements.reviewNoteInput.value, "Next segment");

  const queue = {
    totalRiskItems: 1,
    highRiskCount: 1,
    averageScore: 70,
    items: [
      {
        segmentId: "segment-2",
        level: "high",
        score: 70,
        label: "2",
        category: "review",
        categoryCounts: {},
        reasons: []
      }
    ]
  };
  const context = {
    project: { id: "project-1", qualityProfile: {} },
    segment: { id: "segment-2" },
    activeIndex: 1,
    queue
  };
  controller.renderQuality(context);
  const firstButton = elements.qualityRiskList.querySelectorAll("[data-quality-risk-segment-id]")[0];
  firstButton.focus();
  controller.renderQuality(context);
  const replacementButton = elements.qualityRiskList.querySelectorAll("[data-quality-risk-segment-id]")[0];
  assert.notEqual(replacementButton, firstButton);
  assert.equal(ownerDocument.activeElement, replacementButton);
  assert.equal(replacementButton.focused >= 1, true);
});

test("QualityReviewController exposes deterministic empty states and reports unexpected action failures", async () => {
  const { createQualityReviewController } = await moduleAt("src/features/quality/quality-review-controller.js");
  const ownerDocument = fakeDocument();
  const elements = qualityElements(ownerDocument);
  const failures = [];
  const controller = createController(createQualityReviewController, elements, {
    refreshRisks: () => Promise.reject(new Error("Refresh failed")),
    onError: (error, context) => failures.push([error.message, context.phase])
  });
  controller.mount();
  controller.render({ project: null, segment: null });
  assert.equal(elements.reviewForm.classList.contains("empty-review"), true);
  assert.equal(elements.qualitySummary.textContent, "No project.");
  assert.equal(elements.qualityRiskList.textContent, "No risk queue yet.");
  assert.equal(elements.saveQualityDecisionBtn.disabled, true);
  elements.refreshQualityRiskBtn.dispatch("click");
  await new Promise((resolve) => {
    setImmediate(resolve);
  });
  assert.deepEqual(failures, [["Refresh failed", "refresh-risks"]]);
});
