const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const vm = require("node:vm");
const test = require("node:test");
const { IDBFactory, IDBKeyRange } = require("fake-indexeddb");

const root = path.resolve(__dirname, "../..");
const load = (file) => import(pathToFileURL(path.join(root, file)).href);

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
}

async function harness(t) {
  const events = [];
  const runtime = vm.createContext({
    window: { dispatchEvent: (event) => events.push(event) },
    indexedDB: new IDBFactory(),
    IDBKeyRange,
    crypto,
    structuredClone,
    setInterval,
    clearInterval,
    console,
    Blob,
    TextEncoder,
    CustomEvent
  });
  vm.runInContext(readFileSync(path.join(root, "storage.js"), "utf8"), runtime);
  const storage = runtime.window.CatHan.storage;
  const db = await storage.openDatabase();
  t.after(async () => {
    await storage.releaseProject("p");
    db.close();
  });
  const hooks = {};
  runtime.window.CatHan.storage = {
    ...storage,
    get: async (store, id) => {
      if (store === "resources" && hooks.beforeResourceRead) await hooks.beforeResourceRead();
      return storage.get(store, id);
    }
  };
  for (const file of ["tm.js", "project.js"]) vm.runInContext(readFileSync(path.join(root, file), "utf8"), runtime);
  const project = await storage.put("projects", {
    id: "p",
    name: "Test project",
    sourceLang: "en",
    targetLang: "tr",
    mainTmName: "Main TM",
    resourceLinks: [{ type: "tm", role: "main", resourceId: "main", cachedName: "Main TM" }]
  });
  await storage.put("resources", { id: "main", type: "tm", name: "Main TM" });
  const segments = await storage.bulkPut(
    "segments",
    [0, 1].map((index) => ({
      id: `s${index}`,
      projectId: project.id,
      documentId: "d",
      documentName: "test.docx",
      index,
      source: index ? "I have many friends." : "I have a friend.",
      target: "",
      status: "empty",
      revision: 0
    }))
  );
  const session = { getProject: () => project, getSegments: () => segments };
  const tasks = [];
  const setTimer = (callback, delay) => {
    const task = { callback, delay, cancelled: false };
    tasks.push(task);
    return task;
  };
  const runRecovery = async () => {
    const ready = tasks.filter((task) => task.delay === 0 && !task.cancelled);
    for (const task of ready) {
      task.cancelled = true;
      await task.callback();
    }
  };
  const statuses = [];
  const status = { set: (message, mode) => statuses.push({ message, mode }) };
  const repository = {
    save: runtime.window.CatHan.project.saveSegment,
    saveMany: runtime.window.CatHan.project.saveSegments
  };
  const { createAutosaveService } = await load("src/features/editor/autosave-service.js");
  const autosave = createAutosaveService({
    editorSessionStore: session,
    repository,
    editLifecycle: { finalize() {}, finalizeProject() {}, finalizeAll() {} },
    status,
    setTimer,
    clearTimer: (task) => {
      task.cancelled = true;
    }
  });
  const { createCommandPersistenceService } = await load("src/features/editor/command-persistence-service.js");
  const persistence = createCommandPersistenceService({ autosave, session, repository, setTimer });
  const { createSegmentConfirmationController } = await load("src/features/editor/segment-confirmation-controller.js");
  const commandResults = [];
  let activeIndex = 0;
  const controller = createSegmentConfirmationController({
    element: { addEventListener() {}, setAttribute() {} },
    editorSessionStore: session,
    commands: {
      bus: {
        execute: async (command) => {
          const result = await command.execute();
          commandResults.push(result);
          return result;
        }
      },
      create: (options) => ({ execute: options.applyFirst }),
      changed() {}
    },
    selection: {
      getActiveIndex: () => activeIndex,
      focusTarget() {},
      goToNextOpen: () => {
        activeIndex += 1;
        return Promise.resolve();
      }
    },
    validation: { missingTags: () => [], tagLabel: String },
    filters: { matches: () => true },
    mutation: {
      confirm: (segment) => {
        segment.status = "confirmed";
        segment.revision += 1;
      },
      restore: (segment, snapshot) => Object.assign(segment, snapshot),
      preparePersistedRollback() {}
    },
    persistence: {
      clearPending: persistence.clear,
      save: persistence.save,
      confirmAtomic: (project, segment, context) =>
        persistence.run([segment], () => runtime.window.CatHan.tm.confirmSegmentWithMainTm(project, segment, context)),
      saveToTm: async () => {},
      logActivity: async () => {}
    },
    restoration: { restoreCommand: async () => {} },
    view: { updateRow() {}, renderSegments() {}, renderProgress() {}, scheduleHistory() {}, renderHistory() {} },
    workspace: { markDirty() {} },
    status
  });
  return {
    storage,
    tm: runtime.window.CatHan.tm,
    project,
    segments,
    hooks,
    autosave,
    controller,
    runRecovery,
    statuses,
    events,
    commandResults
  };
}

