const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const test = require("node:test");

const root = path.resolve(__dirname, "../..");

function loadFactory() {
  return import(pathToFileURL(path.join(root, "src/features/projects/project-home-presentation-controller.js")).href);
}

function createHarness(createProjectHomePresentationController, overrides = {}) {
  const calls = [];
  const failure = overrides.failure || new Error(`${overrides.failAt || "project-home"} failed`);
  const fail = (name) => {
    if (overrides.failAt === name) throw failure;
  };
  const elements = {
    title: { textContent: "" },
    meta: { textContent: "" },
    stats: { html: "" },
    fileCount: { textContent: "" },
    fileList: {
      html: "",
      children: [],
      replaceChildren(...children) {
        calls.push(["fileList.replaceChildren", ...children]);
        fail("fileList.replaceChildren");
        this.children = children;
      }
    }
  };
  const projectReads = overrides.projectReads || [overrides.project ?? null];
  let projectRead = 0;
  const segments = overrides.segments || [];
  const session = {
    getProject() {
      const project = projectReads[Math.min(projectRead, projectReads.length - 1)];
      projectRead += 1;
      calls.push(["session.getProject", project]);
      fail(`session.getProject:${projectRead}`);
      return project;
    },
    getSegments() {
      calls.push(["session.getSegments", segments]);
      fail("session.getSegments");
      return segments;
    }
  };
  const documentRecords = overrides.documents || [];
  const documents = {
    list() {
      calls.push(["documents.list", documentRecords]);
      fail("documents.list");
      return documentRecords;
    }
  };
  const statsById = overrides.statsById || new Map();
  const total = overrides.total || { percent: 0, words: 0 };
  const emptyStats = overrides.emptyStats || { percent: 0, words: 0, segments: 0, empty: 0, draft: 0 };
  const statistics = {
    byDocument(records) {
      calls.push(["statistics.byDocument", records]);
      fail("statistics.byDocument");
      return statsById;
    },
    aggregate(map) {
      calls.push(["statistics.aggregate", map]);
      fail("statistics.aggregate");
      return total;
    },
    empty() {
      calls.push(["statistics.empty"]);
      fail("statistics.empty");
      return emptyStats;
    }
  };
  const resourceSummary = overrides.resourceSummary || { mainTm: "Main", tmLabel: "2 TMs", tbLabel: "1 TB" };
  const resources = {
    summary() {
      calls.push(["resources.summary", resourceSummary]);
      fail("resources.summary");
      return resourceSummary;
    }
  };
  const language = {
    display() {
      calls.push(["language.display"]);
      fail("language.display");
      return overrides.languageDisplay || "English → Turkish";
    }
  };
  const text = {
    displaySafeText(value, fallback) {
      calls.push(["text.displaySafeText", value, fallback]);
      fail("text.displaySafeText");
      return `safeText:${value || fallback || ""}`;
    },
    displaySafeHtml(value) {
      calls.push(["text.displaySafeHtml", value]);
      fail("text.displaySafeHtml");
      return `safeHtml:${value}`;
    },
    escapeHtml(value) {
      calls.push(["text.escapeHtml", value]);
      fail("text.escapeHtml");
      return `escaped:${value}`;
    }
  };
  const localization = {
    source(value, variables) {
      calls.push(["localization.source", value, variables]);
      fail(`localization.source:${value}`);
      return `source:${value}${variables?.value1 ? `:${variables.value1}` : ""}`;
    },
    label(key, variables) {
      calls.push(["localization.label", key, variables]);
      fail(`localization.label:${key}`);
      return `label:${key}${variables?.count === undefined ? "" : `:${variables.count}`}`;
    },
    sourceHtml(value) {
      calls.push(["localization.sourceHtml", value]);
      fail(`localization.sourceHtml:${value}`);
      return `sourceHtml:${value}`;
    },
    labelHtml(key, variables) {
      calls.push(["localization.labelHtml", key, variables]);
      fail(`localization.labelHtml:${key}`);
      const values = variables ? `:${variables.empty}:${variables.draft}` : "";
      return `labelHtml:${key}${values}`;
    }
  };
  const cards = [];
  const buttons = [];
  const fragments = [];
  const dom = {
    createElement(tagName) {
      calls.push(["dom.createElement", tagName]);
      fail("dom.createElement");
      if (tagName === "article") {
        const progress = { style: { width: "" } };
        const actions = {
          children: [],
          append(...children) {
            calls.push(["actions.append", ...children]);
            fail("actions.append");
            this.children.push(...children);
          }
        };
        const card = {
          className: "",
          html: "",
          progress,
          actions,
          querySelector(selector) {
            calls.push(["card.querySelector", selector]);
            fail(`card.querySelector:${selector}`);
            return selector === ".progress-bar > div" ? progress : actions;
          }
        };
        cards.push(card);
        return card;
      }
      const listeners = new Map();
      const button = {
        className: "",
        type: "",
        textContent: "",
        attributes: {},
        setAttribute(name, value) {
          calls.push(["button.setAttribute", button, name, value]);
          fail("button.setAttribute");
          this.attributes[name] = value;
        },
        addEventListener(type, listener) {
          calls.push(["button.addEventListener", button, type, listener]);
          fail("button.addEventListener");
          listeners.set(type, listener);
        },
        click() {
          return listeners.get("click")?.();
        }
      };
      buttons.push(button);
      return button;
    },
    createDocumentFragment() {
      calls.push(["dom.createDocumentFragment"]);
      fail("dom.createDocumentFragment");
      const fragment = {
        children: [],
        append(child) {
          calls.push(["fragment.append", child]);
          fail("fragment.append");
          this.children.push(child);
        }
      };
      fragments.push(fragment);
      return fragment;
    }
  };
  const presentation = {
    replaceSafeHtml(target, html) {
      calls.push(["presentation.replaceSafeHtml", target, html]);
      fail("presentation.replaceSafeHtml");
      target.html = html;
    }
  };
  const actions = {
    deleteDocument(documentInfo) {
      calls.push(["actions.deleteDocument", documentInfo]);
      fail("actions.deleteDocument");
      return overrides.deleteResult;
    },
    openDocument(documentId) {
      calls.push(["actions.openDocument", documentId]);
      fail("actions.openDocument");
      return overrides.openResult;
    }
  };
  const options = {
    elements,
    session,
    documents,
    statistics,
    resources,
    language,
    text,
    localization,
    dom,
    presentation,
    actions
  };
  return {
    buttons,
    calls,
    cards,
    controller: createProjectHomePresentationController(options),
    elements,
    emptyStats,
    failure,
    fragments,
    options,
    resourceSummary,
    statsById,
    total
  };
}

