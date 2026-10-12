import "../linguistics/core.js";
import "../../../source-update-core.js";

const id = (prefix) => `${prefix}-${crypto.randomUUID()}`;
const plain = (value) => {
  const { storageVersion: _v, storageWriter: _w, storageGeneration: _g, ...record } = value;
  return record;
};
export const fileVersionId = (projectId, document) =>
  document.sourceVersionId || `original:${projectId}:${document.id}`;
export const compareSourceUpdate = (...args) => globalThis.LoopCATSourceUpdate.compareSourceUpdate(...args);

/** Owns journaled file lifecycle. UI and parsing are injected; historical rows never enter live queries. */
export function createFileLifecycleService({ storage, prepare, validate, compare = compareSourceUpdate }) {
  const previews = new Map();
  async function state(projectId, documentId) {
    const project = await storage.get("projects", projectId);
    const document = project?.documents?.find((d) => d.id === documentId);
    if (!document) throw Error("This file is no longer in the project.");
    const segments = (await storage.getAllByIndex("segments", "projectId", projectId))
      .filter((s) => s.documentId === documentId)
      .sort((a, b) => a.index - b.index);
    return { project, document, segments };
  }
  function guards(states) {
    return states.map((s) => ({
      store: "segments",
      index: "projectId",
      value: s.project.id,
      where: { documentId: s.document.id },
      records: s.segments
    }));
  }
  function projectAfter(project) {
    const next = structuredClone(project);
    next.updatedAt = new Date().toISOString();
    next.sourceFileName = next.documents[0]?.name || "";
    const docx = next.documents.find((d) => d.type === "docx" && next.docxStructures?.[d.id]);
    delete next.docxStructure;
    delete next.legacyDocxDocumentId;
    if (docx) {
      next.docxStructure = next.docxStructures[docx.id];
      next.legacyDocxDocumentId = docx.id;
    }
    return next;
  }
  function change(store, value) {
    return { store, value };
  }
  async function orderSegments(project, additions, replacedIds = []) {
    const existing = (await storage.getAllByIndex("segments", "projectId", project.id)).filter(
      (s) => !replacedIds.includes(s.documentId)
    );
    const added = new Set(additions.map((s) => s.id));
    const rows = [...existing, ...additions];
    const shifted = [];
    let ordinal = 0;
    for (const document of project.documents) {
      for (const row of rows.filter((s) => s.documentId === document.id).sort((a, b) => a.index - b.index)) {
        if (added.has(row.id)) row.index = ordinal;
        else if (row.index !== ordinal) shifted.push(change("segments", { ...row, index: ordinal }));
        ordinal++;
      }
    }
    return shifted;
  }
  function receipt(requestId, projectId, action, documentIds) {
    return change("fileLifecycleReceipts", {
      id: requestId,
      projectId,
      action,
      documentIds,
      createdAt: new Date().toISOString()
    });
  }
  async function replay(requestId, projectId, action, documentIds) {
    const existing = await storage.get("fileLifecycleReceipts", requestId);
    if (!existing) return false;
    if (
      existing.projectId !== projectId ||
      existing.action !== action ||
      JSON.stringify(existing.documentIds) !== JSON.stringify(documentIds)
    )
      throw Error("The retry does not match its original file action.");
    return true;
  }
  async function rename(projectId, documentId, name, requestId = id("rename")) {
    if (await replay(requestId, projectId, "rename:" + name, [documentId])) return storage.get("projects", projectId);
    const s = await state(projectId, documentId);
    name = String(name).trim();
    if (!name || name.length > 240 || /[\\/\x00-\x1f]/.test(name))
      throw Error("Choose a valid filename without folders.");
    const ext = s.document.name.match(/\.[^.]+$/)?.[0] || "";
    if (ext && !name.toLowerCase().endsWith(ext.toLowerCase()))
      throw Error("Renaming must preserve the file extension.");
    const next = projectAfter({
      ...s.project,
      documents: s.project.documents.map((d) =>
        d.id === documentId
          ? {
              ...d,
              name,
              sourceVersionId: fileVersionId(projectId, d),
              sourceRevision: d.sourceRevision || 1,
              lifecycleRevision: (d.lifecycleRevision || 0) + 1
            }
          : d
      )
    });
    await storage.commitMutation(null, null, {
      snapshots: guards([s]),
      changes: [
        change("projects", next),
        ...s.segments.map((segment) => change("segments", { ...segment, documentName: name })),
        receipt(requestId, projectId, "rename:" + name, [documentId])
      ]
    });
    return storage.get("projects", projectId);
  }
  async function preview(projectId, documentId, file, options = {}) {
    previews.clear();
    const before = await state(projectId, documentId);
    options.signal?.throwIfAborted();
    const prepared = options.prepared || (await prepare(file, { ...before.document.importOptions, ...options }));
    if (JSON.stringify(prepared).length * 2 > 150 * 1024 * 1024)
      throw Error("The reviewed source exceeds the 150 MiB in-memory limit.");
    const family = (type) => (["html", "htm"].includes(type) ? "html" : ["xlf", "xliff"].includes(type) ? "xlf" : type);
    if (family(prepared.documentType) !== family(before.document.type))
      throw Error("An update must use the same file format. Import another format as a new file.");
    const metadata = [prepared.structure, ...prepared.segments.map((s) => s.structure)].filter(Boolean);
    if (
      metadata.some(
        (m) =>
          (m.sourceLang && m.sourceLang.toLowerCase() !== before.project.sourceLang.toLowerCase()) ||
          (m.targetLang && m.targetLang.toLowerCase() !== before.project.targetLang.toLowerCase())
      )
    )
      throw Error("The replacement language pair differs from the project.");
    const incoming = prepared.segments.map((s) => ({
      ...s,
      source: s.source ?? s.text ?? "",
      documentType: prepared.documentType
    }));
    const comparison = await compare(before.segments, incoming, before.project.sourceLang, options.signal);
    await validate(
      prepared,
      incoming.map((s) => ({ ...s, target: s.target || "" }))
    );
    options.signal?.throwIfAborted();
    const noChanges =
      JSON.stringify(before.segments.map((s) => s.source)) === JSON.stringify(incoming.map((s) => s.source)) &&
      JSON.stringify(before.document.importOptions || {}) === JSON.stringify(prepared.importOptions || {}) &&
      !comparison.rows.some((r) => r.conflict) &&
      JSON.stringify(
        before.document.type === "docx"
          ? before.project.docxStructures?.[documentId]
          : before.project.localizationStructures?.[documentId]
      ) === JSON.stringify(prepared.structure);
    const result = {
      id: id("review"),
      before,
      prepared,
      incoming,
      ...comparison,
      noChanges,
      createdAt: Date.now(),
      restoredFromVersionId: options.restoredFromVersionId || ""
    };
    previews.set(result.id, result);
    return result;
  }
  async function commit(previewId, choices = {}, requestId = id("update")) {
    const prior = await storage.get("fileLifecycleReceipts", requestId);
    if (prior) {
      if (prior.action !== `update:${previewId}:${JSON.stringify(choices)}`)
        throw Error("The retry choices differ from the committed update.");
      return storage.get("projects", prior.projectId);
    }
    const p = previews.get(previewId);
    if (!p || Date.now() - p.createdAt > 30 * 60 * 1000)
      throw Error("This review expired. Review the source file again.");
    if (p.noChanges && !p.restoredFromVersionId) throw Error("No update is needed.");
    const { project, document, segments } = p.before;
    const versionId = id("version"),
      createdAt = new Date().toISOString();
    const nextSegments = p.incoming.map((incoming, index) => {
      const row = p.rows[index];
      const choice = choices[index] || choices.all;
      if (row.conflict && !["current", "incoming"].includes(choice))
        throw Error("Resolve every incoming translation conflict before applying the update.");
      const useIncoming = row.conflict && choice === "incoming";
      const target = useIncoming ? row.incomingTarget : row.target;
      return {
        ...incoming,
        id: id("segment"),
        projectId: project.id,
        workspaceId: project.workspaceId || segments[0]?.workspaceId || "local-workspace",
        ownerId: project.ownerId || segments[0]?.ownerId || "local-user",
        documentId: document.id,
        documentName: document.name,
        documentType: document.type,
        sourceVersionId: versionId,
        index,
        documentIndex: index,
        target,
        status: target ? (useIncoming ? "draft" : row.status) : "empty",
        revision: 0,
        createdAt,
        updatedAt: createdAt,
        reviewState: target && (useIncoming || row.reviewRequired) ? "needs-review" : "",
        comments: [],
        history: [],
        targetHistory: [],
        aiSuggestions: [],
        comment: "",
        reviewNote: "",
        previousTranslation: null,
        sourceCarryover: null,
        ...(row.previousSegmentId
          ? {
              sourceCarryover: {
                previousSegmentId: row.previousSegmentId,
                previousVersionId: fileVersionId(project.id, document),
                preservedStatus: !useIncoming && row.preservedStatus,
                disposition: row.disposition
              }
            }
          : {}),
        ...(!row.safeReuse && row.previousTarget
          ? {
              previousTranslation: {
                source: row.previousSource,
                target: row.previousTarget,
                segmentId: row.previousSegmentId,
                sourceVersionId: fileVersionId(project.id, document)
              }
            }
          : {})
      };
    });
    await validate(p.prepared, nextSegments);
    const archive = {
      id: fileVersionId(project.id, document),
      projectId: project.id,
      documentId: document.id,
      version: document.sourceRevision || 1,
      documentInfo: document,
      createdAt,
      docxStructure: project.docxStructures?.[document.id],
      localizationStructure: project.localizationStructures?.[document.id],
      segmentCount: segments.length
    };
    const nextDocument = {
      ...document,
      sourceVersionId: versionId,
      sourceRevision: (document.sourceRevision || 1) + 1,
      lifecycleRevision: (document.lifecycleRevision || 0) + 1,
      originalFilename: p.prepared.fileName,
      importOptions: p.prepared.importOptions || {},
      updatedAt: createdAt,
      restoredFromVersionId: p.restoredFromVersionId
    };
    const next = {
      ...project,
      documents: project.documents.map((d) => (d.id === document.id ? nextDocument : d)),
      docxStructures: { ...project.docxStructures },
      localizationStructures: { ...project.localizationStructures }
    };
    if (document.type === "docx") next.docxStructures[document.id] = p.prepared.structure;
    else next.localizationStructures[document.id] = p.prepared.structure;
    const shifted = await orderSegments(next, nextSegments, [document.id]);
    const changes = [
      ...shifted,
      change("documentVersions", archive),
      ...segments.map((s) => change("versionSegments", { ...plain(s), sourceVersionId: archive.id })),
      ...segments.map((s) => ({
        store: "segments",
        key: s.id,
        delete: true,
        expectedVersion: s.storageVersion || 0,
        projectId: project.id
      })),
      ...nextSegments.map((s) => ({ ...change("segments", s), insertOnly: true })),
      change("projects", projectAfter(next)),
      receipt(requestId, project.id, `update:${previewId}:${JSON.stringify(choices)}`, [document.id])
    ];
    await storage.commitMutation(null, null, { snapshots: guards([p.before]), changes });
    previews.delete(previewId);
    return storage.get("projects", project.id);
  }
  async function versions(projectId, documentId) {
    return (await storage.getAllByIndex("documentVersions", "projectId", projectId))
      .filter((v) => v.documentId === documentId)
      .sort((a, b) => b.version - a.version);
  }
  async function versionSegments(versionId) {
    return (await storage.getAllByIndex("versionSegments", "sourceVersionId", versionId)).sort(
      (a, b) => a.index - b.index
    );
  }
  async function restoreVersion(projectId, documentId, versionId) {
    const version = await storage.get("documentVersions", versionId);
    if (!version || version.projectId !== projectId || version.documentId !== documentId)
      throw Error("This version does not belong to the file.");
    return preview(projectId, documentId, null, {
      restoredFromVersionId: versionId,
      prepared: {
        fileName: version.documentInfo.name,
        documentType: version.documentInfo.type,
        structure: version.docxStructure || version.localizationStructure,
        segments: await versionSegments(versionId),
        importOptions: version.documentInfo.importOptions || {}
      }
    });
  }
  async function trash(projectId, documentIds, requestId = id("trash")) {
    if (!documentIds.length || documentIds.length > 50 || new Set(documentIds).size !== documentIds.length)
      throw Error("Select between 1 and 50 distinct files.");
    if (await replay(requestId, projectId, "trash", documentIds)) return storage.get("projects", projectId);
    const states = await Promise.all(documentIds.map((d) => state(projectId, d)));
    const project = states[0].project;
    const next = {
      ...project,
      documents: project.documents.filter((d) => !documentIds.includes(d.id)),
      docxStructures: { ...project.docxStructures },
      localizationStructures: { ...project.localizationStructures }
    };
    const changes = [];
    for (const s of states) {
      const entry = {
        id: id("trash"),
        entityType: "document",
        entityId: s.document.id,
        projectId,
        label: s.document.name,
        deletedAt: new Date().toISOString(),
        payload: {
          documentInfo: s.document,
          segments: s.segments,
          docxStructure: project.docxStructures?.[s.document.id],
          localizationStructure: project.localizationStructures?.[s.document.id],
          ordinal: project.documents.findIndex((d) => d.id === s.document.id)
        }
      };
      changes.push(
        change("trashEntries", entry),
        ...s.segments.map((segment) => ({
          store: "segments",
          key: segment.id,
          delete: true,
          expectedVersion: segment.storageVersion || 0,
          projectId
        }))
      );
      delete next.docxStructures[s.document.id];
      delete next.localizationStructures[s.document.id];
    }
    const recorded = receipt(requestId, projectId, "trash", documentIds);
    recorded.value.entryIds = changes.filter((c) => c.store === "trashEntries").map((c) => c.value.id);
    changes.push(change("projects", projectAfter(next)), recorded);
    await storage.commitMutation(null, null, { snapshots: guards(states), changes });
    return storage.get("projects", projectId);
  }
  async function restoreTrash(entryIds) {
    if (!entryIds.length || entryIds.length > 50 || new Set(entryIds).size !== entryIds.length)
      throw Error("Select between 1 and 50 distinct Trash files.");
    const entries = await Promise.all(entryIds.map((entryId) => storage.get("trashEntries", entryId)));
    if (entries.some((e) => !e || e.entityType !== "document") || new Set(entries.map((e) => e.projectId)).size !== 1)
      throw Error("Choose existing file Trash items from one project.");
    const projectId = entries[0].projectId,
      project = await storage.get("projects", projectId);
    if (!project) throw Error("Restore the parent project first.");
    const documents = project.documents.slice(),
      docxStructures = { ...project.docxStructures },
      localizationStructures = { ...project.localizationStructures };
    const changes = [];
    for (const entry of entries.sort((a, b) => (a.payload.ordinal ?? Infinity) - (b.payload.ordinal ?? Infinity))) {
      if (documents.some((d) => d.id === entry.entityId)) throw Error("A file with this identity already exists.");
      documents.splice(
        Math.min(entry.payload.ordinal ?? documents.length, documents.length),
        0,
        entry.payload.documentInfo
      );
      if (entry.payload.docxStructure) docxStructures[entry.entityId] = entry.payload.docxStructure;
      if (entry.payload.localizationStructure)
        localizationStructures[entry.entityId] = entry.payload.localizationStructure;
      changes.push(...entry.payload.segments.map((s) => ({ ...change("segments", plain(s)), insertOnly: true })), {
        store: "trashEntries",
        key: entry.id,
        delete: true,
        expectedVersion: entry.storageVersion || 0,
        projectId
      });
    }
    const restoredProject = projectAfter({ ...project, documents, docxStructures, localizationStructures });
    const additions = changes.filter((c) => c.store === "segments").map((c) => c.value);
    changes.push(...(await orderSegments(restoredProject, additions)), change("projects", restoredProject));
    await storage.commitMutation(null, null, { changes });
    return storage.get("projects", projectId);
  }
  return {
    state,
    rename,
    preview,
    commit,
    versions,
    versionSegments,
    restoreVersion,
    trash,
    restoreTrash,
    cancel: () => previews.clear()
  };
}
