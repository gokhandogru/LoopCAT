(() => {
const MANIFEST_FILE = "loopcat-workspace.json";
const LEGACY_MANIFEST_FILE = "cathan-workspace.json";
const MANIFEST_VERSION = 1;
const PACKAGE_FILE = "project.loopcat.json";
const VALIDATION_FILE = "validation-report.json";
const BACKUP_DIR = "backups";
const PROJECT_DIR = "projects";
const RESOURCE_DIR = "resources";
const SCHEMA_VERSION = window.CatHan.storage?.constants?.SCHEMA_VERSION || 3;
const { get, put } = window.CatHan.storage;
const APP_NAME = "LoopCAT";
const LEGACY_APP_NAME = "CatHan";
const MAX_WORKSPACE_JSON_BYTES = 50 * 1024 * 1024;
const SENSITIVE_TEXT_VALUE_PATTERN = /(sk-[A-Za-z0-9_-]{8,}|Bearer\s+[A-Za-z0-9._~+/=-]{8,}|gh[pousr]_[A-Za-z0-9_]{8,}|npm_[A-Za-z0-9_]{8,}|(?:session|cookie)[=:][A-Za-z0-9._~+/=-]{8,})/i;

let directoryHandle = null;
let manifest = null;
let lastError = "";
let lastErrorScope = "";
let lastSkippedProjectPackages = [];
let lastSkippedBackupFiles = [];

function nowIso() {
  return new Date().toISOString();
}

function isSupported() {
  return Boolean(window.showDirectoryPicker);
}

function redactSensitiveText(value) {
  return String(value || "").replace(new RegExp(SENSITIVE_TEXT_VALUE_PATTERN.source, "gi"), "[redacted secret]");
}

function workspaceSafeLabel(value, fallback = "") {
  return redactSensitiveText(value || "").trim() || fallback;
}

function cleanPathPart(value, fallback = "item") {
  return workspaceSafeLabel(value, fallback)
    .normalize("NFKD")
    .replace(/[^\p{L}\p{N}._-]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 72) || fallback;
}

function workspacePathParts(value) {
  return String(value || "")
    .replaceAll("\\", "/")
    .split("/")
    .map((part) => part.trim())
    .filter(Boolean);
}

function cleanWorkspacePathPart(value, fallback = "item") {
  const clean = cleanPathPart(value, fallback).replace(/^\.+$/g, "").trim();
  return clean || fallback;
}

function unsafeWorkspacePathPart(value) {
  const part = String(value || "").trim();
  return !part || part === "." || part === ".." || /[\u0000-\u001f\u007f/\\]/.test(part) || SENSITIVE_TEXT_VALUE_PATTERN.test(part);
}

function workspaceSafePath(value, fallbackParts = []) {
  const rawParts = workspacePathParts(value);
  const parts = rawParts.length ? rawParts : fallbackParts;
  return parts
    .map((part, index) => cleanWorkspacePathPart(part, fallbackParts[index] || "item"))
    .filter(Boolean)
    .join("/");
}

function shortId(id) {
  return String(id || "").replace(/^project-/, "").slice(0, 8) || Date.now();
}

function defaultManifest(existing = {}) {
  const createdAt = existing.createdAt || nowIso();
  return {
    app: APP_NAME,
    type: "workspace-manifest",
    version: MANIFEST_VERSION,
    workspaceVersion: MANIFEST_VERSION,
    schemaVersion: SCHEMA_VERSION,
    createdAt,
    updatedAt: existing.updatedAt || createdAt,
    lastSyncedAt: existing.lastSyncedAt || "",
    projects: Array.isArray(existing.projects) ? existing.projects.map(sanitizeManifestProjectRef).filter(Boolean) : [],
    resources: Array.isArray(existing.resources) ? existing.resources.map(sanitizeManifestResourceRef).filter(Boolean) : [],
    backups: Array.isArray(existing.backups) ? existing.backups.map(sanitizeManifestBackupRef).filter(Boolean) : []
  };
}

function normalizeManifest(value) {
  if (!value || ![APP_NAME, LEGACY_APP_NAME].includes(value.app) || value.type !== "workspace-manifest") {
    return defaultManifest();
  }
  return defaultManifest(value);
}

async function requestPermission(handle, mode = "readwrite") {
  if (!handle) return false;
  if (!handle.queryPermission || !handle.requestPermission) return true;
  const options = { mode };
  if ((await handle.queryPermission(options)) === "granted") return true;
  return (await handle.requestPermission(options)) === "granted";
}

async function hasPermission(handle, mode = "readwrite") {
  if (!handle) return false;
  if (!handle.queryPermission) return true;
  return (await handle.queryPermission({ mode })) === "granted";
}

async function getSavedWorkspaceHandle() {
  try {
    return (await get("appMeta", "workspaceDirectory"))?.handle || null;
  } catch (error) {
    lastError = error.message || "Could not read saved workspace handle.";
    lastErrorScope = "storage-handle";
    return null;
  }
}

async function rememberWorkspaceHandle(handle) {
  await put("appMeta", {
    key: "workspaceDirectory",
    name: handle.name,
    handle,
    updatedAt: nowIso()
  });
}

async function getDirectory(pathParts, options = {}) {
  if (!directoryHandle) throw new Error("No workspace folder is connected.");
  let dir = directoryHandle;
  for (const part of pathParts) {
    dir = await dir.getDirectoryHandle(part, { create: Boolean(options.create) });
  }
  return dir;
}

async function getFileHandle(pathParts, options = {}) {
  const fileName = pathParts[pathParts.length - 1];
  const dir = await getDirectory(pathParts.slice(0, -1), options);
  return dir.getFileHandle(fileName, { create: Boolean(options.create) });
}

function workspaceJsonTooLargeError(label, size) {
  const error = new Error(`${label} is too large to read from the workspace folder. Keep LoopCAT JSON files under 50 MB.`);
  error.name = "WorkspaceJsonTooLargeError";
  error.size = size;
  return error;
}

async function readJsonFromFileHandle(handle, label = "Workspace JSON file") {
  const file = await handle.getFile();
  if (file.size > MAX_WORKSPACE_JSON_BYTES) throw workspaceJsonTooLargeError(label, file.size);
  return JSON.parse(await file.text());
}

async function readJson(pathParts) {
  return readJsonFromFileHandle(await getFileHandle(pathParts), pathParts.join("/"));
}

async function writeJson(pathParts, value) {
  let writable = null;
  try {
    const handle = await getFileHandle(pathParts, { create: true });
    writable = await handle.createWritable();
    await writable.write(new Blob([JSON.stringify(value, null, 2)], { type: "application/json" }));
    await writable.close();
  } catch (error) {
    lastError = workspaceSafeLabel(error.message || `Could not write ${pathParts.join("/")}.`, "Could not write workspace JSON.");
    lastErrorScope = "write";
    if (writable && typeof writable.abort === "function") {
      try {
        await writable.abort();
      } catch {
        // Keep the original write failure visible to the caller.
      }
    }
    throw error;
  }
}

async function writeOptionalValidationReport(pathParts, validation) {
  try {
    await writeJson([pathParts[0], pathParts[1], VALIDATION_FILE], validation || {});
    return { saved: true, warning: "" };
  } catch (error) {
    return {
      saved: false,
      warning: `Validation report sidecar could not be written: ${workspaceSafeLabel(error.message || error, "The validation report could not be written.")}`
    };
  }
}

async function exists(pathParts) {
  try {
    await getFileHandle(pathParts);
    return true;
  } catch (error) {
    if (error.name === "NotFoundError") return false;
    throw error;
  }
}

function isMissingOrInvalidJson(error) {
  return error.name === "NotFoundError" || error.name === "SyntaxError" || error.name === "WorkspaceJsonTooLargeError";
}

function workspacePackageReadWarning(folderName, error) {
  const reason = workspaceSafeLabel(error.message || error.name || "The package JSON could not be read.", "The package JSON could not be read.");
  return `Skipped unreadable workspace package in ${workspaceSafeLabel(folderName, "workspace package")}: ${reason}`;
}

function workspacePackageValidationReason(validation) {
  return workspaceSafeLabel((validation?.errors || []).filter(Boolean).join("; "), "Project package failed validation.");
}

function workspaceBackupValidationReason(validation) {
  return workspaceSafeLabel((validation?.errors || []).filter(Boolean).join("; "), "Backup failed validation.");
}

function workspacePackageValidationWarning(folderName, validation) {
  return `Skipped invalid workspace package in ${workspaceSafeLabel(folderName, "workspace package")}: ${workspacePackageValidationReason(validation)}`;
}

function workspacePackageUnsafePathWarning(folderName) {
  return `Skipped workspace package folder with unsafe name ${workspaceSafeLabel(folderName, "workspace package")}. Rename the folder before syncing it.`;
}

function workspaceBackupUnsafePathWarning(fileName) {
  return `Skipped workspace backup file with unsafe name ${workspaceSafeLabel(fileName, "workspace backup")}. Rename the file before counting it.`;
}

function validateWorkspaceProjectPackage(pkg, label = "Workspace project package") {
  const validateProjectPackage = window.CatHan?.validation?.validateProjectPackage;
  if (typeof validateProjectPackage !== "function") return null;
  const validation = validateProjectPackage(pkg);
  if (validation && !validation.ok) {
    const error = new Error(`${workspaceSafeLabel(label, "Workspace project package")} failed validation: ${workspacePackageValidationReason(validation)}`);
    error.name = "WorkspacePackageValidationError";
    error.validation = validation;
    throw error;
  }
  return validation;
}

function validateWorkspaceBackupFile(data, label = "Workspace backup") {
  const validateBackupFile = window.CatHan?.validation?.validateBackupFile;
  if (typeof validateBackupFile !== "function") return null;
  const validation = validateBackupFile(data);
  if (validation && !validation.ok) {
    const error = new Error(`${workspaceSafeLabel(label, "Workspace backup")} failed validation: ${workspaceBackupValidationReason(validation)}`);
    error.name = "WorkspaceBackupValidationError";
    error.validation = validation;
    throw error;
  }
  return validation;
}

function withWorkspaceValidation(pkg, validation) {
  if (!validation) return pkg;
  return {
    ...pkg,
    validation,
    validationReports: {
      ...(pkg.validationReports || {}),
      package: validation
    }
  };
}

function setSkippedProjectPackages(skipped) {
  lastSkippedProjectPackages = skipped;
  if (skipped.length) {
    lastError = skipped.length === 1
      ? skipped[0].message
      : `Skipped unreadable workspace packages: ${skipped.length} packages.`;
    lastErrorScope = "project-package-scan";
  } else if (lastErrorScope === "project-package-scan") {
    lastError = "";
    lastErrorScope = "";
  }
}

function workspacePackageWarnings() {
  return lastSkippedProjectPackages.map((item) => item.message);
}

function setSkippedBackupFiles(skipped) {
  lastSkippedBackupFiles = skipped;
}

function workspaceBackupWarnings() {
  return lastSkippedBackupFiles.map((item) => item.message);
}

function clearWorkspaceWriteError() {
  if (lastErrorScope !== "write") return;
  lastError = "";
  lastErrorScope = "";
}

async function directoryEntries(handle) {
  if (!handle?.entries) return [];
  const entries = [];
  for await (const entry of handle.entries()) entries.push(entry);
  return entries;
}

function packageValidationSummary(pkg) {
  const validation = pkg.validation || pkg.validationReports?.package;
  if (!validation) return null;
  return {
    errors: validation.errors?.length || 0,
    warnings: validation.warnings?.length || 0,
    risky: validation.risky?.length || 0,
    simplified: validation.simplified?.length || 0,
    skipped: validation.skipped?.length || 0
  };
}

function sanitizeManifestValidationSummary(summary) {
  if (!summary || typeof summary !== "object" || Array.isArray(summary)) return null;
  const count = (value) => {
    const numeric = Number(value);
    return Number.isFinite(numeric) && numeric > 0 ? Math.floor(numeric) : 0;
  };
  return {
    errors: count(summary.errors),
    warnings: count(summary.warnings),
    risky: count(summary.risky),
    simplified: count(summary.simplified),
    skipped: count(summary.skipped)
  };
}

function sanitizeManifestResourceRef(resource) {
  if (!resource || typeof resource !== "object" || Array.isArray(resource)) return null;
  const entryCount = Number(resource.entryCount);
  const termCount = Number(resource.termCount);
  return {
    id: workspaceSafeLabel(resource.id || ""),
    type: workspaceSafeLabel(resource.type || ""),
    name: workspaceSafeLabel(resource.name || "Unnamed resource", "Unnamed resource"),
    role: workspaceSafeLabel(resource.role || ""),
    sourceLang: workspaceSafeLabel(resource.sourceLang || ""),
    targetLang: workspaceSafeLabel(resource.targetLang || ""),
    languagePair: workspaceSafeLabel(resource.languagePair || ""),
    entryCount: Number.isFinite(entryCount) && entryCount >= 0 ? entryCount : 0,
    termCount: Number.isFinite(termCount) && termCount >= 0 ? termCount : 0,
    updatedAt: workspaceSafeLabel(resource.updatedAt || "")
  };
}

function sanitizeManifestProjectRef(projectRef) {
  if (!projectRef || typeof projectRef !== "object" || Array.isArray(projectRef)) return null;
  const segmentCount = Number(projectRef.segmentCount);
  const fallbackProjectPath = [PROJECT_DIR, `${cleanPathPart(projectRef.name || projectRef.id, "project")}-${shortId(projectRef.id)}`, PACKAGE_FILE];
  return {
    id: workspaceSafeLabel(projectRef.id || ""),
    name: workspaceSafeLabel(projectRef.name || "Project", "Project"),
    sourceLang: workspaceSafeLabel(projectRef.sourceLang || ""),
    targetLang: workspaceSafeLabel(projectRef.targetLang || ""),
    packagePath: workspaceSafePath(projectRef.packagePath || "", fallbackProjectPath),
    lastSavedAt: workspaceSafeLabel(projectRef.lastSavedAt || ""),
    updatedAt: workspaceSafeLabel(projectRef.updatedAt || ""),
    schemaVersion: Number.isFinite(Number(projectRef.schemaVersion)) ? Number(projectRef.schemaVersion) : SCHEMA_VERSION,
    segmentCount: Number.isFinite(segmentCount) && segmentCount >= 0 ? segmentCount : 0,
    validationSummary: sanitizeManifestValidationSummary(projectRef.validationSummary),
    resourceRefs: Array.isArray(projectRef.resourceRefs) ? projectRef.resourceRefs.map(sanitizeManifestResourceRef).filter(Boolean) : []
  };
}

function sanitizeManifestBackupRef(backupRef) {
  if (!backupRef || typeof backupRef !== "object" || Array.isArray(backupRef)) return null;
  const projectCount = Number(backupRef.projectCount);
  const segmentCount = Number(backupRef.segmentCount);
  const fallbackName = `${cleanPathPart(backupRef.id || "backup", "backup")}.json`;
  const path = workspaceSafePath(backupRef.path || "", [BACKUP_DIR, fallbackName]);
  return {
    id: workspaceSafeLabel(backupRef.id || `backup-${cleanPathPart(path, "backup")}`, "backup"),
    path,
    createdAt: workspaceSafeLabel(backupRef.createdAt || ""),
    projectCount: Number.isFinite(projectCount) && projectCount >= 0 ? projectCount : null,
    segmentCount: Number.isFinite(segmentCount) && segmentCount >= 0 ? segmentCount : null,
    schemaVersion: Number.isFinite(Number(backupRef.schemaVersion)) ? Number(backupRef.schemaVersion) : null
  };
}

function projectResourceRefsFromPackage(pkg) {
  const project = pkg.project || {};
  return (project.resourceLinks || []).map((link) => ({
    id: link.id || `${project.id}-${link.type}-${cleanPathPart(link.name)}`,
    type: link.type,
    name: workspaceSafeLabel(link.name || ""),
    role: link.role || "",
    sourceLang: project.sourceLang,
    targetLang: project.targetLang
  }));
}

function projectRefFromPackage(pkg, packagePath, savedAt = nowIso()) {
  const project = pkg.project || {};
  const lastSavedAt = pkg.packageMetadata?.savedAt || pkg.savedAt || pkg.exportedAt || project.updatedAt || savedAt;
  return {
    id: project.id,
    name: workspaceSafeLabel(project.name || "Project", "Project"),
    sourceLang: project.sourceLang,
    targetLang: project.targetLang,
    packagePath: packagePath.join("/"),
    lastSavedAt,
    updatedAt: project.updatedAt || lastSavedAt,
    schemaVersion: pkg.schemaVersion || SCHEMA_VERSION,
    segmentCount: (pkg.segments || []).length,
    validationSummary: packageValidationSummary(pkg),
    resourceRefs: projectResourceRefsFromPackage(pkg)
  };
}

function projectPackagePathParts(projectRef = {}) {
  const projectLabel = workspaceSafeLabel(projectRef.name || projectRef.id, "Project");
  const parts = workspacePathParts(projectRef.packagePath || "");
  if (!parts.length) throw new Error(`${projectLabel} is listed in the manifest without a package path.`);
  if (
    parts.length !== 3 ||
    parts[0] !== PROJECT_DIR ||
    parts[2] !== PACKAGE_FILE ||
    parts.some(unsafeWorkspacePathPart)
  ) {
    throw new Error(`${projectLabel} has an invalid workspace package path.`);
  }
  return parts;
}

function packageTimestamp(pkg) {
  const project = pkg?.project || {};
  return new Date(pkg?.packageMetadata?.savedAt || pkg?.savedAt || pkg?.exportedAt || project.updatedAt || project.createdAt || 0).getTime() || 0;
}

function manifestProjectRefTimestamp(projectRef) {
  return new Date(projectRef?.lastSavedAt || projectRef?.updatedAt || 0).getTime() || 0;
}

function dedupeProjectPackages(discovered) {
  const byProjectId = new Map();
  discovered.forEach((item) => {
    const projectId = item.pkg?.project?.id;
    if (!projectId) return;
    const existing = byProjectId.get(projectId);
    if (!existing || packageTimestamp(item.pkg) >= packageTimestamp(existing.pkg)) {
      byProjectId.set(projectId, item);
    }
  });
  return Array.from(byProjectId.values());
}

function mergeManifestAndDiscoveredProjectRefs(manifestRefs = [], discovered = []) {
  const byProjectId = new Map();
  (manifestRefs || []).forEach((ref) => {
    if (!ref?.id) return;
    byProjectId.set(ref.id, { ref, timestamp: manifestProjectRefTimestamp(ref) });
  });
  dedupeProjectPackages(discovered).forEach(({ pkg, packagePath }) => {
    const ref = projectRefFromPackage(pkg, packagePath);
    if (!ref.id) return;
    const existing = byProjectId.get(ref.id);
    const timestamp = manifestProjectRefTimestamp(ref);
    if (!existing || timestamp >= existing.timestamp) byProjectId.set(ref.id, { ref, timestamp });
  });
  return Array.from(byProjectId.values())
    .map((item) => item.ref)
    .sort((a, b) => manifestProjectRefTimestamp(b) - manifestProjectRefTimestamp(a));
}

function visibleProjectRefsFromDiscovered(manifestRefs = [], discovered = []) {
  const manifestById = new Map((manifestRefs || []).filter((ref) => ref?.id).map((ref) => [ref.id, ref]));
  return dedupeProjectPackages(discovered)
    .map(({ pkg, packagePath }) => {
      const ref = projectRefFromPackage(pkg, packagePath);
      return ref.id && manifestById.has(ref.id) ? { ...manifestById.get(ref.id), ...ref } : ref;
    })
    .filter((ref) => ref?.id)
    .sort((a, b) => manifestProjectRefTimestamp(b) - manifestProjectRefTimestamp(a));
}

async function scanProjectPackages() {
  const packages = [];
  const skipped = [];
  let projectsDir;
  try {
    projectsDir = await getDirectory([PROJECT_DIR]);
  } catch (error) {
    if (error.name === "NotFoundError") {
      setSkippedProjectPackages([]);
      return packages;
    }
    throw error;
  }

  for (const [folderName, entryHandle] of await directoryEntries(projectsDir)) {
    if (entryHandle.kind && entryHandle.kind !== "directory") continue;
    if (unsafeWorkspacePathPart(folderName)) {
      skipped.push({
        folderName,
        packagePath: [PROJECT_DIR, cleanWorkspacePathPart(folderName, "workspace-package"), PACKAGE_FILE].join("/"),
        message: workspacePackageUnsafePathWarning(folderName)
      });
      continue;
    }
    try {
      const packageHandle = await entryHandle.getFileHandle(PACKAGE_FILE);
      const pkg = await readJsonFromFileHandle(packageHandle, `${folderName}/${PACKAGE_FILE}`);
      let validation = null;
      try {
        validation = validateWorkspaceProjectPackage(pkg, `${folderName}/${PACKAGE_FILE}`);
      } catch (error) {
        if (error.name !== "WorkspacePackageValidationError") throw error;
        skipped.push({
          folderName,
          packagePath: [PROJECT_DIR, folderName, PACKAGE_FILE].join("/"),
          message: workspacePackageValidationWarning(folderName, error.validation)
        });
        continue;
      }
      if (pkg?.project?.id) {
        packages.push({ pkg: withWorkspaceValidation(pkg, validation), packagePath: [PROJECT_DIR, folderName, PACKAGE_FILE] });
      }
    } catch (error) {
      if (error.name === "NotFoundError") continue;
      if (!isMissingOrInvalidJson(error)) throw error;
      skipped.push({
        folderName,
        packagePath: [PROJECT_DIR, folderName, PACKAGE_FILE].join("/"),
        message: workspacePackageReadWarning(folderName, error)
      });
    }
  }
  setSkippedProjectPackages(skipped);
  return packages;
}

async function rebuildManifestFromPackages(existing = {}) {
  const discovered = dedupeProjectPackages(await scanProjectPackages());
  if (!discovered.length) return null;
  const recoveredProjects = discovered
    .map(({ pkg, packagePath }) => projectRefFromPackage(pkg, packagePath))
    .sort((a, b) => new Date(b.lastSavedAt || 0) - new Date(a.lastSavedAt || 0));
  const recoveredResources = discovered
    .flatMap(({ pkg }) => summarizePackageResources(pkg));
  const lastSyncedAt = recoveredProjects[0]?.lastSavedAt || nowIso();
  const nextManifest = defaultManifest({
    ...existing,
    app: APP_NAME,
    type: "workspace-manifest",
    projects: recoveredProjects,
    resources: upsertResources([], recoveredResources),
    backups: Array.isArray(existing.backups) ? existing.backups : [],
    lastSyncedAt
  });
  await writeJson([RESOURCE_DIR, "resource-index.json"], nextManifest.resources);
  await writeManifest(nextManifest);
  return manifest;
}

async function loadManifest({ create = false } = {}) {
  try {
    manifest = normalizeManifest(await readJson([MANIFEST_FILE]));
    return manifest;
  } catch (error) {
    if (!create || !isMissingOrInvalidJson(error)) throw error;
    try {
      manifest = normalizeManifest(await readJson([LEGACY_MANIFEST_FILE]));
      await writeManifest(manifest);
      return manifest;
    } catch (legacyError) {
      if (!isMissingOrInvalidJson(legacyError)) throw legacyError;
    }
    const recovered = await rebuildManifestFromPackages();
    if (recovered) return recovered;
    await writeManifest(defaultManifest());
    return manifest;
  }
}

async function writeManifest(nextManifest = manifest) {
  const preparedManifest = defaultManifest({
    ...nextManifest,
    updatedAt: nowIso(),
    lastSyncedAt: nextManifest?.lastSyncedAt || manifest?.lastSyncedAt || ""
  });
  await writeJson([MANIFEST_FILE], preparedManifest);
  manifest = preparedManifest;
  clearWorkspaceWriteError();
  return manifest;
}

function projectPackagePath(project) {
  const folder = `${cleanPathPart(project.name, "project")}-${shortId(project.id)}`;
  return [PROJECT_DIR, folder, PACKAGE_FILE];
}

function resourceKey(resource) {
  return [
    resource.type,
    resource.name,
    resource.sourceLang || "",
    resource.targetLang || ""
  ].join("::");
}

function summarizePackageResources(pkg) {
  const project = pkg.project || {};
  const summaries = new Map();
  (pkg.resources?.tmEntries || []).forEach((entry) => {
    const resource = {
      id: `tm-${cleanPathPart(entry.tmName)}-${entry.languagePair || `${entry.sourceLang}::${entry.targetLang}`}`,
      type: "tm",
      name: workspaceSafeLabel(entry.tmName || "Unnamed TM", "Unnamed TM"),
      sourceLang: entry.sourceLang || project.sourceLang || "",
      targetLang: entry.targetLang || project.targetLang || "",
      languagePair: entry.languagePair || `${entry.sourceLang || project.sourceLang || ""}::${entry.targetLang || project.targetLang || ""}`,
      entryCount: 0,
      termCount: 0,
      updatedAt: entry.updatedAt || entry.createdAt || ""
    };
    const key = resourceKey(resource);
    const existing = summaries.get(key) || resource;
    existing.entryCount += 1;
    existing.updatedAt = [existing.updatedAt, resource.updatedAt].sort().pop() || "";
    summaries.set(key, existing);
  });
  (pkg.resources?.terms || []).forEach((term) => {
    const resource = {
      id: `tb-${cleanPathPart(term.termBaseName)}-${term.languagePair || `${term.sourceLang}::${term.targetLang}`}`,
      type: "termbase",
      name: workspaceSafeLabel(term.termBaseName || "Unnamed TB", "Unnamed TB"),
      sourceLang: term.sourceLang || project.sourceLang || "",
      targetLang: term.targetLang || project.targetLang || "",
      languagePair: term.languagePair || `${term.sourceLang || project.sourceLang || ""}::${term.targetLang || project.targetLang || ""}`,
      entryCount: 0,
      termCount: 0,
      updatedAt: term.updatedAt || term.createdAt || ""
    };
    const key = resourceKey(resource);
    const existing = summaries.get(key) || resource;
    existing.termCount += 1;
    existing.updatedAt = [existing.updatedAt, resource.updatedAt].sort().pop() || "";
    summaries.set(key, existing);
  });
  return Array.from(summaries.values());
}

function upsertById(items, item) {
  return [...items.filter((existing) => existing.id !== item.id), item];
}

function upsertResources(existing, nextResources) {
  const byKey = new Map((existing || []).map((resource) => [resourceKey(resource), resource]));
  nextResources.forEach((resource) => {
    byKey.set(resourceKey(resource), {
      ...byKey.get(resourceKey(resource)),
      ...resource
    });
  });
  return Array.from(byKey.values()).sort((a, b) => a.type.localeCompare(b.type) || a.name.localeCompare(b.name));
}

function backupRefFromFileName(name) {
  const path = [BACKUP_DIR, name].join("/");
  return {
    id: `backup-${cleanPathPart(name, "backup")}`,
    path,
    createdAt: "",
    projectCount: null,
    segmentCount: null,
    schemaVersion: null
  };
}

async function scanBackupFiles() {
  const backups = [];
  const skipped = [];
  let backupsDir;
  try {
    backupsDir = await getDirectory([BACKUP_DIR]);
  } catch (error) {
    if (error.name === "NotFoundError") {
      setSkippedBackupFiles([]);
      return backups;
    }
    throw error;
  }
  for (const [fileName, entryHandle] of await directoryEntries(backupsDir)) {
    if (entryHandle.kind && entryHandle.kind !== "file") continue;
    if (!String(fileName || "").toLowerCase().endsWith(".json")) continue;
    if (unsafeWorkspacePathPart(fileName)) {
      skipped.push({
        fileName,
        path: [BACKUP_DIR, cleanWorkspacePathPart(fileName, "workspace-backup.json")].join("/"),
        message: workspaceBackupUnsafePathWarning(fileName)
      });
      continue;
    }
    backups.push(backupRefFromFileName(fileName));
  }
  setSkippedBackupFiles(skipped);
  return backups;
}

function mergeBackupRefs(manifestRefs = [], discoveredRefs = []) {
  const byPath = new Map();
  (discoveredRefs || []).forEach((ref) => {
    if (ref?.path) byPath.set(ref.path, ref);
  });
  (manifestRefs || []).forEach((ref) => {
    if (ref?.path && byPath.has(ref.path)) byPath.set(ref.path, { ...byPath.get(ref.path), ...ref });
  });
  return Array.from(byPath.values())
    .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0) || String(b.path || "").localeCompare(String(a.path || "")));
}

