const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const test = require("node:test");

const root = path.resolve(__dirname, "../..");

function loadFactory() {
  return import(pathToFileURL(path.join(root, "src/features/ai/ai-suggestion-persistence-controller.js")).href);
}

function createHarness(createAiSuggestionPersistenceController, overrides = {}) {
  const segment = {
    id: "s1",
    target: "Original target",
    revision: 3,
    updatedAt: "before",
    targetHistory: [],
    aiSuggestions: [{ id: "existing", suggestedTarget: "Existing target" }]
  };
  const calls = [];
  const statuses = [];
  let nextId = 0;
  const controller = createAiSuggestionPersistenceController({
    mutation: {
      touch(value) {
        calls.push(["touch"]);
        value.revision += 1;
        value.updatedAt = "after";
      },
      restoreInPlace(value, snapshot) {
        calls.push(["restoreInPlace"]);
        Reflect.ownKeys(value).forEach((key) => delete value[key]);
        Object.assign(value, structuredClone(snapshot));
      },
      prepareHistory: (value) => {
        calls.push(["prepareHistory"]);
        value.targetHistory = Array.isArray(value.targetHistory) ? value.targetHistory : [];
        return value;
      }
    },
    persistence: {
      clearPending: (value) => calls.push(["clearPending", value.id]),
      save: (value) => {
        calls.push(["save", value.aiSuggestions.length]);
        return overrides.saveError ? Promise.reject(overrides.saveError) : Promise.resolve();
      }
    },
    activity: {
      log: (type, message, details) => {
        calls.push(["activity", type, message, details]);
        return overrides.activityError ? Promise.reject(overrides.activityError) : Promise.resolve();
      }
    },
    presentation: {
      renderSuggestions: () => calls.push(["renderSuggestions"]),
      renderHistory: () => calls.push(["renderHistory"])
    },
    workspace: {
      markDirty: () => calls.push(["markDirty"]),
      markActivityWarningDirty: () => calls.push(["markActivityWarningDirty"])
    },
    status: { set: (message, mode) => statuses.push([message, mode]) },
    redact: (value) => String(value).replace(/Bearer\s+\S+/gi, "[redacted secret]"),
    ids: {
      suggestion: () => {
        nextId += 1;
        return `generated-${nextId}`;
      }
    },
    clock: { now: () => "2026-08-14T12:00:00.000Z" },
    logger: { warn: (...values) => calls.push(["warn", ...values]) }
  });
  return { calls, controller, segment, statuses };
}

test("AI suggestion persistence normalizes a portable bounded redacted storage record", async () => {
  const { createAiSuggestionPersistenceController } = await loadFactory();
  const harness = createHarness(createAiSuggestionPersistenceController);
  const record = harness.controller.normalize({
    provider: "Provider Bearer provider-secret",
    model: "model Bearer model-secret",
    segmentId: " s1 ",
    suggestedTarget: "Suggested target",
    confidence: "not-finite",
    explanation: Array.from({ length: 12 }, (_, index) => `Explanation ${index} Bearer explanation-secret`),
    status: "",
    origin: "",
    scope: "",
    reviewState: "",
    contextDisclosure: Array.from({ length: 10 }, (_, index) => `Context ${index} Bearer context-secret`)
  });

  assert.deepEqual(record, {
    id: "generated-1",
    provider: "Provider [redacted secret]",
    model: "model [redacted secret]",
    segmentId: "s1",
    suggestedTarget: "Suggested target",
    confidence: 0,
    explanation: Array.from({ length: 8 }, (_, index) => `Explanation ${index} [redacted secret]`),
    status: "review",
    origin: "Provider [redacted secret]",
    scope: "active segment",
    reviewState: "suggested",
    contextDisclosure: Array.from({ length: 8 }, (_, index) => `Context ${index} [redacted secret]`),
    createdAt: "2026-08-14T12:00:00.000Z"
  });
});

