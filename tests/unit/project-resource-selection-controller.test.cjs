const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const test = require("node:test");

const root = path.resolve(__dirname, "../..");
const moduleAt = (relativePath) => import(pathToFileURL(path.join(root, relativePath)).href);

function unique(values) {
  return Array.from(
    new Set((Array.isArray(values) ? values : []).map((value) => String(value || "").trim()).filter(Boolean))
  );
}

function clean(value, fallback = "") {
  if (typeof value !== "string" && typeof value !== "number") return fallback;
  return String(value).trim() || fallback;
}

function createHarness(createProjectResourceSelectionController, overrides = {}) {
  const calls = [];
  const state = {
    mode: overrides.mode || "create",
    project: overrides.project || null,
    checked: overrides.checked || { tm: [], tb: [] },
    main: overrides.main || ""
  };
  const elements = {
    sourceLanguageInput: { value: overrides.sourceLang ?? " en " },
    targetLanguageInput: { value: overrides.targetLang ?? " tr " },
    tmResourceList: { name: "tm-list" },
    tbResourceList: { name: "tb-list" },
    newTmNameInput: { value: overrides.newTmName || "" },
    newTermBaseNameInput: { value: overrides.newTbName || "" }
  };
  elements.dialog = {
    querySelectorAll(selector) {
      const type = selector.includes('"tb"') ? "tb" : "tm";
      return state.checked[type].map((resourceName) => ({ dataset: { resourceName } }));
    },
    querySelector(selector) {
      if (selector !== "[data-main-tm]:checked" || !state.main) return null;
      return { dataset: { mainTm: state.main } };
    }
  };
  let id = 0;
  const tmMatches = overrides.tmMatches || [];
  const tbMatches = overrides.tbMatches || [];
  const controller = createProjectResourceSelectionController({
    elements,
    getProject: () => state.project,
    getMode: () => state.mode,
    normalizeLanguageValue(value) {
      calls.push(["normalizeLanguageValue", value]);
      return String(value || "")
        .trim()
        .toLowerCase();
    },
    normalizeLanguageInput(input) {
      calls.push(["normalizeLanguageInput", input]);
      input.value = String(input.value || "")
        .trim()
        .toLowerCase();
      return input.value;
    },
    projectResources: {
      tmNames(project) {
        calls.push(["tmNames", project]);
        return overrides.selectedTmNames || [];
      },
      termBaseNames(project) {
        calls.push(["termBaseNames", project]);
        return overrides.selectedTbNames || [];
      },
      mainTmName(project) {
        calls.push(["mainTmName", project]);
        return overrides.selectedMain || "";
      },
      links(project) {
        calls.push(["links", project]);
        return overrides.existingLinks || [];
      }
    },
    catalog: {
      matching(type, sourceLang, targetLang, selectedNames) {
        calls.push(["matching", type, sourceLang, targetLang, selectedNames]);
        return type === "tm" ? tmMatches : tbMatches;
      }
    },
    localization: {
      label: (key, values = {}) => `label:${key}:${values.count ?? ""}`,
      labelHtml: (key) => `labelHtml:${key}`
    },
    presentation: {
      replaceSafeHtml(element, html) {
        calls.push(["replaceSafeHtml", element.name, html]);
      },
      escapeHtml: (value) => `escaped:${value}`,
      displaySafeHtml: (value) => `safe:${value}`,
      languagePairDisplay: (sourceLang, targetLang) => `pair:${sourceLang}->${targetLang}`
    },
    names: { unique, clean },
    makeId(prefix) {
      calls.push(["makeId", prefix]);
      id += 1;
      return `${prefix}-${id}`;
    }
  });
  return { calls, controller, elements, state };
}

test("ProjectResourceSelectionController preserves normalized dialog values and immutable checked API", async () => {
  const { createProjectResourceSelectionController } = await moduleAt(
    "src/features/projects/project-resource-selection-controller.js"
  );
  const { controller } = createHarness(createProjectResourceSelectionController, {
    sourceLang: " EN ",
    targetLang: " TR "
  });

  assert.deepEqual(controller.values(), { sourceLang: "en", targetLang: "tr" });
  assert.equal(Object.isFrozen(controller), true);
  assert.throws(
    () => createProjectResourceSelectionController({}),
    /requires the source-language input|requires dialog, resource, catalog/
  );
});

test("ProjectResourceSelectionController preserves no-language early return without replacing picker content", async () => {
  const { createProjectResourceSelectionController } = await moduleAt(
    "src/features/projects/project-resource-selection-controller.js"
  );
  const { calls, controller } = createHarness(createProjectResourceSelectionController, {
    sourceLang: "",
    targetLang: "tr"
  });

  assert.equal(controller.render(), undefined);
  assert.equal(
    calls.some(([name]) => name === "matching" || name === "replaceSafeHtml"),
    false
  );
});

