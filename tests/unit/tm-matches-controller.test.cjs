const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const test = require("node:test");

const rootPath = path.resolve(__dirname, "../..");

function loadFactory() {
  return import(pathToFileURL(path.join(rootPath, "src/features/editor/tm-matches-controller.js")).href);
}

function createNode(tagName, calls) {
  const classes = new Set();
  return {
    tagName,
    type: "",
    className: "",
    textContent: "",
    children: [],
    listeners: new Map(),
    classes,
    classList: {
      add(name) {
        calls.push(["classAdd", tagName, name]);
        classes.add(name);
      },
      toggle(name, force) {
        calls.push(["classToggle", tagName, name, force]);
        if (force) classes.add(name);
        else classes.delete(name);
      }
    },
    addEventListener(type, listener) {
      calls.push(["listen", tagName, type]);
      this.listeners.set(type, listener);
    },
    append(...children) {
      calls.push(["append", tagName, ...children.map((child) => child.tagName)]);
      this.children.push(...children);
    },
    replaceChildren(...children) {
      calls.push(["replaceChildren", tagName, ...children.map((child) => child.tagName)]);
      this.children = children;
    }
  };
}

function createHarness(createTmMatchesController, overrides = {}) {
  const calls = [];
  let project = Object.hasOwn(overrides, "project")
    ? overrides.project
    : { id: "p1", sourceLang: "en", targetLang: "tr" };
  let segment = Object.hasOwn(overrides, "segment") ? overrides.segment : { id: "s1", source: "  Source text  " };
  const root = createNode("root", calls);
  const created = [];
  const insertionResult = overrides.insertionResult || { inserted: true };
  const controller = createTmMatchesController({
    root,
    session: {
      getProject() {
        calls.push(["getProject", project?.id]);
        return project;
      },
      getActiveSegment() {
        calls.push(["getActiveSegment", segment?.id]);
        return segment;
      }
    },
    tm: {
      getNames() {
        calls.push(["getNames"]);
        if (overrides.namesError) throw overrides.namesError;
        return overrides.names || ["Primary", "Reference"];
      },
      findMatches(options) {
        calls.push(["findMatches", structuredClone(options)]);
        if (overrides.lookupError) throw overrides.lookupError;
        return overrides.lookupPromise || Promise.resolve(overrides.matches || []);
      }
    },
    localization: {
      source(value) {
        calls.push(["source", value]);
        if (overrides.sourceError) throw overrides.sourceError;
        return `S:${value}`;
      },
      label(key) {
        calls.push(["label", key]);
        if (overrides.labelError) throw overrides.labelError;
        return `L:${key}`;
      },
      labelHtml(key, values) {
        calls.push(["labelHtml", key, structuredClone(values)]);
        if (overrides.labelHtmlError) throw overrides.labelHtmlError;
        return `H:${key}:${JSON.stringify(values)}`;
      }
    },
    text: {
      escapeHtml(value) {
        calls.push(["escapeHtml", value]);
        if (overrides.escapeError) throw overrides.escapeError;
        return `E[${String(value)}]`;
      }
    },
    safeHtml: {
      replace(element, html) {
        calls.push(["replaceSafeHtml", element.tagName, html]);
        if (overrides.safeHtmlError) throw overrides.safeHtmlError;
        element.safeHtml = html;
      }
    },
    target: {
      insert(value, provenance) {
        calls.push(["insert", value, structuredClone(provenance)]);
        if (overrides.insertError) throw overrides.insertError;
        return insertionResult;
      }
    },
    dom: {
      createElement(tagName) {
        calls.push(["createElement", tagName]);
        if (overrides.domError) throw overrides.domError;
        const node = createNode(tagName, calls);
        created.push(node);
        return node;
      },
      createFragment() {
        calls.push(["createFragment"]);
        if (overrides.fragmentError) throw overrides.fragmentError;
        const node = createNode("fragment", calls);
        created.push(node);
        return node;
      }
    }
  });

  function cards() {
    return root.children[0]?.children || [];
  }

  return {
    calls,
    cards,
    controller,
    created,
    insertionResult,
    root,
    setProject(value) {
      project = value;
    },
    setSegment(value) {
      segment = value;
    }
  };
}

