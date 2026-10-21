const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const test = require("node:test");
const vm = require("node:vm");

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

function createFormatAwareService(createProtectedTextReplacementService) {
  const context = { window: {} };
  vm.runInNewContext(fs.readFileSync(path.join(root, "protected-tags.js"), "utf8"), context);
  return createProtectedTextReplacementService({
    detectTags: context.window.CatHan.protectedTags.detectProtectedTags,
    normalizeCase: (value) => String(value || "").toLowerCase()
  });
}

function installRegexWorker(testContext) {
  const workerSource = fs.readFileSync(path.join(root, "regex-worker.js"), "utf8");
  const originalWorker = Object.getOwnPropertyDescriptor(globalThis, "Worker");
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  testContext.after(() => {
    if (originalWorker) Object.defineProperty(globalThis, "Worker", originalWorker);
    else delete globalThis.Worker;
    if (originalWindow) Object.defineProperty(globalThis, "window", originalWindow);
    else delete globalThis.window;
  });
  globalThis.window = { CatHan: {} };
  globalThis.Worker = class {
    constructor() {
      this.self = { postMessage: (data) => this.onmessage({ data: structuredClone(data) }) };
      vm.runInNewContext(workerSource, { self: this.self });
    }
    postMessage(data) {
      this.self.onmessage({ data });
    }
    terminate() {}
  };
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

test("ProtectedTextReplacementService uses PO format context while keeping ambiguous percentages editable", async () => {
  const { createProtectedTextReplacementService } = await moduleAt(
    "src/features/editor/protected-text-replacement-service.js"
  );
  const service = createFormatAwareService(createProtectedTextReplacementService);
  const cases = [
    ["qt-format", "%1 1", "1", "%1 x"],
    ["c-format", "%02d 02", "02", "%02d x"],
    ["python-format", "%(name)08.2f name", "name", "%(name)08.2f x"]
  ];
  for (const [flag, text, find, expected] of cases) {
    assert.deepEqual(service.replace(text, find, "x", { context: { format: "po", formatFlags: [flag] } }), {
      text: expected,
      count: 1
    });
  }
  assert.deepEqual(service.replace("%1 indirim ve %1,5 artış", "1", "2", { context: { format: "po" } }), {
    text: "%2 indirim ve %2,5 artış",
    count: 2
  });
  assert.deepEqual(service.replace("%0 bites", "bites", "eats"), { text: "%0 eats", count: 1 });
});

test("ProtectedTextReplacementService passes PO context through asynchronous regex replacement", async (t) => {
  installRegexWorker(t);
  const { createProtectedTextReplacementService } = await moduleAt(
    "src/features/editor/protected-text-replacement-service.js"
  );
  const service = createFormatAwareService(createProtectedTextReplacementService);
  const result = await service.replaceAsync("%1 1", "1", "2", {
    regex: true,
    context: { format: "po", formatFlags: ["qt-format"] }
  });
  assert.deepEqual(result, { id: "target", text: "%1 2", count: 1 });
});

test("ProtectedTextReplacementService keeps per-entry format contexts aligned in mixed regex batches", async (t) => {
  installRegexWorker(t);
  const { createProtectedTextReplacementService } = await moduleAt(
    "src/features/editor/protected-text-replacement-service.js"
  );
  const service = createFormatAwareService(createProtectedTextReplacementService);
  const contexts = ["qt-format", "c-format", "python-format", "no-c-format"].map((flag) => ({
    format: "po",
    formatFlags: [flag]
  }));
  const result = await service.replaceMany(["%1 1", "%02d 02", "%(name)s name", "%1 1"], "1|02|name", "x", {
    regex: true,
    contexts
  });
  assert.deepEqual(result, [
    { id: 0, text: "%1 x", count: 1 },
    { id: 1, text: "%02d x", count: 1 },
    { id: 2, text: "%(name)s x", count: 1 },
    { id: 3, text: "%x x", count: 2 }
  ]);
});
