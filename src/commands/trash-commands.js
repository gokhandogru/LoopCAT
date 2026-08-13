export function createDeleteProjectCommand({ projectId, trashRepository }) {
  let entryId = "";
  return {
    id: "delete-project",
    label: "Delete project",
    undoLabel: "Undo project deletion",
    projectId,
    scope: "project",
    affectedIds: [projectId],
    async execute() {
      const entry = await trashRepository.moveProject(projectId);
      entryId = entry.id;
      return { recoveryToken: entry.id, entry };
    },
    undo() {
      if (!entryId) throw new Error("Project deletion has no recovery token.");
      return trashRepository.restore(entryId);
    }
  };
}

export function createDeleteDocumentCommand({ project, documentId, trashRepository }) {
  let entryId = "";
  return {
    id: "delete-document",
    label: "Delete project file",
    undoLabel: "Undo file deletion",
    projectId: project.id,
    scope: "document",
    affectedIds: [documentId],
    async execute() {
      const result = await trashRepository.moveDocument(project, documentId);
      entryId = result.entry.id;
      return { ...result, recoveryToken: entryId };
    },
    undo() {
      if (!entryId) throw new Error("File deletion has no recovery token.");
      return trashRepository.restore(entryId);
    }
  };
}

export function createDeleteResourceEntryCommand({ resourceType, entityId, projectId = null, trashRepository }) {
  let entryId = "";
  return {
    id: "delete-resource-entry",
    label: resourceType === "tm" ? "Delete translation memory entry" : "Delete termbase entry",
    undoLabel: resourceType === "tm" ? "Undo translation memory entry deletion" : "Undo termbase entry deletion",
    projectId,
    scope: "resource-entry",
    affectedIds: [entityId],
    provenance: { origin: "user", channel: "resources" },
    async execute() {
      const entry = await trashRepository.moveResourceEntry(resourceType, entityId);
      entryId = entry.id;
      return { recoveryToken: entry.id, entry };
    },
    undo() {
      if (!entryId) throw new Error("Resource entry deletion has no recovery token.");
      return trashRepository.restore(entryId);
    }
  };
}

export function createDeleteResourceCommand({
  resourceType,
  descriptor,
  affectedIds = [],
  projectId = null,
  trashRepository
}) {
  let entryId = "";
  return {
    id: "delete-resource",
    label: resourceType === "tm" ? "Delete translation memory" : "Delete termbase",
    undoLabel: resourceType === "tm" ? "Undo translation memory deletion" : "Undo termbase deletion",
    projectId,
    scope: "resource",
    affectedIds: affectedIds.length ? [...affectedIds] : [String(descriptor?.key || descriptor?.name || "resource")],
    provenance: { origin: "user", channel: "resources" },
    async execute() {
      const entry = await trashRepository.moveResource(resourceType, descriptor);
      entryId = entry.id;
      return { recoveryToken: entry.id, entry };
    },
    undo() {
      if (!entryId) throw new Error("Resource deletion has no recovery token.");
      return trashRepository.restore(entryId);
    }
  };
}
