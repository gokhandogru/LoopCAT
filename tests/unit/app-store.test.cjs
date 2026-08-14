const assert = require("node:assert/strict");
const { pathToFileURL } = require("node:url");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "../..");

function moduleAt(relativePath) {
  return import(pathToFileURL(path.join(root, relativePath)).href);
}

test("AppStore getState exposes stable defaults and latest snapshot references", async () => {
  const { createAppStore } = await moduleAt("src/app/app-store.js");
  const store = createAppStore();
  const getState = store.getState;
  const initial = getState();

  assert.equal(getState, store.getState);
  assert.equal(getState(), initial);
  assert.deepEqual(initial, {
    navigation: { view: "projects", projectId: null, documentId: "", segmentId: "", activeIndex: -1 },
    interface: { locale: "", focusMode: false }
  });

  store.dispatch({ type: "navigation/changed", payload: { view: "editor", projectId: "project-1" } });
  const latest = getState();
  assert.notEqual(latest, initial);
  assert.equal(getState(), latest);
  assert.equal(latest.navigation.view, "editor");
  assert.equal(latest.navigation.projectId, "project-1");
});

test("AppStore normalizes navigation and clears focus mode outside the editor", async () => {
  const { createAppStore } = await moduleAt("src/app/app-store.js");
  const store = createAppStore({ navigation: { view: "editor", projectId: "project-1" } });
  store.dispatch({ type: "interface/focus-mode-changed", payload: { enabled: true } });
  assert.equal(store.getState().interface.focusMode, true);

  store.dispatch({ type: "navigation/changed", payload: { view: "projects" } });
  assert.equal(store.getState().navigation.view, "projects");
  assert.equal(store.getState().interface.focusMode, false);
});

test("AppStore subscriptions receive explicit actions and can unsubscribe", async () => {
  const { createAppStore } = await moduleAt("src/app/app-store.js");
  const store = createAppStore();
  const actions = [];
  const unsubscribe = store.subscribe((_next, _previous, action) => actions.push(action.type));
  store.dispatch({ type: "interface/locale-changed", payload: { locale: "tr-TR" } });
  unsubscribe();
  store.dispatch({ type: "interface/locale-changed", payload: { locale: "ca-ES" } });
  assert.deepEqual(actions, ["interface/locale-changed"]);
});

test("NavigationController emits stable domain events", async () => {
  const [{ createAppStore }, { createApplicationEvents, APPLICATION_EVENTS }, { createNavigationController }] =
    await Promise.all([
      moduleAt("src/app/app-store.js"),
      moduleAt("src/app/events.js"),
      moduleAt("src/app/navigation-controller.js")
    ]);
  const store = createAppStore();
  const events = createApplicationEvents();
  const navigation = createNavigationController({ store, events });
  const opened = [];
  events.on(APPLICATION_EVENTS.PROJECT_OPENED, (detail) => opened.push(detail.projectId));

  navigation.openProject("project-1", 0);
  navigation.openEditor({ projectId: "project-1", documentId: "file-1", segmentId: "segment-1", activeIndex: 3 });
  navigation.selectSegment({ segmentId: "segment-2", activeIndex: 4 });

  assert.deepEqual(opened, ["project-1"]);
  assert.deepEqual(store.getState().navigation, {
    view: "editor",
    projectId: "project-1",
    documentId: "file-1",
    segmentId: "segment-2",
    activeIndex: 4
  });
});

test("navigation flow preserves stable identity across Projects, dashboard, editor, and segment selection", async () => {
  const [{ createAppStore }, { createApplicationEvents }, { createNavigationController }] = await Promise.all([
    moduleAt("src/app/app-store.js"),
    moduleAt("src/app/events.js"),
    moduleAt("src/app/navigation-controller.js")
  ]);
  const store = createAppStore();
  const navigation = createNavigationController({ store, events: createApplicationEvents() });

  assert.deepEqual(store.getState().navigation, {
    view: "projects",
    projectId: null,
    documentId: "",
    segmentId: "",
    activeIndex: -1
  });

  navigation.openProject("project-1", 0);
  assert.deepEqual(store.getState().navigation, {
    view: "project",
    projectId: "project-1",
    documentId: "",
    segmentId: "",
    activeIndex: 0
  });

  navigation.openEditor({
    projectId: "project-1",
    documentId: "document-1",
    segmentId: "segment-1",
    activeIndex: 2
  });
  navigation.selectSegment({ segmentId: "segment-2", activeIndex: 3 });
  assert.deepEqual(store.getState().navigation, {
    view: "editor",
    projectId: "project-1",
    documentId: "document-1",
    segmentId: "segment-2",
    activeIndex: 3
  });

  navigation.openProjects();
  assert.equal(store.getState().navigation.view, "projects");
  assert.equal(store.getState().navigation.projectId, "project-1");
  assert.equal(store.getState().navigation.documentId, "document-1");
  assert.equal(store.getState().navigation.segmentId, "segment-2");
});

