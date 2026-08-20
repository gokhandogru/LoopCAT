const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const test = require("node:test");

const root = path.resolve(__dirname, "../..");

function loadFactory() {
  return import(pathToFileURL(path.join(root, "src/app/application-trash-controller.js")).href);
}

function createNode(tagName, calls) {
  return {
    tagName,
    className: "",
    textContent: "",
    type: "",
    attributes: new Map(),
    children: [],
    listeners: new Map(),
    setAttribute(name, value) {
      calls.push(["node.setAttribute", tagName, name, value]);
      this.attributes.set(name, value);
    },
    addEventListener(type, listener) {
      calls.push(["node.addEventListener", tagName, type, listener]);
      this.listeners.set(type, listener);
    },
    append(...children) {
      calls.push(["node.append", tagName, children]);
      this.children.push(...children);
    }
  };
}

function createHarness(createApplicationTrashController, overrides = {}) {
  const calls = [];
  const created = [];
  let entries = overrides.entries || [];
  const failure = overrides.failure || new Error(`${overrides.failAt || "Trash"} failed`);
  const fail = (name) => {
    if (overrides.failAt === name) throw failure;
  };
  const reject = (name) => {
    if (overrides.failAt === name) return Promise.reject(failure);
    return null;
  };
  const summaryButton = overrides.noSummaryButton
    ? null
    : {
        textContent: "",
        attributes: new Map(),
        setAttribute(name, value) {
          calls.push(["elements.summaryButton.setAttribute", name, value]);
          this.attributes.set(name, value);
        }
      };
  const list = overrides.noList
    ? null
    : {
        children: [],
        replaceChildren(...children) {
          calls.push(["elements.list.replaceChildren", children]);
          this.children = children;
        }
      };
  const emptyButton = overrides.noList ? null : { disabled: false };
  const elements = { summaryButton, list, emptyButton };
  const repository = overrides.noRepository
    ? null
    : {
        list() {
          calls.push(["repository.list"]);
          return reject("repository.list") || Promise.resolve(entries);
        },
        restore(entryId) {
          calls.push(["repository.restore", entryId]);
          return (
            reject("repository.restore") ||
            Promise.resolve(
              overrides.restoredEntry || {
                id: entryId,
                entityType: "project",
                label: "Restored project"
              }
            )
          );
        },
        emptyAll() {
          calls.push(["repository.emptyAll"]);
          const rejected = reject("repository.emptyAll");
          if (rejected) return rejected;
          entries = [];
          return Promise.resolve();
        }
      };
  const projects = {
    load(selectFirst) {
      calls.push(["projects.load", selectFirst]);
      return reject("projects.load") || Promise.resolve();
    }
  };
  const commandHistory = {
    synchronize(entry, options) {
      calls.push(["commandHistory.synchronize", entry, options]);
      return reject("commandHistory.synchronize") || Promise.resolve(overrides.synchronizeResult ?? true);
    },
    render() {
      calls.push(["commandHistory.render"]);
      fail("commandHistory.render");
    }
  };
  const dialog = {
    open() {
      calls.push(["dialog.open"]);
      fail("dialog.open");
      return overrides.dialogResult;
    }
  };
  const localization = {
    source(value, variables) {
      calls.push(["localization.source", value, variables]);
      fail("localization.source");
      if (!variables) return `localized:${value}`;
      return `localized:${value}:${JSON.stringify(variables)}`;
    },
    confirm(value) {
      calls.push(["localization.confirm", value]);
      fail("localization.confirm");
      return overrides.confirmed ?? true;
    }
  };
  const text = {
    safe(value, fallback) {
      calls.push(["text.safe", value, fallback]);
      fail("text.safe");
      return value ? `safe:${value}` : fallback;
    }
  };
  const date = {
    format(value) {
      calls.push(["date.format", value]);
      fail("date.format");
      return `date:${value}`;
    }
  };
  const dom = {
    createElement(tagName) {
      calls.push(["dom.createElement", tagName]);
      fail("dom.createElement");
      const node = createNode(tagName, calls);
      created.push(node);
      return node;
    },
    createFragment() {
      calls.push(["dom.createFragment"]);
      fail("dom.createFragment");
      const node = createNode("fragment", calls);
      created.push(node);
      return node;
    }
  };
  const status = {
    set(...args) {
      calls.push(["status.set", ...args]);
      fail("status.set");
    }
  };
  const controller = createApplicationTrashController({
    elements,
    repository,
    projects,
    commandHistory,
    dialog,
    localization,
    text,
    date,
    dom,
    status
  });
  return {
    calls,
    commandHistory,
    controller,
    created,
    date,
    dialog,
    dom,
    elements,
    localization,
    projects,
    repository,
    status,
    text
  };
}

