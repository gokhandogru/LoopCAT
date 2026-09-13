const test = require("node:test");
const assert = require("node:assert/strict");
const vm = require("node:vm");
const fs = require("node:fs");
const path = require("node:path");

test("R10 timeout terminates the worker, rejects queued work and never invokes a large renderer fallback", async () => {
  const workers = [];
  const timers = new Map();
  let sequence = 0;
  class Worker {
    constructor() {
      this.listeners = {};
      workers.push(this);
    }
    addEventListener(name, callback) {
      this.listeners[name] = callback;
    }
    postMessage(request) {
      this.request = request;
    }
    terminate() {
      this.terminated = true;
    }
  }
  const context = vm.createContext({
    window: { location: { protocol: "https:" } },
    Worker,
    DOMException,
    setTimeout(callback) {
      const id = ++sequence;
      timers.set(id, callback);
      return id;
    },
    clearTimeout: (id) => timers.delete(id)
  });
  vm.runInContext(fs.readFileSync(path.join(__dirname, "../../worker-client.js"), "utf8"), context);
  const api = context.window.CatHan.workerClient;
  let fallbacks = 0;
  const request = () =>
    api.findTmMatches({
      entries: Array(500).fill({ id: "t" }),
      options: { source: "query" },
      fallback: () => {
        fallbacks++;
      }
    });
  const first = request();
  const obsolete = request();
  const latest = request();
  const outcomes = Promise.allSettled([first, obsolete, latest]);
  for (const callback of [...timers.values()]) callback();
  const results = await outcomes;
  assert.ok(results.every((result) => result.status === "rejected"));
  assert.equal(results[1].reason.name, "AbortError");
  assert.equal(workers[0].terminated, true);
  assert.equal(fallbacks, 0);
  const recovered = request();
  const active = workers[1];
  active.listeners.message({ data: { id: active.request.id, ok: true, result: ["recovered"] } });
  assert.deepEqual(await recovered, ["recovered"]);
});
