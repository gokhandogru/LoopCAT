const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const test = require("node:test");

const root = path.resolve(__dirname, "../..");

function loadFactory() {
  return import(pathToFileURL(path.join(root, "src/features/projects/project-document-manifest-service.js")).href);
}

function createHarness(createProjectDocumentManifestService, overrides = {}) {
  const calls = [];
  let project = Object.hasOwn(overrides, "project")
    ? overrides.project
    : { sourceFileName: "Source.xlf", documents: [] };
  const options = {
    session: {
      getProject() {
        calls.push(["getProject"]);
        if (overrides.projectError) throw overrides.projectError;
        return project;
      }
    },
    names: {
      clean(value, fallback = "") {
        calls.push(["clean", value, fallback]);
        if (overrides.cleanError) throw overrides.cleanError;
        if (typeof value !== "string" && typeof value !== "number") return fallback;
        const cleaned = String(value).trim();
        return cleaned || fallback;
      }
    },
    text: {
      lower(value) {
        calls.push(["lower", value]);
        if (overrides.lowerError) throw overrides.lowerError;
        if (overrides.lower) return overrides.lower(value);
        return String(value || "").toLocaleLowerCase("en-US");
      }
    }
  };
  return {
    calls,
    options,
    service: createProjectDocumentManifestService(options),
    setProject(value) {
      project = value;
    }
  };
}

test("ProjectDocumentManifestService preserves live defaults, explicit projects, and array-only input", async () => {
  const { createProjectDocumentManifestService } = await loadFactory();
  const harness = createHarness(createProjectDocumentManifestService, {
    project: { documents: [{ id: "first" }] }
  });
  assert.deepEqual(harness.service.manifest(), [{ id: "first", name: "Document", type: "file" }]);
  harness.setProject({ sourceFileName: "second.txt", documents: [{ id: "second" }] });
  assert.deepEqual(harness.service.manifest(), [{ id: "second", name: "second.txt", type: "file" }]);
  assert.deepEqual(harness.service.manifest({ documents: [{ id: "explicit" }] }), [
    { id: "explicit", name: "Document", type: "file" }
  ]);
  assert.equal(harness.calls.filter(([name]) => name === "getProject").length, 2);
  for (const project of [null, {}, { documents: null }, { documents: {} }, { documents: "document" }]) {
    assert.deepEqual(harness.service.manifest(project), []);
  }
});

test("ProjectDocumentManifestService rejects malformed records and preserves stable first-ID order", async () => {
  const { createProjectDocumentManifestService } = await loadFactory();
  const { service } = createHarness(createProjectDocumentManifestService);
  const result = service.manifest({
    sourceFileName: "Source.xlf",
    documents: [
      null,
      [],
      "record",
      12,
      { id: "" },
      { id: false },
      { id: " Alpha ", name: " First ", type: " XLIFF ", marker: 1 },
      { id: "Alpha", name: "Duplicate", type: "html", marker: 2 },
      { id: 0, name: 12, type: 12 },
      { id: Number.NaN, name: null, type: null },
      { id: " Beta ", name: " Beta file ", type: " HTML " }
    ]
  });
  assert.deepEqual(result, [
    { id: "Alpha", name: "First", type: "xliff", marker: 1 },
    { id: "0", name: "12", type: "12" },
    { id: "NaN", name: "Source.xlf", type: "file" },
    { id: "Beta", name: "Beta file", type: "html" }
  ]);
});

test("ProjectDocumentManifestService preserves exact source-name fallback identity and access timing", async () => {
  const { createProjectDocumentManifestService } = await loadFactory();
  const { service } = createHarness(createProjectDocumentManifestService);
  let sourceReads = 0;
  const project = {
    get sourceFileName() {
      sourceReads += 1;
      return "  Raw source name.xlf  ";
    },
    documents: [
      { id: "" },
      { id: "one", name: {} },
      { id: "one", name: "duplicate" },
      { id: "two", name: "   " },
      { id: "three", name: 0 }
    ]
  };
  assert.deepEqual(service.manifest(project), [
    { id: "one", name: "  Raw source name.xlf  ", type: "file" },
    { id: "two", name: "  Raw source name.xlf  ", type: "file" },
    { id: "three", name: "0", type: "file" }
  ]);
  assert.equal(sourceReads, 3);
  assert.deepEqual(service.manifest({ sourceFileName: 0, documents: [{ id: "fallback", name: null }] }), [
    { id: "fallback", name: "Document", type: "file" }
  ]);
});

