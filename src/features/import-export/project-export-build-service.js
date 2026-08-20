/**
 * Owns project-package and browser-backup construction plus write-validation
 * policy. Downloads, export history, activity persistence, workspace writes,
 * recovery UI, and status presentation remain behind existing orchestrators.
 *
 * @param {{
 *   session: { getProject: () => any, getSegments: () => any[] },
 *   autosave: { flush: (projectId?: string) => Promise<unknown> },
 *   storage: {
 *     getProjectSegments: (projectId: string) => Promise<any[]>,
 *     getAllByIndex: (storeName: string, indexName: string, value: string) => Promise<any[]>,
 *     listTerms: (options: any) => Promise<any[]>,
 *     listActivityEvents: (projectId: string) => Promise<any[]>,
 *     exportAllData: () => Promise<any>
 *   },
 *   resources: {
 *     getLinks: (project: any) => any[],
 *     getTmNames: (project: any) => string[],
 *     getTermBaseNames: (project: any) => string[]
 *   },
 *   documents: { manifest: (project: any) => any[] },
 *   ai: { normalizeProjectSettings: (settings: any) => any },
 *   portable: {
 *     createContext: () => any,
 *     sanitize: (value: any, path: string, notes: any[], context: any) => any,
 *     validateProjectPackage: (pkg: any) => any,
 *     hasOriginalLocalizationStructure: (structure: any) => boolean
 *   },
 *   backup: { validate: (backup: any) => any },
 *   validation: { summary: (report: any) => string },
 *   workspace: { isConnected: () => boolean },
 *   constants: { appName: string, projectPackageSchemaVersion: number },
 *   clock: { now: () => string }
 * }} options
 */