async function connect(handle, { persist = true } = {}) {
  if (!isSupported()) throw new Error("Workspace folders are not supported in this browser.");
  if (!(await requestPermission(handle))) throw new Error("Workspace folder permission was not granted.");
  directoryHandle = handle;
  if (persist) await rememberWorkspaceHandle(handle);
  await loadManifest({ create: true });
  return getStatus();
}

async function chooseWorkspaceFolder(options = {}) {
  const pickerOptions = { mode: "readwrite" };
  if (options.startIn) pickerOptions.startIn = options.startIn;
  const handle = await window.showDirectoryPicker(pickerOptions);
  return connect(handle);
}

async function reconnectSavedWorkspace() {
  if (!isSupported()) return getStatus();
  const handle = await getSavedWorkspaceHandle();
  if (!handle || !(await hasPermission(handle))) return getStatus();
  directoryHandle = handle;
  await loadManifest({ create: true });
  return getStatus();
}

async function ensureConnected() {
  if (!directoryHandle) await reconnectSavedWorkspace();
  if (!directoryHandle) throw new Error("Choose a workspace folder first.");
  if (!(await requestPermission(directoryHandle))) throw new Error("Workspace folder permission was not granted.");
  if (!manifest) await loadManifest({ create: true });
}

async function saveProjectPackage(pkg) {
  await ensureConnected();
  if (!pkg?.project?.id) throw new Error("Project package is missing project metadata.");
  const validation = validateWorkspaceProjectPackage(pkg, pkg.project.name || "Workspace project package");
  const validatedPackage = withWorkspaceValidation(pkg, validation);
  const packagePath = projectPackagePath(validatedPackage.project);
  const savedAt = nowIso();
  const packageWithMetadata = {
    ...validatedPackage,
    packageMetadata: {
      ...(validatedPackage.packageMetadata || {}),
      format: "loopcat-project-package",
      packageVersion: validatedPackage.version || 1,
      contractVersion: "loopcat-package-v1",
      packagePath: packagePath.join("/"),
      savedAt,
      storageMode: "workspace-folder"
    },
    savedAt
  };
  await writeJson(packagePath, packageWithMetadata);
  const validationReportResult = await writeOptionalValidationReport(packagePath, packageWithMetadata.validation || {});

  const resourceRefs = (packageWithMetadata.project.resourceLinks || []).map((link) => ({
    id: link.id || `${packageWithMetadata.project.id}-${link.type}-${cleanPathPart(link.name)}`,
    type: link.type,
    name: workspaceSafeLabel(link.name || ""),
    role: link.role || "",
    sourceLang: packageWithMetadata.project.sourceLang,
    targetLang: packageWithMetadata.project.targetLang
  }));
  const projectRef = { ...projectRefFromPackage(packageWithMetadata, packagePath, savedAt), resourceRefs };
  const nextManifest = defaultManifest({
    ...(manifest || {}),
    projects: upsertById(manifest?.projects || [], projectRef)
      .sort((a, b) => new Date(b.lastSavedAt || 0) - new Date(a.lastSavedAt || 0)),
    resources: upsertResources(manifest?.resources || [], summarizePackageResources(packageWithMetadata)),
    lastSyncedAt: savedAt
  });
  await writeJson([RESOURCE_DIR, "resource-index.json"], nextManifest.resources);
  await writeManifest(nextManifest);
  return {
    manifest,
    packagePath: packagePath.join("/"),
    savedAt,
    validationReportSaved: validationReportResult.saved,
    validationReportWarning: validationReportResult.warning
  };
}

