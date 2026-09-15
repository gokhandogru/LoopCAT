const test = require("node:test");
const assert = require("node:assert/strict");
const vm = require("node:vm");
const fs = require("node:fs");
const path = require("node:path");

test("file workers accept only bundled sources and revoke cached URLs on unload", () => {
  const created = [];
  const revoked = [];
  const handlers = {};
  let rules;
  const context = vm.createContext({
    window: {
      addEventListener: (event, callback) => {
        handlers[event] = callback;
      }
    },
    sources: { "./cat-worker.js": "self.postMessage('trusted')" },
    Blob,
    URL: {
      createObjectURL: (blob) => {
        created.push(blob);
        return `blob:null/${created.length}`;
      },
      revokeObjectURL: (url) => revoked.push(url)
    },
    Worker: class {
      constructor(url) {
        this.url = url;
      }
    },
    trustedTypes: {
      createPolicy: (_name, policy) => {
        rules = policy;
        return policy;
      }
    }
  });
  const source = fs
    .readFileSync(path.join(__dirname, "../../src/entry/file-workers.js"), "utf8")
    .replace(/^import[^\n]+\n/, "");
  vm.runInContext(source, context);
  const create = context.window.CatHan.createFileWorker;
  assert.equal(create("./cat-worker.js").url, "blob:null/1");
  assert.equal(create("./cat-worker.js").url, "blob:null/1");
  assert.equal(created.length, 1);
  assert.throws(() => create("https://example.com/worker.js"), /Unrecognized/);
  assert.throws(() => create("toString"), /Unrecognized/);
  assert.throws(() => rules.createScriptURL("blob:null/untrusted"), /Unrecognized/);
  handlers.pagehide({ persisted: true });
  assert.equal(revoked.length, 0);
  handlers.pagehide({ persisted: false });
  assert.deepEqual(revoked, ["blob:null/1"]);
  assert.throws(() => rules.createScriptURL("blob:null/1"), /Unrecognized/);
});
