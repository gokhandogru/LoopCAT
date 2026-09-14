const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const test = require("node:test");

test("Background TM scores preserve exhaustive analysis, including repetitions and normalized matches", () => {
  let handler;
  let reply;
  const context = vm.createContext({
    self: {
      addEventListener: (_name, callback) => {
        handler = callback;
      },
      postMessage: (value) => {
        reply = value;
      }
    }
  });
  vm.runInContext(fs.readFileSync(path.resolve(__dirname, "../../cat-worker.js"), "utf8"), context);
  context.window = { CatHan: { tm: { normalizeText: context.normalizeText, similarity: context.similarity } } };
  vm.runInContext(fs.readFileSync(path.resolve(__dirname, "../../analysis.js"), "utf8"), context);
  const entries = ["Good morning", "A small example", "Numbers 42", "!!!"].map((source) => ({ source }));
  const segments = ["Good morning!", "A smaller example", "good MORNING", "Other text", "", "!!!"].map((source) => ({
    source,
    target: "",
    status: "empty"
  }));
  handler({
    data: {
      id: "test",
      type: "tm-analysis",
      payload: { sources: segments.map((segment) => segment.source), entries: entries.map((entry) => entry.source) }
    }
  });
  assert.equal(reply.ok, true);
  const analyze = context.window.CatHan.analysis.analyzeProject;
  assert.deepEqual(analyze({}, segments, [], reply.result).leverage, analyze({}, segments, entries).leverage);
});

test("Analysis uses a separate worker and cancellation leaves active TM lookup running", async () => {
  const workers = [];
  class Worker {
    constructor() {
      this.listeners = {};
      workers.push(this);
    }
    addEventListener(type, callback) {
      this.listeners[type] = callback;
    }
    postMessage(request) {
      this.request = request;
    }
    terminate() {
      this.terminated = true;
    }
  }
  const context = vm.createContext({
    window: { location: { protocol: "loopcat:" } },
    Worker,
    DOMException,
    setTimeout,
    clearTimeout
  });
  vm.runInContext(fs.readFileSync(path.resolve(__dirname, "../../worker-client.js"), "utf8"), context);
  const api = context.window.CatHan.workerClient;
  const lookup = api.findTmMatches({
    entries: [],
    options: {},
    fallback: () => {
      throw Error("No fallback");
    }
  });
  const abort = new AbortController();
  const analysis = api.analyzeTm({ sources: ["a"], entries: ["b"], signal: abort.signal });
  abort.abort();
  await assert.rejects(analysis, { name: "AbortError" });
  assert.equal(workers[1].terminated, true);
  assert.equal(workers[0].terminated, undefined);
  workers[0].listeners.message({ data: { id: workers[0].request.id, ok: true, result: ["match"] } });
  assert.deepEqual(await lookup, ["match"]);
});