test("TmMatchesController preserves active-segment and project guards with the localized muted state", async () => {
  const { createTmMatchesController } = await loadFactory();
  const missingSegment = createHarness(createTmMatchesController, { segment: null });
  assert.equal(await missingSegment.controller.refresh(), undefined);
  assert.equal(missingSegment.root.textContent, "S:No active segment.");
  assert.equal(missingSegment.root.classes.has("muted"), true);
  assert.deepEqual(
    missingSegment.calls.filter(([name]) => ["getActiveSegment", "getProject", "findMatches"].includes(name)),
    [["getActiveSegment", undefined]]
  );

  const missingProject = createHarness(createTmMatchesController, { project: null });
  assert.equal(await missingProject.controller.refresh(), undefined);
  assert.equal(missingProject.root.textContent, "S:No active segment.");
  assert.equal(missingProject.root.classes.has("muted"), true);
  assert.equal(
    missingProject.calls.some(([name]) => name === "findMatches"),
    false
  );
  assert.equal(
    missingProject.calls.some(([name]) => name === "replaceChildren"),
    false
  );
});

test("TmMatchesController preserves exact lookup inputs, context reads, and the empty-match presentation", async () => {
  const { createTmMatchesController } = await loadFactory();
  const harness = createHarness(createTmMatchesController);
  assert.equal(await harness.controller.refresh(), undefined);
  assert.deepEqual(
    harness.calls.find(([name]) => name === "findMatches"),
    [
      "findMatches",
      {
        source: "  Source text  ",
        sourceLang: "en",
        targetLang: "tr",
        tmNames: ["Primary", "Reference"]
      }
    ]
  );
  assert.equal(harness.calls.filter(([name]) => name === "getProject").length, 5);
  assert.equal(harness.calls.filter(([name]) => name === "getActiveSegment").length, 2);
  assert.equal(harness.root.textContent, "S:No TM matches.");
  assert.equal(harness.root.classes.has("muted"), true);
  assert.equal(
    harness.calls.some(([name]) => name === "createFragment"),
    false
  );
});

test("TmMatchesController preserves stale project and segment result suppression", async () => {
  const { createTmMatchesController } = await loadFactory();
  let resolveProjectLookup;
  const staleProject = createHarness(createTmMatchesController, {
    lookupPromise: new Promise((resolve) => {
      resolveProjectLookup = resolve;
    })
  });
  const projectRefresh = staleProject.controller.refresh();
  staleProject.setProject({ id: "p2", sourceLang: "en", targetLang: "tr" });
  resolveProjectLookup([{ id: "m1", source: "Source", target: "Target" }]);
  assert.equal(await projectRefresh, undefined);
  assert.equal(
    staleProject.calls.some(([name]) => name === "classToggle"),
    false
  );
  assert.equal(
    staleProject.calls.some(([name]) => name === "createFragment"),
    false
  );

  let resolveSegmentLookup;
  const staleSegment = createHarness(createTmMatchesController, {
    lookupPromise: new Promise((resolve) => {
      resolveSegmentLookup = resolve;
    })
  });
  const segmentRefresh = staleSegment.controller.refresh();
  staleSegment.setSegment({ id: "s2", source: "New source" });
  resolveSegmentLookup([{ id: "m1", source: "Source", target: "Target" }]);
  assert.equal(await segmentRefresh, undefined);
  assert.equal(
    staleSegment.calls.some(([name]) => name === "classToggle"),
    false
  );
  assert.equal(
    staleSegment.calls.some(([name]) => name === "replaceChildren"),
    false
  );
});

test("TmMatchesController preserves lookup rejection timing before presentation effects", async () => {
  const { createTmMatchesController } = await loadFactory();
  const lookupError = new Error("TM unavailable");
  const harness = createHarness(createTmMatchesController, { lookupError });
  await assert.rejects(harness.controller.refresh(), lookupError);
  assert.equal(
    harness.calls.some(([name]) => name === "classToggle"),
    false
  );
  assert.equal(
    harness.calls.some(([name]) => name === "createFragment"),
    false
  );
});