test("ProjectHomePresentationController preserves the immediate no-project return", async () => {
  const { createProjectHomePresentationController } = await loadFactory();
  const harness = createHarness(createProjectHomePresentationController);
  assert.equal(harness.controller.render(), undefined);
  assert.deepEqual(harness.calls, [["session.getProject", null]]);
});

test("ProjectHomePresentationController preserves summary order and safe project metadata", async () => {
  const { createProjectHomePresentationController } = await loadFactory();
  const project = { id: "p", name: "Name <p>", domain: "Legal" };
  const documents = [{ id: "one" }];
  const harness = createHarness(createProjectHomePresentationController, {
    project,
    documents,
    segments: [{}, {}],
    total: { percent: 75, words: 120 }
  });
  harness.controller.render();
  assert.deepEqual(
    harness.calls.slice(0, 5).map(([name]) => name),
    ["session.getProject", "documents.list", "statistics.byDocument", "statistics.aggregate", "resources.summary"]
  );
  assert.equal(harness.elements.title.textContent, "safeText:Name <p>");
  assert.equal(
    harness.elements.meta.textContent,
    "English → Turkish - safeText:Legal - label:mainTm: safeText:Main - safeText:2 TMs - safeText:1 TB"
  );
  assert.equal(harness.elements.stats.html.includes("<strong>75%</strong>"), true);
  assert.equal(harness.elements.stats.html.includes("<strong>2</strong>"), true);
  assert.equal(harness.elements.stats.html.includes("<strong>120</strong>"), true);
  assert.equal(harness.elements.fileCount.textContent, "label:fileCount:1");
});

test("ProjectHomePresentationController preserves localized empty-file presentation and return", async () => {
  const { createProjectHomePresentationController } = await loadFactory();
  const project = { id: "p", name: "Empty", domain: "" };
  const harness = createHarness(createProjectHomePresentationController, { project, documents: [] });
  harness.controller.render();
  assert.equal(harness.elements.fileCount.textContent, "source:No files imported");
  assert.equal(
    harness.elements.fileList.html,
    '<div class="empty-file-state">sourceHtml:Import a DOCX or other format file to start translating this project.</div>'
  );
  assert.equal(harness.fragments.length, 0);
});

test("ProjectHomePresentationController preserves card statistics and fallback markup", async () => {
  const { createProjectHomePresentationController } = await loadFactory();
  const first = { id: "one", name: "One <file>", type: "docx" };
  const second = { id: "two", name: "Two", type: "" };
  const firstStats = { percent: 60, words: 10, segments: 2, empty: 1, draft: 1 };
  const emptyStats = { percent: 0, words: 0, segments: 0, empty: 0, draft: 0 };
  const harness = createHarness(createProjectHomePresentationController, {
    project: { id: "p", name: "P", domain: "" },
    documents: [first, second],
    statsById: new Map([["one", firstStats]]),
    emptyStats
  });
  harness.controller.render();
  assert.equal(harness.cards[0].className, "file-card");
  assert.equal(harness.cards[0].html.includes("safeHtml:One <file>"), true);
  assert.equal(harness.cards[0].html.includes("escaped:DOCX"), true);
  assert.equal(harness.cards[0].progress.style.width, "60%");
  assert.equal(harness.cards[1].html.includes("escaped:FILE"), true);
  assert.equal(harness.cards[1].progress.style.width, "0%");
  assert.equal(harness.calls.filter(([name]) => name === "statistics.empty").length, 1);
  assert.deepEqual(harness.fragments[0].children, harness.cards);
  assert.deepEqual(harness.elements.fileList.children, [harness.fragments[0]]);
});

