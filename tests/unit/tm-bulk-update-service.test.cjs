const assert = require("node:assert/strict");
const test = require("node:test");
const { pathToFileURL } = require("node:url");
const path = require("node:path");
const load = () =>
  import(pathToFileURL(path.resolve(__dirname, "../../src/features/editor/tm-bulk-update-service.js")).href);
const project = { id: "p", sourceLang: "en", targetLang: "de" };
const row = (id, overrides = {}) => ({
  id,
  projectId: "p",
  documentId: "d",
  source: id,
  target: "Ziel",
  status: "confirmed",
  ...overrides
});

test("bulk update skips empty, draft, missing tags, foreign projects and language mismatches; preserves locked segments", async () => {
  const { createTmBulkUpdateService } = await load();
  const saved = [];
  const segments = [
    row("locked", { locked: true }),
    row("empty", { target: " " }),
    row("draft", { status: "draft" }),
    row("tags"),
    row("foreign", { projectId: "other" }),
    row("language", { structure: { targetLang: "fr" } })
  ];
  const before = structuredClone(segments);
  const service = createTmBulkUpdateService({
    flush: () => {},
    validate: () => {},
    missingTags: (s) => (s.id === "tags" ? ["tag"] : []),
    save: (p, s, context) => {
      saved.push({ id: s.id, context });
      return { created: true };
    },
    yieldToUi: () => {}
  });
  const result = await service.run({ project, segments });
  assert.equal(result.added, 1);
  assert.equal(result.skipped, 5);
  assert.equal(saved[0].context.nextSource, "empty");
  assert.equal(saved[0].context.previousBoundary, true);
  assert.deepEqual(segments, before);
});

test("cancellation and save failures retain completed counts and allow retries", async () => {
  const { createTmBulkUpdateService } = await load();
  let cancel = false,
    fail = false;
  const entries = new Set();
  const service = createTmBulkUpdateService({
    flush: () => {},
    validate: () => {},
    missingTags: () => [],
    save: (p, s) => {
      if (fail && s.id === "b") throw Error("Disk full");
      const created = !entries.has(s.id);
      entries.add(s.id);
      return { created };
    },
    yieldToUi: () => {
      cancel = true;
    }
  });
  const segments = [row("a"), row("b"), row("c")];
  let result = await service.run({ project, segments, canceled: () => cancel });
  assert.equal(result.added, 1);
  assert.equal(result.canceled, true);
  fail = true;
  result = await service.run({ project, segments });
  assert.equal(result.existing, 1);
  assert.equal(result.failed, 1);
  assert.equal(entries.has("c"), false);
  fail = false;
  result = await service.run({ project, segments });
  assert.equal(result.added, 2);
  assert.equal(result.existing, 1);
  assert.equal(entries.size, 3);
});

test("preflight failure prevents every write and releases the busy guard", async () => {
  const { createTmBulkUpdateService } = await load();
  let fail = true,
    writes = 0;
  const service = createTmBulkUpdateService({
    flush: () => {
      if (fail) throw Error("Unsaved edits");
    },
    validate: () => {
      throw Error("Missing TM");
    },
    missingTags: () => [],
    save: () => {
      writes++;
    },
    yieldToUi: () => {}
  });
  await assert.rejects(service.run({ project, segments: [row("a")] }), /Unsaved edits/);
  fail = false;
  await assert.rejects(service.run({ project, segments: [row("a")] }), /Missing TM/);
  assert.equal(writes, 0);
});
