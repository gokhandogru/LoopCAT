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
  writeSegmentStructureAtomically,
  writeStoresAtomically,
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
  const localPretranslateMode = ["selected", "document", "untranslated", "visible", "project"].includes(String(source.localPretranslateMode || "").trim())
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
      const name = cleanPortableLabel(link.cachedName || link.name);
      if (!RESOURCE_LINK_TYPES.has(type) || !name) return null;
      const priority = Math.max(0, Math.round(Number(link.priority) || 0));
      return {
        ...link,
        id: typeof link.id === "string" && link.id.trim() ? link.id : "",
        resourceId: cleanText(link.resourceId),
        type,
        name,
        cachedName: name,
        role: type === "tm" && link.role === "main" ? "main" : type === "tm" ? "reference" : "termbase",
        lookup: link.lookup !== false,
        ...(type === "tm" ? { priority, penalty: Math.max(0, Math.min(30, Math.round(Number(link.penalty) || 0))) } : {}),
        ...(type === "termbase"
          ? { priority, qa: link.qa !== false, contribute: Boolean(link.contribute) }
          : {})
      };
    })
    .filter(Boolean);
}

function resourceLinksForProject(project = {}) {
  const { tmName, termBaseName, mainTmName, tmNames = [], termBaseNames = [], resourceLinks = [] } = project || {};
  const cleanLinks = cleanResourceLinks(resourceLinks);
  const tmNameList = Array.isArray(tmNames) ? tmNames : [];
  const tbNameList = Array.isArray(termBaseNames) ? termBaseNames : [];
  const main = cleanPortableLabel(mainTmName, cleanPortableLabel(tmName, cleanPortableLabel(tmNameList[0], "Default TM")));
  const tms = uniqueNames([main, ...tmNameList, ...cleanLinks.filter((link) => link.type === "tm").map((link) => link.name)]);
  const hasExplicitTermbasePlan = Array.isArray(resourceLinks) && resourceLinks.some((link) => link?.type === "termbase") ||
    Object.prototype.hasOwnProperty.call(project || {}, "activeTermBaseId") ||
    Object.prototype.hasOwnProperty.call(project || {}, "termBaseNames");
  const legacyPrimaryTermbase = cleanPortableLabel(termBaseName, cleanPortableLabel(tbNameList[0], hasExplicitTermbasePlan ? "" : "Default TB"));
  const tbs = uniqueNames([legacyPrimaryTermbase, ...tbNameList, ...cleanLinks.filter((link) => link.type === "termbase").map((link) => link.name)]);
  const links = [
    ...tms.map((name) => ({
      ...(cleanLinks.find((link) => link.type === "tm" && link.name === name) || {}),
      id: cleanLinks.find((link) => link.type === "tm" && link.name === name)?.id || makeId("resource-link"),
      type: "tm",
      name,
      cachedName: name,
      role: name === main ? "main" : "reference",
      lookup: cleanLinks.find((link) => link.type === "tm" && link.name === name)?.lookup !== false,
      priority: cleanLinks.find((link) => link.type === "tm" && link.name === name)?.priority ?? tms.indexOf(name),
      penalty: cleanLinks.find((link) => link.type === "tm" && link.name === name)?.penalty || 0
    })),
    ...tbs.map((name) => ({
      ...(cleanLinks.find((link) => link.type === "termbase" && link.name === name) || {}),
      id: cleanLinks.find((link) => link.type === "termbase" && link.name === name)?.id || makeId("resource-link"),
      type: "termbase",
      name,
      cachedName: name,
      role: "termbase",
      lookup: cleanLinks.find((link) => link.type === "termbase" && link.name === name)?.lookup !== false,
      qa: cleanLinks.find((link) => link.type === "termbase" && link.name === name)?.qa !== false,
      contribute: Boolean(cleanLinks.find((link) => link.type === "termbase" && link.name === name)?.contribute),
      priority: cleanLinks.find((link) => link.type === "termbase" && link.name === name)?.priority ?? tbs.indexOf(name)
    }))
  ];
  const tmLinks = links.filter((link) => link.type === "tm").sort((a, b) => a.priority - b.priority);
  if (tmLinks.length && !tmLinks.some((link) => link.role === "main")) tmLinks[0].role = "main";
  if (tmLinks.filter((link) => link.role === "main").length > 1) {
    let foundMain = false;
    tmLinks.forEach((link) => {
      if (link.role !== "main") return;
      if (foundMain) link.role = "reference";
      foundMain = true;
    });
  }
  return [...tmLinks, ...links.filter((link) => link.type === "termbase").sort((a, b) => a.priority - b.priority)];
}

