const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const test = require("node:test");

const root = path.resolve(__dirname, "../..");
const moduleAt = (relativePath) => import(pathToFileURL(path.join(root, relativePath)).href);

const dynamicClasses = new Set(["tag-warning", "review-pill", "comment-marker", "tm-match-badge", "ai-segment-badge"]);

function fakeDocument() {
  const ownerDocument = {
    createElement(tagName) {
      return fakeElement(ownerDocument, tagName);
    }
  };
  return ownerDocument;
}

function fakeElement(ownerDocument, tagName = "div") {
  const classes = new Set();
  const queries = new Map();
  let text = "";
  const element = {
    ownerDocument,
    tagName: String(tagName).toUpperCase(),
    children: [],
    parentElement: null,
    title: "",
    classList: {
      contains: (name) => classes.has(name)
    },
    append(...nodes) {
      for (const node of nodes) {
        node.parentElement = element;
        element.children.push(node);
      }
    },
    remove() {
      if (!element.parentElement) return;
      element.parentElement.children = element.parentElement.children.filter((child) => child !== element);
      element.parentElement = null;
    },
    querySelector(selector) {
      return queries.get(selector) || null;
    },
    querySelectorAll(selector) {
      if (selector !== ".tag-warning, .review-pill, .comment-marker, .tm-match-badge, .ai-segment-badge") {
        return [];
      }
      return element.children.filter((child) =>
        String(child.className || "")
          .split(/\s+/)
          .some((name) => dynamicClasses.has(name))
      );
    },
    setQuery(selector, value) {
      queries.set(selector, value);
    }
  };
  Object.defineProperties(element, {
    className: {
      get: () => [...classes].join(" "),
      set(value) {
        classes.clear();
        String(value || "")
          .split(/\s+/)
          .filter(Boolean)
          .forEach((name) => classes.add(name));
      }
    },
    textContent: {
      get: () => text,
      set(value) {
        text = String(value ?? "");
        element.children = [];
      }
    }
  });
  return element;
}

function createRow(document) {
  const row = fakeElement(document, "tr");
  const statusCell = fakeElement(document, "td");
  const pill = fakeElement(document, "span");
  row.setQuery(".status-col", statusCell);
  row.setQuery(".status-pill", pill);
  return { pill, row, statusCell };
}

function createHarness(createSegmentStatusPresentationService, overrides = {}) {
  const document = fakeDocument();
  const calls = [];
  const state = overrides.state || {};
  const service = createSegmentStatusPresentationService({
    document,
    labels: {
      status(value) {
        calls.push(["status", value]);
        if (overrides.statusError) throw overrides.statusError;
        return `status:${value}`;
      },
      review(value) {
        calls.push(["review", value]);
        if (overrides.reviewError) throw overrides.reviewError;
        return `review:${value}`;
      }
    },
    protectedTags: {
      hasIssue(segment) {
        calls.push(["hasIssue", segment]);
        if (overrides.hasIssueError) throw overrides.hasIssueError;
        return Boolean(state.hasIssue);
      },
      missing(segment) {
        calls.push(["missing", segment]);
        if (overrides.missingError) throw overrides.missingError;
        return overrides.missing || [];
      },
      displayText(tag) {
        calls.push(["displayText", tag]);
        return tag.label || tag.text || "";
      }
    },
    provenance: {
      hasTmPretranslation(segment) {
        calls.push(["hasTmPretranslation", segment]);
        return Boolean(state.hasTm);
      },
      tmBadge(segment) {
        calls.push(["tmBadge", segment]);
        if (overrides.tmBadgeError) throw overrides.tmBadgeError;
        return overrides.tmBadge || { className: "tm-95", text: "95%", title: "Main TM" };
      },
      hasAiDraft(segment) {
        calls.push(["hasAiDraft", segment]);
        return Boolean(state.hasAiDraft);
      },
      aiBadge(segment) {
        calls.push(["aiBadge", segment]);
        if (overrides.aiBadgeError) throw overrides.aiBadgeError;
        return overrides.aiBadge || { className: "ai-draft", text: "AI", title: "AI draft" };
      },
      hasAiSuggestions(segment) {
        calls.push(["hasAiSuggestions", segment]);
        return Boolean(state.hasAiSuggestions);
      },
      aiRiskLevel(segment) {
        calls.push(["aiRiskLevel", segment]);
        if (overrides.aiRiskError) throw overrides.aiRiskError;
        return state.aiRisk || null;
      }
    },
    localization: {
      label(key, values = {}) {
        calls.push(["label", key, values]);
        if (overrides.labelError) throw overrides.labelError;
        return `label:${key}:${values.value ?? values.count ?? ""}`;
      },
      source(text) {
        calls.push(["source", text]);
        if (overrides.sourceError) throw overrides.sourceError;
        return `source:${text}`;
      }
    },
    quality: {
      aiReviewRisk(riskLevel) {
        calls.push(["aiReviewRisk", riskLevel]);
        if (overrides.qualityError) throw overrides.qualityError;
        return `risk:${riskLevel}`;
      }
    }
  });
  return { calls, document, service, state };
}

