const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const test = require("node:test");

const root = path.resolve(__dirname, "../..");
const moduleAt = (relativePath) => import(pathToFileURL(path.join(root, relativePath)).href);

function createHarness(createProtectedTagInspectionService, detectedByText = {}) {
  const calls = [];
  const service = createProtectedTagInspectionService({
    detectTags(text) {
      calls.push(text);
      return detectedByText[text] || [];
    }
  });
  return { calls, service };
}

test("ProtectedTagInspectionService preserves detected-only and stored-only source-tag branches", async () => {
  const { createProtectedTagInspectionService } = await moduleAt(
    "src/features/editor/protected-tag-inspection-service.js"
  );
  const detected = [{ text: "{0}", label: "Placeholder", index: 2 }];
  const { service } = createHarness(createProtectedTagInspectionService, { "A {0}": detected });
  assert.equal(service.sourceTags({ source: "A {0}" }), detected);

  const stored = [{ text: "<b>", label: "Bold", index: 0 }, null, {}, { label: "Label only" }];
  assert.deepEqual(service.sourceTags({ source: "plain", tags: stored }), [stored[0], stored[3]]);
});

test("ProtectedTagInspectionService preserves stored-first duplicate reconciliation and record immutability", async () => {
  const { createProtectedTagInspectionService } = await moduleAt(
    "src/features/editor/protected-tag-inspection-service.js"
  );
  const stored = [
    { text: "{0}", label: "Stored first", index: 1 },
    { text: "{0}", label: "Stored second", index: 5 },
    { label: "<b>", index: 9 }
  ];
  const detected = [
    { text: "{0}", label: "Detected first", index: 1 },
    { text: "{0}", label: "Detected second", index: 5 },
    { text: "{0}", label: "Detected third", index: 12 },
    { text: "<b>", label: "Detected bold", index: 9 },
    {}
  ];
  const segment = { source: "tagged", tags: stored };
  const snapshot = structuredClone({ detected, segment });
  const { service } = createHarness(createProtectedTagInspectionService, { tagged: detected });

  assert.deepEqual(service.sourceTags(segment), [stored[0], stored[1], stored[2], detected[2]]);
  assert.deepEqual({ detected, segment }, snapshot);
});

test("ProtectedTagInspectionService preserves label-before-text display fallbacks", async () => {
  const { createProtectedTagInspectionService } = await moduleAt(
    "src/features/editor/protected-tag-inspection-service.js"
  );
  const { service } = createHarness(createProtectedTagInspectionService);
  assert.equal(service.displayText({ label: "Friendly", text: "{0}" }), "Friendly");
  assert.equal(service.displayText({ text: "{0}" }), "{0}");
  assert.equal(service.displayText(null), "");
});

test("ProtectedTagInspectionService preserves exact duplicate occurrence accounting and missing-tag order", async () => {
  const { createProtectedTagInspectionService } = await moduleAt(
    "src/features/editor/protected-tag-inspection-service.js"
  );
  const tags = [
    { text: "{0}", label: "First" },
    { text: "{0}", label: "Second" },
    { text: "{1}", label: "Third" }
  ];
  const { service } = createHarness(createProtectedTagInspectionService, { source: tags });
  assert.deepEqual(service.missing({ source: "source", target: "one {0}" }), [tags[1], tags[2]]);
  assert.deepEqual(service.missing({ source: "source", target: "{0} {0} {1}" }), []);
});

test("ProtectedTagInspectionService preserves target detection and nonblank missing-tag warning policy", async () => {
  const { createProtectedTagInspectionService } = await moduleAt(
    "src/features/editor/protected-tag-inspection-service.js"
  );
  const targetTags = [{ text: "{0}", index: 0 }];
  const { calls, service } = createHarness(createProtectedTagInspectionService, {
    source: [{ text: "{0}" }],
    "{0} translated": targetTags
  });
  assert.equal(service.targetTags({ target: "{0} translated" }), targetTags);
  assert.equal(service.hasIssue({ source: "source", target: "" }), false);
  assert.equal(service.hasIssue({ source: "source", target: "   " }), false);
  assert.equal(calls.filter((value) => value === "source").length, 0);
  assert.equal(service.hasIssue({ source: "source", target: "translated" }), true);
  assert.equal(service.hasIssue({ source: "source", target: "{0}" }), false);
});

test("ProtectedTagInspectionService validates its boundary and exposes an immutable API", async () => {
  const { createProtectedTagInspectionService } = await moduleAt(
    "src/features/editor/protected-tag-inspection-service.js"
  );
  assert.throws(() => createProtectedTagInspectionService({}), /requires a protected-tag detection boundary/);
  const { service } = createHarness(createProtectedTagInspectionService);
  assert.equal(Object.isFrozen(service), true);
});
