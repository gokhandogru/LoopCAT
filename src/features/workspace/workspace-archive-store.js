import { digest as sha256 } from "../import-export/record-assets.js";
import { readArchive as readPackage, writeArchive as writePackage } from "../import-export/archive-worker-client.js";

export function retainedGenerations(backups, now = Date.now()) {
  const verified = backups.filter((item) => item.verified).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const keep = new Set(verified.slice(0, 10).map((item) => item.id));
  const days = new Set();
  for (const item of verified) {
    const day = item.createdAt.slice(0, 10);
    if (Date.parse(item.createdAt) >= now - 7 * 86400000 && !days.has(day)) {
      keep.add(item.id);
      days.add(day);
    }
    if (item.rollback) keep.add(item.id);
  }
  return backups.filter((item) => keep.has(item.id) || !item.verified);
}

export function createWorkspaceArchiveStore(root) {
  let current;
  let divergent = false;
  let tail = Promise.resolve();
  const safe = (parts) => {
    if (
      !Array.isArray(parts) ||
      parts[0] !== "loopcat-v2" ||
      parts.some(
        (part) => typeof part !== "string" || !part || part === "." || part === ".." || /[\\/:\x00-\x1f]/.test(part)
      )
    )
      throw new Error("Invalid archive workspace path.");
    return parts;
  };
  async function file(parts, create = false) {
    safe(parts);
    let directory = root;
    for (const part of parts.slice(0, -1)) directory = await directory.getDirectoryHandle(part, { create });
    return directory.getFileHandle(parts.at(-1), { create });
  }
  async function readJson(parts) {
    const value = await (await file(parts)).getFile();
    if (value.size > 16 * 1024 * 1024) throw new Error("Workspace generation metadata is too large.");
    return JSON.parse(await value.text());
  }
  async function writeJson(parts, value) {
    const handle = await file(parts, true);
    const bytes = new TextEncoder().encode(JSON.stringify(value));
    const writable = await handle.createWritable();
    try {
      await writable.write(bytes);
      await writable.close();
    } catch (error) {
      await writable.abort?.().catch(() => {});
      throw error;
    }
    if ((await sha256(await (await handle.getFile()).arrayBuffer())) !== (await sha256(bytes)))
      throw new Error("Workspace metadata readback failed.");
  }
  async function head() {
    try {
      return await readJson(["loopcat-v2", "current.json"]);
    } catch (error) {
      if (error.name === "NotFoundError") return null;
      throw error;
    }
  }
  async function generationHeads() {
    let directory;
    try {
      directory = await (await root.getDirectoryHandle("loopcat-v2")).getDirectoryHandle("generations");
    } catch (error) {
      if (error.name === "NotFoundError") return [];
      throw error;
    }
    const rows = [];
    const parents = new Set();
    for await (const [name, handle] of directory.entries()) {
      if (handle.kind !== "file" || !/^[a-f0-9-]+\.json$/.test(name)) continue;
      if (rows.length >= 50000)
        throw new Error("Workspace history exceeds the discovery limit; recover a selected backup into a new folder.");
      const generation = await readJson(["loopcat-v2", "generations", name]);
      if (generation.version !== 1 || name !== `${generation.id}.json`)
        throw new Error("Unsupported workspace history.");
      rows.push({ id: generation.id, parentId: generation.parentId });
      if (generation.parentId) parents.add(generation.parentId);
    }
    return rows.filter((row) => !parents.has(row.id));
  }
  async function discoverBackups() {
    const refs = new Map();
    for (const branch of await generationHeads()) {
      const generation = await readJson(["loopcat-v2", "generations", `${branch.id}.json`]);
      for (const backup of generation.backups || []) {
        safe(backup.path.split("/"));
        refs.set(backup.path, { ...backup, branch: branch.id });
      }
    }
    return [...refs.values()];
  }
  async function load() {
    if (current) return current;
    const pointer = await head();
    if (!pointer) {
      divergent = (await generationHeads()).length > 0;
      return (current = {
        version: 1,
        id: null,
        projects: [],
        backups: [],
        ...(divergent
          ? {
              recoveryWarning:
                "The folder generation pointer is missing. Recover a retained generation as copies, then choose a new backup folder."
            }
          : {})
      });
    }
    if (pointer.version !== 1 || typeof pointer.id !== "string" || !/^[a-f0-9-]+$/.test(pointer.id))
      throw new Error("Unsupported workspace generation.");
    const generation = await readJson(["loopcat-v2", "generations", `${pointer.id}.json`]);
    if (
      generation.version !== 1 ||
      generation.id !== pointer.id ||
      (await sha256(new TextEncoder().encode(JSON.stringify(generation)))) !== pointer.digest
    )
      throw new Error("Workspace generation integrity check failed. Existing packages have been preserved.");
    const heads = await generationHeads();
    divergent = heads.length !== 1 || heads[0]?.id !== pointer.id;
    current = {
      ...generation,
      ...(divergent
        ? {
            recoveryWarning:
              "Folder histories diverged. Recover the desired generation as copies, then choose a new backup folder."
          }
        : {})
    };
    return current;
  }
  async function writeArchive(parts, value, previous, generationOnly = false) {
    const handle = await file(parts, true);
    const writable = await handle.createWritable();
    const result = await writePackage(value, writable, {
      generation: value.generation ?? (previous.generation || 0) + 1,
      parentGeneration: previous.id,
      ...(generationOnly ? { externalRoot: root } : {})
    });
    const checked = await readPackage(await handle.getFile(), {
      verifyOnly: true,
      ...(generationOnly ? { externalRoot: root } : {})
    });
    if (checked.digest !== result.digest) throw new Error("Backup readback did not match the written generation.");
    return { digest: result.digest, verified: true, written: true };
  }
  function serialized(action) {
    const run = () =>
      globalThis.navigator?.locks ? navigator.locks.request("loopcat-external-workspace", action) : action();
    const operation = tail.then(run);
    tail = operation.catch(() => {});
    return operation;
  }
  async function advance(previous, next) {
    if (divergent) throw new Error(current.recoveryWarning);
    const pointer = await head();
    if ((pointer?.id || null) !== previous.id)
      throw new Error("Workspace folder histories diverged. Reconnect and review the generations or import as copies.");
    const generation = {
      ...next,
      version: 1,
      id: crypto.randomUUID(),
      parentId: previous.id,
      generation: (previous.generation || 0) + 1,
      createdAt: new Date().toISOString()
    };
    await writeJson(["loopcat-v2", "generations", `${generation.id}.json`], generation);
    if (((await head())?.id || null) !== previous.id)
      throw new Error("Another writer advanced the folder. Both generations were retained for recovery.");
    await writeJson(["loopcat-v2", "current.json"], {
      version: 1,
      id: generation.id,
      digest: await sha256(new TextEncoder().encode(JSON.stringify(generation)))
    });
    current = generation;
    return generation;
  }
  function saveProjectPackage(pkg) {
    return serialized(async () => {
      const previous = await load();
      const id = crypto.randomUUID();
      const projectKey = await sha256(new TextEncoder().encode(pkg.project.id));
      const parts = ["loopcat-v2", "projects", projectKey, `${id}.loopcat.zip`];
      const checked = await writeArchive(parts, pkg, previous);
      const savedAt = new Date().toISOString();
      const ref = {
        id: pkg.project.id,
        name: pkg.project.name,
        packagePath: parts.join("/"),
        lastSavedAt: savedAt,
        segmentCount: pkg.segments.length,
        ...checked
      };
      const manifest = await advance(previous, {
        ...previous,
        projects: [...previous.projects.filter((item) => item.id !== ref.id), ref]
      });
      return { ...checked, manifest, packagePath: ref.packagePath, savedAt, validationReportSaved: true };
    });
  }
  function exportFullBackup(value, { generationOnly = false } = {}) {
    return serialized(async () => {
      const previous = await load();
      const id = crypto.randomUUID();
      const parts = [
        "loopcat-v2",
        "backups",
        `${id}${generationOnly ? ".loopcat-workspace-state.zip" : ".loopcat-backup.zip"}`
      ];
      const checked = await writeArchive(parts, value, previous, generationOnly);
      const ref = {
        id,
        path: parts.join("/"),
        createdAt: new Date().toISOString(),
        generationOnly,
        localGeneration: value.generation,
        projectCount: value.projects.length,
        segmentCount: value.counts?.segments ?? value.segments.length,
        ...checked
      };
      const all = [...previous.backups, ref];
      const retained = retainedGenerations(all);
      await advance(previous, { ...previous, backups: retained });
      // A verified replacement and its pointer must both exist before pruning.
      // Shared source assets and legacy files are never removed here.
      const obsolete = all.filter((item) => !retained.some((keep) => keep.id === item.id));
      for (const item of obsolete) {
        const parts = item.path.split("/");
        if (
          parts.length !== 3 ||
          parts[0] !== "loopcat-v2" ||
          parts[1] !== "backups" ||
          !/^[a-f0-9-]+\.loopcat-(?:backup|workspace-state)\.zip$/.test(parts[2])
        )
          continue;
        try {
          await (
            await root.getDirectoryHandle("loopcat-v2")
          )
            .getDirectoryHandle("backups")
            .then((folder) => folder.removeEntry(parts[2]));
        } catch {
          /* A failed cleanup retains extra recovery files. */
        }
      }
      return { ...ref, manifestSaved: true };
    });
  }
  return Object.freeze({
    saveProjectPackage,
    exportFullBackup,
    load,
    discoverBackups,
    file: async (path) => (await file(path.split("/"))).getFile(),
    root,
    read: async (path) =>
      (await readPackage(await (await file(path.split("/"))).getFile(), { externalRoot: root })).value
  });
}
