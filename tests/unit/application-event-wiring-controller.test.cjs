const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const test = require("node:test");

const root = path.resolve(__dirname, "../..");
const lifecycleNames = [
  "applicationMenu",
  "globalKeyboard",
  "applicationView",
  "commandButtons",
  "updateControls",
  "uiLocaleControls",
  "projectHome",
  "focusMode",
  "inspectorToggle",
  "projectFilterControls",
  "segmentActionButtons",
  "projectQa",
  "panelToggle",
  "editorFilterControls",
  "termForm",
  "projectDomain",
  "applicationPersistence"
];

function loadFactory() {
  return import(pathToFileURL(path.join(root, "src/app/application-event-wiring-controller.js")).href);
}

function createDependencies(overrides = {}) {
  const calls = [];
  let scrollListener = null;
  const lifecycles = Object.fromEntries(
    lifecycleNames.map((name) => {
      const lifecycle = {
        mount() {
          calls.push([name, "mount", this === lifecycle]);
          if (overrides.mountErrorName === name) throw new Error(`${name} failed`);
          return `${name} result`;
        }
      };
      return [name, lifecycle];
    })
  );
  if (!overrides.noPalette) {
    const palette = {};
    if (!overrides.noPaletteMethod) {
      palette.mountTrigger = function mountTrigger() {
        calls.push(["palette", "mountTrigger", this === palette]);
        if (overrides.paletteError) throw overrides.paletteError;
        return "palette result";
      };
    }
    lifecycles.palette = palette;
  }
  const dependencies = {
    checkpoint(message) {
      calls.push(["checkpoint", message]);
      if (overrides.checkpointError === message) throw new Error(`${message} failed`);
    },
    initialization: {
      renderLanguageDatalists() {
        calls.push(["initialization", "renderLanguageDatalists"]);
        if (overrides.languageError) throw overrides.languageError;
        return "language result";
      },
      renderTextEncodingOptions() {
        calls.push(["initialization", "renderTextEncodingOptions"]);
        if (overrides.encodingError) throw overrides.encodingError;
        return "encoding result";
      }
    },
    segmentGrid: {
      mountScroll(listener) {
        calls.push(["segmentGrid", "mountScroll", typeof listener]);
        if (overrides.scrollMountError) throw overrides.scrollMountError;
        scrollListener = listener;
        return "scroll result";
      },
      renderSegments(options) {
        calls.push(["segmentGrid", "renderSegments", options]);
        if (overrides.renderError) throw overrides.renderError;
        return "render result";
      }
    },
    lifecycles
  };
  return { calls, dependencies, getScrollListener: () => scrollListener };
}

test("ApplicationEventWiringController preserves exact initializer and lifecycle order", async () => {
  const { createApplicationEventWiringController } = await loadFactory();
  const harness = createDependencies();
  const controller = createApplicationEventWiringController(harness.dependencies);

  assert.equal(Object.isFrozen(controller), true);
  assert.equal(controller.wire(), undefined);
  assert.deepEqual(
    harness.calls.map((call) => call.slice(0, 2)),
    [
      ["checkpoint", "rendering language datalists"],
      ["initialization", "renderLanguageDatalists"],
      ["checkpoint", "rendering text encodings"],
      ["initialization", "renderTextEncodingOptions"],
      ["checkpoint", "attaching event listeners"],
      ["applicationMenu", "mount"],
      ["globalKeyboard", "mount"],
      ["segmentGrid", "mountScroll"],
      ["applicationView", "mount"],
      ["commandButtons", "mount"],
      ["updateControls", "mount"],
      ["uiLocaleControls", "mount"],
      ["projectHome", "mount"],
      ["focusMode", "mount"],
      ["inspectorToggle", "mount"],
      ["palette", "mountTrigger"],
      ["projectFilterControls", "mount"],
      ["segmentActionButtons", "mount"],
      ["projectQa", "mount"],
      ["panelToggle", "mount"],
      ["editorFilterControls", "mount"],
      ["termForm", "mount"],
      ["projectDomain", "mount"],
      ["applicationPersistence", "mount"]
    ]
  );
  assert.equal(
    harness.calls.filter((call) => call[1] === "mount").every((call) => call[2]),
    true
  );
  assert.equal(harness.calls.find((call) => call[0] === "palette")[2], true);
});

