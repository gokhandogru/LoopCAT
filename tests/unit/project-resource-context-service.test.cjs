const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const test = require("node:test");

const root = path.resolve(__dirname, "../..");

function loadFactory() {
  return import(pathToFileURL(path.join(root, "src/features/projects/project-resource-context-service.js")).href);
}

function createHarness(createProjectResourceContextService, overrides = {}) {
  const calls = [];
  let project = Object.hasOwn(overrides, "project") ? overrides.project : null;
  let id = 0;
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
      },
      unique(values) {
        calls.push(["unique", values]);
        if (overrides.uniqueError) throw overrides.uniqueError;
        return Array.from(
          new Set((Array.isArray(values) ? values : []).map((value) => String(value || "").trim()).filter(Boolean))
        );
      }
    },
    ids: {
      make(prefix) {
        calls.push(["make", prefix]);
        if (overrides.idError) throw overrides.idError;
        id += 1;
        return `${prefix}-${id}`;
      }
    }
  };
  return {
    calls,
    options,
    service: createProjectResourceContextService(options),
    setProject(value) {
      project = value;
    }
  };
}

test("ProjectResourceContextService cleans array records with exact type, name, ID, and metadata policy", async () => {
  const { createProjectResourceContextService } = await loadFactory();
  const { service } = createHarness(createProjectResourceContextService);
  const nested = { portable: true };
  const source = { id: "  raw-id  ", type: " tm ", name: " Memory ", role: "main", nested };
  const result = service.cleanLinks([
    null,
    [],
    "link",
    12,
    {},
    { type: "TM", name: "Uppercase type" },
    { type: "tm", name: "" },
    { type: "tm", name: 0 },
    source,
    { id: 42, type: "termbase", name: true, marker: 1 },
    { id: "   ", type: "tm", name: "Whitespace ID" }
  ]);
  assert.deepEqual(result, [
    { id: "  raw-id  ", type: "tm", name: "Memory", role: "main", nested },
    { id: "", type: "termbase", name: "true", marker: 1 },
    { id: "", type: "tm", name: "Whitespace ID" }
  ]);
  assert.notEqual(result[0], source);
  assert.equal(result[0].nested, nested);
  assert.deepEqual(source, { id: "  raw-id  ", type: " tm ", name: " Memory ", role: "main", nested });
  for (const value of [undefined, null, {}, "links", 12]) assert.deepEqual(service.cleanLinks(value), []);
});

test("ProjectResourceContextService builds exact legacy defaults and keeps a missing project inert", async () => {
  const { createProjectResourceContextService } = await loadFactory();
  const harness = createHarness(createProjectResourceContextService);
  assert.deepEqual(harness.service.links(null), []);
  assert.deepEqual(harness.calls, []);
  assert.deepEqual(harness.service.links({ mainTmName: "", tmName: " Legacy TM ", termBaseName: " Legacy TB " }), [
    { id: "resource-link-1", type: "tm", name: "Legacy TM", role: "main" },
    { id: "resource-link-2", type: "termbase", name: "Legacy TB", role: undefined }
  ]);
  assert.deepEqual(
    harness.calls.filter(([name]) => name === "clean"),
    [
      ["clean", " Legacy TM ", "Default TM"],
      ["clean", "", "Legacy TM"],
      ["clean", " Legacy TB ", "Default TB"]
    ]
  );
  assert.deepEqual(
    harness.calls.filter(([name]) => name === "make"),
    [
      ["make", "resource-link"],
      ["make", "resource-link"]
    ]
  );
});

