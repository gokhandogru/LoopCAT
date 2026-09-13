import "../../storage.js";
import "../../src/features/import-export/install-archive-adapter.js";
import { archiveJob, writeArchive, readArchive } from "../../src/features/import-export/archive-worker-client.js";
import { createAutosaveService } from "../../src/features/editor/autosave-service.js";
import { createCommandPersistenceService } from "../../src/features/editor/command-persistence-service.js";
import { createWorkspaceDirtyStateController } from "../../src/features/workspace/workspace-dirty-state-controller.js";
import { evaluateRegex } from "../../src/features/editor/regex-worker-client.js";
import { runPerformance } from "./performance-driver.js";

const storage = window.CatHan.storage;
const output = document.getElementById("results");
const lines = [];
function assert(condition, message) {
  if (!condition) throw new Error(message);
  lines.push(`PASS ${message}`);
  output.textContent = lines.join("\n");
}
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function main() {
  if (location.search.includes("performance")) return runPerformance(storage, output);
  if (location.search.includes("peer")) {
    window.recoveryTestStorage = storage;
    return;
  }
  const projectId = "recovery-" + crypto.randomUUID();
  const segmentId = projectId + ":s";
  await storage.put("projects", {
    id: projectId,
    name: "Recovery integration",
    sourceLang: "en",
    targetLang: "tr",
    documents: []
  });
  let segment = await storage.put("segments", {
    id: segmentId,
    projectId,
    source: "Original",
    target: "Acknowledged 🎯",
    revision: 1,
    comments: [{ text: "Keep me" }],
    history: [{ target: "Older" }]
  });
  const peer = document.createElement("iframe");
  const ready = new Promise((resolve) => {
    peer.onload = resolve;
  });
  peer.src = "/reliability-test.html?peer";
  document.body.append(peer);
  await ready;
  for (let i = 0; !peer.contentWindow.recoveryTestStorage && i < 50; i++) await delay(20);
  const other = peer.contentWindow.recoveryTestStorage;
  assert((await other.acquireProject(projectId)) === null, "R4 second real browser context cannot acquire the project");
  await storage.releaseProject(projectId);
  assert((await other.acquireProject(projectId)) !== null, "R4 ownership passes after the previous writer releases");
  await other.releaseProject(projectId);
  peer.remove();
  await storage.acquireProject(projectId);

  let releaseWrite;
  let enteredWrite;
  const entered = new Promise((resolve) => {
    enteredWrite = resolve;
  });
  const gate = new Promise((resolve) => {
    releaseWrite = resolve;
  });
  const save = async (values) => {
    enteredWrite();
    await gate;
    for (const value of values) await storage.put("segments", value);
  };
  const autosave = createAutosaveService({
    editorSessionStore: { getSegments: () => [segment] },
    repository: { save: (value) => save([value]), saveMany: save },
    editLifecycle: { finalize() {}, finalizeProject() {}, finalizeAll() {} },
    status: { set() {} }
  });
  segment = { ...segment, target: "Newest acknowledged 🎯", revision: 2 };
  autosave.enqueueEdit(projectId, segment);
  const first = autosave.flush(projectId);
  await entered;
  let secondDone = false;
  const second = autosave.flush(projectId).then(() => {
    secondDone = true;
  });
  await delay(30);
  assert(!secondDone, "R2 overlapping flush waits for the real IndexedDB commit");
  releaseWrite();
  await Promise.all([first, second]);
  assert(
    (await storage.get("segments", segmentId)).target === segment.target,
    "R2 newest immutable edit survived the flush"
  );

  segment = { ...(await storage.get("segments", segmentId)), target: "Typing before failed command", revision: 3 };
  autosave.enqueueEdit(projectId, segment);
  const commands = createCommandPersistenceService({
    autosave,
    session: { getSegments: () => [segment] },
    repository: {
      save: () => Promise.reject(new DOMException("Simulated exhausted quota", "QuotaExceededError")),
      saveMany: () => Promise.resolve()
    }
  });
  commands.clear(segment);
  segment.target = "Uncommitted command";
  try {
    await commands.save(segment);
  } catch {
    segment.target = "Typing before failed command";
  }
  await delay(20);
  await autosave.flush();
  assert(
    (await storage.get("segments", segmentId)).target === segment.target,
    "R6 failed command retains and retries the preceding typing obligation"
  );

  const noop = () => {};
  let dirtyIds = new Set();
  let recoveryIds = new Set();
  const dirty = createWorkspaceDirtyStateController({
    state: {
      getDirty: () => dirtyIds,
      setDirty: (value) => {
        dirtyIds = value;
      },
      getRecovery: () => recoveryIds,
      setRecovery: (value) => {
        recoveryIds = value;
      },
      getStatus: () => ({ connected: true })
    },
    storage: sessionStorage,
    session: { getProject: () => ({ id: projectId }), getProjects: () => [{ id: projectId }] },
    resources: { links: () => [] },
    summary: { markDirty: noop },
    recovery: { resetDismissal: noop },
    presentation: { renderStatus: noop, renderRecovery: noop }
  });
  dirty.mark(projectId);
  const exportedGeneration = dirty.generation(projectId);
  const root = await navigator.storage.getDirectory();
  const raceFile = await root.getFileHandle("generation-race.txt", { create: true });
  const raceWrite = await raceFile.createWritable();
  await raceWrite.write("Previously acknowledged generation");
  dirty.mark(projectId);
  await raceWrite.close();
  dirty.clear(projectId, exportedGeneration);
  assert(dirty.ids().includes(projectId), "R1 an edit during a real folder write keeps the newer generation dirty");

  const largeTarget = "ç".repeat(26 * 1024 * 1024);
  const large = await writeArchive({
    app: "LoopCAT",
    project: { id: "large-portable" },
    segments: [{ id: "large-target", target: largeTarget }]
  });
  const largeRestored = await readArchive(large.data);
  assert(
    largeRestored.value.segments[0].target === largeTarget,
    "R3 real archive worker round trips target output above 50 MiB"
  );
  const forged = new Uint8Array(await large.data.arrayBuffer());
  const directory = new DataView(forged.buffer);
  for (let i = 0; i < forged.length - 28; i++)
    if (directory.getUint32(i, true) === 0x02014b50) {
      directory.setUint32(i + 24, 1, true);
      break;
    }
  let rejected = false;
  try {
    await readArchive(new Blob([forged]), { verifyOnly: true });
  } catch {
    rejected = true;
  }
  assert(rejected, "R7 real archive worker rejects a forged expanded-size declaration");

  const checkpoint = await storage.createCheckpoint("browser-regression");
  assert(checkpoint.verified, "R11 checkpoint worker verifies IndexedDB records and assets");
  const descriptor = await storage.createArchiveExport();
  const destinationHandle = await root.getFileHandle("verified-file-stream.loopcat-backup.zip", { create: true });
  const fileStream = await destinationHandle.createWritable();
  const fileResult = await writeArchive(descriptor, fileStream);
  assert(
    (await readArchive(await destinationHandle.getFile(), { verifyOnly: true })).digest === fileResult.digest,
    "R13 native browser file stream closes and verifies through the archive worker"
  );
  const archive = await writeArchive(descriptor);
  const folder = await navigator.storage.getDirectory();
  const external = await writeArchive(descriptor, undefined, { externalRoot: folder });
  const externalChecked = await readArchive(external.data, { verifyOnly: true, externalRoot: folder });
  assert(externalChecked.digest === external.digest, "R12 worker can read and verify folder handles and shared assets");
  const collected = [];
  const sink = new WritableStream({
    write(bytes) {
      collected.push(bytes);
    }
  });
  const streamed = await writeArchive(descriptor, sink);
  assert(
    (await readArchive(new Blob(collected), { verifyOnly: true })).digest === streamed.digest,
    "R13 transferable destination stream closes before export resolves"
  );
  const checked = await readArchive(archive.data, { verifyOnly: true });
  assert(checked.digest === archive.digest, "R3 R13 archive worker completes ZIP and verifies its digest");
  const staged = await archiveJob("stage", archive.data);
  const plan = await storage.prepareRestore(staged, { mode: "copy" });
  const result = await storage.commitRestore(plan);
  const copied = (await storage.getAll("segments")).find(
    (value) => value.target === segment.target && value.id !== segmentId
  );
  assert(
    result.projectIds.length > 0 && copied?.comments[0].text === "Keep me" && copied?.history[0].target === "Older",
    "R5 staged copy restore preserves target, comments and history"
  );
  const replace = await storage.prepareRestore(
    { app: "LoopCAT", schemaVersion: 6, projects: [], segments: [], tmEntries: [], terms: [], activityEvents: [] },
    { mode: "replace" }
  );
  await storage.commitRestore(replace);
  assert(
    (await storage.getAll("segments")).length === 0 &&
      (await storage.getAll("checkpoints")).some((row) => row.verified && row.rollback),
    "R5 empty replacement retains verified rollback"
  );
  await storage.put("restoreStaging", { id: "archive-stage-interrupted", inProgress: true });
  await storage.put("restoreStaging", { id: "archive-stage-interrupted:record:segments:s", store: "segments", value: { id: "s" } });
  const restoredStage = await archiveJob("stage", archive.data);
  assert(!(await storage.get("restoreStaging", "archive-stage-interrupted")) && !(await storage.get("restoreStaging", "archive-stage-interrupted:record:segments:s")), "R7 a new archive job reclaims interrupted staging under an exclusive lock");
  await storage.commitRestore(await storage.prepareRestore(restoredStage, { mode: "replace" }));
  assert(
    (await storage.get("segments", segmentId)).target === segment.target,
    "R12 archived output restores after authoritative stores are empty"
  );
  let ticks = 0;
  const timer = setInterval(() => ticks++, 20);
  try {
    await evaluateRegex({ type: "query", pattern: "(a+)+$", records: [{ id: "evil", text: "a".repeat(100) + "!" }] });
    throw new Error("Hostile pattern unexpectedly completed");
  } catch (error) {
    assert(
      error.message.includes("deadline") && ticks > 10,
      "R9 hostile regex is terminated while the renderer stays responsive"
    );
  } finally {
    clearInterval(timer);
  }
  await storage.releaseProject(projectId);
  output.textContent = lines.join("\n") + "\nRELIABILITY TEST PASS";
  parent.postMessage({ type: "loopcat-test-result", text: output.textContent }, location.origin);
}
main().catch((error) => {
  output.textContent = lines.join("\n") + "\nRELIABILITY TEST FAIL " + error.stack;
  parent.postMessage({ type: "loopcat-test-result", text: output.textContent }, location.origin);
});
