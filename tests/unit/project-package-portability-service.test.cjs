const assert = require("node:assert/strict");
const path = require("node:path");
const test = require("node:test");
const { pathToFileURL } = require("node:url");

const rootPath = path.resolve(__dirname, "../..");

function loadFactory() {
  return import(
    pathToFileURL(path.join(rootPath, "src/features/import-export/project-package-portability-service.js")).href
  );
}

function portableClone(value) {
  return JSON.parse(JSON.stringify(value));
}

function createHarness(createProjectPackagePortabilityService, overrides = {}) {
  const calls = [];
  let idCounter = 0;
  const stores = {
    segments: [],
    activityEvents: [],
    tmEntries: [],
    terms: [],
    ...(overrides.stores || {})
  };
  const options = {
    validation: {
      validate(pkg) {
        calls.push(["validate", pkg]);
        if (overrides.validationError) throw overrides.validationError;
        return overrides.validationResult || { ok: true, pkg };
      }
    },
    storage: {
      getAll(storeName) {
        calls.push(["getAll", storeName]);
        if (overrides.storeErrorName === storeName) return Promise.reject(overrides.storeError);
        return Promise.resolve(stores[storeName]);
      }
    },
    records: {
      sanitize(value) {
        calls.push(["sanitize", value]);
        if (overrides.sanitizeError) throw overrides.sanitizeError;
        return overrides.sanitize ? overrides.sanitize(value) : portableClone(value);
      }
    },
    ids: {
      make(prefix) {
        calls.push(["makeId", prefix]);
        if (overrides.idErrorPrefix === prefix) throw overrides.idError;
        idCounter += 1;
        return `${prefix}-generated-${idCounter}`;
      }
    },
    projects: {
      getAll() {
        calls.push(["getProjects"]);
        if (overrides.projectsError) throw overrides.projectsError;
        return overrides.projects || [];
      }
    },
    clock: {
      now() {
        calls.push(["now"]);
        if (overrides.clockError) throw overrides.clockError;
        return overrides.now || "2026-08-20T12:00:00.000Z";
      }
    }
  };
  return {
    calls,
    options,
    service: createProjectPackagePortabilityService(options)
  };
}

test("ProjectPackagePortabilityService delegates validation and preserves delegate failures", async () => {
  const { createProjectPackagePortabilityService } = await loadFactory();
  const pkg = { schemaVersion: 5 };
  const result = { ok: false, errors: ["invalid"] };
  const harness = createHarness(createProjectPackagePortabilityService, { validationResult: result });
  assert.strictEqual(harness.service.validate(pkg), result);
  assert.deepEqual(harness.calls, [["validate", pkg]]);

  const validationError = new Error("validation failed");
  const failure = createHarness(createProjectPackagePortabilityService, { validationError });
  assert.throws(() => failure.service.validate(pkg), validationError);
});

test("ProjectPackagePortabilityService preserves every original localization structure branch", async () => {
  const { createProjectPackagePortabilityService } = await loadFactory();
  const { service } = createHarness(createProjectPackagePortabilityService);
  for (const value of [undefined, null, {}, { source: "" }, { sourceLines: null }, { sourceJson: undefined }]) {
    assert.equal(service.hasOriginalLocalizationStructure(value), false);
  }
  for (const value of [
    { source: "text" },
    { sourceLines: [] },
    { sourceJson: null },
    { rows: [] },
    { packageBase64: "package" }
  ]) {
    assert.equal(service.hasOriginalLocalizationStructure(value), true);
  }
});

test("ProjectPackagePortabilityService preserves portable clone fallbacks and sanitization timing", async () => {
  const { createProjectPackagePortabilityService } = await loadFactory();
  const harness = createHarness(createProjectPackagePortabilityService);
  const record = { id: "one", nested: { value: 2 } };
  const cloned = harness.service.cloneRecord(record);
  assert.deepEqual(cloned, record);
  assert.notStrictEqual(cloned, record);
  assert.notStrictEqual(cloned.nested, record.nested);
  assert.deepEqual(harness.service.cloneRecord(null), {});
  assert.deepEqual(harness.service.cloneRecord(false), {});
  assert.deepEqual(
    harness.calls.filter(([name]) => name === "sanitize"),
    [
      ["sanitize", record],
      ["sanitize", {}],
      ["sanitize", {}]
    ]
  );

  const sanitizeError = new Error("sanitize failed");
  const failure = createHarness(createProjectPackagePortabilityService, { sanitizeError });
  assert.throws(() => failure.service.cloneRecord(record), sanitizeError);
});