function badgeShape(element) {
  return [element.className, element.textContent, element.title];
}

test("SegmentStatusPresentationService preserves status pill and exact stale-marker cleanup", async () => {
  const { createSegmentStatusPresentationService } = await moduleAt(
    "src/features/editor/segment-status-presentation-service.js"
  );
  const { calls, document, service } = createHarness(createSegmentStatusPresentationService);
  const { pill, row, statusCell } = createRow(document);
  const stable = fakeElement(document);
  stable.className = "stable-child";
  statusCell.append(stable);
  for (const className of dynamicClasses) {
    const stale = fakeElement(document);
    stale.className = `${className} stale`;
    statusCell.append(stale);
  }
  const segment = { status: "draft", comments: [], reviewNote: "" };

  assert.equal(service.render(row, segment), undefined);

  assert.equal(pill.className, "status-pill draft");
  assert.equal(pill.textContent, "status:draft");
  assert.deepEqual(statusCell.children, [stable]);
  assert.deepEqual(
    calls.map((call) => call[0]),
    ["status", "hasTmPretranslation", "hasIssue", "hasAiDraft", "hasAiSuggestions", "aiRiskLevel"]
  );
});

test("SegmentStatusPresentationService preserves TM and missing-tag badge identity and order", async () => {
  const { createSegmentStatusPresentationService } = await moduleAt(
    "src/features/editor/segment-status-presentation-service.js"
  );
  const missing = [
    { text: "{0}", label: "First" },
    { text: "<b>", label: "Bold" }
  ];
  const { calls, document, service } = createHarness(createSegmentStatusPresentationService, {
    state: { hasTm: true, hasIssue: true },
    missing,
    tmBadge: { className: "strong", text: "98%", title: "Reference TM" }
  });
  const { row, statusCell } = createRow(document);
  const segment = { status: "translated", comments: [], reviewNote: "" };

  service.render(row, segment);

  assert.deepEqual(statusCell.children.map(badgeShape), [
    ["tm-match-badge strong", "98%", "Reference TM"],
    ["tag-warning", "label:missingValue:First, Bold", ""]
  ]);
  assert.deepEqual(
    calls.filter((call) => ["tmBadge", "missing", "displayText", "label"].includes(call[0])),
    [
      ["tmBadge", segment],
      ["missing", segment],
      ["displayText", missing[0]],
      ["displayText", missing[1]],
      ["label", "missingValue", { value: "First, Bold" }]
    ]
  );
});

test("SegmentStatusPresentationService preserves review and trimmed note plus comment counting", async () => {
  const { createSegmentStatusPresentationService } = await moduleAt(
    "src/features/editor/segment-status-presentation-service.js"
  );
  const { calls, document, service } = createHarness(createSegmentStatusPresentationService);
  const { row, statusCell } = createRow(document);
  const segment = {
    status: "confirmed",
    reviewState: "needs-review",
    comments: [{ id: "one" }, { id: "two" }],
    reviewNote: "  reviewer note  "
  };

  service.render(row, segment);

  assert.deepEqual(statusCell.children.map(badgeShape), [
    ["review-pill needs-review", "review:needs-review", ""],
    ["comment-marker", "label:noteCount:3", ""]
  ]);
  assert.deepEqual(
    calls.filter((call) => ["review", "label"].includes(call[0])),
    [
      ["review", "needs-review"],
      ["label", "noteCount", { count: 3 }]
    ]
  );

  const whitespace = createRow(document);
  service.render(whitespace.row, { status: "draft", comments: [], reviewNote: "   " });
  assert.equal(whitespace.statusCell.children.length, 0);
});

test("SegmentStatusPresentationService preserves AI draft suggestion and risk badge order", async () => {
  const { createSegmentStatusPresentationService } = await moduleAt(
    "src/features/editor/segment-status-presentation-service.js"
  );
  const { calls, document, service } = createHarness(createSegmentStatusPresentationService, {
    state: { hasAiDraft: true, hasAiSuggestions: true, aiRisk: "high" },
    aiBadge: { className: "ai-provider", text: "AI · Model", title: "Provider model" }
  });
  const { row, statusCell } = createRow(document);
  const segment = { status: "draft", comments: [], reviewNote: "", aiSuggestions: [{}, {}] };

  service.render(row, segment);

  assert.deepEqual(statusCell.children.map(badgeShape), [
    ["ai-segment-badge ai-provider", "AI · Model", "Provider model"],
    [
      "ai-segment-badge ai-suggestion",
      "label:aiSuggestionCount:2",
      "source:Reviewable AI suggestions are available for this segment"
    ],
    ["ai-segment-badge ai-risk ai-risk-high", "risk:high", "source:Risk-ranked AI review comment"]
  ]);
  assert.deepEqual(
    calls.filter((call) => ["aiBadge", "label", "source", "aiReviewRisk"].includes(call[0])),
    [
      ["aiBadge", segment],
      ["label", "aiSuggestionCount", { count: 2 }],
      ["source", "Reviewable AI suggestions are available for this segment"],
      ["aiReviewRisk", "high"],
      ["source", "Risk-ranked AI review comment"]
    ]
  );
});

