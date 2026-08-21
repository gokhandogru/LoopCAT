const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const test = require("node:test");

const root = path.resolve(__dirname, "../..");

function loadFactory() {
  return import(
    pathToFileURL(path.join(root, "src/features/projects/language-pair-filter-presentation-controller.js")).href
  );
}

function createHarness(createLanguagePairFilterPresentationController, overrides = {}) {
  const calls = [];
  const failure = overrides.failure || new Error(`${overrides.failAt || "language-pair-filter"} failed`);
  const fail = (name) => {
    if (overrides.failAt === name) throw failure;
  };
  const fragments = [];
  const optionsCreated = [];
  let selectedValue = overrides.current ?? "";
  const select = {
    children: [],
    get value() {
      calls.push(["select.value:get", selectedValue]);
      fail("select.value:get");
      return selectedValue;
    },
    set value(value) {
      calls.push(["select.value:set", value]);
      fail("select.value:set");
      selectedValue = value;
    },
    replaceChildren(...children) {
      calls.push(["select.replaceChildren", ...children]);
      fail("select.replaceChildren");
      this.children = children;
    }
  };
  const projectReads = overrides.projectReads || [overrides.projects || []];
  let projectRead = 0;
  const projects = {
    list() {
      const records = projectReads[Math.min(projectRead, projectReads.length - 1)];
      projectRead += 1;
      calls.push(["projects.list", records]);
      fail("projects.list");
      return records;
    }
  };
  const language = {
    key(project) {
      calls.push(["language.key", project]);
      fail("language.key");
      return project.pair;
    },
    display(sourceLanguage, targetLanguage) {
      calls.push(["language.display", sourceLanguage, targetLanguage]);
      fail("language.display");
      return `display:${sourceLanguage}->${targetLanguage}`;
    }
  };
  const localization = {
    source(value) {
      calls.push(["localization.source", value]);
      fail("localization.source");
      return `localized:${value}`;
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
  const options = { select, projects, language, localization, dom };
  return {
    calls,
    controller: createLanguagePairFilterPresentationController(options),
    failure,
    fragments,
    getSelectedValue: () => selectedValue,
    options,
    optionsCreated,
    select
  };
}

test("LanguagePairFilterPresentationController captures current selection before live projects", async () => {
  const { createLanguagePairFilterPresentationController } = await loadFactory();
  const harness = createHarness(createLanguagePairFilterPresentationController);
  assert.equal(harness.controller.render(), undefined);
  assert.deepEqual(
    harness.calls.slice(0, 5).map(([name]) => name),
    ["select.value:get", "projects.list", "dom.createDocumentFragment", "dom.createElement", "localization.source"]
  );
  assert.deepEqual(harness.optionsCreated, [{ value: "", textContent: "localized:All language pairs" }]);
});

test("LanguagePairFilterPresentationController preserves key mapping exclusion deduplication and sorting", async () => {
  const { createLanguagePairFilterPresentationController } = await loadFactory();
  const projectRecords = [
    { id: "z", pair: "z::tr" },
    { id: "empty", pair: "::" },
    { id: "a", pair: "A::fr" },
    { id: "duplicate", pair: "A::fr" },
    { id: "lower", pair: "a::de" },
    { id: "partial", pair: "::es" }
  ];
  const harness = createHarness(createLanguagePairFilterPresentationController, {
    current: "z::tr",
    projects: projectRecords
  });
  harness.controller.render();
  assert.deepEqual(
    harness.calls.filter(([name]) => name === "language.key").map(([, project]) => project),
    projectRecords
  );
  assert.deepEqual(harness.optionsCreated, [
    { value: "", textContent: "localized:All language pairs" },
    { value: "::es", textContent: "display:->es" },
    { value: "A::fr", textContent: "display:A->fr" },
    { value: "a::de", textContent: "display:a->de" },
    { value: "z::tr", textContent: "display:z->tr" }
  ]);
  assert.deepEqual(harness.fragments[0].children, harness.optionsCreated);
  assert.deepEqual(harness.select.children, [harness.fragments[0]]);
});

test("LanguagePairFilterPresentationController delegates split display and preserves full raw pair values", async () => {
  const { createLanguagePairFilterPresentationController } = await loadFactory();
  const harness = createHarness(createLanguagePairFilterPresentationController, {
    current: "en::tr::ignored",
    projects: [{ pair: "en::tr::ignored" }]
  });
  harness.controller.render();
  assert.deepEqual(
    harness.calls.filter(([name]) => name === "language.display"),
    [["language.display", "en", "tr"]]
  );
  assert.deepEqual(harness.optionsCreated.at(-1), {
    value: "en::tr::ignored",
    textContent: "display:en->tr"
  });
  assert.equal(harness.getSelectedValue(), "en::tr::ignored");
});

test("LanguagePairFilterPresentationController preserves strict selection retention and empty fallback", async () => {
  const { createLanguagePairFilterPresentationController } = await loadFactory();
  const retained = createHarness(createLanguagePairFilterPresentationController, {
    current: "en::tr",
    projects: [{ pair: "en::tr" }]
  });
  retained.controller.render();
  assert.equal(retained.getSelectedValue(), "en::tr");
  const missing = createHarness(createLanguagePairFilterPresentationController, {
    current: "missing::pair",
    projects: [{ pair: "en::tr" }]
  });
  missing.controller.render();
  assert.equal(missing.getSelectedValue(), "");
  const mismatched = createHarness(createLanguagePairFilterPresentationController, {
    current: 1,
    projects: [{ pair: "1" }]
  });
  mismatched.controller.render();
  assert.equal(mismatched.getSelectedValue(), "");
});

test("LanguagePairFilterPresentationController preserves empty and fresh repeated live renders", async () => {
  const { createLanguagePairFilterPresentationController } = await loadFactory();
  const harness = createHarness(createLanguagePairFilterPresentationController, {
    current: "",
    projectReads: [[], [{ pair: "en::tr" }]]
  });
  const render = harness.controller.render;
  render();
  render();
  assert.equal(harness.controller.render, render);
  assert.equal(harness.fragments.length, 2);
  assert.equal(harness.optionsCreated.at(-1).value, "en::tr");
  assert.equal(harness.calls.filter(([name]) => name === "select.replaceChildren").length, 2);
});

test("LanguagePairFilterPresentationController preserves every populated failure boundary", async () => {
  const { createLanguagePairFilterPresentationController } = await loadFactory();
  for (const failAt of [
    "select.value:get",
    "projects.list",
    "language.key",
    "dom.createDocumentFragment",
    "dom.createElement",
    "localization.source",
    "fragment.append",
    "language.display",
    "select.replaceChildren",
    "select.value:set"
  ]) {
    const failure = new Error(`${failAt} boundary`);
    const harness = createHarness(createLanguagePairFilterPresentationController, {
      current: "missing::pair",
      projects: [{ pair: "en::tr" }],
      failAt,
      failure
    });
    assert.throws(() => harness.controller.render(), failure);
  }
});

test("LanguagePairFilterPresentationController validates every owner and exposes an immutable API", async () => {
  const { createLanguagePairFilterPresentationController } = await loadFactory();
  const valid = createHarness(createLanguagePairFilterPresentationController);
  assert.equal(Object.isFrozen(valid.controller), true);
  assert.deepEqual(Object.keys(valid.controller), ["render"]);
  assert.throws(() => createLanguagePairFilterPresentationController(), TypeError);
  for (const options of [
    { ...valid.options, select: null },
    { ...valid.options, select: {} },
    { ...valid.options, projects: { list: null } },
    { ...valid.options, language: { ...valid.options.language, key: null } },
    { ...valid.options, language: { ...valid.options.language, display: null } },
    { ...valid.options, localization: { source: null } },
    { ...valid.options, dom: { ...valid.options.dom, createElement: null } },
    { ...valid.options, dom: { ...valid.options.dom, createDocumentFragment: null } }
  ]) {
    assert.throws(() => createLanguagePairFilterPresentationController(options), TypeError);
  }
});
