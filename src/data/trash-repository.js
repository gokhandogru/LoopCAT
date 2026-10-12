function trashId() {
  const suffix = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `trash-${suffix}`;
}

function resourceConfig(resourceType) {
  if (resourceType === "tm") {
    return {
      store: "tmEntries",
      nameField: "tmName",
      entryType: "tm-entry",
      resourceType: "translation-memory",
      entryLabel: "Translation memory entry"
    };
  }
  if (resourceType === "tb") {
    return {
      store: "terms",
      nameField: "termBaseName",
      entryType: "term",
      resourceType: "termbase",
      entryLabel: "Termbase entry"
    };
  }
  throw new Error(`Unsupported Trash resource type: ${resourceType}`);
}

function languagePair(record = {}) {
  return String(record.languagePair || `${record.sourceLang || ""}::${record.targetLang || ""}`);
}

function resourceTrashEntry(resourceType, records, { wholeResource = false } = {}) {
  const config = resourceConfig(resourceType);
  const first = records[0];
  if (!first) throw new Error("Resource no longer exists.");
  const resourceName = String(first[config.nameField] || "Unnamed resource");
  const pair = languagePair(first);
  return {
    id: trashId(),
    entityType: wholeResource ? config.resourceType : config.entryType,
    entityId: wholeResource ? `${resourceType}:${resourceName}:${pair}` : first.id,
    projectId: "",
    resourceType,
    resourceName,
    sourceLang: String(first.sourceLang || ""),
    targetLang: String(first.targetLang || ""),
    languagePair: pair,
    label: wholeResource ? resourceName : `${config.entryLabel} · ${resourceName}`,
    deletedAt: new Date().toISOString(),
    payload: { records }
  };
}