test("ApplicationTrashController preserves optional summary and repository guards with immutable API", async () => {
  const { createApplicationTrashController } = await loadFactory();
  const missingButton = createHarness(createApplicationTrashController, { noSummaryButton: true });
  assert.equal(Object.isFrozen(missingButton.controller), true);
  assert.deepEqual(await missingButton.controller.renderSummary(), []);
  assert.deepEqual(missingButton.calls, []);

  const missingRepository = createHarness(createApplicationTrashController, { noRepository: true });
  assert.deepEqual(await missingRepository.controller.renderSummary(), []);
  assert.deepEqual(missingRepository.calls, []);
});

test("ApplicationTrashController preserves empty and populated localized summary presentation", async () => {
  const { createApplicationTrashController } = await loadFactory();
  const empty = createHarness(createApplicationTrashController);
  assert.deepEqual(await empty.controller.renderSummary(), []);
  assert.equal(empty.elements.summaryButton.textContent, "localized:Trash");
  assert.equal(
    empty.elements.summaryButton.attributes.get("aria-label"),
    'localized:Trash, {value1} item(s):{"value1":0}'
  );

  const entries = [{ id: "one" }, { id: "two" }];
  const populated = createHarness(createApplicationTrashController, { entries });
  assert.equal(await populated.controller.renderSummary(), entries);
  assert.equal(populated.elements.summaryButton.textContent, 'localized:Trash ({value1}):{"value1":2}');
  assert.equal(
    populated.elements.summaryButton.attributes.get("aria-label"),
    'localized:Trash, {value1} item(s):{"value1":2}'
  );
});

test("ApplicationTrashController preserves absent-list and localized empty-list branches", async () => {
  const { createApplicationTrashController } = await loadFactory();
  const entries = [{ id: "one" }];
  const absent = createHarness(createApplicationTrashController, { entries, noList: true });
  assert.equal(await absent.controller.renderList(), entries);
  assert.equal(
    absent.calls.some(([name]) => name === "dom.createElement"),
    false
  );

  const empty = createHarness(createApplicationTrashController);
  assert.deepEqual(await empty.controller.renderList(), []);
  assert.equal(empty.elements.list.children.length, 1);
  assert.equal(empty.elements.list.children[0].tagName, "div");
  assert.equal(empty.elements.list.children[0].className, "muted");
  assert.equal(
    empty.elements.list.children[0].textContent,
    "localized:Trash is empty. Deleted projects, files, memories, and termbases will appear here."
  );
  assert.equal(empty.elements.emptyButton.disabled, true);
});