test("TmMatchesController preserves ordered safe match cards, fallbacks, and one fragment replacement", async () => {
  const { createTmMatchesController } = await loadFactory();
  const harness = createHarness(createTmMatchesController, {
    matches: [
      {
        id: "m1",
        score: 97,
        tmName: "Main <TM>",
        source: "Source <one>",
        target: "Target & one",
        projectName: "Project > one"
      },
      { score: 82, source: "Second", target: "İkinci" }
    ]
  });
  assert.equal(await harness.controller.refresh(), undefined);
  assert.equal(harness.root.classes.has("muted"), false);
  assert.equal(harness.cards().length, 2);
  assert.equal(
    harness.cards()[0].safeHtml,
    '<header><strong>H:matchPercent:{"score":97}</strong><span>E[Main <TM>]</span></header>\n      <p>E[Source <one>]</p>\n      <p><strong>E[Target & one]</strong></p>\n      <p class="muted">E[Project > one]</p>'
  );
  assert.equal(
    harness.cards()[1].safeHtml,
    '<header><strong>H:matchPercent:{"score":82}</strong><span>E[]</span></header>\n      <p>E[Second]</p>\n      <p><strong>E[İkinci]</strong></p>\n      '
  );
  assert.deepEqual(
    harness.cards().map((card) => [card.className, card.children[0].type, card.children[0].textContent]),
    [
      ["match-card", "", "L:insert"],
      ["match-card", "", "L:insert"]
    ]
  );
  assert.equal(harness.calls.filter(([name]) => name === "replaceChildren").length, 1);
});

test("TmMatchesController preserves synchronous target insertion provenance, ID fallback, and failures", async () => {
  const { createTmMatchesController } = await loadFactory();
  const matches = [
    { id: "m1", score: 100, source: "One", target: "Bir" },
    { score: 90, source: "Two", target: "İki" }
  ];
  const harness = createHarness(createTmMatchesController, { matches });
  await harness.controller.refresh();
  assert.equal(harness.cards()[0].children[0].listeners.get("click")(), harness.insertionResult);
  assert.equal(harness.cards()[1].children[0].listeners.get("click")(), harness.insertionResult);
  assert.deepEqual(
    harness.calls.filter(([name]) => name === "insert"),
    [
      ["insert", "Bir", { channel: "match", resourceId: "m1" }],
      ["insert", "İki", { channel: "match", resourceId: "" }]
    ]
  );

  const insertError = new Error("insert failed");
  const failing = createHarness(createTmMatchesController, { matches: [matches[0]], insertError });
  await failing.controller.refresh();
  assert.throws(() => failing.cards()[0].children[0].listeners.get("click")(), insertError);
});

test("TmMatchesController validates boundaries, propagates rendering failures, and exposes an immutable API", async () => {
  const { createTmMatchesController } = await loadFactory();
  assert.throws(() => createTmMatchesController({}), /requires a results root and session boundaries/);
  const base = {
    root: createNode("root", []),
    session: { getProject: () => null, getActiveSegment: () => null },
    tm: { getNames: () => [], findMatches: () => Promise.resolve([]) },
    localization: { source: (value) => value, label: (value) => value, labelHtml: (value) => value },
    text: { escapeHtml: (value) => String(value) },
    safeHtml: { replace: () => undefined },
    target: { insert: () => undefined },
    dom: { createElement: () => createNode("node", []), createFragment: () => createNode("fragment", []) }
  };
  assert.throws(() => createTmMatchesController({ ...base, tm: null }), /requires TM selection and lookup boundaries/);
  assert.throws(
    () => createTmMatchesController({ ...base, localization: null }),
    /requires presentation and target-insertion boundaries/
  );
  assert.throws(() => createTmMatchesController({ ...base, dom: null }), /requires browser DOM boundaries/);
  assert.equal(Object.isFrozen(createHarness(createTmMatchesController).controller), true);

  const safeHtmlError = new Error("safe HTML failed");
  const failing = createHarness(createTmMatchesController, {
    matches: [{ score: 100, source: "One", target: "Bir" }],
    safeHtmlError
  });
  await assert.rejects(failing.controller.refresh(), safeHtmlError);
  assert.equal(
    failing.calls.some(([name]) => name === "replaceChildren"),
    false
  );
});