test("ProjectPackagePortabilityService preserves copy-name fallback and case-sensitive collision numbering", async () => {
  const { createProjectPackagePortabilityService } = await loadFactory();
  const fallback = createHarness(createProjectPackagePortabilityService);
  assert.equal(fallback.service.importedCopyName(undefined), "Imported project (copy)");
  assert.equal(fallback.service.importedCopyName("   "), "Imported project (copy)");

  const collision = createHarness(createProjectPackagePortabilityService, {
    projects: [{ name: "Base (copy)" }, { name: "Base (copy) 2" }, { name: "base (copy) 3" }, { name: "" }, {}]
  });
  assert.equal(collision.service.importedCopyName("  Base  "), "Base (copy) 3");
  assert.deepEqual(collision.calls, [["getProjects"]]);
});

test("ProjectPackagePortabilityService preserves store-ID filtering and identity types", async () => {
  const { createProjectPackagePortabilityService } = await loadFactory();
  const { service } = createHarness(createProjectPackagePortabilityService);
  const ids = service.storeIds(
    [
      { id: "keep", projectId: "other" },
      { id: "ignored", projectId: "replace" },
      { id: 7, projectId: "other" },
      { id: 0, projectId: "other" },
      { id: "", projectId: "other" },
      { projectId: "other" }
    ],
    "replace"
  );
  assert.deepEqual([...ids], ["keep", 7]);
  assert.deepEqual([...service.storeIds(null)], []);
});

test("ProjectPackagePortabilityService remaps blank, existing, reserved, and forced IDs", async () => {
  const { createProjectPackagePortabilityService } = await loadFactory();
  const harness = createHarness(createProjectPackagePortabilityService);
  const existing = new Set(["existing"]);
  const reserved = new Set();

  const unchanged = harness.service.remapRecordId({ id: "fresh", nested: { value: 1 } }, "segment", existing, reserved);
  assert.deepEqual(unchanged, { id: "fresh", nested: { value: 1 } });
  assert.equal(reserved.has("fresh"), true);
  const blank = harness.service.remapRecordId({ id: "" }, "segment", existing, reserved);
  const collision = harness.service.remapRecordId({ id: "existing" }, "activity", existing, reserved);
  const duplicate = harness.service.remapRecordId({ id: "fresh" }, "tm", existing, reserved);
  const forced = harness.service.remapRecordId({ id: "otherwise-safe" }, "term", existing, reserved, true);
  assert.deepEqual(
    [blank.id, collision.id, duplicate.id, forced.id],
    ["segment-generated-1", "activity-generated-2", "tm-generated-3", "term-generated-4"]
  );
  for (const id of [blank.id, collision.id, duplicate.id, forced.id]) assert.equal(reserved.has(id), true);
});

test("ProjectPackagePortabilityService prepares replacement imports with exact collision scopes", async () => {
  const { createProjectPackagePortabilityService } = await loadFactory();
  const pkg = {
    schemaVersion: 5,
    project: { id: "project-1", name: "Base", nested: { portable: true } },
    segments: [
      { id: "same-project", projectId: "project-1", source: "A" },
      { id: "other-project", projectId: "project-1", source: "B" },
      { id: "fresh", projectId: "project-1", source: "C" },
      { id: "fresh", projectId: "project-1", source: "D" },
      { source: "E" }
    ],
    activityEvents: [
      { id: "same-activity", projectId: "project-1" },
      { id: "other-activity", projectId: "project-1" }
    ],
    resources: {
      note: "preserved",
      tmEntries: [{ id: "tm-conflict" }, { id: "tm-fresh" }, { id: "tm-fresh" }],
      terms: [{ id: "term-conflict" }, { id: "term-fresh" }]
    },
    extra: { keep: true }
  };
  const harness = createHarness(createProjectPackagePortabilityService, {
    stores: {
      segments: [
        { id: "same-project", projectId: "project-1" },
        { id: "other-project", projectId: "project-2" }
      ],
      activityEvents: [
        { id: "same-activity", projectId: "project-1" },
        { id: "other-activity", projectId: "project-2" }
      ],
      tmEntries: [{ id: "tm-conflict" }],
      terms: [{ id: "term-conflict" }]
    }
  });
  const prepared = await harness.service.prepare(pkg, { replaceProjectId: "project-1" });
  assert.deepEqual(harness.calls.slice(0, 4), [
    ["getAll", "segments"],
    ["getAll", "activityEvents"],
    ["getAll", "tmEntries"],
    ["getAll", "terms"]
  ]);
  assert.deepEqual(prepared.project, pkg.project);
  assert.notStrictEqual(prepared.project, pkg.project);
  assert.deepEqual(
    prepared.segments.map(({ id, projectId }) => ({ id, projectId })),
    [
      { id: "same-project", projectId: "project-1" },
      { id: "segment-generated-1", projectId: "project-1" },
      { id: "fresh", projectId: "project-1" },
      { id: "segment-generated-2", projectId: "project-1" },
      { id: "segment-generated-3", projectId: "project-1" }
    ]
  );
  assert.deepEqual(
    prepared.activityEvents.map(({ id, projectId }) => ({ id, projectId })),
    [
      { id: "same-activity", projectId: "project-1" },
      { id: "activity-generated-4", projectId: "project-1" }
    ]
  );
  assert.deepEqual(
    prepared.resources.tmEntries.map(({ id }) => id),
    ["tm-generated-5", "tm-fresh", "tm-generated-6"]
  );
  assert.deepEqual(
    prepared.resources.terms.map(({ id }) => id),
    ["term-generated-7", "term-fresh"]
  );
  assert.equal(prepared.resources.note, "preserved");
  assert.strictEqual(prepared.extra, pkg.extra);
  assert.equal(
    harness.calls.some(([name]) => name === "getProjects" || name === "now"),
    false
  );
  assert.equal(pkg.segments[1].id, "other-project");
});

