const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const test = require("node:test");

const root = path.resolve(__dirname, "../..");

function loadFactory() {
  return import(pathToFileURL(path.join(root, "src/features/editor/segment-grid-controller.js")).href);
}

function createHarness(createSegmentGridController, overrides = {}) {
  const calls = [];
  const frames = [];
  let scrollListener = null;
  const viewport = overrides.noViewport
    ? null
    : {
        addEventListener(type, listener) {
          calls.push(["addEventListener", type]);
          if (overrides.addError) throw overrides.addError;
          scrollListener = listener;
        },
        removeEventListener(type, listener) {
          calls.push(["removeEventListener", type, listener === scrollListener]);
          if (overrides.removeError) throw overrides.removeError;
          if (listener === scrollListener) scrollListener = null;
        }
      };
  if (overrides.noRemove && viewport) viewport.removeEventListener = null;
  const controller = createSegmentGridController({
    navigation: {
      selectSegment(input) {
        calls.push(["selectSegment", input]);
      }
    },
    viewport,
    requestFrame(callback) {
      calls.push(["requestFrame"]);
      frames.push(callback);
      return frames.length;
    }
  });
  return {
    calls,
    controller,
    dispatchScroll() {
      return scrollListener?.();
    },
    frames,
    viewport
  };
}

test("SegmentGridController owns exact scroll mount, repeated-mount, unmount, and immutable lifecycle", async () => {
  const { createSegmentGridController } = await loadFactory();
  const harness = createHarness(createSegmentGridController);
  const render = () => harness.calls.push(["render"]);

  assert.equal(Object.isFrozen(harness.controller), true);
  assert.equal(harness.controller.mountScroll(render), true);
  assert.equal(harness.controller.mountScroll(render), false);
  assert.deepEqual(harness.calls, [["addEventListener", "scroll"]]);
  assert.equal(harness.controller.unmountScroll(), true);
  assert.equal(harness.controller.unmountScroll(), false);
  assert.deepEqual(harness.calls[1], ["removeEventListener", "scroll", true]);
  assert.equal(harness.dispatchScroll(), undefined);
});

test("SegmentGridController coalesces same-frame scrolls and accepts a later frame", async () => {
  const { createSegmentGridController } = await loadFactory();
  const harness = createHarness(createSegmentGridController);
  const render = () => harness.calls.push(["render"]);
  harness.controller.mountScroll(render);
  harness.calls.length = 0;

  assert.equal(harness.dispatchScroll(), true);
  assert.equal(harness.dispatchScroll(), false);
  assert.deepEqual(harness.calls, [["requestFrame"]]);
  assert.equal(harness.frames.length, 1);

  harness.frames.shift()();
  assert.deepEqual(harness.calls, [["requestFrame"], ["render"]]);
  assert.equal(harness.dispatchScroll(), true);
  assert.deepEqual(harness.calls, [["requestFrame"], ["render"], ["requestFrame"]]);
});

test("SegmentGridController keeps a pending scroll render alive across unmount", async () => {
  const { createSegmentGridController } = await loadFactory();
  const harness = createHarness(createSegmentGridController);
  harness.controller.mountScroll(() => harness.calls.push(["render"]));
  harness.calls.length = 0;

  harness.dispatchScroll();
  assert.equal(harness.controller.unmountScroll(), true);
  assert.deepEqual(harness.calls, [["requestFrame"], ["removeEventListener", "scroll", true]]);
  harness.frames.shift()();
  assert.deepEqual(harness.calls[2], ["render"]);
  assert.equal(harness.dispatchScroll(), undefined);
});

test("SegmentGridController rejects unavailable viewport lifecycle and invalid render callbacks", async () => {
  const { createSegmentGridController } = await loadFactory();
  const absent = createHarness(createSegmentGridController, { noViewport: true });
  assert.equal(
    absent.controller.mountScroll(() => {}),
    false
  );
  assert.equal(absent.controller.unmountScroll(), false);
  assert.deepEqual(absent.calls, []);

  const incomplete = createHarness(createSegmentGridController, { noRemove: true });
  assert.equal(
    incomplete.controller.mountScroll(() => {}),
    false
  );
  assert.equal(incomplete.controller.mountScroll(null), false);
  assert.deepEqual(incomplete.calls, []);
});

test("SegmentGridController preserves scroll listener delegate failure timing", async () => {
  const { createSegmentGridController } = await loadFactory();
  const addError = new Error("add failed");
  const addFailure = createHarness(createSegmentGridController, { addError });
  assert.throws(() => addFailure.controller.mountScroll(() => {}), addError);
  assert.deepEqual(addFailure.calls, [["addEventListener", "scroll"]]);

  const removeError = new Error("remove failed");
  const removeFailure = createHarness(createSegmentGridController, { removeError });
  removeFailure.controller.mountScroll(() => {});
  assert.throws(() => removeFailure.controller.unmountScroll(), removeError);
  assert.equal(
    removeFailure.controller.mountScroll(() => {}),
    false
  );
});

test("SegmentGridController clears its frame marker before invoking the scroll render", async () => {
  const { createSegmentGridController } = await loadFactory();
  const harness = createHarness(createSegmentGridController);
  harness.controller.mountScroll(() => {
    harness.calls.push(["render"]);
    assert.equal(harness.dispatchScroll(), true);
  });
  harness.calls.length = 0;

  harness.dispatchScroll();
  harness.frames.shift()();
  assert.deepEqual(harness.calls, [["requestFrame"], ["render"], ["requestFrame"]]);
});
