function trashId() {
  const suffix = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `trash-${suffix}`;
}

export function createTrashRepository(storageRepository) {
  if (!storageRepository?.moveProjectToTrash || !storageRepository?.restoreTrashRecords) {
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
      const entry = {
        id: trashId(),
        entityType: "document",
        entityId: documentId,
        projectId: project.id,
        label: String(documentInfo.name || "File"),
        deletedAt: new Date().toISOString(),
        payload: { documentInfo, segments, docxStructure, localizationStructure }
      };
      await storageRepository.moveProjectDocumentToTrash(nextProject, documentId, entry);
      return { entry, project: nextProject };
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
          documents: [...(project.documents || []), payload.documentInfo],
          docxStructures: { ...(project.docxStructures || {}) },
          localizationStructures: { ...(project.localizationStructures || {}) },
          updatedAt: new Date().toISOString()
        };
        if (payload.docxStructure !== undefined) restoredProject.docxStructures[entry.entityId] = payload.docxStructure;
        if (payload.localizationStructure !== undefined) {
          restoredProject.localizationStructures[entry.entityId] = payload.localizationStructure;
        }
        await storageRepository.restoreTrashRecords({
          entryId,
          project: restoredProject,
          segments: payload.segments || [],
          activityEvents: []
        });
        return entry;
      }
      throw new Error(`Unsupported Trash item type: ${entry.entityType}`);
    },
    async emptyEntry(entryId) {
      await storageRepository.deleteByKey("trashEntries", entryId);
    },
    async emptyAll() {
      const entries = await list();
      await Promise.all(entries.map((entry) => storageRepository.deleteByKey("trashEntries", entry.id)));
      return entries.length;
    }
  });
}
