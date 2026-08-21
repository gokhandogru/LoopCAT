const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const test = require("node:test");

const root = path.resolve(__dirname, "../..");

function loadFactory() {
  return import(pathToFileURL(path.join(root, "src/features/projects/projects-view-presentation-controller.js")).href);
}

function createHarness(createProjectsViewPresentationController, overrides = {}) {
  const calls = [];
  const failure = overrides.failure || new Error(`${overrides.failAt || "projects-view"} failed`);
  const fail = (name) => {
    if (overrides.failAt === name) throw failure;
  };
  const createdElements = [];
  const dashboardChildren = [];
  const verticalModels = [];
  const summaries = overrides.summaries || [];

  function createElement(tagName) {
    calls.push(["dom.createElement", tagName]);
    fail("dom.createElement");
    const listeners = new Map();
    const attributes = new Map();
    const appended = [];
    const progressStyle = {};
    Object.defineProperty(progressStyle, "width", {
      get() {
        return this._width;
      },
      set(value) {
        calls.push(["progress.style.width", value]);
        fail("progress.style.width");
        this._width = value;
      }
    });
    const footer = {
      appended: [],
      append(...children) {
        calls.push(["footer.append", ...children]);
        fail("footer.append");
        this.appended.push(...children);
      }
    };
    const element = {
      tagName,
      className: "",
      type: "",
      textContent: "",
      html: "",
      attributes,
      appended,
      progressStyle,
      footer,
      addEventListener(type, listener) {
        calls.push(["element.addEventListener", element, type, listener]);
        fail("element.addEventListener");
        listeners.set(type, listener);
      },
      setAttribute(name, value) {
        calls.push(["element.setAttribute", element, name, value]);
        fail("element.setAttribute");
        attributes.set(name, value);
      },
      querySelector(selector) {
        calls.push(["element.querySelector", element, selector]);
        fail("element.querySelector");
        if (selector === ".progress-bar > div") return { style: progressStyle };
        if (selector === "footer") return footer;
        return null;
      },
      append(...children) {
        calls.push(["element.append", element, ...children]);
        fail("element.append");
        appended.push(...children);
      },
      click() {
        return listeners.get("click")?.({ type: "click", currentTarget: element });
      },
      listener(type) {
        return listeners.get(type);
      }
    };
    createdElements.push(element);
    return element;
  }

  const elements = {
    dashboard: {
      replaceChildren(...children) {
        calls.push(["dashboard.replaceChildren", ...children]);
        fail("dashboard.replaceChildren");
        dashboardChildren.splice(0, dashboardChildren.length, ...children);
        return overrides.replaceResult;
      }
    },
    searchInput: {
      get value() {
        calls.push(["elements.searchInput.value", overrides.query ?? ""]);
        fail("elements.searchInput.value");
        return overrides.query ?? "";
      }
    },
    languagePairFilter: {
      get value() {
        calls.push(["elements.languagePairFilter.value", overrides.pair ?? ""]);
        fail("elements.languagePairFilter.value");
        return overrides.pair ?? "";
      }
    }
  };
  const session = {
    getProjectSummaries() {
      calls.push(["session.getProjectSummaries", summaries]);
      fail("session.getProjectSummaries");
      return summaries;
    }
  };
  const search = {
    build(project) {
      calls.push(["search.build", project]);
      fail("search.build");
      return `built:${project.id}`;
    }
  };
  const language = {
    key(project) {
      calls.push(["language.key", project]);
      fail("language.key");
      return `key:${project.id}`;
    },
    display(project) {
      calls.push(["language.display", project]);
      fail("language.display");
      return `display:${project.id}`;
    }
  };
  const text = {
    stableLower(value) {
      calls.push(["text.stableLower", value]);
      fail("text.stableLower");
      return overrides.normalizedQuery ?? String(value).toLowerCase();
    },
    displaySafeHtml(value) {
      calls.push(["text.displaySafeHtml", value]);
      fail("text.displaySafeHtml");
      return `safe-html:${value}`;
    },
    displaySafeText(value, fallback) {
      calls.push(["text.displaySafeText", value, fallback]);
      fail("text.displaySafeText");
      return value ? `safe-text:${value}` : fallback;
    },
    escapeHtml(value) {
      calls.push(["text.escapeHtml", value]);
      fail("text.escapeHtml");
      return `escaped:${value}`;
    }
  };
  const localization = {
    source(value, replacements) {
      calls.push(["localization.source", value, replacements]);
      fail("localization.source");
      return replacements ? `source:${value}:${JSON.stringify(replacements)}` : `source:${value}`;
    },
    label(key, replacements) {
      calls.push(["localization.label", key, replacements]);
      fail("localization.label");
      return replacements ? `label:${key}:${JSON.stringify(replacements)}` : `label:${key}`;
    },
    labelHtml(key, replacements) {
      calls.push(["localization.labelHtml", key, replacements]);
      fail("localization.labelHtml");
      return replacements ? `label-html:${key}:${JSON.stringify(replacements)}` : `label-html:${key}`;
    }
  };
  const date = {
    format(value) {
      calls.push(["date.format", value]);
      fail("date.format");
      return `date:${value}`;
    }
  };
  const dom = { createElement };
  const presentation = {
    replaceSafeHtml(target, html) {
      calls.push(["presentation.replaceSafeHtml", target, html]);
      fail("presentation.replaceSafeHtml");
      target.html = html;
      return overrides.presentationResult;
    }
  };
  const verticalRenderer = Object.prototype.hasOwnProperty.call(overrides, "verticalRenderer")
    ? overrides.verticalRenderer
    : null;
  const vertical = {
    getProjects() {
      calls.push(["vertical.getProjects", verticalRenderer]);
      fail("vertical.getProjects");
      return verticalRenderer;
    }
  };
  if (verticalRenderer && typeof verticalRenderer.render === "function") {
    const originalRender = verticalRenderer.render;
    verticalRenderer.render = function render(model) {
      calls.push(["vertical.render", this, model]);
      fail("vertical.render");
      verticalModels.push(model);
      return originalRender.call(this, model);
    };
  }
  const actions = {
    deleteProject(projectId) {
      calls.push(["actions.deleteProject", projectId]);
      fail("actions.deleteProject");
      return overrides.deleteResult;
    },
    open(projectId) {
      calls.push(["actions.open", projectId]);
      fail("actions.open");
      return overrides.openResult;
    },
    clearFilters(event) {
      calls.push(["actions.clearFilters", event]);
      fail("actions.clearFilters");
      return overrides.clearResult;
    },
    importPackage(event) {
      calls.push(["actions.importPackage", event]);
      fail("actions.importPackage");
      return overrides.importResult;
    }
  };
  const options = {
    elements,
    session,
    search,
    language,
    text,
    localization,
    date,
    dom,
    presentation,
    vertical,
    actions
  };
  const controller = createProjectsViewPresentationController(options);
  return {
    actions,
    calls,
    controller,
    createdElements,
    dashboardChildren,
    failure,
    options,
    verticalModels
  };
}