function resourceRecord(input = {}, fallback = {}) {
  const now = new Date().toISOString();
  const type = input.type === "termbase" ? "termbase" : "tm";
  const sourceLang = cleanPortableLabel(input.sourceLang, cleanPortableLabel(fallback.sourceLang));
  const targetLang = cleanPortableLabel(input.targetLang, cleanPortableLabel(fallback.targetLang));
  const name = cleanPortableLabel(input.name || input.cachedName);
  if (!name || !sourceLang || !targetLang) throw new Error("Resource name and languages are required.");
  return {
    ...input,
    id: cleanText(input.id || input.resourceId) || makeId(type === "tm" ? "tm-resource" : "termbase-resource"),
    type,
    name,
    sourceLang,
    targetLang,
    languagePair: `${sourceLang}::${targetLang}`,
    languages: type === "termbase" ? uniqueNames(input.languages?.length ? input.languages : [sourceLang, targetLang]) : [sourceLang, targetLang],
    archived: Boolean(input.archived),
    createdAt: cleanText(input.createdAt) || now,
    updatedAt: now
  };
}

function uniqueResourceName(baseName, resources, type, sourceLang, targetLang) {
  const base = cleanPortableLabel(baseName, type === "tm" ? "Project TM" : "Project terminology");
  const collision = (name) => resources.some((resource) =>
    resource.type === type && String(resource.name || "").toLocaleLowerCase() === name.toLocaleLowerCase() &&
    (resource.sourceLang !== sourceLang || resource.targetLang !== targetLang || resource.name === name)
  );
  if (!collision(base)) return base;
  let suffix = 2;
  while (collision(`${base} ${suffix}`)) suffix += 1;
  return `${base} ${suffix}`;
}

