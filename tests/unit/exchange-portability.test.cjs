const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const { readFileSync } = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const vm = require("node:vm");
const { IDBFactory, IDBKeyRange } = require("fake-indexeddb");
const root = path.resolve(__dirname, "../..");
const pin = {
  id: "edu.example.qa",
  version: "1.0.0",
  kind: "qa",
  digest: "a".repeat(64),
  required: true,
  priority: 100
};
const source = {
  exchangeLocalBinding: "source text, not permission",
  exchangeRequirements: { unrecognized: "source structure" },
  nested: [{ exchangeRequirements: ["bonjour"] }]
};
const project = {
  ...require("../fixtures/modernization/baseline-backup.json").projects[0],
  id: "p",
  documents: [{ id: "d", name: "ui.json", type: "json" }],
  localizationStructures: { d: { format: "json", sourceJson: source } },
  exchangeRequirements: [pin],
  exchangeLocalBinding: "old-device-binding"
};
const seg = {
  id: "s",
  projectId: "p",
  documentId: "d",
  source: "Save",
  target: "Kaydet",
  status: "confirmed",
  structure: { format: "json", path: ["exchangeLocalBinding"] }
};
const json = (x) => JSON.parse(JSON.stringify(x));
async function fixture(t) {
  const ctx = vm.createContext({
    window: {},
    indexedDB: new IDBFactory(),
    crypto,
    IDBKeyRange,
    structuredClone,
    setInterval,
    clearInterval,
    console,
    Blob,
    TextEncoder,
    CustomEvent
  });
  for (const name of ["storage.js", "validation.js"]) vm.runInContext(readFileSync(path.join(root, name), "utf8"), ctx);
  const { storage: s, validation: v } = ctx.window.CatHan;
  await s.writeStoresAtomically({ projects: [json(project)], segments: [json(seg)] });
  t.after(async () => {
    for (const p of await s.getAll("projects")) await s.releaseProject(p.id);
    (await s.openDatabase()).close();
  });
  const { createProjectExportBuildService } =
    await import("../../src/features/import-export/project-export-build-service.js");
  const service = createProjectExportBuildService({
    session: { getProject: () => project, getSegments: () => [seg] },
    autosave: { flush: s.flushMutations },
    storage: {
      ...s,
      getProjectSegments: (id) => s.getAllByIndex("segments", "projectId", id),
      listTerms: () => Promise.resolve([])
    },
    resources: { getLinks: (p) => p.resourceLinks, getTmNames: () => [], getTermBaseNames: () => [] },
    documents: { manifest: (p) => p.documents },
    ai: { normalizeProjectSettings: (x) => x || {} },
    portable: {
      createContext: s.createPortableSanitizerContext,
      sanitize: s.sanitizePortableValue,
      validateProjectPackage: v.validateProjectPackage,
      hasOriginalLocalizationStructure: (x) => Boolean(x?.sourceJson)
    },
    backup: { validate: v.validateBackupFile },
    validation: { summary: v.reportSummary },
    workspace: { isConnected: () => false },
    constants: { appName: "LoopCAT", projectPackageSchemaVersion: 8 },
    clock: { now: () => new Date().toISOString() }
  });
  return { s, v, service, indexedDB: ctx.indexedDB };
}
function assertInertProject(p) {
  assert.equal(Object.hasOwn(p, "exchangeLocalBinding"), false);
  assert.deepEqual(json(p.exchangeRequirements), [pin]);
  assert.deepEqual(json(p.localizationStructures.d.sourceJson), source);
}
async function assertRestored(s) {
  assertInertProject(await s.get("projects", "p"));
  assert.equal((await s.get("segments", "s")).target, "Kaydet");
}
test("real JSON project export/reimport and full backup replacement keep requirements but strip device activation", async (t) => {
  const { s, service } = await fixture(t);
  const projectPackage = json(await service.buildProjectPackage());
  assertInertProject(projectPackage.project);
  const backup = json(await s.exportAllData());
  assertInertProject(backup.projects[0]);
  assert.equal((await s.get("projects", "p")).exchangeLocalBinding, "old-device-binding");
  await s.importProjectPackageRecords({
    project: { ...projectPackage.project, exchangeLocalBinding: "old-device-binding" },
    segments: projectPackage.segments,
    replaceProjectId: "p"
  });
  await assertRestored(s);
  await s.put("projects", { ...(await s.get("projects", "p")), exchangeLocalBinding: "current-local-authorization" });
  backup.projects[0].exchangeLocalBinding = "current-local-authorization";
  await s.commitRestore(await s.prepareRestore(backup, { mode: "replace" }));
  await assertRestored(s);
});
test("same-database streamed ZIP and current/legacy checkpoint recovery strip activation but preserve original JSON fields", async (t) => {
  const { s } = await fixture(t);
  const archive = await import("../../src/features/import-export/archive-adapter.js");
  const cp = await s.createCheckpoint("exchange-recovery");
  const written = await archive.writePackage(await s.checkpointArchiveSource(cp.id));
  const decoded = await archive.readPackage(written.data);
  assertInertProject(decoded.value.projects[0]);
  const staging = await s.stageBackupRecords((accept) => archive.readPackage(written.data, { onRecord: accept }));
  await s.commitRestore(await s.prepareRestore(staging, { mode: "replace" }));
  await assertRestored(s);
  for (const checkpointId of [cp.id, "legacy-checkpoint"]) {
    if (checkpointId === "legacy-checkpoint") {
      const blob = new Blob([JSON.stringify({ projects: [project], segments: [seg] })]);
      const digest = Buffer.from(await crypto.subtle.digest("SHA-256", await blob.arrayBuffer())).toString("hex");
      await s.put("checkpoints", {
        id: checkpointId,
        createdAt: new Date().toISOString(),
        generation: 1,
        verified: true,
        digest,
        blob
      });
      const rows = [];
      for await (const row of s.checkpointRecords(checkpointId, { portable: true })) rows.push(row);
      assertInertProject(rows.find((x) => x.store === "projects").value);
    }
    await s.put("projects", { ...(await s.get("projects", "p")), exchangeLocalBinding: "old-device-binding" });
    await s.commitRestore(await s.prepareRestore(await s.stageCheckpoint(checkpointId), { mode: "replace" }));
    await assertRestored(s);
  }
});
test("malformed requirements fail validation and both restore paths before prior work or authority changes", async (t) => {
  const { s, v, service } = await fixture(t),
    backup = json(await s.exportAllData()),
    pkg = json(await service.buildProjectPackage());
  assert.ok(v.validateProjectPackage({ ...pkg, project }).errors.some((e) => /device-only Exchange/.test(e)));
  assert.ok(
    v.validateBackupFile({ ...backup, projects: [project] }).errors.some((e) => /device-only Exchange/.test(e))
  );
  const bad = [
    [{ ...pin, priority: 101 }],
    [{ ...pin, id: "nonsense" }],
    [{ ...pin, version: "01.0.0" }],
    [{ ...pin, digest: [pin.digest] }],
    [{ ...pin, activate: true }],
    [pin, pin]
  ];
  for (const refs of bad) {
    const p = { ...backup.projects[0], exchangeRequirements: refs };
    const b = { ...backup, projects: [p] };
    assert.ok(v.validateProjectPackage({ ...pkg, project: p }).errors.some((x) => /Exchange/.test(x)));
    assert.ok(v.validateBackupFile(b).errors.some((x) => /Exchange/.test(x)));
    await assert.rejects(
      s.importProjectPackageRecords({ project: p, segments: [], replaceProjectId: "p" }),
      /Exchange/
    );
    await assert.rejects(s.prepareRestore(b, { mode: "replace" }), /Exchange/);
    await assert.rejects(
      s.stageBackupRecords(async (accept) => {
        await accept({ store: "metadata", value: { app: "LoopCAT", schemaVersion: 9 } });
        await accept({ store: "projects", value: p });
      }),
      /Exchange/
    );
  }
  assert.equal((await s.get("projects", "p")).exchangeLocalBinding, "old-device-binding");
  assert.equal((await s.get("segments", "s")).target, "Kaydet");
});
test("reopening a replacement with an installed and previously enabled digest does not reuse its permissions", async (t) => {
  const { s, service, indexedDB } = await fixture(t),
    { createPackRepository } = await import("../../src/features/exchange/repository.js"),
    { createExchangeHost } = await import("../../src/features/exchange/host.js"),
    { EXAMPLE_TERM_PACK } = await import("../../src/features/exchange/examples.js"),
    { encodePack } = await import("../../src/features/exchange/pack-format.js");
  const repo = createPackRepository({ indexedDB });
  const pack = await repo.install(await encodePack(EXAMPLE_TERM_PACK));
  await repo.enable("p@old-device-binding", pack.id, pack.version);
  const pins = await repo.requirements("p@old-device-binding");
  assert.equal((await repo.active("p@old-device-binding"))[0].digest, pack.digest);
  await s.put("projects", { ...(await s.get("projects", "p")), exchangeRequirements: pins });
  const pkg = await service.buildProjectPackage();
  await s.importProjectPackageRecords({ project: pkg.project, segments: pkg.segments, replaceProjectId: "p" });
  const current = await s.get("projects", "p");
  const host = createExchangeHost({ document: { querySelector: () => null }, getProject: () => current });
  assert.deepEqual(json(current.exchangeRequirements), json(pins));
  assert.equal((await repo.list()).length, 1);
  assert.deepEqual(await host.terms({ source: "server" }), []);
  assert.equal((await repo.active("p@old-device-binding")).length, 1);
  repo.close?.();
});