test("ProjectHomePresentationController preserves button labels, action order, and listener identities", async () => {
  const { createProjectHomePresentationController } = await loadFactory();
  const documentInfo = { id: "document", name: "Document", type: "txt" };
  const deleteResult = { deleted: true };
  const openResult = { opened: true };
  const harness = createHarness(createProjectHomePresentationController, {
    project: { id: "p", name: "P", domain: "" },
    documents: [documentInfo],
    deleteResult,
    openResult
  });
  harness.controller.render();
  const [deleteButton, openButton] = harness.buttons;
  assert.deepEqual(
    [deleteButton.className, deleteButton.type, deleteButton.textContent, deleteButton.attributes["aria-label"]],
    ["danger-small", "button", "source:Delete", "source:Delete file {value1}:safeText:Document"]
  );
  assert.deepEqual(
    [openButton.className, openButton.type, openButton.textContent, openButton.attributes["aria-label"]],
    ["primary", "button", "source:Open", "source:Open file {value1}:safeText:Document"]
  );
  assert.deepEqual(harness.cards[0].actions.children, [deleteButton, openButton]);
  assert.equal(deleteButton.click(), deleteResult);
  assert.equal(openButton.click(), openResult);
  assert.deepEqual(
    harness.calls.filter(([name]) => name === "actions.deleteDocument" || name === "actions.openDocument"),
    [
      ["actions.deleteDocument", documentInfo],
      ["actions.openDocument", "document"]
    ]
  );
});

test("ProjectHomePresentationController preserves repeated live project reads", async () => {
  const { createProjectHomePresentationController } = await loadFactory();
  const guard = { id: "p", name: "Guard", domain: "Guard domain" };
  const title = { id: "p", name: "Title", domain: "Title domain" };
  const meta = { id: "p", name: "Meta", domain: "Meta domain" };
  const harness = createHarness(createProjectHomePresentationController, {
    projectReads: [guard, title, meta],
    documents: []
  });
  harness.controller.render();
  assert.equal(harness.elements.title.textContent, "safeText:Title");
  assert.equal(harness.elements.meta.textContent.includes("safeText:Meta domain"), true);
  assert.equal(harness.calls.filter(([name]) => name === "session.getProject").length, 3);
});

test("ProjectHomePresentationController preserves representative failure timing", async () => {
  const { createProjectHomePresentationController } = await loadFactory();
  const project = { id: "p", name: "P", domain: "" };
  for (const failAt of [
    "session.getProject:1",
    "documents.list",
    "statistics.byDocument",
    "statistics.aggregate",
    "resources.summary",
    "text.displaySafeText",
    "session.getSegments",
    "presentation.replaceSafeHtml"
  ]) {
    const failure = new Error(`${failAt} boundary`);
    const harness = createHarness(createProjectHomePresentationController, { failAt, failure, project });
    assert.throws(() => harness.controller.render(), failure);
  }
  for (const failAt of [
    "dom.createDocumentFragment",
    "dom.createElement",
    "statistics.empty",
    "card.querySelector:.progress-bar > div",
    "button.setAttribute",
    "button.addEventListener",
    "card.querySelector:.file-card-actions",
    "actions.append",
    "fragment.append",
    "fileList.replaceChildren"
  ]) {
    const failure = new Error(`${failAt} boundary`);
    const harness = createHarness(createProjectHomePresentationController, {
      failAt,
      failure,
      project,
      documents: [{ id: "one", name: "One", type: "txt" }]
    });
    assert.throws(() => harness.controller.render(), failure);
  }
});

test("ProjectHomePresentationController validates every owner and exposes an immutable API", async () => {
  const { createProjectHomePresentationController } = await loadFactory();
  const valid = createHarness(createProjectHomePresentationController);
  assert.equal(Object.isFrozen(valid.controller), true);
  assert.deepEqual(Object.keys(valid.controller), ["render"]);
  assert.throws(() => createProjectHomePresentationController(), TypeError);
  for (const options of [
    { ...valid.options, elements: { ...valid.options.elements, title: null } },
    { ...valid.options, elements: { ...valid.options.elements, fileList: {} } },
    { ...valid.options, session: { ...valid.options.session, getProject: null } },
    { ...valid.options, documents: { list: null } },
    { ...valid.options, statistics: { ...valid.options.statistics, byDocument: null } },
    { ...valid.options, resources: { summary: null } },
    { ...valid.options, language: { display: null } },
    { ...valid.options, text: { ...valid.options.text, displaySafeHtml: null } },
    { ...valid.options, localization: { ...valid.options.localization, sourceHtml: null } },
    { ...valid.options, dom: { ...valid.options.dom, createElement: null } },
    { ...valid.options, presentation: { replaceSafeHtml: null } },
    { ...valid.options, actions: { ...valid.options.actions, openDocument: null } }
  ]) {
    assert.throws(() => createProjectHomePresentationController(options), TypeError);
  }
});
