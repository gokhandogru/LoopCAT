const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const test = require("node:test");

const root = path.resolve(__dirname, "../..");
const moduleAt = (relativePath) => import(pathToFileURL(path.join(root, relativePath)).href);

function createHarness(createProtectedTextReplacementService, detectedByText = {}) {
  const calls = [];
  const service = createProtectedTextReplacementService({
    detectTags(text) {
      calls.push(["detectTags", text]);
      return detectedByText[text] || [];
    },
    normalizeCase(value) {
      calls.push(["normalizeCase", value]);
      return String(value || "").toLowerCase();
    }
  });
  return { calls, service };
}

test("ProtectedTextReplacementService preserves coercion and empty-find no-op behavior", async () => {
  const { createProtectedTextReplacementService } = await moduleAt(
    "src/features/editor/protected-text-replacement-service.js"
  );
  const { calls, service } = createHarness(createProtectedTextReplacementService);
  assert.deepEqual(service.replacePlain(null, null, "x"), { text: "", count: 0 });
  assert.deepEqual(service.replacePlain(123, "", "x"), { text: "123", count: 0 });
  assert.deepEqual(calls, []);
});

test("ProtectedTextReplacementService preserves literal case-sensitive and normalized matching with counts", async () => {
  const { createProtectedTextReplacementService } = await moduleAt(
    "src/features/editor/protected-text-replacement-service.js"
  );
  const { calls, service } = createHarness(createProtectedTextReplacementService);
  assert.deepEqual(service.replacePlain("Cat cat CAT", "cat", "dog", { caseSensitive: true }), {
    text: "Cat dog CAT",
    count: 1
  });
  assert.deepEqual(service.replacePlain("Cat cat CAT", "cat", "dog"), {
    text: "dog dog dog",
    count: 3
  });
  assert.deepEqual(
    calls.filter(([name]) => name === "normalizeCase"),
    [
      ["normalizeCase", "cat"],
      ["normalizeCase", "Cat cat CAT"]
    ]
  );
});

test("ProtectedTextReplacementService preserves global regex flags, counts, invalid-pattern failures, and empty-match rejection", async () => {
  const { createProtectedTextReplacementService } = await moduleAt(
    "src/features/editor/protected-text-replacement-service.js"
  );
  const { service } = createHarness(createProtectedTextReplacementService);
  assert.deepEqual(service.replacePlain("A1 a2", "a(\\d)", "x$1", { regex: true }), {
    text: "x$1 x$1",
    count: 2
  });
  assert.deepEqual(service.replacePlain("A1 a2", "a(\\d)", "x", { regex: true, caseSensitive: true }), {
    text: "A1 x",
    count: 1
  });
  assert.throws(() => service.replacePlain("text", "[", "x", { regex: true }), SyntaxError);
  assert.throws(
    () => service.replacePlain("text", ".*?", "x", { regex: true }),
    /Find pattern must not match empty text/
  );
});

test("ProtectedTextReplacementService preserves sorted protected tokens and replaces only surrounding chunks", async () => {
  const { createProtectedTextReplacementService } = await moduleAt(
    "src/features/editor/protected-text-replacement-service.js"
  );
  const source = "b <b>bold</b> %s b";
  const tokens = [
    { text: "%s", index: 14 },
    { text: "</b>", index: 9 },
    { text: "<b>", index: 2 }
  ];
  const tokenSnapshot = structuredClone(tokens);
  const { service } = createHarness(createProtectedTextReplacementService, { [source]: tokens });
  assert.deepEqual(service.replace(source, "b", "strong", { caseSensitive: true }), {
    text: "strong <b>strongold</b> %s strong",
    count: 3
  });
  assert.deepEqual(
    tokens,
    tokenSnapshot.sort((a, b) => a.index - b.index || b.text.length - a.text.length)
  );
});

test("ProtectedTextReplacementService skips overlapping tokens and aggregates chunk and tail counts", async () => {
  const { createProtectedTextReplacementService } = await moduleAt(
    "src/features/editor/protected-text-replacement-service.js"
  );
  const source = "a {long} a";
  const tokens = [
    { text: "{lo", index: 2 },
    { text: "{long}", index: 2 },
    { text: "long", index: 3 }
  ];
  const { service } = createHarness(createProtectedTextReplacementService, { [source]: tokens });
  assert.deepEqual(service.replace(source, "a", "x"), { text: "x {long} x", count: 2 });
});

test("ProtectedTextReplacementService validates boundaries and exposes an immutable API", async () => {
  const { createProtectedTextReplacementService } = await moduleAt(
    "src/features/editor/protected-text-replacement-service.js"
  );
  assert.throws(
    () => createProtectedTextReplacementService({}),
    /requires protected-tag detection and case-normalization boundaries/
  );
  const { service } = createHarness(createProtectedTextReplacementService);
  assert.equal(Object.isFrozen(service), true);
});