test("ApplicationEventWiringController preserves scroll rendering and result suppression", async () => {
  const { createApplicationEventWiringController } = await loadFactory();
  const harness = createDependencies();
  const controller = createApplicationEventWiringController(harness.dependencies);
  controller.wire();
  harness.calls.length = 0;

  assert.equal(harness.getScrollListener()({ ignored: true }), undefined);
  assert.deepEqual(harness.calls, [["segmentGrid", "renderSegments", { fromScroll: true, preserveScroll: true }]]);
});

test("ApplicationEventWiringController preserves repeat wiring and optional palette behavior", async () => {
  const { createApplicationEventWiringController } = await loadFactory();
  for (const overrides of [{ noPalette: true }, { noPaletteMethod: true }]) {
    const harness = createDependencies(overrides);
    const controller = createApplicationEventWiringController(harness.dependencies);
    assert.equal(controller.wire(), undefined);
    assert.equal(controller.wire(), undefined);
    assert.equal(harness.calls.filter((call) => call[1] === "renderLanguageDatalists").length, 2);
    assert.equal(
      harness.calls.some((call) => call[0] === "palette"),
      false
    );
  }
});

test("ApplicationEventWiringController preserves synchronous failure timing", async () => {
  const { createApplicationEventWiringController } = await loadFactory();

  const checkpoint = createDependencies({ checkpointError: "rendering text encodings" });
  assert.throws(
    () => createApplicationEventWiringController(checkpoint.dependencies).wire(),
    /rendering text encodings failed/
  );
  assert.deepEqual(
    checkpoint.calls.map((call) => call.slice(0, 2)),
    [
      ["checkpoint", "rendering language datalists"],
      ["initialization", "renderLanguageDatalists"],
      ["checkpoint", "rendering text encodings"]
    ]
  );

  const lifecycle = createDependencies({ mountErrorName: "projectQa" });
  assert.throws(() => createApplicationEventWiringController(lifecycle.dependencies).wire(), /projectQa failed/);
  assert.equal(lifecycle.calls.at(-1)[0], "projectQa");
  assert.equal(
    lifecycle.calls.some((call) => call[0] === "panelToggle"),
    false
  );

  const render = createDependencies({ renderError: new Error("render failed") });
  createApplicationEventWiringController(render.dependencies).wire();
  assert.throws(() => render.getScrollListener()(), /render failed/);
});

test("ApplicationEventWiringController validates initializers, grid, lifecycles, and palette", async () => {
  const { createApplicationEventWiringController } = await loadFactory();
  const valid = createDependencies().dependencies;

  assert.throws(
    () => createApplicationEventWiringController({ ...valid, checkpoint: null }),
    /requires a checkpoint reporter/
  );
  assert.throws(
    () =>
      createApplicationEventWiringController({
        ...valid,
        initialization: { ...valid.initialization, renderTextEncodingOptions: null }
      }),
    /requires checked UI initializers/
  );
  assert.throws(
    () =>
      createApplicationEventWiringController({
        ...valid,
        segmentGrid: { ...valid.segmentGrid, mountScroll: null }
      }),
    /requires checked segment-grid boundaries/
  );
  for (const name of lifecycleNames) {
    assert.throws(
      () =>
        createApplicationEventWiringController({
          ...valid,
          lifecycles: { ...valid.lifecycles, [name]: null }
        }),
      /requires checked feature lifecycles/
    );
  }
  assert.throws(
    () =>
      createApplicationEventWiringController({
        ...valid,
        lifecycles: { ...valid.lifecycles, palette: { mountTrigger: true } }
      }),
    /requires a checked optional palette lifecycle/
  );
});
