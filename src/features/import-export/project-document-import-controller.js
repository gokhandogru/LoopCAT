import {
  createProjectDocumentDuplicatePolicy,
  validateProjectDocumentImportControllerOptions
} from "./project-document-import-controller-contract.js";

/**
 * Owns project-document import routing and the shared post-parse persistence,
 * session, navigation, activity, and presentation sequence. File-size policy,
 * format parsing, repositories, history preparation, localization/safety, and
 * presentation remain behind injected boundaries.
 *
 * @param {{
 *   session: {
 *     getProject: () => any,
 *     getProjects: () => any[],
 *     getSegments: () => any[],
 *     replaceProject: (project: any) => unknown,
 *     replaceProjects: (projects: any[]) => unknown,
 *     replaceSegments: (segments: any[]) => unknown
 *   },
 *   catalog: { list: () => Array<{ name: string }>, manifest: (project: any) => any[] },
 *   files: { assertSize: (file: any, label: string, maxBytes: number) => unknown, maxBytes: number },
 *   formats: {
 *     extractDocx: (file: any) => Promise<any>,
 *     parseLocalization: (file: any, options: any) => Promise<any>,
 *     parseXliff: (file: any, options: any) => Promise<any>,
 *     decodingOptions: () => any,
 *     isXliffType: (extension: string) => boolean
 *   },
 *   repository: {
 *     append: (project: any, segments: any[], options: any) => Promise<any>,
 *     getProjectSegments: (projectId: string) => Promise<any[]>
 *   },
 *   histories: { prepare: (segments: any[]) => any[] },
 *   progress: { report: (phase: string, file?: any, detail?: string) => Promise<unknown> },
 *   ids: { next: () => string | number },
 *   summaries: { refresh: () => Promise<unknown> },
 *   navigation: { selectDocument: (selection: any) => unknown },
 *   activity: {
 *     log: (type: string, summary: string, detail: any, label: string) => Promise<boolean>,
 *     appendWarning: (message: string, activityLogged: boolean) => string
 *   },
 *   workspace: { markDirty: () => unknown },
 *   status: { set: (message: string, mode: string) => unknown, mode: (mode: string, activityLogged: boolean) => string },
 *   presentation: { renderAll: () => unknown, refreshEditorContext: () => Promise<unknown> },
 *   text: { lower: (value: string) => string, safe: (value: unknown) => string },
 *   confirm: (message: string) => boolean
 * }} options
 */
