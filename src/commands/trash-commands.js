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
