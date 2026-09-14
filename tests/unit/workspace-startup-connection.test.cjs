const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const test = require("node:test");

function folder(name, permission = () => Promise.resolve("granted")) {
  return {
    name,
    queryPermission: permission,
    requestPermission: permission,
    getFileHandle: () =>
      Promise.resolve({
        getFile: () =>
          Promise.resolve(
            new Blob([JSON.stringify({ app: "LoopCAT", type: "workspace-manifest", projects: [], backups: [] })])
          )
      }),
    getDirectoryHandle: () => Promise.reject(Object.assign(new Error("Missing"), { name: "NotFoundError" }))
  };
}
function load(handle) {
  const context = vm.createContext({
    Blob,
    console,
    CustomEvent,
    window: {
      showDirectoryPicker: () => {},
      CatHan: { storage: { constants: {}, get: () => Promise.resolve({ handle }), put: () => Promise.resolve() } }
    }
  });
  vm.runInContext(fs.readFileSync(path.join(__dirname, "../../workspace-storage.js"), "utf8"), context);
  return context.window.CatHan.workspaceStorage;
}

test("Startup reconnect is coalesced and folder-dependent writes wait for verification", async () => {
  let grant;
  const pending = new Promise((resolve) => {
    grant = resolve;
  });
  const storage = load(folder("Saved", () => pending));
  const first = storage.reconnectSavedWorkspace();
  assert.equal(storage.reconnectSavedWorkspace(), first);
  let finished = false;
  const write = storage.saveProjectPackage({}).catch((error) => {
    finished = true;
    return error;
  });
  await Promise.resolve();
  assert.equal(finished, false);
  grant("granted");
  assert.equal((await first).name, "Saved");
  assert.match((await write).message, /missing project metadata/);
});

test("A later folder selection wins over a slow startup reconnect; denied permission leaves local mode available", async () => {
  let grant;
  const pending = new Promise((resolve) => {
    grant = resolve;
  });
  const storage = load(folder("Old", () => pending));
  const first = storage.reconnectSavedWorkspace();
  const selected = storage.connectHandle(folder("Selected"));
  grant("granted");
  assert.equal((await first).name, "Old");
  assert.equal((await selected).name, "Selected");
  assert.equal((await storage.reconnectSavedWorkspace()).name, "Selected");
  const denied = load(folder("Offline", () => Promise.resolve("denied")));
  assert.equal((await denied.reconnectSavedWorkspace()).connected, false);
});

test("Ordinary reconnect does not enumerate or validate legacy packages, even with a missing manifest", async () => {
  for (const missing of [false, true]) {
    const handle = folder("Saved");
    let enumerations = 0;
    handle.getDirectoryHandle = () => {
      enumerations += 1;
      throw Error("Unexpected package scan");
    };
    if (missing)
      handle.getFileHandle = () => Promise.reject(Object.assign(new Error("Missing"), { name: "NotFoundError" }));
    const storage = load(handle);
    assert.equal((await storage.reconnectSavedWorkspace()).connected, true);
    assert.equal((await storage.getStatus()).connected, true);
    assert.equal(enumerations, 0);
  }
});