test("ApplicationTrashController renders every safe entity label and one restore listener", async () => {
  const { createApplicationTrashController } = await loadFactory();
  const entries = [
    { id: "document", entityType: "document", label: "File", deletedAt: "d1" },
    { id: "project", entityType: "project", label: "Project", deletedAt: "d2" },
    { id: "tm", entityType: "translation-memory", resourceType: "tm", label: "Memory", deletedAt: "d3" },
    { id: "tb", entityType: "termbase", resourceType: "tb", label: "Terms", deletedAt: "d4" }
  ];
  const harness = createHarness(createApplicationTrashController, { entries });
  assert.equal(await harness.controller.renderList(), entries);
  const fragment = harness.elements.list.children[0];
  assert.equal(fragment.tagName, "fragment");
  assert.equal(fragment.children.length, 4);
  assert.equal(harness.elements.emptyButton.disabled, false);

  const expectedLabels = ["Project file", "Project", "Translation memory", "Termbase"];
  fragment.children.forEach((item, index) => {
    assert.equal(item.tagName, "article");
    assert.equal(item.className, "trash-item");
    const [copy, actions] = item.children;
    const [title, meta] = copy.children;
    const restoreButton = actions.children[0];
    assert.equal(title.textContent, `safe:${entries[index].label}`);
    assert.equal(meta.textContent, `localized:${expectedLabels[index]} · date:d${index + 1}`);
    assert.equal(restoreButton.type, "button");
    assert.equal(restoreButton.textContent, "localized:Restore");
    assert.equal(typeof restoreButton.listeners.get("click"), "function");
  });
});

test("ApplicationTrashController restore preserves project, resource, list, status, and controls order", async () => {
  const { createApplicationTrashController } = await loadFactory();
  const entry = { id: "trash-1", entityType: "term", resourceType: "tb", label: "Terms" };
  const harness = createHarness(createApplicationTrashController, {
    entries: [entry],
    restoredEntry: entry
  });
  assert.equal(await harness.controller.restore("trash-1"), true);
  const orderedNames = harness.calls.map(([name]) => name);
  for (const [before, after] of [
    ["repository.restore", "projects.load"],
    ["projects.load", "commandHistory.synchronize"],
    ["commandHistory.synchronize", "repository.list"],
    ["elements.list.replaceChildren", "status.set"],
    ["status.set", "commandHistory.render"]
  ]) {
    assert.equal(orderedNames.indexOf(before) < orderedNames.lastIndexOf(after), true, `${before} before ${after}`);
  }
  assert.deepEqual(
    harness.calls.find(([name]) => name === "commandHistory.synchronize"),
    ["commandHistory.synchronize", entry, { refreshSuggestions: true }]
  );
  assert.deepEqual(
    harness.calls.find(([name]) => name === "status.set"),
    ["status.set", "Terms restored from Trash", "saved"]
  );

  const fallback = createHarness(createApplicationTrashController, {
    restoredEntry: { id: "trash-2", entityType: "project", label: "" }
  });
  assert.equal(await fallback.controller.restore("trash-2"), true);
  assert.deepEqual(
    fallback.calls.find(([name]) => name === "status.set"),
    ["status.set", "Item restored from Trash", "saved"]
  );
});

test("ApplicationTrashController restore buttons preserve entry identity and promise results", async () => {
  const { createApplicationTrashController } = await loadFactory();
  const entry = { id: "trash-button", entityType: "project", label: "Project" };
  const harness = createHarness(createApplicationTrashController, { entries: [entry], restoredEntry: entry });
  await harness.controller.renderList();
  const restoreButton = harness.elements.list.children[0].children[0].children[1].children[0];
  const result = restoreButton.listeners.get("click")({ type: "click" });
  assert.equal(result instanceof Promise, true);
  assert.equal(await result, true);
  assert.deepEqual(
    harness.calls.find(([name]) => name === "repository.restore"),
    ["repository.restore", "trash-button"]
  );
});

test("ApplicationTrashController contains every primary restore failure with preservation status", async () => {
  const { createApplicationTrashController } = await loadFactory();
  for (const failAt of [
    "repository.restore",
    "projects.load",
    "commandHistory.synchronize",
    "repository.list",
    "localization.source",
    "dom.createFragment",
    "commandHistory.render"
  ]) {
    const failure = new Error(`${failAt} failed`);
    const harness = createHarness(createApplicationTrashController, {
      entries: [{ id: "one", entityType: "project" }],
      failAt,
      failure
    });
    assert.equal(await harness.controller.restore("one"), false);
    assert.deepEqual(harness.calls.at(-1), ["status.set", failure.message, "dirty"]);
  }
});