test("ProjectResourceContextService gives clean links precedence and normalizes roles and duplicates", async () => {
  const { createProjectResourceContextService } = await loadFactory();
  const harness = createHarness(createProjectResourceContextService);
  const project = {
    mainTmName: "Main TM",
    tmName: "Legacy TM",
    termBaseName: "Legacy TB",
    resourceLinks: [
      { id: "reference", type: "tm", name: "Reference TM", role: "main" },
      { id: "main", type: "tm", name: "Main TM", role: "reference" },
      { id: "duplicate", type: "tm", name: "Reference TM", role: "main" },
      { id: "   ", type: "termbase", name: "Terms", role: "primary" },
      { id: "duplicate-terms", type: "termbase", name: "Terms", role: "secondary" }
    ]
  };
  assert.deepEqual(harness.service.links(project), [
    { id: "reference", type: "tm", name: "Reference TM", role: "reference" },
    { id: "main", type: "tm", name: "Main TM", role: "main" },
    { id: "resource-link-1", type: "termbase", name: "Terms", role: "primary" }
  ]);
  assert.deepEqual(
    harness.calls.filter(([name]) => name === "make"),
    [["make", "resource-link"]]
  );
  assert.equal(
    harness.calls.some(([name, value]) => name === "clean" && value === "Legacy TB"),
    false
  );
});

test("ProjectResourceContextService completes missing main-TM and termbase links in exact ID order", async () => {
  const { createProjectResourceContextService } = await loadFactory();
  const tmOnly = createHarness(createProjectResourceContextService);
  assert.deepEqual(
    tmOnly.service.links({
      mainTmName: "Main TM",
      termBaseName: "Terms",
      resourceLinks: [{ type: "tm", name: "Reference TM" }]
    }),
    [
      { id: "resource-link-2", type: "tm", name: "Main TM", role: "main" },
      { id: "resource-link-1", type: "tm", name: "Reference TM", role: "reference" },
      { id: "resource-link-3", type: "termbase", name: "Terms" }
    ]
  );

  const termbaseOnly = createHarness(createProjectResourceContextService);
  assert.deepEqual(
    termbaseOnly.service.links({
      mainTmName: "Main TM",
      resourceLinks: [{ type: "termbase", name: "Terms" }]
    }),
    [
      { id: "resource-link-2", type: "tm", name: "Main TM", role: "main" },
      { id: "resource-link-1", type: "termbase", name: "Terms", role: undefined }
    ]
  );
});

test("ProjectResourceContextService preserves live main-TM defaults and explicit project selection", async () => {
  const { createProjectResourceContextService } = await loadFactory();
  const harness = createHarness(createProjectResourceContextService, {
    project: { mainTmName: "First Main", tmName: "First Legacy" }
  });
  assert.equal(harness.service.mainTm(), "First Main");
  harness.setProject({ tmName: "Second Legacy" });
  assert.equal(harness.service.mainTm(), "Second Legacy");
  assert.equal(harness.service.mainTm({ mainTmName: "Explicit Main", tmName: "Explicit Legacy" }), "Explicit Main");
  assert.equal(harness.service.mainTm(null), "Default TM");
  assert.equal(harness.calls.filter(([name]) => name === "getProject").length, 2);
  const firstCleanCalls = harness.calls.filter(([name]) => name === "clean").slice(0, 2);
  assert.deepEqual(firstCleanCalls, [
    ["clean", "First Legacy", "Default TM"],
    ["clean", "First Main", "First Legacy"]
  ]);
});

test("ProjectResourceContextService preserves main-first TM names, termbase order, and primary fallback", async () => {
  const { createProjectResourceContextService } = await loadFactory();
  const { service } = createHarness(createProjectResourceContextService);
  const project = {
    mainTmName: "Main TM",
    resourceLinks: [
      { id: "reference", type: "tm", name: "Reference TM" },
      { id: "main", type: "tm", name: "Main TM" },
      { id: "terms-b", type: "termbase", name: "Terms B" },
      { id: "terms-a", type: "termbase", name: "Terms A" }
    ]
  };
  assert.deepEqual(service.tmNames(project), ["Main TM", "Reference TM"]);
  assert.deepEqual(service.termBaseNames(project), ["Terms B", "Terms A"]);
  assert.equal(service.primaryTermBase(project), "Terms B");
  assert.deepEqual(service.tmNames(null), ["Default TM"]);
  assert.deepEqual(service.termBaseNames(null), []);
  assert.equal(service.primaryTermBase(null), "Default TB");
});