async function normalizeResourcePlan(projectDraft = {}, resourcePlan = null, existingProject = null) {
  const identity = projectIdentityFields(projectDraft);
  const resources = await getAll("resources");
  const planWasConfigured = Boolean(resourcePlan?.configured || resourcePlan?.reviewed);
  const seenRequestedLinks = new Set();
  const requestedLinks = cleanResourceLinks(resourcePlan?.resourceLinks || projectDraft.resourceLinks || []).filter((link) => {
    const identityKey = `${link.type}\u0000${link.name.toLocaleLowerCase()}`;
    if (seenRequestedLinks.has(identityKey)) return false;
    seenRequestedLinks.add(identityKey);
    return true;
  });
  const requestedDrafts = Array.isArray(resourcePlan?.newResources) ? resourcePlan.newResources : [];
  const createdResources = [];

  if (!requestedLinks.length && !existingProject) {
    const requestedTmName = cleanPortableLabel(
      projectDraft.mainTmName,
      cleanPortableLabel(
        projectDraft.tmName,
        cleanPortableLabel(Array.isArray(projectDraft.tmNames) ? projectDraft.tmNames[0] : "", `${identity.name} TM`)
      )
    );
    const requestedTbName = cleanPortableLabel(
      projectDraft.termBaseName,
      cleanPortableLabel(Array.isArray(projectDraft.termBaseNames) ? projectDraft.termBaseNames[0] : "", `${identity.name} terminology`)
    );
    const tmName = uniqueResourceName(requestedTmName, resources, "tm", identity.sourceLang, identity.targetLang);
    const tbName = uniqueResourceName(requestedTbName, resources, "termbase", identity.sourceLang, identity.targetLang);
    const tm = resourceRecord({ type: "tm", name: tmName }, identity);
    const tb = resourceRecord({ type: "termbase", name: tbName }, identity);
    createdResources.push(tm, tb);
    return {
      configured: false,
      newResources: createdResources,
      resourceLinks: [
        { id: makeId("resource-link"), resourceId: tm.id, type: "tm", name: tm.name, cachedName: tm.name, role: "main", lookup: true, priority: 0, penalty: 0 },
        { id: makeId("resource-link"), resourceId: tb.id, type: "termbase", name: tb.name, cachedName: tb.name, role: "termbase", lookup: true, qa: true, contribute: true, priority: 0 }
      ],
      activeTermBaseId: tb.id
    };
  }

  const draftById = new Map(requestedDrafts.map((item) => [cleanText(item.id || item.resourceId), item]));
  const existingById = new Map(resources.map((item) => [item.id, item]));
  const links = requestedLinks.map((link, index) => {
    let resource = existingById.get(link.resourceId);
    if (!resource && !link.resourceId) {
      const compatibleByName = [...resources, ...createdResources].filter((candidate) =>
        candidate.type === link.type &&
        String(candidate.name || "").toLocaleLowerCase() === link.name.toLocaleLowerCase() &&
        (link.type === "tm"
          ? candidate.sourceLang === identity.sourceLang && candidate.targetLang === identity.targetLang
          : candidate.languages?.includes(identity.sourceLang) && candidate.languages?.includes(identity.targetLang))
      );
      if (compatibleByName.length === 1) resource = compatibleByName[0];
    }
    if (!resource) {
      const draft = draftById.get(link.resourceId) || requestedDrafts.find((item) => item.name === link.name && item.type === link.type) || {
        id: link.resourceId,
        type: link.type,
        name: link.name
      };
      const baseName = cleanPortableLabel(draft.name || link.name);
      const name = uniqueResourceName(baseName, [...resources, ...createdResources], link.type, identity.sourceLang, identity.targetLang);
      resource = resourceRecord({ ...draft, id: draft.id || link.resourceId, type: link.type, name }, identity);
      createdResources.push(resource);
    }
    const compatible = link.type === "tm"
      ? resource.sourceLang === identity.sourceLang && resource.targetLang === identity.targetLang
      : resource.languages?.includes(identity.sourceLang) && resource.languages?.includes(identity.targetLang);
    if (!compatible) throw new Error(`Resource “${resource.name}” is incompatible with ${identity.sourceLang} → ${identity.targetLang}. Review Optional Resource Settings.`);
    return {
      ...link,
      id: link.id || makeId("resource-link"),
      resourceId: resource.id,
      name: resource.name,
      cachedName: resource.name,
      priority: Number.isFinite(Number(link.priority)) ? Number(link.priority) : index
    };
  });
  const tmLinks = links.filter((link) => link.type === "tm").sort((a, b) => a.priority - b.priority);
  if (!tmLinks.length) {
    const name = uniqueResourceName(`${identity.name} TM`, [...resources, ...createdResources], "tm", identity.sourceLang, identity.targetLang);
    const tm = resourceRecord({ type: "tm", name }, identity);
    createdResources.push(tm);
    tmLinks.push({ id: makeId("resource-link"), resourceId: tm.id, type: "tm", name, cachedName: name, role: "main", lookup: true, priority: 0, penalty: 0 });
  }
  const requestedMain = tmLinks.find((link) => link.role === "main") || tmLinks[0];
  tmLinks.forEach((link, index) => {
    link.role = link === requestedMain ? "main" : "reference";
    link.priority = index;
  });
  const tbLinks = links.filter((link) => link.type === "termbase").sort((a, b) => a.priority - b.priority);
  tbLinks.forEach((link, index) => { link.priority = index; });
  let activeTermBaseId = cleanText(resourcePlan?.activeTermBaseId || projectDraft.activeTermBaseId);
  const writable = tbLinks.filter((link) => link.contribute);
  if (!writable.some((link) => link.resourceId === activeTermBaseId)) activeTermBaseId = writable[0]?.resourceId || null;
  return { configured: planWasConfigured, newResources: createdResources, resourceLinks: [...tmLinks, ...tbLinks], activeTermBaseId };
}

async function listProjects() {
  const projects = await getAll("projects");
  return projects.map(projectReadRecord).sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
}