export function createTrashRepository(storageRepository) {
  if (
    !storageRepository?.moveProjectToTrash ||
    !storageRepository?.restoreTrashRecords ||
    !storageRepository?.moveResourceRecordsToTrash ||
    !storageRepository?.restoreResourceTrashRecords
  ) {
    throw new TypeError("TrashRepository requires schema-6 storage operations.");
  }

  async function list() {
    const entries = await storageRepository.getAll("trashEntries");
    return entries.sort((a, b) => new Date(b.deletedAt || 0).getTime() - new Date(a.deletedAt || 0).getTime());
  }

  return Object.freeze({
    list,
    async moveProject(projectId) {
      const [project, segments, activityEvents] = await Promise.all([
        storageRepository.get("projects", projectId),
        storageRepository.getAllByIndex("segments", "projectId", projectId),
        storageRepository.getAllByIndex("activityEvents", "projectId", projectId)
      ]);
      if (!project) throw new Error("Project no longer exists.");
      const entry = {
        id: trashId(),
        entityType: "project",
        entityId: project.id,
        projectId: project.id,
        label: String(project.name || "Project"),
        deletedAt: new Date().toISOString(),
        payload: { project, segments, activityEvents }
      };
      await storageRepository.moveProjectToTrash(project.id, entry);
      return entry;
    },
    async moveDocument(project, documentId) {
      project = (await storageRepository.get("projects", project?.id)) || project;
      const documentInfo = (project?.documents || []).find((documentRecord) => documentRecord.id === documentId);
      if (!project?.id || !documentInfo) throw new Error("Project file no longer exists.");
      const projectSegments = await storageRepository.getAllByIndex("segments", "projectId", project.id);
      const segments = projectSegments.filter((segment) => segment.documentId === documentId);
      const remainingSegments = projectSegments.filter((segment) => segment.documentId !== documentId);
      const nextProject = {
        ...project,
        documents: (project.documents || []).filter((documentRecord) => documentRecord.id !== documentId),
        sourceFileName: remainingSegments[0]?.documentName || "",
        docxStructures: { ...(project.docxStructures || {}) },
        localizationStructures: { ...(project.localizationStructures || {}) },
        updatedAt: new Date().toISOString()
      };
      const docxStructure = nextProject.docxStructures[documentId];
      const localizationStructure = nextProject.localizationStructures[documentId];
      delete nextProject.docxStructures[documentId];
      delete nextProject.localizationStructures[documentId];
      if (
        nextProject.legacyDocxDocumentId === documentId ||
        project.documents.find((d) => d.type === "docx")?.id === documentId
      ) {
        delete nextProject.docxStructure;
        delete nextProject.legacyDocxDocumentId;
        const remaining = nextProject.documents.find((d) => d.type === "docx" && nextProject.docxStructures[d.id]);
        if (remaining) {
          nextProject.docxStructure = nextProject.docxStructures[remaining.id];
          nextProject.legacyDocxDocumentId = remaining.id;
        }
      }
      const entry = {
        id: trashId(),
        entityType: "document",
        entityId: documentId,
        projectId: project.id,
        label: String(documentInfo.name || "File"),
        deletedAt: new Date().toISOString(),
        payload: {
          documentInfo,
          segments,
          docxStructure,
          localizationStructure,
          ordinal: project.documents.findIndex((d) => d.id === documentId)
        }
      };
      await storageRepository.moveProjectDocumentToTrash(nextProject, documentId, entry);
      return { entry, project: nextProject };
    },
    async moveResourceEntry(resourceType, entityId) {
      const config = resourceConfig(resourceType);
      const record = await storageRepository.get(config.store, entityId);
      if (!record) throw new Error("Resource entry no longer exists.");
      const entry = resourceTrashEntry(resourceType, [record]);
      await storageRepository.moveResourceRecordsToTrash(resourceType, entry);
      return entry;
    },
    async moveResource(resourceType, descriptor = {}) {
      const config = resourceConfig(resourceType);
      const name = String(descriptor.name || "");
      const pair = String(descriptor.languagePair || `${descriptor.sourceLang || ""}::${descriptor.targetLang || ""}`);
      const records = (await storageRepository.getAll(config.store)).filter(
        (record) => String(record?.[config.nameField] || "") === name && languagePair(record) === pair
      );
      if (!records.length) throw new Error("Resource no longer exists.");
      const entry = resourceTrashEntry(resourceType, records, { wholeResource: true });
      await storageRepository.moveResourceRecordsToTrash(resourceType, entry);
      return entry;
    },
    async restore(entryId) {
      const entry = await storageRepository.get("trashEntries", entryId);
      if (!entry) throw new Error("Trash item no longer exists.");
      if (entry.entityType === "project") {
        const conflict = await storageRepository.get("projects", entry.projectId);
        if (conflict)
          throw new Error("A project with this ID already exists. Export the Trash item before restoring it.");
        await storageRepository.restoreTrashRecords({
          entryId,
          project: entry.payload.project,
          segments: entry.payload.segments || [],
          activityEvents: entry.payload.activityEvents || []
        });
        return entry;
      }
      if (entry.entityType === "document") {
        const project = await storageRepository.get("projects", entry.projectId);
        if (!project) throw new Error("Restore the parent project before restoring this file.");
        if ((project.documents || []).some((documentInfo) => documentInfo.id === entry.entityId)) {
          throw new Error("A file with this ID already exists in the project.");
        }
        const payload = entry.payload || {};
        const restoredProject = {
          ...project,
          documents: (() => {
            const docs = [...(project.documents || [])];
            docs.splice(Math.min(payload.ordinal ?? docs.length, docs.length), 0, payload.documentInfo);
            return docs;
          })(),
          docxStructures: { ...(project.docxStructures || {}) },
          localizationStructures: { ...(project.localizationStructures || {}) },
          updatedAt: new Date().toISOString()
        };
        if (payload.docxStructure !== undefined) restoredProject.docxStructures[entry.entityId] = payload.docxStructure;
        if (payload.localizationStructure !== undefined) {
          restoredProject.localizationStructures[entry.entityId] = payload.localizationStructure;
        }
        restoredProject.sourceFileName = restoredProject.documents[0]?.name || "";
        const firstDocx = restoredProject.documents.find(
          (d) => d.type === "docx" && restoredProject.docxStructures[d.id]
        );
        if (firstDocx) {
          restoredProject.docxStructure = restoredProject.docxStructures[firstDocx.id];
          restoredProject.legacyDocxDocumentId = firstDocx.id;
        }
        await storageRepository.restoreTrashRecords({
          entryId,
          project: restoredProject,
          segments: payload.segments || [],
          activityEvents: []
        });
        return entry;
      }
      if (["tm-entry", "term", "translation-memory", "termbase"].includes(entry.entityType)) {
        return storageRepository.restoreResourceTrashRecords(entryId);
      }
      throw new Error(`Unsupported Trash item type: ${entry.entityType}`);
    },
    async emptyEntry(entryId) {
      const entry = await storageRepository.get("trashEntries", entryId);
      if (entry && storageRepository.commitMutation && ["project", "document"].includes(entry.entityType)) {
        const changes = [];
        for (const store of ["documentVersions", "versionSegments", "fileLifecycleReceipts"]) {
          const records = await storageRepository.getAllByIndex(store, "projectId", entry.projectId);
          for (const record of records)
            if (
              entry.entityType === "project" ||
              record.documentId === entry.entityId ||
              record.documentIds?.includes(entry.entityId)
            )
              changes.push({
                store,
                key: record.id,
                delete: true,
                expectedVersion: record.storageVersion || 0,
                projectId: entry.projectId
              });
        }
        changes.push({
          store: "trashEntries",
          key: entryId,
          delete: true,
          expectedVersion: entry.storageVersion || 0,
          projectId: entry.projectId
        });
        await storageRepository.commitMutation(null, null, { changes });
        if (globalThis.window?.dispatchEvent && typeof CustomEvent === "function")
          window.dispatchEvent(
            new CustomEvent("loopcat-files-purged", {
              detail: {
                projectId: entry.projectId,
                ids: [entry.entityId, ...(entry.payload?.segments || []).map((s) => s.id), ...changes.map((c) => c.key)]
              }
            })
          );
        return;
      }
      await storageRepository.deleteByKey("trashEntries", entryId);
    },
    async emptyAll() {
      const entries = await list();
      for (const entry of entries) await this.emptyEntry(entry.id);
      return entries.length;
    }
  });
}
