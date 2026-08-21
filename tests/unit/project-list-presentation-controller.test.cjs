const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const test = require("node:test");

const root = path.resolve(__dirname, "../..");

function loadFactory() {
  return import(pathToFileURL(path.join(root, "src/features/projects/project-list-presentation-controller.js")).href);
}

function createHarness(createProjectListPresentationController, overrides = {}) {
  const calls = [];
  const failure = overrides.failure || new Error(`${overrides.failAt || "project-list"} failed`);
  const fail = (name) => {
    if (overrides.failAt === name) throw failure;
  };
  const defaultProjects = overrides.projects || [];
  const projectReads = overrides.projectReads || [defaultProjects];
  const currentReads = overrides.currentReads || [overrides.currentProject ?? null];
  let projectsRead = 0;
  let currentRead = 0;
  const createdElements = [];
  const fragments = [];
  const rootState = { children: [], html: undefined };

  const listRoot = {
    replaceChildren(...children) {
      calls.push(["root.replaceChildren", ...children]);
      fail("root.replaceChildren");
      rootState.children = children;
    }
  };
  const session = {
    getProject() {
      const value = currentReads[Math.min(currentRead, currentReads.length - 1)];
      currentRead += 1;
      calls.push(["session.getProject", value]);
      fail("session.getProject");
      return value;
    },
    getProjects() {
      const value = projectReads[Math.min(projectsRead, projectReads.length - 1)];
      projectsRead += 1;
      calls.push(["session.getProjects", value]);
      fail(`session.getProjects:${projectsRead}`);
      return value;
    }
  };
  const dom = {
    createElement(tagName) {
      calls.push(["dom.createElement", tagName]);
      fail("dom.createElement");
      const listeners = new Map();
      const element = {
        tagName,
        className: "",
        html: "",
        addEventListener(type, listener) {
          calls.push(["button.addEventListener", element, type, listener]);
          fail("button.addEventListener");
          listeners.set(type, listener);
        },
        click() {
          return listeners.get("click")?.();
        }
      };
      createdElements.push(element);
      return element;
    },
    createDocumentFragment() {
      calls.push(["dom.createDocumentFragment"]);
      fail("dom.createDocumentFragment");
      const fragment = {
        children: [],
        append(child) {
          calls.push(["fragment.append", fragment, child]);
          fail("fragment.append");
          fragment.children.push(child);
        }
      };
      fragments.push(fragment);
      return fragment;
    }
  };
  const text = {
    displaySafeHtml(value) {
      calls.push(["text.displaySafeHtml", value]);
      fail("text.displaySafeHtml");
      return `safe:${value}`;
    },
    escapeHtml(value) {
      calls.push(["text.escapeHtml", value]);
      fail("text.escapeHtml");
      return `escaped:${value}`;
    }
  };
  const language = {
    display(project) {
      calls.push(["language.display", project]);
      fail("language.display");
      return `language:${project.id}`;
    }
  };
  const localization = {
    sourceHtml(value) {
      calls.push(["localization.sourceHtml", value]);
      fail("localization.sourceHtml");
      return `source:${value}`;
    },
    labelHtml(key) {
      calls.push(["localization.labelHtml", key]);
      fail("localization.labelHtml");
      return `label:${key}`;
    }
  };
  const presentation = {
    replaceSafeHtml(target, html) {
      calls.push(["presentation.replaceSafeHtml", target, html]);
      fail("presentation.replaceSafeHtml");
      target.html = html;
      if (target === listRoot) rootState.html = html;
    }
  };
  const navigation = {
    open(projectId) {
      calls.push(["navigation.open", projectId]);
      fail("navigation.open");
      return overrides.openResult;
    }
  };
  const options = {
    root: listRoot,
    session,
    dom,
    text,
    language,
    localization,
    presentation,
    navigation
  };
  const controller = createProjectListPresentationController(options);
  return {
    calls,
    controller,
    createdElements,
    failure,
    fragments,
    options,
    rootState
  };
}

test("ProjectListPresentationController preserves the first-read empty state and immediate return", async () => {
  const { createProjectListPresentationController } = await loadFactory();
  const projects = [];
  const harness = createHarness(createProjectListPresentationController, { projectReads: [projects] });
  assert.equal(harness.controller.render(), undefined);
  assert.deepEqual(harness.calls, [
    ["session.getProjects", projects],
    ["localization.sourceHtml", "No projects yet."],
    ["presentation.replaceSafeHtml", harness.options.root, '<div class="muted">source:No projects yet.</div>']
  ]);
  assert.equal(harness.rootState.html, '<div class="muted">source:No projects yet.</div>');
  assert.equal(harness.fragments.length, 0);
});

test("ProjectListPresentationController preserves the second fresh project read and stable order", async () => {
  const { createProjectListPresentationController } = await loadFactory();
  const guardProjects = [{ id: "guard" }];
  const first = { id: "first", name: "First", sourceFileName: "first.docx" };
  const second = { id: "second", name: "Second", sourceFileName: "second.docx" };
  const harness = createHarness(createProjectListPresentationController, {
    projectReads: [guardProjects, [first, second]]
  });
  harness.controller.render();
  assert.equal(harness.calls.filter(([name]) => name === "session.getProjects").length, 2);
  assert.deepEqual(
    harness.createdElements.map((element) => element.html.match(/safe:([^<]+)/)?.[1]),
    ["First", "Second"]
  );
  assert.deepEqual(harness.fragments[0].children, harness.createdElements);
  assert.deepEqual(harness.rootState.children, [harness.fragments[0]]);
});