test("typing and confirming two segments does not schedule duplicate autosaves or create conflict copies", async (t) => {
  const h = await harness(t);
  const targets = ["Bir arkadaşım var.", "Arkadaşlarım var."];
  for (let index = 0; index < targets.length; index++) {
    const segment = h.segments[index];
    segment.target = targets[index];
    segment.status = "draft";
    segment.revision += 1;
    h.autosave.debounce(segment);
    const entered = deferred();
    const release = deferred();
    h.hooks.beforeResourceRead = () => {
      entered.resolve();
      return release.promise;
    };
    const confirming = h.controller.confirm();
    await entered.promise;
    await h.runRecovery();
    assert.equal(
      h.autosave.pendingRecords().length,
      0,
      "typing recovery must not revive an atomic confirmation's cleared save"
    );
    assert.equal(h.autosave.size(), 1, "the active confirmation remains a close/flush obligation");
    release.resolve();
    assert.equal(await confirming, true);
    await h.runRecovery();
    await h.autosave.flush("p");
    assert.equal(h.autosave.size(), 0);
  }
  assert.equal((await h.storage.getAll("conflictCopies")).length, 0);
  assert.equal(
    h.statuses.some(({ message }) => /conflict|retrying/i.test(message)),
    false
  );
  assert.equal((await h.storage.getAll("tmEntries")).length, 2);
  assert.equal((await h.storage.getAll("tmContributions")).length, 2);
  for (const [index, target] of targets.entries()) {
    const saved = await h.storage.get("segments", `s${index}`);
    assert.equal(saved.target, target);
    assert.equal(saved.status, "confirmed");
  }
});

test("typing while confirmation is pending preserves both the confirmed TM target and the newer draft", async (t) => {
  const h = await harness(t);
  const segment = h.segments[0];
  Object.assign(segment, { target: "Bir arkadaşım var.", status: "draft", revision: 1 });
  h.autosave.debounce(segment);
  const entered = deferred();
  const release = deferred();
  h.hooks.beforeResourceRead = () => {
    entered.resolve();
    return release.promise;
  };
  const confirming = h.controller.confirm();
  await entered.promise;
  segment.target = "Benim bir arkadaşım var.";
  segment.status = "draft";
  segment.revision += 1;
  segment.updatedAt = "newer typing";
  h.autosave.debounce(segment);
  await h.runRecovery();
  let flushed = false;
  const duringConfirmation = h.autosave.flush("p").then(() => {
    flushed = true;
  });
  await Promise.resolve();
  assert.equal(flushed, false, "newer autosave and flush must wait for the atomic confirmation");
  release.resolve();
  assert.equal(await confirming, true);
  assert.equal(segment.target, "Benim bir arkadaşım var.");
  assert.equal(segment.status, "draft");
  assert.equal(segment.updatedAt, "newer typing");
  assert.equal(h.commandResults[0].snapshot.target, "Bir arkadaşım var.");
  assert.equal(h.commandResults[0].snapshot.status, "confirmed");
  assert.equal(h.commandResults[0].activeSegmentId, segment.id, "newer typing keeps focus on the current draft");
  assert.equal((await h.storage.getAll("tmEntries"))[0].target, "Bir arkadaşım var.");
  assert.equal((await h.storage.getAll("tmContributions"))[0].segmentRevision, 2);
  await duringConfirmation;
  assert.equal((await h.storage.get("segments", segment.id)).target, "Benim bir arkadaşım var.");
  assert.equal((await h.storage.getAll("conflictCopies")).length, 0);
});

test("failed confirmation does not restore an old snapshot over typing made while it was pending", async (t) => {
  const h = await harness(t);
  const segment = h.segments[0];
  Object.assign(segment, { target: "Bir arkadaşım var.", status: "draft", revision: 1 });
  h.autosave.debounce(segment);
  const entered = deferred();
  const release = deferred();
  h.hooks.beforeResourceRead = () => {
    entered.resolve();
    return release.promise;
  };
  const confirming = h.controller.confirm();
  await entered.promise;
  Object.assign(segment, { target: "Yeni çevirim.", status: "draft", revision: 3 });
  h.autosave.debounce(segment);
  release.reject(new Error("resource read failed"));
  assert.equal(await confirming, false);
  assert.equal(segment.target, "Yeni çevirim.");
  assert.equal(segment.revision, 3);
  await h.runRecovery();
  await h.autosave.flush("p");
  assert.equal((await h.storage.get("segments", segment.id)).target, "Yeni çevirim.");
  assert.equal((await h.storage.getAll("tmEntries")).length, 0);
});

test("overlapping confirmations update the shared main TM without same-window resource conflicts", async (t) => {
  const h = await harness(t);
  const targets = ["Bir arkadaşım var.", "Arkadaşlarım var."];
  const operations = h.segments.map((segment, index) => {
    Object.assign(segment, { target: targets[index], status: "confirmed", revision: 1 });
    return h.tm.confirmSegmentWithMainTm(h.project, segment);
  });
  await Promise.all(operations);
  assert.equal((await h.storage.getAll("conflictCopies")).length, 0);
  assert.equal((await h.storage.getAll("tmEntries")).length, 2);
  assert.equal((await h.storage.getAll("tmContributions")).length, 2);
  for (const segment of h.segments) assert.equal((await h.storage.get("segments", segment.id)).target, segment.target);
});

test("genuine conflicts identify the affected records and later commits identify only the records saved", async (t) => {
  const h = await harness(t);
  const original = h.segments[0];
  const current = await h.storage.put("segments", { ...original, target: "Current", revision: 1 });
  await assert.rejects(h.storage.put("segments", { ...original, target: "Conflicting", revision: 1 }), {
    name: "StorageConflictError"
  });
  const conflict = h.events.filter((event) => event.type === "loopcat-storage-status").at(-1).detail;
  assert.equal(conflict.code, "conflict");
  assert.match(conflict.message, /Save conflict/);
  assert.deepEqual(Array.from(conflict.recordKeys), [JSON.stringify(["segments", original.id])]);
  await h.storage.put("segments", { ...current, target: "Resolved", revision: 2 });
  const commit = h.events.filter((event) => event.type === "loopcat-committed").at(-1).detail;
  assert.deepEqual(Array.from(commit.recordKeys), [JSON.stringify(["segments", original.id])]);
  assert.equal(
    (await h.storage.getAll("conflictCopies")).length,
    1,
    "resolving the UI error must not delete the recovery copy"
  );
});