async function listProjectPackages() {
  await ensureConnected();
  return mergeManifestAndDiscoveredProjectRefs(manifest.projects || [], await scanProjectPackages());
}

async function readProjectPackage(projectRef) {
  await ensureConnected();
  const path = projectPackagePathParts(projectRef);
  const pkg = await readJson(path);
  const validation = validateWorkspaceProjectPackage(pkg, projectRef.name || path.join("/"));
  return withWorkspaceValidation(pkg, validation);
}

async function readAllProjectPackages() {
  const refs = await listProjectPackages();
  const packages = [];
  for (const ref of refs) {
    packages.push({ ref, pkg: await readProjectPackage(ref) });
  }
  return packages;
}

async function repairWorkspaceManifest() {
  await ensureConnected();
  const repaired = await rebuildManifestFromPackages(manifest || {});
  if (!repaired) {
    const nextManifest = defaultManifest(manifest || {});
    await writeJson([RESOURCE_DIR, "resource-index.json"], nextManifest.resources || []);
    await writeManifest(nextManifest);
  }
  return {
    manifest,
    recoveredProjectCount: manifest?.projects?.length || 0,
    recoveredResourceCount: manifest?.resources?.length || 0,
    skippedProjectCount: lastSkippedProjectPackages.length,
    warnings: workspacePackageWarnings()
  };
}