test("ProjectResourceContextService preserves exact singular and plural summary shapes", async () => {
  const { createProjectResourceContextService } = await loadFactory();
  const { service } = createHarness(createProjectResourceContextService);
  assert.deepEqual(service.summary({}), {
    mainTm: "Default TM",
    tmNames: ["Default TM"],
    tbNames: ["Default TB"],
    tmLabel: "1 TM",
    tbLabel: "1 TB"
  });
  assert.deepEqual(
    service.summary({
      mainTmName: "Main TM",
      resourceLinks: [
        { id: "main", type: "tm", name: "Main TM" },
        { id: "reference", type: "tm", name: "Reference TM" },
        { id: "terms-a", type: "termbase", name: "Terms A" },
        { id: "terms-b", type: "termbase", name: "Terms B" }
      ]
    }),
    {
      mainTm: "Main TM",
      tmNames: ["Main TM", "Reference TM"],
      tbNames: ["Terms A", "Terms B"],
      tmLabel: "2 TMs",
      tbLabel: "2 TBs"
    }
  );
  assert.deepEqual(service.summary(null), {
    mainTm: "Default TM",
    tmNames: ["Default TM"],
    tbNames: [],
    tmLabel: "1 TM",
    tbLabel: "0 TBs"
  });
});

test("ProjectResourceContextService creates fresh normalized links per call without mutating project records", async () => {
  const { createProjectResourceContextService } = await loadFactory();
  const { service } = createHarness(createProjectResourceContextService);
  const sourceLink = { type: "tm", name: "Reference TM", metadata: { score: 1 } };
  const project = { mainTmName: "Main TM", termBaseName: "Terms", resourceLinks: [sourceLink] };
  const first = service.links(project);
  const second = service.links(project);
  assert.notEqual(first, second);
  assert.notEqual(first[1], second[1]);
  assert.equal(first[1].id, "resource-link-1");
  assert.equal(second[1].id, "resource-link-4");
  assert.equal(Object.hasOwn(first[1], "metadata"), false);
  assert.deepEqual(sourceLink, { type: "tm", name: "Reference TM", metadata: { score: 1 } });
});

test("ProjectResourceContextService preserves conversion, cleanup, ID, unique, and session failure timing", async () => {
  const { createProjectResourceContextService } = await loadFactory();
  const conversionError = new Error("type conversion failed");
  const type = {
    toString() {
      throw conversionError;
    }
  };
  assert.throws(
    () => createHarness(createProjectResourceContextService).service.cleanLinks([{ type, name: "Name" }]),
    conversionError
  );

  const cleanError = new Error("cleanup failed");
  assert.throws(() => createHarness(createProjectResourceContextService, { cleanError }).service.links({}), cleanError);

  const idError = new Error("ID failed");
  assert.throws(
    () =>
      createHarness(createProjectResourceContextService, { idError }).service.links({
        mainTmName: "Main",
        resourceLinks: [{ type: "tm", name: "Main" }]
      }),
    idError
  );

  const uniqueError = new Error("unique failed");
  assert.throws(
    () => createHarness(createProjectResourceContextService, { uniqueError }).service.tmNames({}),
    uniqueError
  );

  const projectError = new Error("project failed");
  assert.throws(
    () => createHarness(createProjectResourceContextService, { projectError }).service.summary(),
    projectError
  );
});

test("ProjectResourceContextService validates boundaries and exposes an immutable API", async () => {
  const { createProjectResourceContextService } = await loadFactory();
  const valid = createHarness(createProjectResourceContextService);
  assert.equal(Object.isFrozen(valid.service), true);
  assert.deepEqual(Object.keys(valid.service), [
    "cleanLinks",
    "links",
    "mainTm",
    "tmNames",
    "termBaseNames",
    "primaryTermBase",
    "summary"
  ]);
  for (const [options, error] of [
    [{ ...valid.options, session: { getProject: null } }, /current-project boundary/],
    [{ ...valid.options, names: { ...valid.options.names, clean: null } }, /project-name boundaries/],
    [{ ...valid.options, names: { ...valid.options.names, unique: null } }, /project-name boundaries/],
    [{ ...valid.options, ids: { make: null } }, /ID boundary/]
  ]) {
    assert.throws(() => createProjectResourceContextService(options), error);
  }
});