function project(id, overrides = {}) {
  return {
    id,
    name: `Project ${id}`,
    sourceFileName: `${id}.docx`,
    progress: { percent: 25, total: 4 },
    wordCount: 10,
    updatedAt: `${id}-date`,
    ...overrides
  };
}

test("ProjectsViewPresentationController preserves read order fresh mapping and truthy cache precedence", async () => {
  const { createProjectsViewPresentationController } = await loadFactory();
  const cached = project("cached", { searchText: "cached-search", languagePairKey: "cached-pair" });
  const nested = { retained: true };
  const fallback = project("fallback", { searchText: "", languagePairKey: null, nested });
  const verticalRenderer = { render() {} };
  const harness = createHarness(createProjectsViewPresentationController, {
    query: "  Mixed QUERY  ",
    normalizedQuery: "normalized-query",
    pair: "en::tr",
    summaries: [cached, fallback],
    verticalRenderer
  });

  assert.equal(harness.controller.render(), undefined);
  assert.deepEqual(
    harness.calls.slice(0, 9).map(([name]) => name),
    [
      "elements.searchInput.value",
      "text.stableLower",
      "elements.languagePairFilter.value",
      "session.getProjectSummaries",
      "search.build",
      "language.key",
      "vertical.getProjects",
      "vertical.render"
    ]
  );
  assert.deepEqual(
    harness.calls.find(([name]) => name === "text.stableLower"),
    ["text.stableLower", "Mixed QUERY"]
  );
  assert.equal(harness.calls.filter(([name]) => name === "search.build").length, 1);
  assert.equal(harness.calls.filter(([name]) => name === "language.key").length, 1);
  const model = harness.verticalModels[0];
  assert.equal(model.query, "normalized-query");
  assert.equal(model.languagePair, "en::tr");
  assert.notEqual(model.projects[0], cached);
  assert.notEqual(model.projects[1], fallback);
  assert.equal(model.projects[0].searchText, "cached-search");
  assert.equal(model.projects[0].languagePairKey, "cached-pair");
  assert.equal(model.projects[1].searchText, "built:fallback");
  assert.equal(model.projects[1].languagePairKey, "key:fallback");
  assert.equal(model.projects[1].nested, nested);
  assert.deepEqual(cached, project("cached", { searchText: "cached-search", languagePairKey: "cached-pair" }));
});