test("ProjectResourceSelectionController preserves create-mode safe picker options, counts, and localized empty state", async () => {
  const { createProjectResourceSelectionController } = await moduleAt(
    "src/features/projects/project-resource-selection-controller.js"
  );
  const { calls, controller } = createHarness(createProjectResourceSelectionController, {
    mode: "create",
    tmMatches: [{ name: "<TM>", sourceLang: "en", targetLang: "tr", count: 2 }],
    tbMatches: []
  });

  controller.render();

  assert.deepEqual(
    calls.filter(([name]) => name === "matching"),
    [
      ["matching", "tm", "en", "tr", []],
      ["matching", "tb", "en", "tr", []]
    ]
  );
  const tmHtml = calls.find((entry) => entry[0] === "replaceSafeHtml" && entry[1] === "tm-list")[2];
  assert.match(tmHtml, /data-resource-name="escaped:<TM>"/);
  assert.match(tmHtml, /<strong>safe:<TM><\/strong>/);
  assert.match(tmHtml, /escaped:pair:en->tr - label:unitCount:2/);
  assert.match(tmHtml, /name="projectMainTm"/);
  assert.doesNotMatch(tmHtml, / checked/);
  const tbHtml = calls.find((entry) => entry[0] === "replaceSafeHtml" && entry[1] === "tb-list")[2];
  assert.equal(tbHtml, '<div class="muted">labelHtml:noMatchingTbs</div>');
});

test("ProjectResourceSelectionController preserves edit-mode selected and main picker controls", async () => {
  const { createProjectResourceSelectionController } = await moduleAt(
    "src/features/projects/project-resource-selection-controller.js"
  );
  const project = { id: "project-1" };
  const { calls, controller } = createHarness(createProjectResourceSelectionController, {
    mode: "edit",
    project,
    selectedTmNames: ["Primary"],
    selectedTbNames: ["Terms"],
    selectedMain: "Primary",
    tmMatches: [{ name: "Primary", sourceLang: "en", targetLang: "tr", count: 1 }],
    tbMatches: [{ name: "Terms", sourceLang: "en", targetLang: "tr", count: 3 }]
  });

  controller.render();

  const tmHtml = calls.find((entry) => entry[0] === "replaceSafeHtml" && entry[1] === "tm-list")[2];
  const tbHtml = calls.find((entry) => entry[0] === "replaceSafeHtml" && entry[1] === "tb-list")[2];
  assert.equal((tmHtml.match(/checked/g) || []).length, 2);
  assert.equal((tbHtml.match(/checked/g) || []).length, 1);
  assert.doesNotMatch(tbHtml, /projectMainTm/);
  assert.match(tbHtml, /label:termCount:3/);
  assert.deepEqual(
    calls.filter(([name]) => name === "tmNames" || name === "termBaseNames" || name === "mainTmName"),
    [
      ["tmNames", project],
      ["termBaseNames", project],
      ["mainTmName", project]
    ]
  );
});

test("ProjectResourceSelectionController preserves new-resource precedence, IDs, roles, and selected-name order", async () => {
  const { createProjectResourceSelectionController } = await moduleAt(
    "src/features/projects/project-resource-selection-controller.js"
  );
  const project = { id: "project-1" };
  const { controller } = createHarness(createProjectResourceSelectionController, {
    checked: { tm: ["Reference", "Primary", "Reference"], tb: ["Terms", "Terms"] },
    main: "Primary",
    newTmName: " New Main ",
    newTbName: " New Terms ",
    existingLinks: [
      { id: "tm-reference", type: "tm", name: "Reference" },
      { id: "tb-terms", type: "termbase", name: "Terms" }
    ]
  });

  const settings = controller.collect(project);

  assert.deepEqual(settings.tmNames, ["New Main", "Reference", "Primary"]);
  assert.deepEqual(settings.termBaseNames, ["Terms", "New Terms"]);
  assert.equal(settings.mainTmName, "New Main");
  assert.equal(settings.tmName, "New Main");
  assert.equal(settings.termBaseName, "Terms");
  assert.deepEqual(settings.resourceLinks, [
    { id: "resource-link-1", type: "tm", name: "New Main", role: "main" },
    { id: "tm-reference", type: "tm", name: "Reference", role: "reference" },
    { id: "resource-link-2", type: "tm", name: "Primary", role: "reference" },
    { id: "tb-terms", type: "termbase", name: "Terms" },
    { id: "resource-link-3", type: "termbase", name: "New Terms" }
  ]);
});

test("ProjectResourceSelectionController preserves legacy defaults, valid-main correction, and generated links", async () => {
  const { createProjectResourceSelectionController } = await moduleAt(
    "src/features/projects/project-resource-selection-controller.js"
  );
  const legacyProject = { tmName: " Legacy TM ", termBaseName: " Legacy TB " };
  const { controller } = createHarness(createProjectResourceSelectionController, {
    checked: { tm: [], tb: [] },
    main: "Missing"
  });

  const settings = controller.collect(legacyProject);

  assert.deepEqual(settings.tmNames, ["Legacy TM"]);
  assert.deepEqual(settings.termBaseNames, ["Legacy TB"]);
  assert.equal(settings.mainTmName, "Legacy TM");
  assert.deepEqual(settings.resourceLinks, [
    { id: "resource-link-1", type: "tm", name: "Legacy TM", role: "main" },
    { id: "resource-link-2", type: "termbase", name: "Legacy TB" }
  ]);

  const defaults = createHarness(createProjectResourceSelectionController).controller.collect(null);
  assert.equal(defaults.tmName, "Default TM");
  assert.equal(defaults.termBaseName, "Default TB");
});