test("ProjectPackagePortabilityService prepares copies with one shared timestamp and forced project records", async () => {
  const { createProjectPackagePortabilityService } = await loadFactory();
  const pkg = {
    project: {
      id: "original-project",
      name: "Base",
      createdAt: "old-created",
      updatedAt: "old-updated",
      exportHistory: [{ at: "old" }]
    },
    segments: [{ id: "segment-safe", projectId: "original-project" }],
    activityEvents: [{ id: "activity-safe", projectId: "original-project" }],
    resources: { tmEntries: [{ id: "tm-safe" }], terms: [{ id: "term-safe" }] }
  };
  const harness = createHarness(createProjectPackagePortabilityService, {
    projects: [{ name: "Base (copy)" }, { name: "Base (copy) 2" }]
  });
  const prepared = await harness.service.prepare(pkg, { importAsCopy: true });
  assert.deepEqual(prepared.project, {
    id: "project-generated-1",
    name: "Base (copy) 3",
    createdAt: "2026-08-20T12:00:00.000Z",
    updatedAt: "2026-08-20T12:00:00.000Z",
    exportHistory: []
  });
  assert.deepEqual(prepared.segments, [{ id: "segment-generated-2", projectId: "project-generated-1" }]);
  assert.deepEqual(prepared.activityEvents, [{ id: "activity-generated-3", projectId: "project-generated-1" }]);
  assert.equal(prepared.resources.tmEntries[0].id, "tm-safe");
  assert.equal(prepared.resources.terms[0].id, "term-safe");
  assert.equal(harness.calls.filter(([name]) => name === "now").length, 1);
  assert.deepEqual(pkg.project.exportHistory, [{ at: "old" }]);
});

test("ProjectPackagePortabilityService preserves empty defaults, failure timing, and immutable API", async () => {
  const { createProjectPackagePortabilityService } = await loadFactory();
  const empty = createHarness(createProjectPackagePortabilityService);
  const prepared = await empty.service.prepare({ project: { id: "project-1" }, resources: { note: "keep" } });
  assert.deepEqual(prepared.segments, []);
  assert.deepEqual(prepared.activityEvents, []);
  assert.deepEqual(prepared.resources, { note: "keep", tmEntries: [], terms: [] });

  const storeError = new Error("activity store failed");
  const storeFailure = createHarness(createProjectPackagePortabilityService, {
    storeErrorName: "activityEvents",
    storeError
  });
  await assert.rejects(storeFailure.service.prepare({ project: {} }), storeError);
  assert.deepEqual(
    storeFailure.calls.filter(([name]) => name === "getAll").map(([, storeName]) => storeName),
    ["segments", "activityEvents", "tmEntries", "terms"]
  );
  assert.equal(
    storeFailure.calls.some(([name]) => name === "sanitize"),
    false
  );

  assert.throws(() => createProjectPackagePortabilityService(), /requires validation, storage/);
  assert.throws(
    () => createProjectPackagePortabilityService({ ...empty.options, ids: null }),
    /requires validation, storage/
  );
  assert.deepEqual(Object.keys(empty.service), [
    "cloneRecord",
    "hasOriginalLocalizationStructure",
    "importedCopyName",
    "prepare",
    "remapRecordId",
    "storeIds",
    "validate"
  ]);
  assert.equal(Object.isFrozen(empty.service), true);
  assert.throws(() => {
    "use strict";
    empty.service.prepare = null;
  }, TypeError);
});
