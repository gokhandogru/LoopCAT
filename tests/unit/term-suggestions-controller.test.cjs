const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const test = require("node:test");

const rootPath = path.resolve(__dirname, "../..");

function loadFactory() {
  return import(pathToFileURL(path.join(rootPath, "src/features/editor/term-suggestions-controller.js")).href);
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

function createHarness(createTermSuggestionsController, overrides = {}) {
  const calls = [];
  let project = Object.hasOwn(overrides, "project")
    ? overrides.project
    : { id: "p1", sourceLang: "en", targetLang: "tr" };
  let segment = Object.hasOwn(overrides, "segment") ? overrides.segment : { id: "s1", source: "  Source text  " };
  const root = createNode("root", calls);
  const created = [];
  const deletionResult = overrides.deletionResult || { deleted: true };
  const controller = createTermSuggestionsController({
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
    terms: {
      getNames() {
        calls.push(["getNames"]);
        if (overrides.namesError) throw overrides.namesError;
        return overrides.names || ["Primary TB", "Reference TB"];
      },
      find(options) {
        calls.push(["findTerms", structuredClone(options)]);
        if (overrides.lookupError) throw overrides.lookupError;
        return overrides.lookupPromise || Promise.resolve(overrides.suggestions || []);
      }
    },
    localization: {
      source(value) {
        calls.push(["source", value]);
        if (overrides.sourceError) throw overrides.sourceError;
        return `S:${value}`;
      },
      labelHtml(key) {
        calls.push(["labelHtml", key]);
        if (overrides.labelHtmlError) throw overrides.labelHtmlError;
        return `H:${key}`;
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
    mutation: {
      deleteTerm(term, options) {
        calls.push(["deleteTerm", term, structuredClone(options)]);
        if (overrides.deleteError) throw overrides.deleteError;
        return overrides.deletionPromise || deletionResult;
      }
    },
    target: overrides.withTarget
      ? {
          insert(...args) {
            calls.push(["insertTerm", ...args]);
            return overrides.insertResult;
          }
        }
      : undefined,
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
    deletionResult,
    root,
    setProject(value) {
      project = value;
    },
    setSegment(value) {
      segment = value;
    }
  };
}

test("TermSuggestionsController preserves active-segment and project guards with the localized muted state", async () => {
  const { createTermSuggestionsController } = await loadFactory();
  const missingSegment = createHarness(createTermSuggestionsController, { segment: null });
  assert.equal(await missingSegment.controller.refresh(), undefined);
  assert.equal(missingSegment.root.textContent, "S:No active segment.");
  assert.equal(missingSegment.root.classes.has("muted"), true);
  assert.deepEqual(
    missingSegment.calls.filter(([name]) => ["getActiveSegment", "getProject", "findTerms"].includes(name)),
    [["getActiveSegment", undefined]]
  );

  const missingProject = createHarness(createTermSuggestionsController, { project: null });
  assert.equal(await missingProject.controller.refresh(), undefined);
  assert.equal(missingProject.root.textContent, "S:No active segment.");
  assert.equal(missingProject.root.classes.has("muted"), true);
  assert.equal(
    missingProject.calls.some(([name]) => name === "findTerms"),
    false
  );
  assert.equal(
    missingProject.calls.some(([name]) => name === "replaceChildren"),
    false
  );
});

test("TermSuggestionsController preserves exact lookup inputs, context reads, and the empty-suggestion presentation", async () => {
  const { createTermSuggestionsController } = await loadFactory();
  const harness = createHarness(createTermSuggestionsController);
  assert.equal(await harness.controller.refresh(), undefined);
  assert.deepEqual(
    harness.calls.find(([name]) => name === "findTerms"),
    [
      "findTerms",
      {
        source: "  Source text  ",
        sourceLang: "en",
        targetLang: "tr",
        termBaseNames: ["Primary TB", "Reference TB"]
      }
    ]
  );
  assert.equal(harness.calls.filter(([name]) => name === "getProject").length, 5);
  assert.equal(harness.calls.filter(([name]) => name === "getActiveSegment").length, 2);
  assert.equal(harness.root.textContent, "S:No terms found in this segment.");
  assert.equal(harness.root.classes.has("muted"), true);
  assert.equal(
    harness.calls.some(([name]) => name === "createFragment"),
    false
  );
});

test("TermSuggestionsController preserves stale project and segment result suppression", async () => {
  const { createTermSuggestionsController } = await loadFactory();
  let resolveProjectLookup;
  const staleProject = createHarness(createTermSuggestionsController, {
    lookupPromise: new Promise((resolve) => {
      resolveProjectLookup = resolve;
    })
  });
  const projectRefresh = staleProject.controller.refresh();
  staleProject.setProject({ id: "p2", sourceLang: "en", targetLang: "tr" });
  resolveProjectLookup([{ id: "t1", sourceTerm: "Source", targetTerm: "Target" }]);
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
  const staleSegment = createHarness(createTermSuggestionsController, {
    lookupPromise: new Promise((resolve) => {
      resolveSegmentLookup = resolve;
    })
  });
  const segmentRefresh = staleSegment.controller.refresh();
  staleSegment.setSegment({ id: "s2", source: "New source" });
  resolveSegmentLookup([{ id: "t1", sourceTerm: "Source", targetTerm: "Target" }]);
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

test("TermSuggestionsController preserves lookup rejection timing before presentation effects", async () => {
  const { createTermSuggestionsController } = await loadFactory();
  const lookupError = new Error("Termbase unavailable");
  const harness = createHarness(createTermSuggestionsController, { lookupError });
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

test("TermSuggestionsController preserves ordered approved and forbidden safe cards with one replacement", async () => {
  const { createTermSuggestionsController } = await loadFactory();
  const suggestions = [
    {
      id: "t1",
      sourceTerm: "Open <file>",
      targetTerm: "Dosya & aç",
      termBaseName: "Main <TB>",
      notes: "Use > menu"
    },
    { id: "t2", sourceTerm: "Never", targetTerm: "Asla", isForbidden: true }
  ];
  const harness = createHarness(createTermSuggestionsController, { suggestions });
  assert.equal(await harness.controller.refresh(), undefined);
  assert.equal(harness.root.classes.has("muted"), false);
  assert.equal(harness.cards().length, 2);
  assert.equal(
    harness.cards()[0].safeHtml,
    "<header><strong>E[Open <file>]</strong><span>E[Dosya & aç]</span><span>H:approved</span><span>E[Main <TB>]</span></header>\n      <p>E[Use > menu]</p>"
  );
  assert.equal(
    harness.cards()[1].safeHtml,
    "<header><strong>E[Never]</strong><span>E[Asla]</span><span>H:forbidden</span><span>E[]</span></header>\n      "
  );
  assert.deepEqual(
    harness.cards().map((card) => [card.className, card.children[0].type, card.children[0].textContent]),
    [
      ["term-card", "", "S:Delete"],
      ["term-card forbidden-term-card", "", "S:Delete"]
    ]
  );
  assert.equal(harness.calls.filter(([name]) => name === "replaceChildren").length, 1);
  assert.deepEqual(harness.controller.getResults(), suggestions);
});

test("TermSuggestionsController offers insertion only for approved terms", async () => {
  const { createTermSuggestionsController } = await loadFactory();
  const approved = { id: "t1", sourceTerm: "Open", targetTerm: "Aç" };
  const forbidden = { id: "t2", sourceTerm: "Never", targetTerm: "Asla", isForbidden: true };
  const harness = createHarness(createTermSuggestionsController, {
    suggestions: [approved, forbidden],
    withTarget: true
  });
  await harness.controller.refresh();

  assert.deepEqual(
    harness.cards().map((card) => card.children.map((button) => button.textContent)),
    [["S:Insert", "S:Delete"], ["S:Delete"]]
  );
  assert.equal(harness.cards()[0].children[0].listeners.get("click")(), undefined);
  assert.deepEqual(
    harness.calls.find(([name]) => name === "insertTerm"),
    ["insertTerm", "Aç", { resourceId: "t1", sourceTerm: "Open" }]
  );
});

test("TermSuggestionsController preserves awaited deletion identity, options, undefined fulfillment, and rejection", async () => {
  const { createTermSuggestionsController } = await loadFactory();
  const term = { id: "t1", sourceTerm: "Open", targetTerm: "Aç" };
  let resolveDeletion;
  const harness = createHarness(createTermSuggestionsController, {
    suggestions: [term],
    deletionPromise: new Promise((resolve) => {
      resolveDeletion = resolve;
    })
  });
  await harness.controller.refresh();
  const action = harness.cards()[0].children[0].listeners.get("click")();
  assert.deepEqual(
    harness.calls.find(([name]) => name === "deleteTerm"),
    ["deleteTerm", term, { refreshResourceView: false, refreshSuggestions: true }]
  );
  let settled = false;
  action.finally(() => {
    settled = true;
  });
  await Promise.resolve();
  assert.equal(settled, false);
  resolveDeletion(harness.deletionResult);
  assert.equal(await action, undefined);

  const deleteError = new Error("delete failed");
  const failing = createHarness(createTermSuggestionsController, {
    suggestions: [term],
    deleteError
  });
  await failing.controller.refresh();
  await assert.rejects(failing.cards()[0].children[0].listeners.get("click")(), deleteError);
});

test("TermSuggestionsController validates boundaries, propagates rendering failures, and exposes an immutable API", async () => {
  const { createTermSuggestionsController } = await loadFactory();
  assert.throws(() => createTermSuggestionsController({}), /requires a results root and session boundaries/);
  const base = {
    root: createNode("root", []),
    session: { getProject: () => null, getActiveSegment: () => null },
    terms: { getNames: () => [], find: () => Promise.resolve([]) },
    localization: { source: (value) => value, labelHtml: (value) => value },
    text: { escapeHtml: (value) => String(value) },
    safeHtml: { replace: () => undefined },
    mutation: { deleteTerm: () => undefined },
    dom: { createElement: () => createNode("node", []), createFragment: () => createNode("fragment", []) }
  };
  assert.throws(
    () => createTermSuggestionsController({ ...base, terms: null }),
    /requires termbase selection and lookup boundaries/
  );
  assert.throws(
    () => createTermSuggestionsController({ ...base, localization: null }),
    /requires presentation and mutation boundaries/
  );
  assert.throws(() => createTermSuggestionsController({ ...base, dom: null }), /requires browser DOM boundaries/);
  assert.equal(Object.isFrozen(createHarness(createTermSuggestionsController).controller), true);

  const safeHtmlError = new Error("safe HTML failed");
  const failing = createHarness(createTermSuggestionsController, {
    suggestions: [{ sourceTerm: "Open", targetTerm: "Aç" }],
    safeHtmlError
  });
  await assert.rejects(failing.controller.refresh(), safeHtmlError);
  assert.equal(
    failing.calls.some(([name]) => name === "replaceChildren"),
    false
  );
});