test("ProjectsViewPresentationController preserves the vertical renderer receiver callbacks and early return", async () => {
  const { createProjectsViewPresentationController } = await loadFactory();
  const item = project("vertical");
  const verticalRenderer = {
    result: { ignored: true },
    render(_model) {
      assert.equal(this, verticalRenderer);
      return this.result;
    }
  };
  const harness = createHarness(createProjectsViewPresentationController, {
    summaries: [item],
    verticalRenderer
  });

  assert.equal(harness.controller.render(), undefined);
  assert.equal(harness.dashboardChildren.length, 0);
  assert.equal(harness.calls.filter(([name]) => name === "dashboard.replaceChildren").length, 0);
  const firstModel = harness.verticalModels[0];
  assert.equal(typeof firstModel.createItem, "function");
  assert.equal(typeof firstModel.createEmptyState, "function");
  harness.controller.render();
  const secondModel = harness.verticalModels[1];
  assert.equal(secondModel.createItem, firstModel.createItem);
  assert.equal(secondModel.createEmptyState, firstModel.createEmptyState);
});

test("ProjectsViewPresentationController preserves fallback filtering strict pairs stable order and replacement", async () => {
  const { createProjectsViewPresentationController } = await loadFactory();
  const first = project("first", { searchText: "alpha first", languagePairKey: "en::tr" });
  const pairMismatch = project("pair", { searchText: "alpha pair", languagePairKey: "EN::TR" });
  const queryMismatch = project("query", { searchText: "beta", languagePairKey: "en::tr" });
  const last = project("last", { searchText: "last alpha", languagePairKey: "en::tr" });
  const harness = createHarness(createProjectsViewPresentationController, {
    query: " alpha ",
    pair: "en::tr",
    summaries: [first, pairMismatch, queryMismatch, last],
    verticalRenderer: null
  });

  harness.controller.render();
  assert.equal(harness.calls.filter(([name]) => name === "dashboard.replaceChildren").length, 1);
  assert.deepEqual(
    harness.dashboardChildren.map((tile) => tile.html.match(/safe-html:Project ([^<]+)/)?.[1]),
    ["first", "last"]
  );
  assert.equal(harness.createdElements.filter((element) => element.className === "project-tile").length, 2);
});