export function createProjectExportBuildService(options) {
  const session = options?.session;
  const autosave = options?.autosave;
  const storage = options?.storage;
  const resources = options?.resources;
  const documents = options?.documents;
  const ai = options?.ai;
  const portable = options?.portable;
  const backup = options?.backup;
  const validation = options?.validation;
  const workspace = options?.workspace;
  const constants = options?.constants;
  const clock = options?.clock;

  if (
    typeof session?.getProject !== "function" ||
    typeof session?.getSegments !== "function" ||
    typeof autosave?.flush !== "function" ||
    typeof storage?.getProjectSegments !== "function" ||
    typeof storage?.getAllByIndex !== "function" ||
    typeof storage?.listTerms !== "function" ||
    typeof storage?.listActivityEvents !== "function" ||
    typeof storage?.exportAllData !== "function" ||
    typeof resources?.getLinks !== "function" ||
    typeof resources?.getTmNames !== "function" ||
    typeof resources?.getTermBaseNames !== "function" ||
    typeof documents?.manifest !== "function" ||
    typeof ai?.normalizeProjectSettings !== "function" ||
    typeof portable?.createContext !== "function" ||
    typeof portable?.sanitize !== "function" ||
    typeof portable?.validateProjectPackage !== "function" ||
    typeof portable?.hasOriginalLocalizationStructure !== "function" ||
    typeof backup?.validate !== "function" ||
    typeof validation?.summary !== "function" ||
    typeof workspace?.isConnected !== "function" ||
    typeof constants?.appName !== "string" ||
    !Number.isFinite(constants?.projectPackageSchemaVersion) ||
    typeof clock?.now !== "function"
  ) {
    throw new TypeError(
      "ProjectExportBuildService requires session, autosave, storage, resource, document, AI, portable, backup, validation, workspace, constant, and clock boundaries."
    );
  }

  async function buildProjectPackage(project = session.getProject(), segmentRecords = null, buildOptions = {}) {
    if (!project) return null;
    await autosave.flush(project.id);
    const projectSegments =
      segmentRecords ||
      (project.id === session.getProject()?.id ? session.getSegments() : await storage.getProjectSegments(project.id));
    const [tmEntries, terms, activityEvents] = await Promise.all([
      storage.getAllByIndex("tmEntries", "languagePair", `${project.sourceLang}::${project.targetLang}`),
      storage.listTerms({
        sourceLang: project.sourceLang,
        targetLang: project.targetLang,
        termBaseNames: resources.getTermBaseNames(project)
      }),
      storage.listActivityEvents(project.id)
    ]);
    const tmNames = new Set(resources.getTmNames(project));
    const scopedTm = tmEntries.filter((entry) => tmNames.has(entry.tmName));
    const portableContext = portable.createContext();
    const pkg = {
      app: constants.appName,
      type: "project-package",
      version: 1,
      schemaVersion: constants.projectPackageSchemaVersion,
      exportedAt: clock.now(),
      packageMetadata: {
        format: "loopcat-project-package",
        packageVersion: 1,
        contractVersion: "loopcat-package-v1",
        generator: "LoopCAT browser workspace",
        storageMode: workspace.isConnected() ? "workspace-folder" : "browser-cache"
      },
      project: portable.sanitize(
        {
          ...project,
          resourceLinks: resources.getLinks(project),
          aiSettings: ai.normalizeProjectSettings(project.aiSettings)
        },
        "",
        [],
        portableContext
      ),
      segments: portable.sanitize(projectSegments, "", [], portableContext),
      resources: portable.sanitize(
        {
          tmEntries: scopedTm,
          terms
        },
        "",
        [],
        portableContext
      ),
      resourceReferences: portable.sanitize(
        resources.getLinks(project).map((link) => ({
          id: link.id,
          type: link.type,
          name: link.name,
          role: link.role || "",
          sourceLang: project.sourceLang,
          targetLang: project.targetLang
        })),
        "resourceReferences",
        [],
        portableContext
      ),
      sourceAssets: portable.sanitize(
        documents.manifest(project).map((documentInfo) => {
          const docxStructure =
            project.docxStructures?.[documentInfo.id] || (documentInfo.type === "docx" ? project.docxStructure : null);
          const localizationStructure = project.localizationStructures?.[documentInfo.id];
          const originalAvailable = Boolean(
            docxStructure?.docxPackageBase64 || portable.hasOriginalLocalizationStructure(localizationStructure)
          );
          return {
            id: documentInfo.id,
            name: documentInfo.name,
            type: documentInfo.type,
            originalAvailable,
            structurePreserved: Boolean(docxStructure || localizationStructure)
          };
        }),
        "sourceAssets",
        [],
        portableContext
      ),
      activityEvents: portable.sanitize(
        [...(activityEvents || []), ...(buildOptions.activityEvents || [])],
        "",
        [],
        portableContext
      )
    };
    const packageValidation = portable.validateProjectPackage(pkg);
    return {
      ...pkg,
      validation: packageValidation,
      validationReports: { package: packageValidation }
    };
  }

  function assertValidProjectPackageForWrite(pkg, actionLabel) {
    const packageValidation = pkg?.validation || portable.validateProjectPackage(pkg);
    if (packageValidation.ok) return packageValidation;
    const error = /** @type {Error & { validation: any }} */ (
      new Error(`Cannot ${actionLabel}: ${validation.summary(packageValidation)}`)
    );
    error.validation = packageValidation;
    throw error;
  }

  function assertValidBackupForWrite(backupRecord, actionLabel) {
    const backupValidation = backup.validate(backupRecord);
    if (backupValidation.ok) return backupValidation;
    const error = /** @type {Error & { validation: any }} */ (
      new Error(`Cannot ${actionLabel}: ${validation.summary(backupValidation)}`)
    );
    error.validation = backupValidation;
    throw error;
  }

  async function buildBackupExport() {
    await autosave.flush();
    const backupRecord = await storage.exportAllData();
    const backupValidation = assertValidBackupForWrite(backupRecord, "export backup");
    return { backup: backupRecord, validation: backupValidation };
  }

  return Object.freeze({
    assertValidBackupForWrite,
    assertValidProjectPackageForWrite,
    buildBackupExport,
    buildProjectPackage
  });
}
