const assert = require("node:assert/strict");
const test = require("node:test");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const load = () => import(pathToFileURL(path.resolve(__dirname, "../../src/ui/collection-view-controller.js")).href);

function harness(createController, { failure = null } = {}) {
  const attributes = new Map();
  const writes = [];
  const errors = [];
  let focused = null;
  const groups = [
    "projects",
    "files",
    "resources",
    "resource-entries",
    "resource-entries",
    "resource-selection",
    "trash"
  ].map((scope) => {
    const buttons = ["card", "list"].map((mode) => {
      const handlers = new Map();
      return {
        dataset: { viewMode: mode },
        attributes: new Map(),
        setAttribute(name, value) {
          this.attributes.set(name, value);
        },
        addEventListener(name, listener) {
          handlers.set(name, listener);
        },
        removeEventListener(name, listener) {
          if (handlers.get(name) === listener) handlers.delete(name);
        },
        dispatch(name, event = {}) {
          handlers.get(name)?.(event);
        },
        focus() {
          focused = this;
        }
      };
    });
    return { dataset: { collectionScope: scope }, buttons, querySelectorAll: () => buttons };
  });
  const documentRoot = {
    documentElement: { setAttribute: (name, value) => attributes.set(name, value) },
    querySelectorAll: () => groups
  };
  const controller = createController({
    documentRoot,
    preferencesRepository: {
      patch: (patch) => {
        writes.push(patch);
        return failure ? Promise.reject(failure) : Promise.resolve();
      }
    },
    onError: (error) => errors.push(error)
  });
  return { controller, attributes, groups, writes, errors, documentRoot, focused: () => focused };
}

test("collection views preserve defaults and restore only valid independent preferences", async () => {
  const { createCollectionViewController, DEFAULT_COLLECTION_VIEWS } = await load();
  const h = harness(createCollectionViewController);
  assert.equal(
    h.controller.initialize({
      collectionViews: { projects: "list", files: "invalid", resources: "card", unknown: "list" }
    }),
    true
  );
  assert.equal(h.controller.initialize({ collectionViews: { projects: "card" } }), false);
  assert.deepEqual(h.controller.getState(), { ...DEFAULT_COLLECTION_VIEWS, projects: "list" });
  assert.equal(h.attributes.get("data-projects-view"), "list");
  assert.equal(h.attributes.get("data-files-view"), "card");
  assert.equal(h.attributes.get("data-resource-entries-view"), "list");
  assert.equal(h.groups[0].buttons[1].attributes.get("aria-pressed"), "true");
  assert.equal(h.writes.length, 0);
});

test("collection view switching preserves other preferences and synchronizes both resource entry controls", async () => {
  const { createCollectionViewController } = await load();
  const h = harness(createCollectionViewController);
  h.controller.initialize();
  await h.controller.setView("projects", "list");
  await h.controller.setView("resource-entries", "card");
  for (const index of [3, 4]) {
    assert.equal(h.groups[index].buttons[0].attributes.get("aria-pressed"), "true");
    assert.equal(h.groups[index].buttons[1].attributes.get("aria-pressed"), "false");
  }
  assert.equal(h.writes.at(-1).collectionViews.projects, "list");
  assert.equal(h.writes.at(-1).collectionViews.files, "card");
  assert.equal(await h.controller.setView("unknown", "list"), false);
  assert.equal(await h.controller.setView("projects", "unexpected"), false);
  assert.equal(h.writes.length, 2);
  const reloaded = harness(createCollectionViewController);
  reloaded.controller.initialize(h.writes.at(-1));
  assert.deepEqual(reloaded.controller.getState(), h.controller.getState());
});

test("collection view buttons support arrows/Home/End without changing tab focus elsewhere", async () => {
  const { createCollectionViewController } = await load();
  const h = harness(createCollectionViewController);
  h.controller.initialize();
  const [card, list] = h.groups[0].buttons;
  let prevented = 0;
  card.dispatch("keydown", { key: "ArrowRight", preventDefault: () => prevented++ });
  assert.equal(h.focused(), list);
  assert.equal(h.controller.getState().projects, "list");
  list.dispatch("keydown", { key: "Home", preventDefault: () => prevented++ });
  assert.equal(h.focused(), card);
  card.dispatch("keydown", { key: "End", preventDefault: () => prevented++ });
  assert.equal(h.focused(), list);
  list.dispatch("keydown", { key: "Tab", preventDefault: () => prevented++ });
  assert.equal(prevented, 3);
  card.dispatch("click");
  assert.equal(h.controller.getState().projects, "card");
  h.controller.dispose();
  list.dispatch("click");
  assert.equal(h.controller.getState().projects, "card");
});

test("collection preferences report failed persistence while keeping the selected view usable and reset defaults", async () => {
  const { createCollectionViewController, DEFAULT_COLLECTION_VIEWS } = await load();
  const failure = new Error("Disk unavailable");
  const h = harness(createCollectionViewController, { failure });
  h.controller.initialize();
  h.groups[0].buttons[1].dispatch("click");
  await new Promise((resolve) => {
    setImmediate(resolve);
  });
  assert.equal(h.controller.getState().projects, "list");
  assert.deepEqual(h.errors, [failure]);
  const healthy = harness(createCollectionViewController);
  healthy.controller.initialize({ collectionViews: { projects: "list", trash: "card" } });
  await healthy.controller.reset();
  assert.deepEqual(healthy.controller.getState(), DEFAULT_COLLECTION_VIEWS);
  assert.deepEqual(healthy.writes.at(-1), { collectionViews: DEFAULT_COLLECTION_VIEWS });
});

test("resetting layout does not overwrite a newer collection choice while preference writes are pending", async () => {
  const { createCollectionViewController } = await load();
  const { createWorkspaceLayoutController } = await import(
    pathToFileURL(path.resolve(__dirname, "../../src/features/workspace/workspace-layout-controller.js")).href
  );
  const h = harness(createCollectionViewController);
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  let stored = { collectionViews: { projects: "list" } };
  let tail = Promise.resolve();
  let count = 0;
  const preferencesRepository = {
    read: () => Promise.resolve(stored),
    patch: (changes) => {
      const wait = ++count === 1 ? gate : Promise.resolve();
      tail = tail
        .then(() => wait)
        .then(() => {
          stored = { ...stored, ...changes };
        });
      return tail;
    }
  };
  const layout = createWorkspaceLayoutController({
    documentRoot: { dataset: {} },
    collectionDocument: h.documentRoot,
    workspace: { dataset: {} },
    preferencesRepository
  });
  await layout.initialize();
  const resetting = layout.reset();
  assert.equal(h.attributes.get("data-projects-view"), "card");
  h.groups[0].buttons[1].dispatch("click");
  assert.equal(h.attributes.get("data-projects-view"), "list");
  release();
  await resetting;
  await tail;
  assert.equal(h.attributes.get("data-projects-view"), "list");
  assert.equal(stored.collectionViews.projects, "list");
});