async function createProject(input = {}) {
  const { name, domain, creatorName, creatorOrigin, sourceLang, targetLang } = input || {};
  const now = new Date().toISOString();
  const identity = projectIdentityFields({ name, sourceLang, targetLang });
  const plan = await normalizeResourcePlan({ ...input, ...identity }, input.resourcePlan || input, null);
  const links = plan.resourceLinks;
  const main = links.find((link) => link.type === "tm" && link.role === "main")?.name || `${identity.name} TM`;
  const firstTb = links.find((link) => link.type === "termbase")?.name || "";
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
    activeTermBaseId: plan.activeTermBaseId,
    qaSettings: defaultQaSettings(),
    aiSettings: defaultAiSettings(),
    qualityProfile: defaultQualityProfile(),
    exportHistory: [],
    sourceFileName: "",
    documents: [],
    createdAt: now,
    updatedAt: now
  };
  if (typeof writeStoresAtomically !== "function") throw new Error("Atomic project resource storage is unavailable.");
  const committed = await writeStoresAtomically({ resources: plan.newResources, projects: [project] });
  return projectReadRecord(committed.projects[0]);
}

function commitProjectWithResources(projectDraft = {}, resourcePlan = null) {
  return createProject({ ...projectDraft, resourcePlan });
}

function projectUpdateRecord(project, options = {}) {
  if (!project || typeof project !== "object") throw new Error("Project metadata is required.");
  const { academicMetadata: _academicMetadata, ...projectWithoutAcademicMetadata } = project;
  if (projectWithoutAcademicMetadata.legacyDocxDocumentId && projectWithoutAcademicMetadata.docxStructure === projectWithoutAcademicMetadata.docxStructures?.[projectWithoutAcademicMetadata.legacyDocxDocumentId]) delete projectWithoutAcademicMetadata.docxStructure;
  const identity = projectIdentityFields(projectWithoutAcademicMetadata, options);
  const links = resourceLinksForProject(projectWithoutAcademicMetadata);
  const main = links.find((link) => link.type === "tm" && link.role === "main")?.name || cleanPortableLabel(projectWithoutAcademicMetadata.tmName, "Default TM");
  const firstTb = links.find((link) => link.type === "termbase")?.name || "";
  const writableTermbases = links.filter((link) => link.type === "termbase" && link.contribute);
  const activeTermBaseId = writableTermbases.some((link) => link.resourceId === projectWithoutAcademicMetadata.activeTermBaseId)
    ? projectWithoutAcademicMetadata.activeTermBaseId
    : writableTermbases[0]?.resourceId || null;
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
    activeTermBaseId,
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
    ...(!normalized.docxStructure && normalized.docxStructures?.[normalized.legacyDocxDocumentId] ? { docxStructure: normalized.docxStructures[normalized.legacyDocxDocumentId] } : {}),
    updatedBy: project.updatedBy || normalized.updatedBy,
    updatedAt: project.updatedAt || normalized.updatedAt
  };
}

async function updateProject(project) {
  const existingProject = project?.id ? await get("projects", project.id) : null;
  const plan = await normalizeResourcePlan(project, project.resourcePlan || project, existingProject);
  const plannedMainTm = plan.resourceLinks.find((link) => link.type === "tm" && link.role === "main")?.name;
  const plannedTermbase = plan.resourceLinks.find((link) => link.type === "termbase")?.name || "";
  const updated = projectUpdateRecord({
    ...project,
    ...(plannedMainTm ? { tmName: plannedMainTm, mainTmName: plannedMainTm } : {}),
    termBaseName: plannedTermbase,
    resourceLinks: plan.resourceLinks,
    activeTermBaseId: plan.activeTermBaseId,
    termBaseNames: plan.resourceLinks.filter((link) => link.type === "termbase").map((link) => link.name)
  }, { existingProject });
  if (typeof writeStoresAtomically !== "function") throw new Error("Atomic project resource storage is unavailable.");
  const committed = await writeStoresAtomically({ resources: plan.newResources, projects: [updated] });
  return projectReadRecord(committed.projects[0]);
}

async function updateProjectResourcePlan(projectId, resourcePlan) {
  const project = await get("projects", projectId);
  if (!project) throw new Error("Project not found.");
  return updateProject({ ...project, resourcePlan });
}