// Real native temp files + production workspace store, ZIP codec, generation
// hashing/pointer verification; only browser FileSystemHandle and Worker ports are adapted.
function directory(base) {
  const exists = async (p) => {
    try {
      await fs.stat(p);
    } catch (e) {
      if (e.code === "ENOENT") throw new DOMException("Missing", "NotFoundError");
      throw e;
    }
  };
  const sub = (name) => {
    if (!name || name === "." || name === ".." || /[\\/:]/.test(name)) throw new Error("Unsafe fixture path");
    return path.join(base, name);
  };
  return {
    kind: "directory",
    async getDirectoryHandle(name, { create = false } = {}) {
      const p = sub(name);
      if (create) await fs.mkdir(p, { recursive: true });
      await exists(p);
      return directory(p);
    },
    async getFileHandle(name, { create = false } = {}) {
      const p = sub(name);
      if (create) await (await fs.open(p, "a")).close();
      await exists(p);
      return {
        kind: "file",
        getFile: async () => new Blob([await fs.readFile(p)]),
        async createWritable() {
          const fh = await fs.open(p, "w");
          const writer = new WritableStream({
            write: (bytes) => fh.write(bytes),
            close: () => fh.close(),
            abort: () => fh.close()
          });
          return Object.assign(writer, {
            write: (bytes) => fh.write(bytes),
            close: () => fh.close(),
            abort: () => fh.close()
          });
        }
      };
    },
    async *entries() {
      for (const e of await fs.readdir(base, { withFileTypes: true }))
        yield [e.name, { kind: e.isFile() ? "file" : "directory" }];
    }
  };
}
test("verified workspace-folder ZIP survives a new folder-store instance and same-database reimport", async (t) => {
  const { s, service } = await fixture(t),
    archive = await import("../../src/features/import-export/archive-adapter.js");
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), "loopcat-exchange-folder-"));
  t.after(() => fs.rm(temp, { recursive: true, force: true }));
  const prior = global.window;
  t.after(() => {
    if (prior === undefined) delete global.window;
    else global.window = prior;
  });
  global.window = {
    dispatchEvent: () => {},
    CatHan: {
      createFileWorker: () => ({
        terminate() {},
        async postMessage(d) {
          try {
            const result =
              d.operation === "write"
                ? await archive.writePackage(d.input, d.writable, d.options)
                : await archive.readPackage(d.input, d.options);
            await this.onmessage({ data: { type: "complete", result } });
          } catch (e) {
            await this.onmessage({ data: { type: "failed", error: e.message } });
          }
        }
      })
    }
  };
  const { createWorkspaceArchiveStore } = await import("../../src/features/workspace/workspace-archive-store.js");
  const folder = directory(temp),
    first = createWorkspaceArchiveStore(folder);
  const pkg = await service.buildProjectPackage();
  const saved = await first.saveProjectPackage(pkg);
  assert.equal(saved.verified, true);
  const second = createWorkspaceArchiveStore(folder);
  const current = await second.load();
  const disk = await second.read(current.projects[0].packagePath);
  assertInertProject(disk.project);
  assert.equal(disk.segments[0].target, "Kaydet");
  await s.importProjectPackageRecords({ project: disk.project, segments: disk.segments, replaceProjectId: "p" });
  await assertRestored(s);
});
