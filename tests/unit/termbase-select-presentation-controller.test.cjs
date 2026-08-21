const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const test = require("node:test");

const root = path.resolve(__dirname, "../..");

function loadFactory() {
  return import(pathToFileURL(path.join(root, "src/features/editor/termbase-select-presentation-controller.js")).href);
}

function createHarness(createTermbaseSelectPresentationController, overrides = {}) {
  const calls = [];
  const failure = overrides.failure || new Error(`${overrides.failAt || "termbase-select"} failed`);
  const fail = (name) => {
    if (overrides.failAt === name) throw failure;
  };
  const fragments = [];
  const optionsCreated = [];
  const select =
    overrides.select === null
      ? null
      : {
          value: overrides.current ?? "",
          children: [],
          replaceChildren(...children) {
            calls.push(["select.replaceChildren", ...children]);
            fail("select.replaceChildren");
            select.children = children;
          }
        };
  const namesReads = overrides.namesReads || [overrides.names || []];
  let namesRead = 0;
  const resources = {
    termBaseNames() {
      const names = namesReads[Math.min(namesRead, namesReads.length - 1)];
      namesRead += 1;
      calls.push(["resources.termBaseNames", names]);
      fail("resources.termBaseNames");
      return names;
    },
    primaryTermBase() {
      calls.push(["resources.primaryTermBase"]);
      fail("resources.primaryTermBase");
      return overrides.primary;
    }
  };
  const dom = {
    createElement(tagName) {
      calls.push(["dom.createElement", tagName]);
      fail("dom.createElement");
      const option = { value: undefined, textContent: undefined };
      optionsCreated.push(option);
      return option;
    },
    createDocumentFragment() {
      calls.push(["dom.createDocumentFragment"]);
      fail("dom.createDocumentFragment");
      const fragment = {
        children: [],
        append(child) {
          calls.push(["fragment.append", child]);
          fail("fragment.append");
          fragment.children.push(child);
        }
      };
      fragments.push(fragment);
      return fragment;
    }
  };
  const text = {
    displaySafeText(value) {
      calls.push(["text.displaySafeText", value]);
      fail("text.displaySafeText");
      return `safe:${value}`;
    }
  };
  const options = { select, resources, dom, text };
  return {
    calls,
    controller: createTermbaseSelectPresentationController(options),
    failure,
    fragments,
    options,
    optionsCreated,
    select
  };
}

test("TermbaseSelectPresentationController preserves the absent-select immediate return", async () => {
  const { createTermbaseSelectPresentationController } = await loadFactory();
  const harness = createHarness(createTermbaseSelectPresentationController, { select: null });
  assert.equal(harness.controller.render(), undefined);
  assert.deepEqual(harness.calls, []);
  assert.equal(harness.fragments.length, 0);
});

test("TermbaseSelectPresentationController preserves live names and stable safe option construction", async () => {
  const { createTermbaseSelectPresentationController } = await loadFactory();
  const names = ["Main <TM>", "Reference"];
  const harness = createHarness(createTermbaseSelectPresentationController, {
    names,
    current: "Reference",
    primary: "unused"
  });
  assert.equal(harness.controller.render(), undefined);
  assert.deepEqual(harness.optionsCreated, [
    { value: "Main <TM>", textContent: "safe:Main <TM>" },
    { value: "Reference", textContent: "safe:Reference" }
  ]);
  assert.deepEqual(harness.fragments[0].children, harness.optionsCreated);
  assert.deepEqual(harness.select.children, [harness.fragments[0]]);
  assert.equal(harness.calls.filter(([name]) => name === "resources.primaryTermBase").length, 0);
});

test("TermbaseSelectPresentationController retains the strict current selection after replacement", async () => {
  const { createTermbaseSelectPresentationController } = await loadFactory();
  const harness = createHarness(createTermbaseSelectPresentationController, {
    names: [1, "1"],
    current: 1,
    primary: "fallback"
  });
  harness.controller.render();
  assert.equal(harness.select.value, 1);
  assert.equal(harness.calls.at(-1)[0], "select.replaceChildren");
  assert.equal(
    harness.calls.some(([name]) => name === "resources.primaryTermBase"),
    false
  );
});

test("TermbaseSelectPresentationController resolves the primary fallback lazily after replacement", async () => {
  const { createTermbaseSelectPresentationController } = await loadFactory();
  const harness = createHarness(createTermbaseSelectPresentationController, {
    names: ["Main"],
    current: "Missing",
    primary: "Main"
  });
  harness.controller.render();
  assert.equal(harness.select.value, "Main");
  assert.deepEqual(
    harness.calls.slice(-2).map(([name]) => name),
    ["select.replaceChildren", "resources.primaryTermBase"]
  );
});

test("TermbaseSelectPresentationController preserves empty names and fresh repeated renders", async () => {
  const { createTermbaseSelectPresentationController } = await loadFactory();
  const first = [];
  const second = ["Later"];
  const harness = createHarness(createTermbaseSelectPresentationController, {
    namesReads: [first, second],
    current: "",
    primary: "Fallback"
  });
  const render = harness.controller.render;
  render();
  assert.equal(harness.select.value, "Fallback");
  render();
  assert.equal(harness.controller.render, render);
  assert.equal(harness.fragments.length, 2);
  assert.equal(harness.optionsCreated.at(-1).value, "Later");
});

test("TermbaseSelectPresentationController preserves every populated failure boundary", async () => {
  const { createTermbaseSelectPresentationController } = await loadFactory();
  for (const failAt of [
    "resources.termBaseNames",
    "dom.createDocumentFragment",
    "dom.createElement",
    "text.displaySafeText",
    "fragment.append",
    "select.replaceChildren",
    "resources.primaryTermBase"
  ]) {
    const failure = new Error(`${failAt} boundary`);
    const harness = createHarness(createTermbaseSelectPresentationController, {
      failAt,
      failure,
      names: ["Main"],
      current: "Missing",
      primary: "Main"
    });
    assert.throws(() => harness.controller.render(), failure);
  }
});

test("TermbaseSelectPresentationController validates every owner and exposes an immutable API", async () => {
  const { createTermbaseSelectPresentationController } = await loadFactory();
  const valid = createHarness(createTermbaseSelectPresentationController);
  assert.equal(Object.isFrozen(valid.controller), true);
  assert.deepEqual(Object.keys(valid.controller), ["render"]);
  assert.throws(() => createTermbaseSelectPresentationController(), TypeError);
  for (const options of [
    { ...valid.options, resources: { ...valid.options.resources, termBaseNames: null } },
    { ...valid.options, resources: { ...valid.options.resources, primaryTermBase: null } },
    { ...valid.options, dom: { ...valid.options.dom, createElement: null } },
    { ...valid.options, dom: { ...valid.options.dom, createDocumentFragment: null } },
    { ...valid.options, text: { displaySafeText: null } }
  ]) {
    assert.throws(() => createTermbaseSelectPresentationController(options), TypeError);
  }
});