async function queryResourceMatches({ projectId, source, context = {}, tmLimit = 12 } = {}) {
  const storedProject = await get("projects", projectId);
  if (!storedProject) throw new Error("Project not found.");
  const project = projectReadRecord(storedProject);
  const tmLinks = project.resourceLinks.filter((link) => link.type === "tm" && link.lookup !== false);
  const termbaseLinks = project.resourceLinks.filter((link) => link.type === "termbase" && link.lookup !== false);
  const findTmMatches = window.CatHan.tm?.findTmMatches;
  const findTerms = window.CatHan.termbase?.findTerms;
  if (typeof findTmMatches !== "function" || typeof findTerms !== "function") {
    throw new Error("Resource matching services are unavailable.");
  }
  const [tmMatches, termMatches] = await Promise.all([
    findTmMatches({
      source,
      sourceLang: project.sourceLang,
      targetLang: project.targetLang,
      resourceLinks: tmLinks,
      context: { ...context, domain: context.domain || project.domain || "" },
      limit: Math.max(1, Math.min(100, Math.round(Number(tmLimit) || 12)))
    }),
    findTerms({
      source,
      sourceLang: project.sourceLang,
      targetLang: project.targetLang,
      resourceLinks: termbaseLinks
    })
  ]);
  const resourceSignature = JSON.stringify([
    project.id,
    project.sourceLang,
    project.targetLang,
    ...project.resourceLinks.map((link) => [
      link.resourceId,
      link.type,
      link.lookup !== false,
      link.priority,
      link.penalty || 0,
      link.qa !== false,
      Boolean(link.contribute)
    ])
  ]);
  return { project, tmMatches, termMatches, resourceSignature };
}

async function listResources(options = {}) {
  const type = options.type === "tm" || options.type === "termbase" ? options.type : "";
  const includeArchived = Boolean(options.includeArchived);
  return (await getAll("resources"))
    .filter((resource) => (!type || resource.type === type) && (includeArchived || !resource.archived))
    .sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")));
}

async function createResource(input = {}) {
  const existing = await listResources({ includeArchived: true });
  const sourceLang = cleanPortableLabel(input.sourceLang);
  const targetLang = cleanPortableLabel(input.targetLang);
  const name = uniqueResourceName(input.name, existing, input.type, sourceLang, targetLang);
  const record = resourceRecord({ ...input, name }, { sourceLang, targetLang });
  await writeStoresAtomically({ resources: [record] });
  return record;
}

async function renameResource(resourceId, name) {
  const resource = await get("resources", resourceId);
  if (!resource) throw new Error("Resource not found.");
  const cleanName = cleanPortableLabel(name);
  if (!cleanName) throw new Error("Resource name is required.");
  const projects = await getAll("projects");
  const [tmEntries, terms] = await Promise.all([
    getAllByIndex("tmEntries", "resourceId", resourceId),
    getAllByIndex("terms", "resourceId", resourceId)
  ]);
  const now = new Date().toISOString();
  const updatedResource = { ...resource, name: cleanName, updatedAt: now };
  const updatedProjects = projects
    .filter((project) => (project.resourceLinks || []).some((link) => link.resourceId === resourceId))
    .map((project) => {
      const resourceLinks = project.resourceLinks.map((link) => link.resourceId === resourceId
        ? { ...link, name: cleanName, cachedName: cleanName }
        : link);
      const main = resourceLinks.find((link) => link.type === "tm" && link.role === "main")?.name || project.mainTmName;
      const firstTb = resourceLinks.find((link) => link.type === "termbase")?.name || "";
      return { ...project, resourceLinks, tmName: main, mainTmName: main, termBaseName: firstTb, updatedAt: now };
    });
  await writeStoresAtomically({
    resources: [updatedResource],
    projects: updatedProjects,
    tmEntries: tmEntries.map((entry) => ({ ...entry, tmName: cleanName, updatedAt: now })),
    terms: terms.map((term) => ({ ...term, termBaseName: cleanName, updatedAt: now }))
  });
  return updatedResource;
}