async function exportFullBackup(data) {
  await ensureConnected();
  validateWorkspaceBackupFile(data, "Workspace backup");
  const fileName = `loopcat-backup-${new Date().toISOString().slice(0, 10)}-${Date.now()}.json`;
  const backupPath = [BACKUP_DIR, fileName];
  await writeJson(backupPath, data);
  const backupRef = {
    id: `backup-${Date.now()}`,
    path: backupPath.join("/"),
    createdAt: nowIso(),
    projectCount: (data.projects || []).length,
    segmentCount: (data.segments || []).length,
    schemaVersion: data.schemaVersion || SCHEMA_VERSION
  };
  const nextManifest = defaultManifest({
    ...(manifest || {}),
    backups: upsertById(manifest?.backups || [], backupRef).slice(-25),
    lastSyncedAt: backupRef.createdAt
  });
  try {
    await writeManifest(nextManifest);
    return { ...backupRef, manifestSaved: true, manifestWarning: "" };
  } catch (error) {
    return {
      ...backupRef,
      manifestSaved: false,
      manifestWarning: `Backup file saved, but the workspace manifest could not be updated: ${workspaceSafeLabel(error.message || error, "The workspace manifest could not be updated.")}`
    };
  }
}

async function getStatus() {
  const supported = isSupported();
  const connected = Boolean(directoryHandle);
  const previousWriteError = lastErrorScope === "write" ? lastError : "";
  const visibleProjects = connected ? visibleProjectRefsFromDiscovered(manifest?.projects || [], await scanProjectPackages()) : (manifest?.projects || []);
  const visibleBackups = connected ? mergeBackupRefs(manifest?.backups || [], await scanBackupFiles()) : (manifest?.backups || []);
  const warnings = [...workspacePackageWarnings(), ...workspaceBackupWarnings()];
  return {
    supported,
    connected,
    mode: connected ? "workspace-folder" : "browser-cache",
    name: connected ? workspaceSafeLabel(directoryHandle.name, "Workspace folder") : "Browser cache",
    manifest,
    lastSyncedAt: manifest?.lastSyncedAt || "",
    projectCount: visibleProjects.length,
    resourceCount: manifest?.resources?.length || 0,
    backupCount: visibleBackups.length,
    skippedProjectCount: lastSkippedProjectPackages.length,
    warnings,
    lastError: previousWriteError || lastError
  };
}

