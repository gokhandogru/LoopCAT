import { readEntries, readPackage, writePackage } from "./archive-adapter.js";
import * as archiveAssets from "./record-assets.js";

// The legacy storage boundary is also used in the dedicated recovery worker.
// It performs checkpoint/indexed reads here; project editing remains in the owner.
self.window = self;
const storageReady = import("./archive-worker-storage.js").then(({ storage }) => {
  self.CatHan.archiveAssets = archiveAssets;
  return storage;
});
const acknowledgements = new Map();
let sequence = 0;
async function deliver(record) {
  const id = ++sequence;
  await new Promise((resolve, reject) => {
    acknowledgements.set(id, { resolve, reject });
    self.postMessage({ type: "record", id, record });
  });
}
self.onmessage = async ({ data }) => {
  if (data.type === "ack") {
    const pending = acknowledgements.get(data.id);
    acknowledgements.delete(data.id);
    if (data.error) pending?.reject(new Error(data.error));
    else pending?.resolve();
    return;
  }
  if (data.type !== "job") return;
  const pulse = setInterval(() => self.postMessage({ type: "progress" }), 1000);
  try {
    const storage = await storageReady;
    let result;
    if (data.operation === "checkpoint") result = await storage.createCheckpoint(data.input);
    else if (data.operation === "journal-base") result = await storage.prepareJournalBase();
    else if (data.operation === "stage-checkpoint") result = await storage.stageCheckpoint(data.input);
    else if (data.operation === "stage")
      result = await storage.stageBackupRecords(async (onRecord) => {
        const checked = await readPackage(data.input, { ...data.options, onRecord });
        if (checked.manifest.kind !== "workspace") throw new Error("Choose a workspace backup archive.");
      });
    else if (data.operation === "prepare-restore")
      result = await storage.prepareRestore(data.input.data, { mode: data.input.mode });
    else if (data.operation === "write") {
      const input = data.input.checkpointId
        ? await storage.checkpointArchiveSource(data.input.checkpointId)
        : data.input;
      result = await writePackage(input, data.writable, data.options);
    } else if (data.operation === "read")
      result = await readPackage(data.input, { ...data.options, ...(data.streamRecords ? { onRecord: deliver } : {}) });
    else if (data.operation === "entries") result = await readEntries(data.input, data.options);
    else throw new Error("Unsupported archive worker operation.");
    self.postMessage({ type: "complete", result });
  } catch (error) {
    self.postMessage({ type: "failed", error: error.message || "Archive processing failed." });
  } finally {
    clearInterval(pulse);
  }
};