export function createProjectDocumentImportController(options) {
  const session = options?.session;
  const catalog = options?.catalog;
  const files = options?.files;
  const formats = options?.formats;
  const repository = options?.repository;
  const histories = options?.histories;
  const progress = options?.progress;
  const ids = options?.ids;
  const summaries = options?.summaries;
  const navigation = options?.navigation;
  const activity = options?.activity;
  const workspace = options?.workspace;
  const status = options?.status;
  const presentation = options?.presentation;
  const text = options?.text;
  const confirm = options?.confirm;

  validateProjectDocumentImportControllerOptions(options);
  const { confirmDuplicate, hasDocumentNamed } = createProjectDocumentDuplicatePolicy({ catalog, text, confirm });
  let importContext = null;

  function append(project, segments, documentOptions) {
    project = {
      ...project,
      documents: project.documents.map((document) =>
        document.id === documentOptions.documentId
          ? {
              ...document,
              sourceRevision: 1,
              originalFilename: document.name,
              importOptions: {
                encoding: importContext?.encoding || formats.decodingOptions()?.encoding || "auto",
                ...(document.type === "tmx"
                  ? { importedTranslationStatus: importContext?.importedTranslationStatus || "draft" }
                  : {})
              }
            }
          : document
      )
    };
    if (importContext) {
      const current = session.getProject();
      if (current?.id !== importContext.projectId || current?.storageVersion !== importContext.version)
        throw new Error("Project changed during import. Retry after reviewing the project.");
      if (importContext.batch?.canceled()) throw new DOMException("Import canceled before saving.", "AbortError");
      if (importContext.batch) {
        const receipt = {
          importKey: `${importContext.batch.id}:${importContext.rowId}`,
          batchId: importContext.batch.id,
          name: importContext.file.name,
          fingerprint: importContext.fingerprint,
          encoding: importContext.encoding,
          allowLanguageMismatch: !!importContext.allowLanguageMismatch,
          ...(documentOptions.documentType === "tmx"
            ? { importedTranslationStatus: importContext.importedTranslationStatus || "draft" }
            : {}),
          documentId: documentOptions.documentId,
          importedAt: new Date().toISOString()
        };
        project = { ...project, importReceipts: [...(project.importReceipts || []).slice(-999), receipt] };
      }
    }
    return repository.append(project, segments, documentOptions);
  }

  async function finishBatch(batch) {
    if (!batch.committed.length || session.getProject()?.id !== batch.projectId) return;
    const first = batch.committed[0];
    await replaceImportedProject({ project: session.getProject() }, first.documentId, first.file);
    workspace.markDirty();
    presentation.renderAll();
    await presentation.refreshEditorContext();
  }

  function segmentDetail(count) {
    return `${count} segment${count === 1 ? "" : "s"}`;
  }

  function documentId() {
    return `doc-${ids.next()}`;
  }

  async function replaceImportedProject(importResult, importedDocumentId, file) {
    await progress.report("Refreshing project view", file);
    session.replaceProject(importResult.project);
    session.replaceSegments(histories.prepare(await repository.getProjectSegments(session.getProject().id)));
    session.replaceProjects(
      session.getProjects().map((project) => (project.id === session.getProject().id ? session.getProject() : project))
    );
    await summaries.refresh();
    const activeIndex = session.getSegments().findIndex((segment) => segment.documentId === importedDocumentId);
    navigation.selectDocument({
      documentId: importedDocumentId,
      segmentId: session.getSegments()[activeIndex]?.id || "",
      activeIndex
    });
  }

  async function finishImport({ file, importResult, documentId: importedDocumentId, complete }) {
    if (importContext?.batch) {
      session.replaceProject(importResult.project);
      importContext.batch.committed.push({ documentId: importedDocumentId, file });
      workspace.markDirty();
      return;
    }
    await replaceImportedProject(importResult, importedDocumentId, file);
    const { activityContext, message } = complete();
    const activityLogged = await activity.log(
      "import",
      activityContext.summary,
      activityContext.detail,
      activityContext.label
    );
    workspace.markDirty();
    status.set(activity.appendWarning(message, activityLogged), status.mode("saved", activityLogged));
    presentation.renderAll();
    await presentation.refreshEditorContext();
  }

  async function importDocx(file) {
    files.assertSize(file, "Project file", files.maxBytes);
    await progress.report("Reading DOCX package", file);
    const result = await formats.extractDocx(file);
    await progress.report("Saving imported segments", file, segmentDetail(result.segments.length));
    const importedDocumentId = documentId();
    const documents = [
      ...catalog.manifest(session.getProject()),
      { id: importedDocumentId, name: result.fileName, type: "docx" }
    ];
    const docxStructures = {
      ...(session.getProject().docxStructures || {}),
      [importedDocumentId]: result.structure
    };
    const importResult = await append(
      {
        ...session.getProject(),
        sourceFileName: result.fileName,
        docxStructure: result.structure,
        docxStructures,
        documents
      },
      result.segments,
      { documentId: importedDocumentId, documentName: result.fileName, documentType: "docx" }
    );
    await finishImport({
      file,
      importResult,
      documentId: importedDocumentId,
      complete: () => {
        const extractedParts = result.structure?.textPartSummary?.filter((part) => part.segments > 0).length || 1;
        return {
          activityContext: {
            summary: "DOCX imported",
            detail: {
              fileName: file.name,
              segmentCount: result.segments.length,
              documentId: importedDocumentId
            },
            label: "DOCX import"
          },
          message: `Imported ${result.segments.length} segments from ${extractedParts} DOCX part${extractedParts === 1 ? "" : "s"}`
        };
      }
    });
  }

  async function importLocalization(file) {
    files.assertSize(file, "Project file", files.maxBytes);
    await progress.report("Parsing project file", file);
    const decodingOptions = importContext?.encoding ? { encoding: importContext.encoding } : formats.decodingOptions();
    const isTmx = /\.tmx$/i.test(file.name);
    const result = await formats.parseLocalization(file, {
      ...decodingOptions,
      ...(isTmx
        ? {
            sourceLang: session.getProject().sourceLang,
            targetLang: session.getProject().targetLang,
            importedTranslationStatus: importContext?.importedTranslationStatus || "draft"
          }
        : {})
    });
    await progress.report("Saving imported segments", file, segmentDetail(result.segments.length));
    const importedDocumentId = documentId();
    const documents = [
      ...catalog.manifest(session.getProject()),
      { id: importedDocumentId, name: result.fileName, type: result.documentType }
    ];
    const localizationStructures = result.structure
      ? { ...(session.getProject().localizationStructures || {}), [importedDocumentId]: result.structure }
      : session.getProject().localizationStructures;
    const importResult = await append({ ...session.getProject(), documents, localizationStructures }, result.segments, {
      documentId: importedDocumentId,
      documentName: result.fileName,
      documentType: result.documentType
    });
    await finishImport({
      file,
      importResult,
      documentId: importedDocumentId,
      complete: () => ({
        activityContext: {
          summary: "Localization file imported",
          detail: {
            fileName: file.name,
            documentType: result.documentType,
            segmentCount: result.segments.length,
            documentId: importedDocumentId
          },
          label: "Localization import"
        },
        message: "Saved"
      })
    });
  }

  async function importXliff(file) {
    files.assertSize(file, "Project file", files.maxBytes);
    await progress.report("Parsing XLIFF", file);
    const result = await formats.parseXliff(
      file,
      importContext?.encoding ? { encoding: importContext.encoding } : formats.decodingOptions()
    );
    const project = session.getProject();
    const metadata = [result.structure, ...result.segments.map((segment) => segment.structure)].filter(Boolean);
    if (
      !importContext?.allowLanguageMismatch &&
      metadata.some(
        (info) =>
          (info.sourceLang && info.sourceLang.toLowerCase() !== project.sourceLang.toLowerCase()) ||
          (info.targetLang && info.targetLang.toLowerCase() !== project.targetLang.toLowerCase())
      )
    ) {
      const error = Object.assign(new Error("The XLIFF language pair differs from this project."), {
        code: "LANGUAGE_MISMATCH"
      });
      throw error;
    }
    await progress.report("Saving imported segments", file, segmentDetail(result.segments.length));
    const importedDocumentId = documentId();
    const documents = [
      ...catalog.manifest(session.getProject()),
      { id: importedDocumentId, name: result.fileName, type: result.documentType }
    ];
    const localizationStructures = {
      ...(session.getProject().localizationStructures || {}),
      [importedDocumentId]: result.structure
    };
    const importResult = await append({ ...session.getProject(), documents, localizationStructures }, result.segments, {
      documentId: importedDocumentId,
      documentName: result.fileName,
      documentType: result.documentType
    });
    await finishImport({
      file,
      importResult,
      documentId: importedDocumentId,
      complete: () => ({
        activityContext: {
          summary: "XLIFF imported",
          detail: {
            fileName: file.name,
            segmentCount: result.segments.length,
            documentId: importedDocumentId
          },
          label: "XLIFF import"
        },
        message: `Imported ${result.segments.length} XLIFF segment${result.segments.length === 1 ? "" : "s"}`
      })
    });
  }

  async function importFile(file, importOptions = {}) {
    if (!session.getProject() || !file) return;
    files.assertSize(file, "Project file", files.maxBytes);
    if (!importOptions.acceptDuplicate && !confirmDuplicate(file)) {
      status.set("Import canceled", "saved");
      return false;
    }
    const receipt =
      importOptions.batch &&
      (session.getProject().importReceipts || []).find(
        (item) => item.importKey === `${importOptions.batch.id}:${importOptions.rowId}`
      );
    if (receipt) {
      if (
        receipt.fingerprint !== importOptions.fingerprint ||
        receipt.encoding !== importOptions.encoding ||
        receipt.name !== file.name ||
        !!receipt.allowLanguageMismatch !== !!importOptions.allowLanguageMismatch ||
        (/\.tmx$/i.test(file.name) &&
          (receipt.importedTranslationStatus || "draft") !== (importOptions.importedTranslationStatus || "draft"))
      )
        throw new Error("Retry input differs from the committed import receipt.");
      return;
    }
    importContext = {
      ...importOptions,
      file,
      projectId: session.getProject().id,
      version: session.getProject().storageVersion
    };
    try {
      const extension = file.name.split(".").pop().toLowerCase();
      if (extension === "tmx" && !importContext.importedTranslationStatus) {
        importContext.importedTranslationStatus = confirm(
          "Import existing TMX translations as confirmed? Choose Cancel to keep them as drafts. Empty targets remain empty."
        )
          ? "confirmed"
          : "draft";
      }
      if (extension === "docx") {
        await importDocx(file);
        return;
      }
      if (formats.isXliffType(extension)) {
        await importXliff(file);
        return;
      }
      await importLocalization(file);
    } finally {
      importContext = null;
    }
  }

  return Object.freeze({
    finishBatch,
    confirmDuplicate,
    hasDocumentNamed,
    importDocx,
    importFile,
    importLocalization,
    importXliff
  });
}