test("ProjectListPresentationController reads current project per item with strict active IDs", async () => {
  const { createProjectListPresentationController } = await loadFactory();
  const first = { id: 1, name: "Numeric", sourceFileName: "one" };
  const second = { id: "1", name: "String", sourceFileName: "two" };
  const firstCurrent = { id: 1 };
  const secondCurrent = { id: 1 };
  const harness = createHarness(createProjectListPresentationController, {
    projectReads: [
      [first, second],
      [first, second]
    ],
    currentReads: [firstCurrent, secondCurrent]
  });
  harness.controller.render();
  assert.deepEqual(
    harness.calls.filter(([name]) => name === "session.getProject"),
    [
      ["session.getProject", firstCurrent],
      ["session.getProject", secondCurrent]
    ]
  );
  assert.equal(harness.createdElements[0].className, "project-item active");
  assert.equal(harness.createdElements[1].className, "project-item ");
});

test("ProjectListPresentationController preserves safe card markup and no-source fallback", async () => {
  const { createProjectListPresentationController } = await loadFactory();
  const withSource = { id: "with", name: "Name <one>", sourceFileName: "source <one>" };
  const withoutSource = { id: "without", name: "Name two", sourceFileName: "" };
  const harness = createHarness(createProjectListPresentationController, {
    projectReads: [
      [withSource, withoutSource],
      [withSource, withoutSource]
    ]
  });
  harness.controller.render();
  assert.equal(
    harness.createdElements[0].html,
    "<strong>safe:Name <one></strong><span>escaped:language:with</span><span>safe:source <one></span>"
  );
  assert.equal(
    harness.createdElements[1].html,
    "<strong>safe:Name two</strong><span>escaped:language:without</span><span>label:noSourceFile</span>"
  );
  assert.equal(harness.calls.filter(([name]) => name === "localization.labelHtml").length, 1);
  assert.equal(harness.calls.filter(([name, value]) => name === "text.displaySafeHtml" && value === "").length, 0);
});

test("ProjectListPresentationController captures exact project IDs in open listeners", async () => {
  const { createProjectListPresentationController } = await loadFactory();
  const first = { id: "project-a", name: "A", sourceFileName: "a" };
  const second = { id: "project-b", name: "B", sourceFileName: "b" };
  const openResult = { opened: true };
  const harness = createHarness(createProjectListPresentationController, {
    projectReads: [
      [first, second],
      [first, second]
    ],
    openResult
  });
  harness.controller.render();
  assert.equal(harness.createdElements[0].click(), openResult);
  assert.equal(harness.createdElements[1].click(), openResult);
  assert.deepEqual(
    harness.calls.filter(([name]) => name === "navigation.open"),
    [
      ["navigation.open", "project-a"],
      ["navigation.open", "project-b"]
    ]
  );
});

test("ProjectListPresentationController preserves a non-empty guard followed by an empty live list", async () => {
  const { createProjectListPresentationController } = await loadFactory();
  const harness = createHarness(createProjectListPresentationController, {
    projectReads: [[{ id: "guard" }], []]
  });
  harness.controller.render();
  assert.equal(harness.createdElements.length, 0);
  assert.equal(harness.fragments.length, 1);
  assert.deepEqual(harness.rootState.children, [harness.fragments[0]]);
  assert.equal(harness.rootState.html, undefined);
});

test("ProjectListPresentationController preserves empty and populated failure timing", async () => {
  const { createProjectListPresentationController } = await loadFactory();
  for (const failAt of ["session.getProjects:1", "localization.sourceHtml", "presentation.replaceSafeHtml"]) {
    const failure = new Error(`${failAt} boundary`);
    const harness = createHarness(createProjectListPresentationController, { failAt, failure });
    assert.throws(() => harness.controller.render(), failure);
    assert.equal(harness.fragments.length, 0);
  }

  const project = { id: "project", name: "Name", sourceFileName: "source" };
  for (const failAt of [
    "dom.createDocumentFragment",
    "session.getProjects:2",
    "dom.createElement",
    "session.getProject",
    "text.displaySafeHtml",
    "language.display",
    "text.escapeHtml",
    "presentation.replaceSafeHtml",
    "button.addEventListener",
    "fragment.append",
    "root.replaceChildren"
  ]) {
    const failure = new Error(`${failAt} boundary`);
    const harness = createHarness(createProjectListPresentationController, {
      failAt,
      failure,
      projectReads: [[project], [project]]
    });
    assert.throws(() => harness.controller.render(), failure);
  }
});

test("ProjectListPresentationController validates every boundary and exposes an immutable API", async () => {
  const { createProjectListPresentationController } = await loadFactory();
  const valid = createHarness(createProjectListPresentationController);
  assert.equal(Object.isFrozen(valid.controller), true);
  assert.deepEqual(Object.keys(valid.controller), ["render"]);
  const invalid = [
    undefined,
    {},
    { ...valid.options, root: {} },
    { ...valid.options, session: { ...valid.options.session, getProject: null } },
    { ...valid.options, session: { ...valid.options.session, getProjects: null } },
    { ...valid.options, dom: { ...valid.options.dom, createElement: null } },
    { ...valid.options, dom: { ...valid.options.dom, createDocumentFragment: null } },
    { ...valid.options, text: { ...valid.options.text, displaySafeHtml: null } },
    { ...valid.options, text: { ...valid.options.text, escapeHtml: null } },
    { ...valid.options, language: { display: null } },
    { ...valid.options, localization: { ...valid.options.localization, sourceHtml: null } },
    { ...valid.options, localization: { ...valid.options.localization, labelHtml: null } },
    { ...valid.options, presentation: { replaceSafeHtml: null } },
    { ...valid.options, navigation: { open: null } }
  ];
  invalid.forEach((options) => {
    assert.throws(() => createProjectListPresentationController(options), /ProjectListPresentationController requires/);
  });
});