test("ProjectsViewPresentationController preserves safe tile markup progress actions labels and IDs", async () => {
  const { createProjectsViewPresentationController } = await loadFactory();
  const record = project("tile-id", {
    name: "Unsafe <project>",
    domain: "Legal",
    sourceFileName: "source <file>.docx",
    progress: { percent: 37, total: 8 },
    wordCount: 123,
    updatedAt: "updated-value"
  });
  const deleteResult = { deleted: true };
  const openResult = { opened: true };
  const harness = createHarness(createProjectsViewPresentationController, {
    summaries: [record],
    verticalRenderer: null,
    deleteResult,
    openResult
  });

  harness.controller.render();
  const tile = harness.createdElements.find((element) => element.className === "project-tile");
  const buttons = harness.createdElements.filter((element) => element.tagName === "button");
  assert.match(tile.html, /safe-html:Unsafe <project>/);
  assert.match(tile.html, /safe-html:Legal - source <file>\.docx/);
  assert.match(tile.html, /escaped:display:tile-id/);
  assert.match(tile.html, /<strong>37%<\/strong>/);
  assert.match(tile.html, /<strong>8<\/strong>/);
  assert.match(tile.html, /<strong>123<\/strong>/);
  assert.match(tile.html, /date:updated-value/);
  assert.equal(tile.progressStyle.width, "37%");
  assert.equal(buttons[0].className, "danger-small");
  assert.equal(buttons[0].type, "button");
  assert.equal(buttons[0].textContent, "source:Delete");
  assert.match(buttons[0].attributes.get("aria-label"), /Delete project \{value1\}/);
  assert.equal(buttons[1].className, "primary");
  assert.equal(buttons[1].textContent, "source:Open");
  assert.match(buttons[1].attributes.get("aria-label"), /Open project \{value1\}/);
  assert.deepEqual(tile.footer.appended, buttons);
  assert.equal(buttons[0].click(), deleteResult);
  assert.equal(buttons[1].click(), openResult);
  assert.deepEqual(
    harness.calls.filter(([name]) => name === "actions.deleteProject" || name === "actions.open"),
    [
      ["actions.deleteProject", "tile-id"],
      ["actions.open", "tile-id"]
    ]
  );
});

test("ProjectsViewPresentationController preserves source metadata fallback branches", async () => {
  const { createProjectsViewPresentationController } = await loadFactory();
  const domainOnly = project("domain", { domain: "Domain", sourceFileName: "" });
  const sourceOnly = project("source", { domain: "", sourceFileName: "source.docx" });
  const neither = project("neither", { domain: "", sourceFileName: "" });
  const harness = createHarness(createProjectsViewPresentationController, {
    summaries: [domainOnly, sourceOnly, neither],
    verticalRenderer: null
  });

  harness.controller.render();
  const tiles = harness.createdElements.filter((element) => element.className === "project-tile");
  assert.match(tiles[0].html, /safe-html:Domain - label:noSourceFileImported/);
  assert.match(tiles[1].html, /safe-html:source\.docx/);
  assert.match(tiles[2].html, /safe-html:label:noSourceFileImported/);
  assert.equal(harness.calls.filter(([name]) => name === "localization.label").length, 2);
});

test("ProjectsViewPresentationController preserves both actionable empty states and direct listener identities", async () => {
  const { createProjectsViewPresentationController } = await loadFactory();
  const filtered = createHarness(createProjectsViewPresentationController, {
    query: "missing",
    summaries: [project("existing", { searchText: "other", languagePairKey: "en::tr" })],
    verticalRenderer: null,
    clearResult: "cleared"
  });
  filtered.controller.render();
  const filteredEmpty = filtered.dashboardChildren[0];
  assert.equal(filteredEmpty.className, "actionable-empty-state");
  assert.deepEqual(
    filteredEmpty.appended.map((element) => element.textContent),
    [
      "source:No matching projects",
      "source:Clear the search and language filters to see every local project.",
      "source:Clear filters"
    ]
  );
  assert.equal(filteredEmpty.appended[2].listener("click"), filtered.actions.clearFilters);
  assert.equal(filteredEmpty.appended[2].click(), "cleared");

  const empty = createHarness(createProjectsViewPresentationController, {
    summaries: [],
    verticalRenderer: null,
    importResult: "imported"
  });
  empty.controller.render();
  const firstProjectEmpty = empty.dashboardChildren[0];
  assert.deepEqual(
    firstProjectEmpty.appended.map((element) => element.textContent),
    [
      "source:Start your first translation",
      "source:Choose New project above, or bring in an existing LoopCAT project package.",
      "source:Import project package"
    ]
  );
  assert.equal(firstProjectEmpty.appended[2].listener("click"), empty.actions.importPackage);
  assert.equal(firstProjectEmpty.appended[2].click(), "imported");
});

