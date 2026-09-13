const load = () => import("./archive-worker-client.js");
window.CatHan = window.CatHan || {};
window.CatHan.archive = Object.freeze({
  cancel: async () => (await load()).cancelArchiveJobs(),
  createWorkspaceStore: async (root) =>
    (await import("../workspace/workspace-archive-store.js")).createWorkspaceArchiveStore(root),
  createCheckpoint: async (reason) => (await load()).archiveJob("checkpoint", reason),
  prepareJournalBase: async () => (await load()).archiveJob("journal-base"),
  prepareRestore: async (data, mode) => (await load()).archiveJob("prepare-restore", { data, mode }),
  stageCheckpoint: async (id) => (await load()).archiveJob("stage-checkpoint", id),
  stageBackup: async (input, options) => (await load()).archiveJob("stage", input, options),
  readEntries: async (input, options) => (await load()).archiveJob("entries", input, options),
  readPackage: async (...args) => (await load()).readArchive(...args),
  writePackage: async (...args) => (await load()).writeArchive(...args)
});
