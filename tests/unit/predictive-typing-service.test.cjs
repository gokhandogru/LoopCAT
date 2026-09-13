const assert = require("node:assert/strict");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");
const fs = require("node:fs");
const { pathToFileURL } = require("node:url");

const root = path.resolve(__dirname, "..", "..");

function loadPredictiveTyping() {
  return import(pathToFileURL(path.join(root, "src/features/editor/predictive-typing-service.js")).href);
}

test("predictive typing ranks safe terminology before TM fragments and honors resource priority", async () => {
  const { prepareCompletionCandidates } = await loadPredictiveTyping();
  const candidates = prepareCompletionCandidates({
    termMatches: [
      { sourceTerm: "car", targetTerm: "automobile", status: "admitted", resourcePriority: 0 },
      { sourceTerm: "car", targetTerm: "vehicle", status: "preferred", resourcePriority: 4 },
      { sourceTerm: "car", targetTerm: "motorcar", status: "preferred", resourcePriority: 1 },
      { sourceTerm: "car", targetTerm: "forbidden wording", status: "forbidden", resourcePriority: 0 },
      { sourceTerm: "car", targetTerm: "<ph>unsafe</ph>", status: "preferred", resourcePriority: 0 }
    ],
    tmMatches: [
      { source: "A car", target: "motorcar on the road", matchKind: "exact", effectiveScore: 100, resourcePriority: 0 },
      { source: "A vehicle", target: "low score fragment", matchKind: "fuzzy", effectiveScore: 69, resourcePriority: 0 }
    ]
  });

  assert.deepEqual(
    candidates.slice(0, 3).map((candidate) => candidate.text),
    ["motorcar", "vehicle", "automobile"]
  );
  assert.equal(
    candidates.some((candidate) => candidate.text.includes("forbidden")),
    false
  );
  assert.equal(
    candidates.some((candidate) => candidate.text.includes("unsafe")),
    false
  );
  assert.equal(
    candidates.some((candidate) => candidate.text.includes("low score")),
    false
  );
  assert.equal(candidates.find((candidate) => candidate.text === "motorcar").kind, "terminologyPreferred");
});

test("predictive typing completes the caret prefix with locale-aware casing and rejects stale caches", async () => {
  const { caretPrefix, completePrefix, prepareCompletionCandidates } = await loadPredictiveTyping();
  const candidates = prepareCompletionCandidates({
    locale: "tr",
    termMatches: [{ sourceTerm: "city", targetTerm: "İstanbul", status: "preferred" }],
    tmMatches: [{ source: "city", target: "istanbul airport", matchKind: "exact", effectiveScore: 100 }]
  });
  const prefix = caretPrefix("Welcome to i", 12, "tr");
  assert.deepEqual(prefix, { text: "Welcome to i", start: 0, end: 12 });
  const matches = completePrefix({
    prefix: "i",
    caretContext: { resourceSignature: "current" },
    resourceSignature: "current",
    candidates,
    locale: "tr"
  });
  assert.equal(matches[0].insertion, "İstanbul");
  assert.deepEqual(
    completePrefix({
      prefix: "i",
      caretContext: { resourceSignature: "old" },
      resourceSignature: "current",
      candidates,
      locale: "tr"
    }),
    []
  );

  const upper = completePrefix({
    prefix: "İS",
    caretContext: { resourceSignature: "current" },
    resourceSignature: "current",
    candidates: candidates.filter((candidate) => !candidate.preserveCase),
    locale: "tr"
  });
  assert.equal(upper[0].insertion, "İSTANBUL AİRPORT");
});

test("predictive typing keeps its cache bounded", async () => {
  const { prepareCompletionCandidates, PREDICTIVE_TYPING_LIMITS } = await loadPredictiveTyping();
  const candidates = prepareCompletionCandidates({
    termMatches: Array.from({ length: 700 }, (_, index) => ({
      sourceTerm: `source ${index}`,
      targetTerm: `target ${index}`,
      status: "preferred"
    }))
  });
  assert.equal(candidates.length, PREDICTIVE_TYPING_LIMITS.maxCandidates);
});

test("project resource matching queries only lookup-enabled stable resources", async () => {
  const source = fs.readFileSync(path.join(root, "project.js"), "utf8");
  const calls = [];
  const project = {
    id: "project-1",
    name: "Example",
    sourceLang: "en",
    targetLang: "tr",
    mainTmName: "Main",
    tmName: "Main",
    termBaseName: "Terms",
    activeTermBaseId: "tb-1",
    resourceLinks: [
      {
        id: "l1",
        resourceId: "tm-1",
        type: "tm",
        cachedName: "Main",
        role: "main",
        lookup: true,
        priority: 0,
        penalty: 2
      },
      {
        id: "l2",
        resourceId: "tm-2",
        type: "tm",
        cachedName: "Archive",
        role: "reference",
        lookup: false,
        priority: 1,
        penalty: 0
      },
      {
        id: "l3",
        resourceId: "tb-1",
        type: "termbase",
        cachedName: "Terms",
        role: "termbase",
        lookup: true,
        qa: true,
        contribute: true,
        priority: 0
      },
      {
        id: "l4",
        resourceId: "tb-2",
        type: "termbase",
        cachedName: "QA only",
        role: "termbase",
        lookup: false,
        qa: true,
        contribute: false,
        priority: 1
      }
    ]
  };
  const noOp = () => Promise.resolve([]);
  const storage = new Proxy(
    {
      get: (store, id) => Promise.resolve(store === "projects" && id === project.id ? project : null),
      getAll: noOp,
      getAllByIndex: noOp,
      makeId: (prefix) => `${prefix}-id`,
      constants: { LOCAL_WORKSPACE_ID: "local-workspace", LOCAL_USER_ID: "local-user" }
    },
    { get: (target, key) => (key in target ? target[key] : noOp) }
  );
  const context = {
    console,
    window: {
      CatHan: {
        storage,
        tm: {
          findTmMatches: (options) => {
            calls.push(["tm", options]);
            return Promise.resolve([{ id: "match" }]);
          }
        },
        termbase: {
          findTerms: (options) => {
            calls.push(["term", options]);
            return Promise.resolve([{ id: "term" }]);
          }
        }
      }
    }
  };
  vm.runInNewContext(source, context, { filename: "project.js" });
  const result = await context.window.CatHan.project.queryResourceMatches({
    projectId: project.id,
    source: "Hello",
    context: { previousSource: "Before" }
  });

  assert.deepEqual(
    Array.from(calls[0][1].resourceLinks, (link) => link.resourceId),
    ["tm-1"]
  );
  assert.deepEqual(
    Array.from(calls[1][1].resourceLinks, (link) => link.resourceId),
    ["tb-1"]
  );
  assert.equal(result.tmMatches[0].id, "match");
  assert.equal(result.termMatches[0].id, "term");
  assert.match(result.resourceSignature, /tm-1/);
});