test("SegmentStatusPresentationService replaces prior dynamic badges on repeated renders", async () => {
  const { createSegmentStatusPresentationService } = await moduleAt(
    "src/features/editor/segment-status-presentation-service.js"
  );
  const state = { hasTm: true, hasIssue: true, hasAiDraft: true, hasAiSuggestions: true, aiRisk: "low" };
  const { document, service } = createHarness(createSegmentStatusPresentationService, {
    state,
    missing: [{ text: "{0}" }]
  });
  const { row, statusCell } = createRow(document);
  const segment = {
    status: "draft",
    reviewState: "reviewed",
    comments: [{}],
    reviewNote: "note",
    aiSuggestions: [{}]
  };
  service.render(row, segment);
  assert.equal(statusCell.children.length, 7);

  Object.assign(state, {
    hasTm: false,
    hasIssue: false,
    hasAiDraft: false,
    hasAiSuggestions: false,
    aiRisk: null
  });
  Object.assign(segment, { reviewState: "", comments: [], reviewNote: "" });
  service.render(row, segment);

  assert.equal(statusCell.children.length, 0);
});

test("SegmentStatusPresentationService preserves primary and accumulated AI failure timing", async () => {
  const { createSegmentStatusPresentationService } = await moduleAt(
    "src/features/editor/segment-status-presentation-service.js"
  );
  const statusFailure = new Error("status failed");
  const status = createHarness(createSegmentStatusPresentationService, { statusError: statusFailure });
  const statusRow = createRow(status.document);
  assert.throws(
    () => status.service.render(statusRow.row, { status: "draft" }),
    (error) => error === statusFailure
  );
  assert.equal(
    status.calls.some((call) => call[0] === "hasTmPretranslation"),
    false
  );

  const qualityFailure = new Error("quality failed");
  const quality = createHarness(createSegmentStatusPresentationService, {
    state: { hasAiDraft: true, hasAiSuggestions: true, aiRisk: "high" },
    qualityError: qualityFailure
  });
  const qualityRow = createRow(quality.document);
  assert.throws(
    () =>
      quality.service.render(qualityRow.row, {
        status: "draft",
        comments: [],
        reviewNote: "",
        aiSuggestions: [{}]
      }),
    (error) => error === qualityFailure
  );
  assert.equal(qualityRow.statusCell.children.length, 0);
  assert.equal(
    quality.calls.some((call) => call[0] === "aiBadge"),
    true
  );
  assert.equal(
    quality.calls.some((call) => call[0] === "source" && call[1].startsWith("Risk-ranked")),
    false
  );
});

test("SegmentStatusPresentationService validates every boundary and exposes an immutable API", async () => {
  const { createSegmentStatusPresentationService } = await moduleAt(
    "src/features/editor/segment-status-presentation-service.js"
  );
  const service = createHarness(createSegmentStatusPresentationService).service;
  assert.deepEqual(Object.keys(service), ["render"]);
  assert.equal(Object.isFrozen(service), true);

  const makeOptions = () => ({
    document: { createElement() {} },
    labels: { status() {}, review() {} },
    protectedTags: { hasIssue() {}, missing() {}, displayText() {} },
    provenance: {
      hasTmPretranslation() {},
      tmBadge() {},
      hasAiDraft() {},
      aiBadge() {},
      hasAiSuggestions() {},
      aiRiskLevel() {}
    },
    localization: { label() {}, source() {} },
    quality: { aiReviewRisk() {} }
  });
  for (const mutate of [
    (options) => (options.document.createElement = null),
    (options) => (options.labels.status = null),
    (options) => (options.labels.review = null),
    (options) => (options.protectedTags.hasIssue = null),
    (options) => (options.protectedTags.missing = null),
    (options) => (options.protectedTags.displayText = null),
    (options) => (options.provenance.hasTmPretranslation = null),
    (options) => (options.provenance.tmBadge = null),
    (options) => (options.provenance.hasAiDraft = null),
    (options) => (options.provenance.aiBadge = null),
    (options) => (options.provenance.hasAiSuggestions = null),
    (options) => (options.provenance.aiRiskLevel = null),
    (options) => (options.localization.label = null),
    (options) => (options.localization.source = null),
    (options) => (options.quality.aiReviewRisk = null)
  ]) {
    const options = makeOptions();
    mutate(options);
    assert.throws(
      () => createSegmentStatusPresentationService(options),
      /SegmentStatusPresentationService requires DOM, label, protected-tag, provenance, localization, and quality boundaries\./
    );
  }
});