test("ProjectDocumentManifestService preserves cleaned lowercasing and the final file fallback", async () => {
  const { createProjectDocumentManifestService } = await loadFactory();
  const harness = createHarness(createProjectDocumentManifestService, {
    lower(value) {
      if (value === "EMPTY") return "";
      if (value === "ZERO") return 0;
      return String(value || "").toLowerCase();
    }
  });
  assert.deepEqual(
    harness.service.manifest({
      documents: [
        { id: "xliff", type: " XLIFF " },
        { id: "invalid", type: {} },
        { id: "blank", type: "   " },
        { id: "empty", type: "EMPTY" },
        { id: "zero", type: "ZERO" }
      ]
    }),
    [
      { id: "xliff", name: "Document", type: "xliff" },
      { id: "invalid", name: "Document", type: "file" },
      { id: "blank", name: "Document", type: "file" },
      { id: "empty", name: "Document", type: "file" },
      { id: "zero", name: "Document", type: "file" }
    ]
  );
  assert.deepEqual(
    harness.calls.filter(([name]) => name === "lower").map(([, value]) => value),
    ["XLIFF", "file", "file", "EMPTY", "ZERO"]
  );
});

test("ProjectDocumentManifestService preserves enumerable metadata without mutating source records", async () => {
  const { createProjectDocumentManifestService } = await loadFactory();
  const { service } = createHarness(createProjectDocumentManifestService);
  const symbol = Symbol("metadata");
  const nested = { count: 2 };
  const documentInfo = {
    id: " original ",
    name: " Name ",
    type: " HTML ",
    nested,
    [symbol]: "portable"
  };
  const first = service.manifest({ documents: [documentInfo] });
  const second = service.manifest({ documents: [documentInfo] });
  assert.notEqual(first, second);
  assert.notEqual(first[0], documentInfo);
  assert.notEqual(first[0], second[0]);
  assert.equal(first[0].nested, nested);
  assert.equal(first[0][symbol], "portable");
  assert.deepEqual(documentInfo, {
    id: " original ",
    name: " Name ",
    type: " HTML ",
    nested,
    [symbol]: "portable"
  });
  assert.equal(first[0].id, "original");
  assert.equal(first[0].name, "Name");
  assert.equal(first[0].type, "html");
});

test("ProjectDocumentManifestService skips duplicate and empty IDs before later record effects", async () => {
  const { createProjectDocumentManifestService } = await loadFactory();
  const { service } = createHarness(createProjectDocumentManifestService);
  let forbiddenReads = 0;
  const forbiddenRecord = (id) => ({
    id,
    get name() {
      forbiddenReads += 1;
      throw new Error("name must not be read");
    },
    get type() {
      forbiddenReads += 1;
      throw new Error("type must not be read");
    }
  });
  assert.deepEqual(
    service.manifest({
      documents: [{ id: "kept", name: "Kept" }, forbiddenRecord("kept"), forbiddenRecord("")]
    }),
    [{ id: "kept", name: "Kept", type: "file" }]
  );
  assert.equal(forbiddenReads, 0);
});

test("ProjectDocumentManifestService preserves project, cleanup, spread, and normalization failure timing", async () => {
  const { createProjectDocumentManifestService } = await loadFactory();
  const projectError = new Error("project failed");
  assert.throws(
    () => createHarness(createProjectDocumentManifestService, { projectError }).service.manifest(),
    projectError
  );

  const documentsError = new Error("documents failed");
  const documentsProject = {};
  Object.defineProperty(documentsProject, "documents", {
    get() {
      throw documentsError;
    }
  });
  assert.throws(
    () => createHarness(createProjectDocumentManifestService).service.manifest(documentsProject),
    documentsError
  );

  const cleanError = new Error("cleanup failed");
  assert.throws(
    () =>
      createHarness(createProjectDocumentManifestService, { cleanError }).service.manifest({
        documents: [{ id: "document" }]
      }),
    cleanError
  );

  const spreadError = new Error("spread failed");
  const spreadRecord = { id: "document" };
  Object.defineProperty(spreadRecord, "metadata", {
    enumerable: true,
    get() {
      throw spreadError;
    }
  });
  const spreadHarness = createHarness(createProjectDocumentManifestService);
  assert.throws(() => spreadHarness.service.manifest({ documents: [spreadRecord] }), spreadError);
  assert.deepEqual(spreadHarness.calls, [["clean", "document", ""]]);

  const lowerError = new Error("lower failed");
  const lowerHarness = createHarness(createProjectDocumentManifestService, { lowerError });
  assert.throws(
    () => lowerHarness.service.manifest({ documents: [{ id: "document", name: "Name", type: "HTML" }] }),
    lowerError
  );
  assert.deepEqual(lowerHarness.calls, [
    ["clean", "document", ""],
    ["clean", "Name", "Document"],
    ["clean", "HTML", "file"],
    ["lower", "HTML"]
  ]);
});

test("ProjectDocumentManifestService validates boundaries and exposes an immutable API", async () => {
  const { createProjectDocumentManifestService } = await loadFactory();
  const valid = createHarness(createProjectDocumentManifestService);
  assert.equal(Object.isFrozen(valid.service), true);
  assert.deepEqual(Object.keys(valid.service), ["manifest"]);
  for (const [options, error] of [
    [{ ...valid.options, session: { getProject: null } }, /current-project boundary/],
    [{ ...valid.options, names: { clean: null } }, /project-name cleanup boundary/],
    [{ ...valid.options, text: { lower: null } }, /stable text-normalization boundary/]
  ]) {
    assert.throws(() => createProjectDocumentManifestService(options), error);
  }
});