async function buildHealthReport({ projects = [], tmEntries = [], terms = [], dirtyProjectIds = [] } = {}) {
  await ensureConnected();
  const discovered = await scanProjectPackages();
  await scanBackupFiles();
  const visibleProjects = visibleProjectRefsFromDiscovered(manifest?.projects || [], discovered);
  const visibleResources = upsertResources(
    manifest?.resources || [],
    dedupeProjectPackages(discovered).flatMap(({ pkg }) => summarizePackageResources(pkg))
  );
  const report = {
    ok: true,
    errors: [],
    warnings: [],
    preserved: [],
    simplified: [],
    skipped: [],
    risky: []
  };
  report.preserved.push(`${visibleProjects.length} visible project package${visibleProjects.length === 1 ? "" : "s"} in the workspace folder.`);
  report.preserved.push(`${manifest.projects.length} project package${manifest.projects.length === 1 ? "" : "s"} in the workspace manifest.`);
  report.preserved.push(`${visibleResources.length} visible resource reference${visibleResources.length === 1 ? "" : "s"} in the workspace folder.`);
  report.preserved.push(`${manifest.resources.length} resource reference${manifest.resources.length === 1 ? "" : "s"} in the workspace manifest.`);
  if (dirtyProjectIds.length) {
    report.warnings.push(`${dirtyProjectIds.length} open project package${dirtyProjectIds.length === 1 ? " has" : "s have"} unsaved folder changes.`);
  }
  workspacePackageWarnings().forEach((warning) => {
    report.errors.push(warning);
  });
  workspaceBackupWarnings().forEach((warning) => {
    report.errors.push(warning);
  });
  for (const projectRef of manifest.projects || []) {
    try {
      const projectLabel = workspaceSafeLabel(projectRef.name || projectRef.id, "Project");
      const packagePath = projectPackagePathParts(projectRef);
      if (!(await exists(packagePath))) {
        report.errors.push(`${projectLabel} is listed in the manifest, but its package file is missing.`);
      }
    } catch (error) {
      report.errors.push(workspaceSafeLabel(error.message || error, "Project has an invalid workspace package path."));
    }
  }
  const resourceSet = new Set(visibleResources.map(resourceKey));
  const tmSet = new Set(tmEntries.map((entry) => resourceKey({
    type: "tm",
    name: entry.tmName,
    sourceLang: entry.sourceLang,
    targetLang: entry.targetLang
  })));
  const tbSet = new Set(terms.map((term) => resourceKey({
    type: "termbase",
    name: term.termBaseName,
    sourceLang: term.sourceLang,
    targetLang: term.targetLang
  })));
  projects.forEach((project) => {
    const seenLinks = new Set();
    const projectLabel = workspaceSafeLabel(project.name || project.id, "Project");
    (project.resourceLinks || []).forEach((link) => {
      const linkLabel = workspaceSafeLabel(link.name || "resource", "resource");
      const key = resourceKey({
        type: link.type,
        name: link.name,
        sourceLang: project.sourceLang,
        targetLang: project.targetLang
      });
      if (seenLinks.has(key)) report.simplified.push(`${projectLabel} has a duplicate ${link.type} link named ${linkLabel}.`);
      seenLinks.add(key);
      const cacheHasResource = link.type === "tm" ? tmSet.has(key) : tbSet.has(key);
      if (!cacheHasResource && resourceSet.has(key)) {
        report.risky.push(`${projectLabel} links to ${linkLabel}, which is present in the workspace manifest but not loaded in the local cache.`);
      } else if (!cacheHasResource && !resourceSet.has(key)) {
        report.skipped.push(`${projectLabel} links to missing ${link.type} resource ${linkLabel}.`);
      }
    });
  });
  report.ok = report.errors.length === 0;
  return report;
}

window.CatHan = window.CatHan || {};
window.CatHan.workspaceStorage = {
  MANIFEST_FILE,
  LEGACY_MANIFEST_FILE,
  isSupported,
  chooseWorkspaceFolder,
  connectHandle: connect,
  reconnectSavedWorkspace,
  saveProjectPackage,
  listProjectPackages,
  readProjectPackage,
  readAllProjectPackages,
  repairWorkspaceManifest,
  exportFullBackup,
  buildHealthReport,
  getStatus
};
})();