test("AI suggestion persistence preserves supplied finite metadata and IDs", async () => {
  const { createAiSuggestionPersistenceController } = await loadFactory();
  const harness = createHarness(createAiSuggestionPersistenceController);
  const record = harness.controller.normalize({
    id: "supplied-id",
    provider: "Provider",
    model: "model",
    confidence: 87,
    status: "review",
    origin: "AI polish",
    scope: "visible segments",
    reviewState: "needs-review",
    createdAt: "2026-08-13T00:00:00.000Z"
  });

  assert.equal(record.id, "supplied-id");
  assert.equal(record.confidence, 87);
  assert.equal(record.origin, "AI polish");
  assert.equal(record.scope, "visible segments");
  assert.equal(record.reviewState, "needs-review");
  assert.equal(record.createdAt, "2026-08-13T00:00:00.000Z");
});

test("AI suggestion persistence appends, saves, logs, presents, and marks workspace dirty", async () => {
  const { createAiSuggestionPersistenceController } = await loadFactory();
  const harness = createHarness(createAiSuggestionPersistenceController);

  const result = await harness.controller.append(
    harness.segment,
    { id: "new", provider: "OpenAI", model: "model", suggestedTarget: "Suggested" },
    "ai-openai-suggestion",
    "OpenAI suggestion created"
  );

  assert.deepEqual(result, { ok: true, activityLogged: true });
  assert.equal(harness.segment.aiSuggestions.length, 2);
  assert.equal(harness.segment.aiSuggestions[1].suggestedTarget, "Suggested");
  assert.equal(harness.segment.revision, 4);
  assert.deepEqual(
    harness.calls.slice(0, 5).map(([name]) => name),
    ["touch", "clearPending", "save", "activity", "renderSuggestions"]
  );
  assert.ok(harness.calls.some(([name]) => name === "markDirty"));
  assert.equal(harness.statuses.length, 0);
});

test("primary AI suggestion persistence failure restores the exact segment and presentation", async () => {
  const { createAiSuggestionPersistenceController } = await loadFactory();
  const harness = createHarness(createAiSuggestionPersistenceController, {
    saveError: new Error("segment storage unavailable")
  });

  const result = await harness.controller.append(
    harness.segment,
    { id: "new", suggestedTarget: "Suggested" },
    "ai-test",
    "AI suggestion created"
  );

  assert.equal(result, false);
  assert.equal(harness.segment.aiSuggestions.length, 1);
  assert.equal(harness.segment.revision, 3);
  assert.equal(harness.segment.updatedAt, "before");
  assert.deepEqual(harness.statuses.at(-1), ["segment storage unavailable", "dirty"]);
  for (const expected of ["restoreInPlace", "prepareHistory", "renderSuggestions", "renderHistory"]) {
    assert.ok(
      harness.calls.some(([name]) => name === expected),
      `${expected} should run`
    );
  }
  assert.equal(
    harness.calls.some(([name]) => name === "activity"),
    false
  );
  assert.equal(
    harness.calls.some(([name]) => name === "markDirty"),
    false
  );
});

test("secondary AI suggestion activity failure keeps the durable record and reports dirty", async () => {
  const { createAiSuggestionPersistenceController } = await loadFactory();
  const harness = createHarness(createAiSuggestionPersistenceController, {
    activityError: new Error("activity unavailable")
  });

  const result = await harness.controller.append(
    harness.segment,
    { id: "new", suggestedTarget: "Suggested" },
    "ai-test",
    "AI suggestion created"
  );

  assert.deepEqual(result, { ok: true, activityLogged: false });
  assert.equal(harness.segment.aiSuggestions.length, 2);
  assert.ok(harness.calls.some(([name]) => name === "warn"));
  assert.ok(harness.calls.some(([name]) => name === "markActivityWarningDirty"));
  assert.ok(harness.calls.some(([name]) => name === "markDirty"));
  assert.deepEqual(harness.statuses.at(-1), ["AI suggestion created; activity log failed", "dirty"]);
});

test("AI suggestion persistence is inert for missing segment or suggestion input", async () => {
  const { createAiSuggestionPersistenceController } = await loadFactory();
  const harness = createHarness(createAiSuggestionPersistenceController);
  assert.equal(await harness.controller.append(null, {}, "type", "message"), false);
  assert.equal(await harness.controller.append(harness.segment, null, "type", "message"), false);
  assert.equal(harness.calls.length, 0);
});
