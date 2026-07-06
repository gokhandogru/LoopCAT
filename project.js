(() => {
const {
  bulkPut,
  bulkPutIfRevisionNotOlder,
  deleteByKey,
  deleteProjectRecords,
  deleteWhere,
  get,
  getAll,
  getAllByIndex,
  makeId,
  put,
  putIfRevisionNotOlder,
  updateProjectAndDeleteDocumentSegments,
  updateProjectAndPutSegments,
  constants
} = window.CatHan.storage;
const LOCAL_WORKSPACE_ID = constants?.LOCAL_WORKSPACE_ID || "local-workspace";
const LOCAL_USER_ID = constants?.LOCAL_USER_ID || "local-user";
const RESOURCE_LINK_TYPES = new Set(["tm", "termbase"]);
const SENSITIVE_TEXT_VALUE_PATTERN = /(sk-[A-Za-z0-9_-]{8,}|Bearer\s+[A-Za-z0-9._~+/=-]{8,}|gh[pousr]_[A-Za-z0-9_]{8,}|npm_[A-Za-z0-9_]{8,}|(?:session|cookie)[=:][A-Za-z0-9._~+/=-]{8,})/i;

function ownershipFields(value = {}) {
  const now = new Date().toISOString();
  return {
    workspaceId: value.workspaceId || LOCAL_WORKSPACE_ID,
    ownerId: value.ownerId || LOCAL_USER_ID,
    createdBy: value.createdBy || LOCAL_USER_ID,
    updatedBy: LOCAL_USER_ID,
    createdAt: value.createdAt || now,
    updatedAt: now
  };
}

function defaultQaSettings() {
  return {
    enabledChecks: ["empty", "tag", "copy", "number", "punctuation", "term"]
  };
}

function defaultAiSettings(settings = {}) {
  const source = settings && typeof settings === "object" ? settings : {};
  const localProvider = redactSensitiveText(source.localProvider || source.localProviderId || "ollama").trim() || "ollama";
  const localBaseUrl = redactSensitiveText(source.localBaseUrl || "http://localhost:11434").trim() || "http://localhost:11434";
  const localModel = redactSensitiveText(source.localModel || "translategemma").trim() || "translategemma";
  const localSourceCode = redactSensitiveText(source.localSourceCode || "").trim();
  const localTargetCode = redactSensitiveText(source.localTargetCode || "").trim();
  const localConcurrency = Number(source.localConcurrency);
  const localTimeoutMs = Number(source.localTimeoutMs);
  const localPretranslateMode = ["selected", "untranslated", "visible", "project"].includes(String(source.localPretranslateMode || "").trim())
    ? String(source.localPretranslateMode).trim()
    : "untranslated";
  const localVariantMode = ["standard", "formal", "concise", "locale", "plain"].includes(String(source.localVariantMode || "").trim())
    ? String(source.localVariantMode).trim()
    : "standard";
  const localAdaptMode = ["simplify", "formalize", "localize", "shorten"].includes(String(source.localAdaptMode || "").trim())
    ? String(source.localAdaptMode).trim()
    : "simplify";
  return {
    enabled: Boolean(source.enabled),
    provider: redactSensitiveText(source.provider || "OpenAI").trim() || "OpenAI",
    model: redactSensitiveText(source.model || "gpt-5.5").trim() || "gpt-5.5",
    apiKeyMode: "bring-your-own",
    sendSourceToAi: Boolean(source.sendSourceToAi),
    useTmContext: source.useTmContext !== false,
    useTermbaseContext: source.useTermbaseContext !== false,
    styleGuide: redactSensitiveText(source.styleGuide || "").trim(),
    localProvider,
    localBaseUrl,
    localModel,
    localSourceLang: redactSensitiveText(source.localSourceLang || "").trim(),
    localSourceCode,
    localTargetLang: redactSensitiveText(source.localTargetLang || "").trim(),
    localTargetCode,
    localPretranslateMode,
    localVariantMode,
    localAdaptMode,
    localConcurrency: Number.isFinite(localConcurrency) ? Math.min(2, Math.max(1, Math.round(localConcurrency))) : 1,
    localTimeoutMs: Number.isFinite(localTimeoutMs) ? Math.min(600000, Math.max(5000, Math.round(localTimeoutMs))) : 120000,
    localOverwrite: Boolean(source.localOverwrite),
    localIncludeNearbyContext: source.localIncludeNearbyContext !== false,
    localPreserveConfirmedLocked: source.localPreserveConfirmedLocked !== false
  };
}

const QUALITY_STANDARDS = new Set(["student-review", "freelance-delivery", "agency-delivery", "regulated"]);
const QUALITY_REVIEW_DEPTHS = new Set(["targeted", "full", "lqa"]);
const QUALITY_RISK_TOLERANCES = new Set(["balanced", "strict", "regulated"]);
const QUALITY_TERMINOLOGY_STRICTNESS = new Set(["standard", "strict"]);
const QUALITY_AI_DISCLOSURE_MODES = new Set(["not-used", "local-only", "hosted-disclosed", "client-approved"]);

function qualityChoice(value, allowed, fallback) {
  const clean = cleanText(value);
  return allowed.has(clean) ? clean : fallback;
}

function defaultQualityProfile(profile = {}) {
  const source = profile && typeof profile === "object" ? profile : {};
  return {
    standard: qualityChoice(source.standard, QUALITY_STANDARDS, "freelance-delivery"),
    reviewDepth: qualityChoice(source.reviewDepth, QUALITY_REVIEW_DEPTHS, "targeted"),
    riskTolerance: qualityChoice(source.riskTolerance, QUALITY_RISK_TOLERANCES, "balanced"),
    terminologyStrictness: qualityChoice(source.terminologyStrictness, QUALITY_TERMINOLOGY_STRICTNESS, "standard"),
    aiDisclosure: qualityChoice(source.aiDisclosure, QUALITY_AI_DISCLOSURE_MODES, "local-only"),
    audience: redactSensitiveText(cleanText(source.audience)).slice(0, 120),
    tone: redactSensitiveText(cleanText(source.tone, "Neutral")).slice(0, 80)
  };
}

function redactSensitiveText(value) {
  return String(value || "").replace(new RegExp(SENSITIVE_TEXT_VALUE_PATTERN.source, "gi"), "[redacted secret]");
}

function uniqueNames(values) {
  return Array.from(new Set((Array.isArray(values) ? values : []).map((value) => cleanPortableLabel(value)).filter(Boolean)));
}

function cleanText(value, fallback = "") {
  if (typeof value !== "string" && typeof value !== "number") return fallback;
  const clean = String(value).trim();
  return clean || fallback;
}

function cleanPortableLabel(value, fallback = "") {
  const clean = redactSensitiveText(cleanText(value, fallback)).trim();
  return clean || fallback;
}

function projectIdentityFields(project = {}, options = {}) {
  const allowFallback = Boolean(options.allowFallback);
  const name = redactSensitiveText(cleanText(project.name, allowFallback ? "Untitled project" : ""));
  const sourceLang = redactSensitiveText(cleanText(project.sourceLang, allowFallback ? "und" : ""));
  const targetLang = redactSensitiveText(cleanText(project.targetLang, allowFallback ? "und" : ""));
  if (!allowFallback) {
    if (!name) throw new Error("Project name is required.");
    if (!sourceLang) throw new Error("Project source language is required.");
    if (!targetLang) throw new Error("Project target language is required.");
  }
  return { name, sourceLang, targetLang };
}

function cleanDocumentManifest(documents = []) {
  const seen = new Set();
  return (Array.isArray(documents) ? documents : [])
    .map((documentInfo) => {
      if (!documentInfo || typeof documentInfo !== "object" || Array.isArray(documentInfo)) return null;
      const id = cleanText(documentInfo.id);
      if (!id || seen.has(id)) return null;
      seen.add(id);
      return {
        ...documentInfo,
        id,
        name: cleanPortableLabel(documentInfo.name, "Document"),
        type: cleanText(documentInfo.type, "file")
      };
    })
    .filter(Boolean);
}

function projectUpdateDocuments(project = {}, existingProject = null) {
  const incoming = cleanDocumentManifest(project.documents);
  const existing = cleanDocumentManifest(existingProject?.documents);
  return existing.length && !incoming.length ? existing : incoming;
}

function segmentRevision(segment) {
  const revision = Number(segment?.revision);
  return Number.isFinite(revision) && revision >= 0 ? revision : 0;
}

function cleanResourceLinks(resourceLinks = []) {
  return (Array.isArray(resourceLinks) ? resourceLinks : [])
    .map((link) => {
      if (!link || typeof link !== "object" || Array.isArray(link)) return null;
      const type = String(link.type || "").trim();
      const name = cleanPortableLabel(link.name);
      if (!RESOURCE_LINK_TYPES.has(type) || !name) return null;
      return {
        ...link,
        id: typeof link.id === "string" && link.id.trim() ? link.id : "",
        type,
        name
      };
    })
    .filter(Boolean);
}

function resourceLinksForProject(project = {}) {
  const { id = "project", tmName, termBaseName, mainTmName, tmNames = [], termBaseNames = [], resourceLinks = [] } = project || {};
  const cleanLinks = cleanResourceLinks(resourceLinks);
  const tmNameList = Array.isArray(tmNames) ? tmNames : [];
  const tbNameList = Array.isArray(termBaseNames) ? termBaseNames : [];
  const main = cleanPortableLabel(mainTmName, cleanPortableLabel(tmName, cleanPortableLabel(tmNameList[0], "Default TM")));
  const tms = uniqueNames([main, ...tmNameList, ...cleanLinks.filter((link) => link.type === "tm").map((link) => link.name)]);
  const tbs = uniqueNames([cleanPortableLabel(termBaseName, cleanPortableLabel(tbNameList[0], "Default TB")), ...tbNameList, ...cleanLinks.filter((link) => link.type === "termbase").map((link) => link.name)]);
  return [
    ...tms.map((name) => ({
      id: cleanLinks.find((link) => link.type === "tm" && link.name === name)?.id || makeId("resource-link"),
      type: "tm",
      name,
      role: name === main ? "main" : "reference"
    })),
    ...tbs.map((name) => ({
      id: cleanLinks.find((link) => link.type === "termbase" && link.name === name)?.id || makeId("resource-link"),
      type: "termbase",
      name
    }))
  ];
}

async function listProjects() {
  const projects = await getAll("projects");
  return projects.map(projectReadRecord).sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
}

async function createProject(input = {}) {
  const { name, domain, creatorName, creatorOrigin, sourceLang, targetLang, tmName, termBaseName, mainTmName, tmNames = [], termBaseNames = [], resourceLinks = [] } = input || {};
  const now = new Date().toISOString();
  const identity = projectIdentityFields({ name, sourceLang, targetLang });
  const links = resourceLinksForProject({ tmName, termBaseName, mainTmName, tmNames, termBaseNames, resourceLinks });
  const main = links.find((link) => link.type === "tm" && link.role === "main")?.name || cleanPortableLabel(tmName, "Default TM");
  const firstTb = links.find((link) => link.type === "termbase")?.name || cleanPortableLabel(termBaseName, "Default TB");
  const project = {
    id: makeId("project"),
    workspaceId: LOCAL_WORKSPACE_ID,
    ownerId: LOCAL_USER_ID,
    createdBy: LOCAL_USER_ID,
    updatedBy: LOCAL_USER_ID,
    name: identity.name,
    sourceLang: identity.sourceLang,
    targetLang: identity.targetLang,
    domain: redactSensitiveText(domain || "").trim(),
    creatorName: cleanPortableLabel(creatorName || ""),
    creatorOrigin: cleanPortableLabel(creatorOrigin || ""),
    tmName: main,
    mainTmName: main,
    termBaseName: firstTb,
    resourceLinks: links,
    qaSettings: defaultQaSettings(),
    aiSettings: defaultAiSettings(),
    qualityProfile: defaultQualityProfile(),
    exportHistory: [],
    sourceFileName: "",
    documents: [],
    createdAt: now,
    updatedAt: now
  };
  await put("projects", project);
  return project;
}

function projectUpdateRecord(project, options = {}) {
  if (!project || typeof project !== "object") throw new Error("Project metadata is required.");
  const { academicMetadata: _academicMetadata, ...projectWithoutAcademicMetadata } = project;
  const identity = projectIdentityFields(projectWithoutAcademicMetadata, options);
  const links = resourceLinksForProject(projectWithoutAcademicMetadata);
  const main = links.find((link) => link.type === "tm" && link.role === "main")?.name || cleanPortableLabel(projectWithoutAcademicMetadata.tmName, "Default TM");
  const firstTb = links.find((link) => link.type === "termbase")?.name || cleanPortableLabel(projectWithoutAcademicMetadata.termBaseName, "Default TB");
  return {
    ...projectWithoutAcademicMetadata,
    name: identity.name,
    sourceLang: identity.sourceLang,
    targetLang: identity.targetLang,
    domain: redactSensitiveText(projectWithoutAcademicMetadata.domain || "").trim(),
    creatorName: cleanPortableLabel(projectWithoutAcademicMetadata.creatorName || projectWithoutAcademicMetadata.createdByName || ""),
    creatorOrigin: cleanPortableLabel(projectWithoutAcademicMetadata.creatorOrigin || ""),
    tmName: main,
    mainTmName: main,
    termBaseName: firstTb,
    sourceFileName: cleanPortableLabel(projectWithoutAcademicMetadata.sourceFileName || ""),
    documents: projectUpdateDocuments(projectWithoutAcademicMetadata, options.existingProject),
    resourceLinks: links,
    aiSettings: defaultAiSettings(projectWithoutAcademicMetadata.aiSettings),
    qualityProfile: defaultQualityProfile(projectWithoutAcademicMetadata.qualityProfile),
    ...ownershipFields(projectWithoutAcademicMetadata)
  };
}

function projectReadRecord(project) {
  const normalized = projectUpdateRecord(project, { allowFallback: true });
  return {
    ...normalized,
    updatedBy: project.updatedBy || normalized.updatedBy,
    updatedAt: project.updatedAt || normalized.updatedAt
  };
}

async function updateProject(project) {
  const existingProject = project?.id ? await get("projects", project.id) : null;
  const updated = projectUpdateRecord(project, { existingProject });
  await put("projects", updated);
  return updated;
}

async function getProjectSegments(projectId) {
  const segments = await getAllByIndex("segments", "projectId", projectId);
  return segments.sort((a, b) => a.index - b.index);
}

async function replaceProjectSegments(projectId, sourceSegments) {
  await deleteWhere("segments", (segment) => segment.projectId === projectId);
  return appendProjectSegments(projectId, sourceSegments, { startIndex: 0 });
}

function projectSegmentRecords(projectId, sourceSegments, options = {}) {
  const now = new Date().toISOString();
  const startIndex = options.startIndex ?? 0;
  const documentId = options.documentId || makeId("document");
  const documentName = cleanPortableLabel(options.documentName, "Imported document");
  const documentType = options.documentType || "text";
  const detectTags = window.CatHan.docx?.detectProtectedTags || (() => []);
  return sourceSegments.map((item, offset) => ({
    id: makeId("segment"),
    workspaceId: options.workspaceId || LOCAL_WORKSPACE_ID,
    ownerId: options.ownerId || LOCAL_USER_ID,
    createdBy: LOCAL_USER_ID,
    updatedBy: LOCAL_USER_ID,
    projectId,
    documentId,
    documentName,
    documentType,
    index: startIndex + offset,
    documentIndex: offset,
    source: item.text,
    target: item.target || "",
    status: item.status || (item.target ? "draft" : "empty"),
    reviewState: item.reviewState || "",
    reviewNote: item.reviewNote || "",
    comment: item.comment || "",
    comments: item.comments || [],
    aiSuggestions: item.aiSuggestions || [],
    targetHistory: item.targetHistory || [],
    revision: segmentRevision(item),
    tags: item.tags || detectTags(item.text || ""),
    structure: item.structure || null,
    createdAt: now,
    updatedAt: now
  }));
}

function documentInfoFromSegments(segments = []) {
  const first = segments[0];
  if (!first?.documentId) return null;
  return {
    id: first.documentId,
    name: first.documentName || "Imported document",
    type: first.documentType || "text"
  };
}

function projectWithDocument(project, documentInfo) {
  if (!project || !documentInfo?.id) return project;
  const documents = Array.isArray(project.documents) ? project.documents : [];
  if (documents.some((item) => item?.id === documentInfo.id)) return project;
  return {
    ...project,
    documents: [...documents, documentInfo]
  };
}

async function appendProjectSegments(projectId, sourceSegments, options = {}) {
  const existing = await getProjectSegments(projectId);
  const segments = projectSegmentRecords(projectId, sourceSegments, {
    ...options,
    startIndex: options.startIndex ?? existing.length
  });
  const project = await get("projects", projectId);
  const documentInfo = documentInfoFromSegments(segments);
  const updatedProject = project ? projectUpdateRecord(projectWithDocument(project, documentInfo)) : null;
  if (updatedProject && updateProjectAndPutSegments) {
    const result = await updateProjectAndPutSegments(updatedProject, segments);
    return result.segments;
  }
  await bulkPut("segments", segments);
  if (updatedProject) await put("projects", updatedProject);
  return segments;
}

async function appendProjectSegmentsAndUpdateProject(project, sourceSegments, options = {}) {
  const existingProject = project?.id ? await get("projects", project.id) : null;
  const updated = projectUpdateRecord(project, { existingProject });
  const existing = await getProjectSegments(updated.id);
  const segments = projectSegmentRecords(updated.id, sourceSegments, {
    ...options,
    startIndex: options.startIndex ?? existing.length
  });
  if (updateProjectAndPutSegments) {
    const result = await updateProjectAndPutSegments(updated, segments);
    return { project: result.project, segments: result.segments };
  }
  await bulkPut("segments", segments);
  await put("projects", updated);
  return { project: updated, segments };
}

async function saveSegments(segments) {
  const now = new Date().toISOString();
  const next = segments.map((segment) => ({
    ...segment,
    revision: segmentRevision(segment),
    updatedBy: LOCAL_USER_ID,
    updatedAt: now
  }));
  const result = bulkPutIfRevisionNotOlder
    ? await bulkPutIfRevisionNotOlder("segments", next, "revision")
    : { values: await Promise.all(next.map((segment) => saveSegment(segment))) };
  return result.values;
}

async function saveSegment(segment) {
  const next = {
    ...segment,
    revision: segmentRevision(segment),
    updatedBy: LOCAL_USER_ID,
    updatedAt: new Date().toISOString()
  };
  const result = await putIfRevisionNotOlder("segments", next, "revision");
  return result.value;
}

async function deleteSegment(id) {
  await deleteByKey("segments", id);
}

async function deleteProject(projectId) {
  if (deleteProjectRecords) {
    await deleteProjectRecords(projectId);
    return;
  }
  await deleteWhere("segments", (segment) => segment.projectId === projectId);
  await deleteWhere("activityEvents", (event) => event.projectId === projectId);
  await deleteByKey("projects", projectId);
}

async function deleteProjectDocument(projectOrId, documentId) {
  const project = typeof projectOrId === "object" && projectOrId ? projectUpdateRecord(projectOrId) : null;
  const projectId = project?.id || projectOrId;
  if (project && updateProjectAndDeleteDocumentSegments) {
    return updateProjectAndDeleteDocumentSegments(project, documentId);
  }
  await deleteWhere("segments", (segment) => segment.projectId === projectId && segment.documentId === documentId);
  return project;
}

window.CatHan.project = {
  listProjects,
  createProject,
  updateProject,
  getProjectSegments,
  replaceProjectSegments,
  appendProjectSegments,
  appendProjectSegmentsAndUpdateProject,
  saveSegments,
  deleteSegment,
  saveSegment,
  deleteProject,
  deleteProjectDocument
};
})();