test("ApplicationTrashController preserves optional dialog fulfillment, fallback, and rejection", async () => {
  const { createApplicationTrashController } = await loadFactory();
  const value = { opened: true };
  const opened = createHarness(createApplicationTrashController, { dialogResult: value });
  assert.equal(await opened.controller.open(), value);
  assert.deepEqual(opened.calls, [["dialog.open"]]);

  const absent = createHarness(createApplicationTrashController, { dialogResult: undefined });
  assert.equal(await absent.controller.open(), false);

  const failure = new Error("dialog failed");
  const failed = createHarness(createApplicationTrashController, { failAt: "dialog.open", failure });
  await assert.rejects(failed.controller.open(), failure);
});

test("ApplicationTrashController preserves permanent-empty guards and exact success sequence", async () => {
  const { createApplicationTrashController } = await loadFactory();
  const noEntries = createHarness(createApplicationTrashController);
  assert.equal(await noEntries.controller.empty(), false);
  assert.deepEqual(noEntries.calls, [["repository.list"]]);

  const canceled = createHarness(createApplicationTrashController, { entries: [{ id: "one" }], confirmed: false });
  assert.equal(await canceled.controller.empty(), false);
  assert.equal(
    canceled.calls.some(([name]) => name === "repository.emptyAll"),
    false
  );

  const emptied = createHarness(createApplicationTrashController, { entries: [{ id: "one" }] });
  assert.equal(await emptied.controller.empty(), true);
  assert.deepEqual(
    emptied.calls.filter(([name]) =>
      ["repository.list", "localization.confirm", "repository.emptyAll", "status.set"].includes(name)
    ),
    [
      ["repository.list"],
      ["localization.confirm", "Permanently delete every item in Trash? This cannot be undone."],
      ["repository.emptyAll"],
      ["repository.list"],
      ["status.set", "Trash emptied permanently", "saved"]
    ]
  );
  assert.equal(emptied.elements.emptyButton.disabled, true);
});

test("ApplicationTrashController propagates permanent-empty and rendering failures in order", async () => {
  const { createApplicationTrashController } = await loadFactory();
  for (const failAt of [
    "repository.list",
    "localization.confirm",
    "repository.emptyAll",
    "localization.source",
    "dom.createElement",
    "status.set"
  ]) {
    const failure = new Error(`${failAt} failed`);
    const harness = createHarness(createApplicationTrashController, {
      entries: [{ id: "one" }],
      failAt,
      failure
    });
    await assert.rejects(harness.controller.empty(), failure);
  }
});

test("ApplicationTrashController validates every injected owner and present optional element", async () => {
  const { createApplicationTrashController } = await loadFactory();
  const valid = createHarness(createApplicationTrashController);
  const create = (changes = {}) =>
    createApplicationTrashController({
      elements: valid.elements,
      repository: valid.repository,
      projects: valid.projects,
      commandHistory: valid.commandHistory,
      dialog: valid.dialog,
      localization: valid.localization,
      text: valid.text,
      date: valid.date,
      dom: valid.dom,
      status: valid.status,
      ...changes
    });
  for (const changes of [
    { elements: null },
    { elements: { summaryButton: {}, list: null, emptyButton: null } },
    { elements: { summaryButton: null, list: {}, emptyButton: {} } },
    { elements: { summaryButton: null, list: valid.elements.list, emptyButton: null } },
    { repository: {} },
    { projects: {} },
    { commandHistory: {} },
    { dialog: {} },
    { localization: {} },
    { text: {} },
    { date: {} },
    { dom: {} },
    { status: {} }
  ]) {
    assert.throws(() => create(changes), /ApplicationTrashController requires/);
  }
  assert.doesNotThrow(() => create({ repository: null }));
});
