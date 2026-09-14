export function createReliabilityControls({
  window,
  document,
  storage,
  session,
  autosave,
  status,
  saveState,
  render,
  reopen,
  exports,
  workspace
}) {
  const readOnly = new Set();
  const paused = new Set();
  let pauseAll = 0;
  let activeProject = "";
  let checkpointTimer;
  let checkpointRunning = false;
  let dirtySinceCheckpoint = false;
  let channel;
  let storageError = "";
  let genericStorageError = "";
  const conflictingRecords = new Map();
  let lastVerifiedBackup = null;
  let backupError = "";
  let wasConnected = false;
  let committedGeneration = 0;
  try {
    channel = new window.BroadcastChannel("loopcat-ownership-v1");
  } catch {
    /* The lease still enforces ownership. */
  }
  const clientId = crypto.randomUUID();
  const isReadOnly = (projectId) => Boolean(pauseAll || readOnly.has(projectId) || paused.has(projectId));
  function assertWritable(projectId) {
    if (isReadOnly(projectId))
      throw new Error("Project is read-only while another window owns editing or recovery is in progress.");
  }
  function refresh() {
    const pending = autosave.getState();
    saveState?.setDurability({
      pendingCount: pending.pending,
      inFlightCount: pending.inFlight,
      committedGeneration,
      verifiedBackupGeneration: lastVerifiedBackup?.localGeneration ?? null,
      durableErrors: [storageError, backupError].filter(Boolean)
    });
    const projectId = session.getProject()?.id;
    const button = document.getElementById("requestEditingBtn");
    if (button) button.hidden = !readOnly.has(projectId);
    const label = document.getElementById("protectionStatus");
    if (label)
      label.textContent = `${readOnly.has(projectId) ? "Read-only · " : ""}${storageError || (autosave.size() ? "Local save pending" : "Local save up to date")} · ${backupError || (workspace.connected() ? (lastVerifiedBackup ? `External backup verified ${new Date(lastVerifiedBackup.createdAt).toLocaleTimeString()}` : "External backup pending") : "External backup not configured")}`;
    if (workspace.connected() && !wasConnected) {
      dirtySinceCheckpoint = true;
      scheduleCheckpoint();
      window.CatHan.workspaceStorage
        .getStatus()
        .then((value) => {
          lastVerifiedBackup = value.latestVerifiedBackup;
        })
        .catch(() => {});
    }
    wasConnected = workspace.connected();
  }
  async function open(projectId) {
    if (activeProject && activeProject !== projectId) await storage.releaseProject(activeProject);
    activeProject = projectId;
    if (projectId) {
      const token = await storage.acquireProject(projectId);
      if (token === null) readOnly.add(projectId);
      else readOnly.delete(projectId);
    }
    refresh();
  }
  function emergencyText() {
    return (
      `LoopCAT emergency bilingual output\nProject: ${session.getProject()?.name || "Current project"}\nCreated: ${new Date().toISOString()}\n\n` +
      session
        .getSegments()
        .map(
          (segment) =>
            `[${segment.id}] ${segment.documentName || ""}\nSource:\n${segment.source || ""}\nTarget:\n${segment.target || ""}`
        )
        .join("\n\n")
    );
  }
  function pauseEditing() {
    pauseAll++;
    render();
    refresh();
    let released = false;
    return () => {
      if (released) return;
      released = true;
      pauseAll--;
      render();
      refresh();
    };
  }
  async function withEditingPaused(action) {
    pauseAll++;
    try {
      render();
      await autosave.flush();
      await storage.flushMutations();
      return await action();
    } finally {
      pauseAll--;
      try {
        render();
        refresh();
      } catch (error) {
        status.set(`Saved state needs a display refresh: ${error.message}`, "dirty");
      }
    }
  }
  async function checkpoint() {
    if (checkpointRunning || !dirtySinceCheckpoint) return;
    checkpointRunning = true;
    dirtySinceCheckpoint = false;
    try {
      await autosave.flush();
      const checkpoint = await storage.createCheckpoint();
      const project = session.getProject();
      if (project && !isReadOnly(project.id)) {
        const migrated = await storage.migrateCheckpointAssets(checkpoint.id, project.id);
        if (
          migrated &&
          session.getProject()?.id === migrated.id &&
          session.getProject().storageVersion === project.storageVersion
        )
          session.replaceProject({
            ...migrated,
            docxStructure: migrated.docxStructures[migrated.legacyDocxDocumentId]
          });
      }
      if (committedGeneration <= checkpoint.generation) dirtySinceCheckpoint = false;
      if (workspace.connected()) {
        await workspace.backup({ generationOnly: true });
        lastVerifiedBackup = (await window.CatHan.workspaceStorage.getStatus()).latestVerifiedBackup;
      }
      backupError = "";
    } catch (error) {
      dirtySinceCheckpoint = true;
      backupError = `Recovery backup failed: ${error.message}`;
      status.set(`Recovery checkpoint failed: ${error.message}`, "dirty");
    } finally {
      checkpointRunning = false;
      if (dirtySinceCheckpoint) scheduleCheckpoint();
      refresh();
    }
  }
  function scheduleCheckpoint() {
    if (checkpointTimer || checkpointRunning) return;
    checkpointTimer = setTimeout(() => {
      checkpointTimer = null;
      void checkpoint();
    }, 60000);
  }
  if (channel)
    channel.onmessage = async ({ data }) => {
      if (data?.sender === clientId || typeof data?.projectId !== "string") return;
      const id = data.projectId;
      if (data.type === "handoff-request" && activeProject === id && !readOnly.has(id)) {
        paused.add(id);
        render();
        try {
          await autosave.flush(id);
          await storage.flushMutations();
          await storage.releaseProject(id);
          readOnly.add(id);
          channel.postMessage({ type: "handoff-complete", projectId: id, recipient: data.sender, sender: clientId });
        } catch (error) {
          status.setPersistence(`Editing handoff failed: ${error.message}; retry saving`, "dirty");
        } finally {
          paused.delete(id);
          render();
          refresh();
        }
      } else if (data.type === "handoff-complete" && data.recipient === clientId) {
        await reopen(id);
        refresh();
      }
    };
  function mount() {
    window.addEventListener("loopcat-storage-initialization", (event) => {
      status.setInitialization?.(event.detail?.message || "");
    });
    storage
      .get("appMeta", "committed-generation")
      .then((value) => {
        committedGeneration = Math.max(committedGeneration, Number(value?.value) || 0);
        refresh();
      })
      .catch(() => {});
    const run = (action) => () => {
      return Promise.resolve()
        .then(action)
        .catch((error) => {
          status.set(error.message, "dirty");
        });
    };
    document.getElementById("cancelArchiveBtn")?.addEventListener(
      "click",
      run(() => window.CatHan.archive.cancel())
    );
    window.addEventListener("loopcat-archive-jobs", (event) => {
      const button = document.getElementById("cancelArchiveBtn");
      if (button) button.disabled = !event.detail.count;
    });
    document.getElementById("refreshFolderBackupsBtn")?.addEventListener(
      "click",
      run(async () => {
        const backups = await window.CatHan.workspaceStorage.listRecoveryBackups();
        const select = document.getElementById("folderBackupSelect");
        select.replaceChildren();
        for (const backup of backups
          .filter((item) => item.verified)
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt))) {
          const option = document.createElement("option");
          option.value = backup.path;
          option.textContent = `${new Date(backup.createdAt).toLocaleString()} · ${backup.projectCount} projects · ${backup.segmentCount} segments`;
          select.append(option);
        }
      })
    );
    document.getElementById("restoreFolderBackupBtn")?.addEventListener(
      "click",
      run(async () => {
        const path = document.getElementById("folderBackupSelect").value;
        if (path) await exports.restore(await window.CatHan.workspaceStorage.stageBackup(path));
      })
    );
    document.getElementById("refreshCheckpointsBtn")?.addEventListener(
      "click",
      run(async () => {
        const checkpoints = (await storage.getAll("checkpoints"))
          .filter((item) => item.verified)
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
        const select = document.getElementById("checkpointSelect");
        select.replaceChildren();
        for (const checkpoint of checkpoints) {
          const option = document.createElement("option");
          option.value = checkpoint.id;
          option.textContent = `${new Date(checkpoint.createdAt).toLocaleString()} · ${checkpoint.reason}${checkpoint.rollback ? " · protected rollback" : ""}`;
          select.append(option);
        }
        if (!checkpoints.length)
          status.set("No verified checkpoints yet. A recovery checkpoint is created after dirty activity.", "dirty");
      })
    );
    document.getElementById("restoreCheckpointBtn")?.addEventListener(
      "click",
      run(async () => {
        const id = document.getElementById("checkpointSelect").value;
        if (!id) return;
        status.set("Verifying recovery checkpoint...");
        await exports.restore(await window.CatHan.archive.stageCheckpoint(id));
      })
    );
    document.getElementById("exportConflictsBtn")?.addEventListener(
      "click",
      run(async () => {
        const conflicts = await storage.getAll("conflictCopies");
        const text = conflicts
          .flatMap((conflict) =>
            (conflict.changes || []).map(
              (change) =>
                `[${conflict.createdAt}] ${change.store} ${change.value?.id || change.key || ""}\n${change.store === "segments" ? `Source:\n${change.value?.source || ""}\nPreserved target:\n${change.value?.target || ""}` : JSON.stringify(change.value, null, 2)}`
            )
          )
          .join("\n\n");
        exports.download(
          "loopcat-preserved-conflicts.txt",
          text || "No preserved conflicting records.",
          "text/plain;charset=utf-8"
        );
        status.set("Conflict export download requested", "dirty");
      })
    );
    document.getElementById("retryLocalSaveBtn")?.addEventListener(
      "click",
      run(async () => {
        await autosave.flush();
        await storage.flushMutations();
        // A no-op flush does not prove a previously failed database reopened.
        await storage.get("appMeta", "committed-generation");
        genericStorageError = "";
        storageError = Array.from(conflictingRecords.values()).at(-1) || "";
        status.setStorage?.(storageError);
        if (!storageError && !autosave.size()) status.setPersistence("Saved", "saved");
        refresh();
      })
    );
    document.getElementById("emergencyExportBtn")?.addEventListener("click", () => {
      exports.download("loopcat-emergency.txt", emergencyText(), "text/plain;charset=utf-8");
      status.set("Emergency download requested", "dirty");
    });
    document
      .getElementById("projectPackageJsonExportBtn")
      ?.addEventListener("click", () => exports.project({ format: "json" }));
    document.getElementById("backupJsonExportBtn")?.addEventListener("click", () => exports.backup({ format: "json" }));
    document.getElementById("requestEditingBtn")?.addEventListener("click", async () => {
      const id = session.getProject()?.id;
      if (!id) return;
      if (channel) channel.postMessage({ type: "handoff-request", projectId: id, sender: clientId });
      if ((await storage.acquireProject(id)) !== null) await reopen(id);
    });
    window.addEventListener("loopcat-committed", (event) => {
      committedGeneration = Math.max(committedGeneration, event.detail.generation || 0);
      // A successful write acknowledges only its own records. Saving another
      // segment must never dismiss an unresolved conflict or database error.
      const previousError = storageError;
      for (const key of event.detail.recordKeys || []) conflictingRecords.delete(key);
      storageError = genericStorageError || Array.from(conflictingRecords.values()).at(-1) || "";
      if (storageError !== previousError) status.setStorage?.(storageError);
      dirtySinceCheckpoint = true;
      scheduleCheckpoint();
      if (!autosave.size() && !storageError) status.setPersistence("Saved", "saved");
      if (event.detail?.checkpointNow) {
        clearTimeout(checkpointTimer);
        checkpointTimer = null;
        void checkpoint();
      }
      refresh();
    });
    window.addEventListener("loopcat-storage-status", (event) => {
      const detail = event.detail;
      const message = typeof detail === "string" ? detail : detail?.message || "Local storage needs attention.";
      if (detail?.code === "conflict" && detail.recordKeys?.length) {
        for (const key of detail.recordKeys) conflictingRecords.set(key, message);
      } else genericStorageError = message;
      storageError = genericStorageError || message;
      if (status.setStorage) status.setStorage(storageError);
      else status.setPersistence(storageError, "dirty");
      refresh();
    });
    window.addEventListener("loopcat-ownership-lost", (event) => {
      readOnly.add(event.detail.projectId);
      status.setPersistence(
        "Editing ownership expired. Current output remains available; request editing access or export it.",
        "dirty"
      );
      render();
      refresh();
    });
    window.addEventListener("loopcat-workspace-connected", () => {
      wasConnected = false;
      lastVerifiedBackup = null;
      backupError = "";
      refresh();
    });
    setInterval(refresh, 1000);
    refresh();
  }
  window.CatHan.ownership = Object.freeze({ isReadOnly, assertWritable });
  return Object.freeze({ open, mount, emergencyText, withEditingPaused, pauseEditing, refresh });
}
