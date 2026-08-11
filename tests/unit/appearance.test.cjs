const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const test = require("node:test");

const root = path.resolve(__dirname, "../..");
const moduleAt = (relativePath) => import(pathToFileURL(path.join(root, relativePath)).href);

function preferences(initial = {}) {
  let value = { ...initial };
  return {
    read: () => Promise.resolve({ ...value }),
    patch: (changes) => {
      value = { ...value, ...changes };
      return Promise.resolve(value);
    },
    value: () => value
  };
}

function control() {
  const listeners = new Map();
  return {
    value: "",
    addEventListener(type, listener) {
      listeners.set(type, listener);
    },
    dispatch(type) {
      listeners.get(type)?.();
    }
  };
}

test("theme controller respects existing Light profiles and resolves System preference", async () => {
  const { createThemeController } = await moduleAt("src/ui/theme-controller.js");
  const documentRoot = { dataset: {}, style: {} };
  const themeColorMeta = { content: "" };
  const select = control();
  const media = { matches: true, addEventListener() {}, addListener() {} };
  const repository = preferences();
  const theme = createThemeController({
    documentRoot,
    themeColorMeta,
    select,
    preferencesRepository: repository,
    matchMedia: () => media
  });
  await theme.initialize({ freshProfile: false });
  assert.equal(documentRoot.dataset.theme, "light");
  await theme.setPreference("system");
  assert.equal(documentRoot.dataset.theme, "dark");
  assert.equal(repository.value().theme, "system");
});

test("workspace layout remembers compact density and inspector state", async () => {
  const { createWorkspaceLayoutController } = await moduleAt("src/features/workspace/workspace-layout-controller.js");
  const documentRoot = { dataset: {} };
  const workspace = { dataset: {} };
  const densitySelect = control();
  const repository = preferences({ density: "compact", inspectorOpen: false });
  const inspectorStates = [];
  const layout = createWorkspaceLayoutController({
    documentRoot,
    workspace,
    densitySelect,
    preferencesRepository: repository,
    onInspectorPreference: (value) => inspectorStates.push(value)
  });
  await layout.initialize();
  assert.equal(documentRoot.dataset.density, "compact");
  assert.equal(inspectorStates.at(-1), false);
  await layout.reset();
  assert.deepEqual(layout.getState(), { density: "balanced", inspectorOpen: true, inspectorWidth: 320 });
});

test("workspace inspector width is clamped and persisted", async () => {
  const { createWorkspaceLayoutController } = await moduleAt("src/features/workspace/workspace-layout-controller.js");
  const repository = preferences({ inspectorWidth: 999 });
  const workspace = { dataset: {}, style: { setProperty() {} } };
  const layout = createWorkspaceLayoutController({
    documentRoot: { dataset: {} },
    workspace,
    preferencesRepository: repository
  });
  await layout.initialize();
  assert.equal(layout.getState().inspectorWidth, 420);
  await layout.setInspectorWidth(100);
  assert.equal(layout.getState().inspectorWidth, 280);
  assert.equal(repository.value().inspectorWidth, 280);
});

test("filter presets apply a focused workflow and remember only preset IDs per project", async () => {
  const { createFilterPresetController } = await moduleAt("src/features/editor/filter-preset-controller.js");
  const select = control();
  const repository = preferences();
  const applied = [];
  const inspectorTabs = [];
  const controller = createFilterPresetController({
    select,
    preferencesRepository: repository,
    getProjectId: () => "project-1",
    applyFilters: (preset) => applied.push(preset),
    setInspectorTab: (tab) => inspectorTabs.push(tab)
  });
  await controller.initialize();
  select.value = "review";
  select.dispatch("change");
  await new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
  assert.equal(applied.at(-1).reviewState, "needs-review");
  assert.equal(inspectorTabs.at(-1), "review");
  assert.deepEqual(repository.value().filterPresetByProject, { "project-1": "review" });
  controller.markCustom();
  assert.equal(select.value, "");
  await controller.restoreForProject("project-1");
  assert.equal(select.value, "review");
});