test("ProjectsViewPresentationController preserves populated failure boundaries", async () => {
  const { createProjectsViewPresentationController } = await loadFactory();
  const summary = project("failure", { searchText: "", languagePairKey: "" });
  for (const failAt of [
    "elements.searchInput.value",
    "text.stableLower",
    "elements.languagePairFilter.value",
    "session.getProjectSummaries",
    "search.build",
    "language.key",
    "vertical.getProjects",
    "vertical.render"
  ]) {
    const harness = createHarness(createProjectsViewPresentationController, {
      summaries: [summary],
      verticalRenderer: { render() {} },
      failAt
    });
    assert.throws(
      () => harness.controller.render(),
      (error) => error === harness.failure,
      failAt
    );
  }
  for (const failAt of [
    "dom.createElement",
    "presentation.replaceSafeHtml",
    "text.displaySafeHtml",
    "language.display",
    "text.escapeHtml",
    "date.format",
    "element.querySelector",
    "progress.style.width",
    "text.displaySafeText",
    "element.setAttribute",
    "element.addEventListener",
    "footer.append",
    "dashboard.replaceChildren"
  ]) {
    const harness = createHarness(createProjectsViewPresentationController, {
      summaries: [project("tile", { searchText: "tile", languagePairKey: "key:tile" })],
      verticalRenderer: null,
      failAt
    });
    assert.throws(
      () => harness.controller.render(),
      (error) => error === harness.failure,
      failAt
    );
  }
  for (const failAt of ["localization.source", "element.append"]) {
    const harness = createHarness(createProjectsViewPresentationController, {
      summaries: [],
      verticalRenderer: null,
      failAt
    });
    assert.throws(
      () => harness.controller.render(),
      (error) => error === harness.failure,
      failAt
    );
  }
  for (const [failAt, buttonIndex] of [
    ["actions.deleteProject", 0],
    ["actions.open", 1]
  ]) {
    const harness = createHarness(createProjectsViewPresentationController, {
      summaries: [project("action", { searchText: "action", languagePairKey: "key:action" })],
      verticalRenderer: null,
      failAt
    });
    harness.controller.render();
    const buttons = harness.createdElements.filter((element) => element.tagName === "button");
    assert.throws(
      () => buttons[buttonIndex].click(),
      (error) => error === harness.failure,
      failAt
    );
  }
  for (const [failAt, summariesForState, query] of [
    [
      "actions.clearFilters",
      [project("filtered", { searchText: "different", languagePairKey: "key:filtered" })],
      "missing"
    ],
    ["actions.importPackage", [], ""]
  ]) {
    const harness = createHarness(createProjectsViewPresentationController, {
      summaries: summariesForState,
      query,
      verticalRenderer: null,
      failAt
    });
    harness.controller.render();
    const action = harness.dashboardChildren[0].appended[2];
    assert.throws(
      () => action.click(),
      (error) => error === harness.failure,
      failAt
    );
  }
});

test("ProjectsViewPresentationController validates every owner and exposes an immutable API", async () => {
  const { createProjectsViewPresentationController } = await loadFactory();
  const valid = createHarness(createProjectsViewPresentationController).options;
  const cases = [
    ["elements", null, /Projects view elements/],
    ["session", {}, /project-summary boundary/],
    ["search", {}, /project-search boundary/],
    ["language", {}, /language boundaries/],
    ["text", {}, /text-safety boundaries/],
    ["localization", {}, /localization boundaries/],
    ["date", {}, /date boundary/],
    ["dom", {}, /DOM creation boundary/],
    ["presentation", {}, /presentation boundaries/],
    ["vertical", {}, /presentation boundaries/],
    ["actions", {}, /action boundaries/]
  ];
  for (const [key, value, pattern] of cases) {
    assert.throws(() => createProjectsViewPresentationController({ ...valid, [key]: value }), pattern, key);
  }
  const controller = createProjectsViewPresentationController(valid);
  assert.equal(Object.isFrozen(controller), true);
  assert.deepEqual(Object.keys(controller), ["render"]);
  const render = controller.render;
  controller.render = () => {};
  assert.equal(controller.render, render);
});
