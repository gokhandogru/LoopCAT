const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const test = require("node:test");

const root = path.resolve(__dirname, "../..");
const moduleAt = (relativePath) => import(pathToFileURL(path.join(root, relativePath)).href);

test("R11 update activation keeps editing paused through reload and releases it on activation failure", async () => {
  const { createUpdateController } = await moduleAt("src/features/update/update-controller.js");
  let paused = false;
  let fail = false;
  let listener;
  const waiting = {
    postMessage() {
      if (fail) throw new Error("activation rejected");
      queueMicrotask(() => listener());
    }
  };
  const controller = createUpdateController({
    serviceWorker: {
      controller: {},
      register: () => Promise.resolve({ waiting }),
      addEventListener: (_name, value) => {
        listener = value;
      }
    },
    location: {
      reload() {
        assert.equal(paused, true);
      }
    },
    beforeActivate: () => {
      paused = true;
      return () => {
        paused = false;
      };
    }
  });
  await controller.initialize();
  assert.equal(await controller.activate(), true);
  assert.equal(paused, true);
  fail = true;
  assert.equal(await controller.activate(), false);
  assert.equal(paused, false);
});

test("update activation saves first and asks only the waiting worker to activate", async () => {
  const { createUpdateController } = await moduleAt("src/features/update/update-controller.js");
  const events = new Map();
  const messages = [];
  const states = [];
  const waiting = {
    postMessage(message) {
      messages.push(message);
      queueMicrotask(() => events.get("controllerchange")?.());
    }
  };
  const registration = {
    waiting,
    addEventListener() {},
    update: () => Promise.resolve()
  };
  const serviceWorker = {
    controller: {},
    register: () => Promise.resolve(registration),
    addEventListener(type, listener) {
      events.set(type, listener);
    }
  };
  let saved = false;
  let reloaded = false;
  const controller = createUpdateController({
    serviceWorker,
    location: { reload: () => (reloaded = true) },
    beforeActivate: () => {
      saved = true;
      return Promise.resolve();
    },
    onStateChange: ({ state }) => states.push(state)
  });
  await controller.initialize();
  await controller.activate();
  assert.equal(saved, true);
  assert.deepEqual(messages, [{ type: "SKIP_WAITING" }]);
  assert.equal(reloaded, true);
  assert.deepEqual(states, ["ready", "saving", "activating", "reloading"]);
});