test("restored navigation is normalized and Focus mode remains editor-only", async () => {
  const { createAppStore } = await moduleAt("src/app/app-store.js");
  const store = createAppStore({
    navigation: {
      view: "editor",
      projectId: "project-restored",
      documentId: "document-restored",
      segmentId: "segment-restored",
      activeIndex: 7
    },
    interface: { focusMode: true, locale: "tr-TR" }
  });

  assert.deepEqual(store.getState(), {
    navigation: {
      view: "editor",
      projectId: "project-restored",
      documentId: "document-restored",
      segmentId: "segment-restored",
      activeIndex: 7
    },
    interface: { focusMode: true, locale: "tr-TR" }
  });

  store.dispatch({ type: "navigation/changed", payload: { view: "project" } });
  assert.equal(store.getState().interface.focusMode, false);
  store.dispatch({ type: "interface/focus-mode-changed", payload: { enabled: true } });
  assert.equal(store.getState().interface.focusMode, false);
});

test("legacy navigation synchronization is characterized before writer migration", async () => {
  const [{ createAppStore }, { createApplicationEvents }, { createNavigationController }] = await Promise.all([
    moduleAt("src/app/app-store.js"),
    moduleAt("src/app/events.js"),
    moduleAt("src/app/navigation-controller.js")
  ]);
  const store = createAppStore();
  const navigation = createNavigationController({ store, events: createApplicationEvents() });

  const synchronized = navigation.syncLegacy({
    view: "editor",
    projectId: "legacy-project",
    documentId: "legacy-document",
    segmentId: "legacy-segment",
    activeIndex: 5
  });

  assert.deepEqual(synchronized, {
    view: "editor",
    projectId: "legacy-project",
    documentId: "legacy-document",
    segmentId: "legacy-segment",
    activeIndex: 5
  });
  assert.deepEqual(store.getState().navigation, synchronized);
});

test("NavigationController owns document and project selection identity", async () => {
  const [{ createAppStore }, { createApplicationEvents }, { createNavigationController }] = await Promise.all([
    moduleAt("src/app/app-store.js"),
    moduleAt("src/app/events.js"),
    moduleAt("src/app/navigation-controller.js")
  ]);
  const store = createAppStore();
  const navigation = createNavigationController({ store, events: createApplicationEvents() });

  navigation.openEditor({
    projectId: "project-1",
    documentId: "document-1",
    segmentId: "segment-1",
    activeIndex: 2
  });
  navigation.selectDocument({ documentId: "document-2", segmentId: "segment-5", activeIndex: 6 });
  assert.deepEqual(store.getState().navigation, {
    view: "editor",
    projectId: "project-1",
    documentId: "document-2",
    segmentId: "segment-5",
    activeIndex: 6
  });

  navigation.clearSelection();
  assert.deepEqual(store.getState().navigation, {
    view: "editor",
    projectId: null,
    documentId: "",
    segmentId: "",
    activeIndex: -1
  });
});

test("NavigationController preserves selection defaults, returns, and segment events", async () => {
  const [{ createAppStore }, { createApplicationEvents, APPLICATION_EVENTS }, { createNavigationController }] =
    await Promise.all([
      moduleAt("src/app/app-store.js"),
      moduleAt("src/app/events.js"),
      moduleAt("src/app/navigation-controller.js")
    ]);
  const store = createAppStore();
  const events = createApplicationEvents();
  const navigation = createNavigationController({ store, events });
  const selected = [];
  events.on(APPLICATION_EVENTS.SEGMENT_SELECTED, (value) => selected.push(value));

  navigation.openEditor({
    projectId: "project-1",
    documentId: "document-1",
    segmentId: "segment-1",
    activeIndex: 2
  });
  const segmentSelection = navigation.selectSegment({ activeIndex: 4 });
  assert.equal(segmentSelection, store.getState().navigation);
  assert.deepEqual(segmentSelection, {
    view: "editor",
    projectId: "project-1",
    documentId: "document-1",
    segmentId: "",
    activeIndex: 4
  });
  assert.deepEqual(selected, [segmentSelection]);

  navigation.openEditor({
    projectId: "project-1",
    documentId: "document-1",
    segmentId: "segment-2",
    activeIndex: 3
  });
  const documentSelection = navigation.selectDocument({ documentId: "document-2" });
  assert.equal(documentSelection, store.getState().navigation);
  assert.equal(documentSelection.segmentId, "segment-2");
  assert.equal(documentSelection.activeIndex, 3);

  const clearedDocument = navigation.selectDocument({ documentId: "", segmentId: "", activeIndex: -1 });
  assert.deepEqual(clearedDocument, {
    view: "editor",
    projectId: "project-1",
    documentId: "",
    segmentId: "",
    activeIndex: -1
  });
  const synchronized = navigation.syncLegacy({
    view: "project",
    projectId: "project-2",
    documentId: "document-3",
    segmentId: "segment-3",
    activeIndex: 7
  });
  assert.equal(synchronized, store.getState().navigation);
  assert.equal(synchronized.view, "project");
});

test("PreferencesRepository ignores unknown versions and stores only its scoped record", async () => {
  const { createPreferencesRepository } = await moduleAt("src/data/preferences-repository.js");
  const records = new Map([["modernization.preferences", { key: "modernization.preferences", version: 99 }]]);
  const repository = createPreferencesRepository({
    get(_store, key) {
      return Promise.resolve(records.get(key));
    },
    put(_store, value) {
      records.set(value.key, value);
      return Promise.resolve(value);
    }
  });
  assert.deepEqual(await repository.read(), {});
  await repository.write({ density: "balanced" });
  assert.deepEqual(await repository.read(), { density: "balanced" });
  await Promise.all([repository.patch({ theme: "dark" }), repository.patch({ inspectorOpen: false })]);
  assert.deepEqual(await repository.read(), { density: "balanced", theme: "dark", inspectorOpen: false });
});