async function duplicateResource(resourceId, name = "") {
  const source = await get("resources", resourceId);
  if (!source) throw new Error("Resource not found.");
  const copy = await createResource({ ...source, id: "", name: name || `${source.name} copy`, archived: false });
  if (source.type === "tm") {
    const entries = (await getAllByIndex("tmEntries", "resourceId", source.id)).map((entry) => ({
      ...entry,
      id: makeId("tm"),
      resourceId: copy.id,
      tmName: copy.name,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }));
    if (entries.length) await writeStoresAtomically({ tmEntries: entries });
  } else {
    const sourceConcepts = await getAllByIndex("termConcepts", "resourceId", source.id);
    const concepts = sourceConcepts.map((concept) => ({
      ...concept, id: makeId("term-concept"), resourceId: copy.id
    }));
    const conceptIds = new Map(concepts.map((concept, index) => [sourceConcepts[index]?.id, concept.id]));
    const designations = (await getAllByIndex("termDesignations", "resourceId", source.id)).map((designation) => ({
      ...designation,
      id: makeId("term-designation"),
      resourceId: copy.id,
      conceptId: conceptIds.get(designation.conceptId) || designation.conceptId
    }));
    const terms = (await getAllByIndex("terms", "resourceId", source.id)).map((term) => ({
      ...term,
      id: makeId("term"),
      resourceId: copy.id,
      conceptId: conceptIds.get(term.conceptId) || makeId("term-concept"),
      termBaseName: copy.name,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }));
    if (concepts.length || designations.length || terms.length) {
      await writeStoresAtomically({ terms, termConcepts: concepts, termDesignations: designations });
    }
  }
  return copy;
}

async function setResourceArchived(resourceId, archived) {
  const resource = await get("resources", resourceId);
  if (!resource) throw new Error("Resource not found.");
  if (archived) {
    const projects = await getAll("projects");
    const linked = projects.filter((project) => (project.resourceLinks || []).some((link) => link.resourceId === resourceId));
    const mainProjects = linked.filter((project) =>
      (project.resourceLinks || []).some((link) => link.resourceId === resourceId && link.type === "tm" && link.role === "main")
    );
    if (mainProjects.length) {
      throw new Error(`Reassign the main TM in ${mainProjects.map((project) => project.name).join(", ")} before archiving it.`);
    }
    if (linked.length) {
      throw new Error(`Unlink this resource from ${linked.map((project) => project.name).join(", ")} before archiving it.`);
    }
  }
  const updated = { ...resource, archived: Boolean(archived), updatedAt: new Date().toISOString() };
  await writeStoresAtomically({ resources: [updated] });
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
  if (updatedProject) Object.assign(updatedProject, await put("projects", updatedProject));
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
  Object.assign(updated, await put("projects", updated));
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
  if (result.staleIndexes?.length) throw new Error("Save conflict: one or more targets have a newer stored version.");
  result.values.forEach((value, index) => {
    if (value?.storageVersion !== undefined) segments[index].storageVersion = value.storageVersion;
  });
  return result.values;
}

async function saveSegmentStructure(segments = [], deleteSegmentIds = []) {
  if (typeof writeSegmentStructureAtomically !== "function") {
    throw new Error("Atomic structural segment storage is unavailable.");
  }
  const now = new Date().toISOString();
  const next = segments.map((segment) => ({
    ...segment,
    revision: segmentRevision(segment),
    updatedBy: LOCAL_USER_ID,
    updatedAt: now
  }));
  const result = await writeSegmentStructureAtomically({ segments: next, deleteSegmentIds });
  const saved = result?.segments || next;
  saved.forEach((value, index) => { if (value.storageVersion !== undefined) segments[index].storageVersion = value.storageVersion; });
  return saved;
}

async function saveSegment(segment) {
  const next = {
    ...segment,
    revision: segmentRevision(segment),
    updatedBy: LOCAL_USER_ID,
    updatedAt: new Date().toISOString()
  };
  const result = await putIfRevisionNotOlder("segments", next, "revision");
  if (result.stale) throw new Error("Save conflict: this target has a newer stored version.");
  if (result.value?.storageVersion !== undefined) segment.storageVersion = result.value.storageVersion;
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
  getProject: async (id) => { const project = await get("projects", id); return project ? projectReadRecord(project) : null; },
  createProject,
  commitProjectWithResources,
  updateProject,
  updateProjectResourcePlan,
  queryResourceMatches,
  listResources,
  createResource,
  renameResource,
  duplicateResource,
  setResourceArchived,
  getProjectSegments,
  replaceProjectSegments,
  appendProjectSegments,
  appendProjectSegmentsAndUpdateProject,
  saveSegments,
  saveSegmentStructure,
  deleteSegment,
  saveSegment,
  deleteProject,
  deleteProjectDocument
};
})();
