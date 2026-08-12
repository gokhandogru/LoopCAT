(() => {
  const DB_NAME = "cathan-local-cat";
  const DB_VERSION = 6;
  const PROJECT_PACKAGE_SCHEMA_VERSION = 5;
  const BACKUP_SCHEMA_VERSION = 6;
  const LOCAL_WORKSPACE_ID = "local-workspace";
  const LOCAL_USER_ID = "local-user";
  const APP_NAME = "LoopCAT";
  const LEGACY_APP_NAME = "CatHan";
  const SECRET_FIELD_PATTERN = /(api[_-]?key|secret|token|authorization|bearer|password|cookie|session)/i;
  const RUNTIME_HANDLE_FIELD_PATTERN = /^(?:file|directory|browser|workspace|native|fileSystem)?[_-]?handle$/i;
  const PROVIDER_TRACE_FIELD_PATTERN =
    /^(?:responseId|requestId|prompt|promptTemplate|providerRequestId|providerResponseId|customEndpoint)$/i;
  const SENSITIVE_TEXT_VALUE_PATTERN =
    /(sk-[A-Za-z0-9_-]{8,}|Bearer\s+[A-Za-z0-9._~+/=-]{8,}|gh[pousr]_[A-Za-z0-9_]{8,}|npm_[A-Za-z0-9_]{8,}|(?:session|cookie)[=:][A-Za-z0-9._~+/=-]{8,})/i;
  const TM_INDEX_META_PREFIX = "tm-token-index:";
  const TERM_INDEX_META_PREFIX = "term-token-index:";
  const RESOURCE_LINK_TYPES = new Set(["tm", "termbase"]);
  const PORTABLE_LABEL_VALUE_KEYS = new Set([
    "createdByName",
    "creatorName",
    "creatorOrigin",
    "documentName",
    "fileName",
    "filename",
    "projectName",
    "sourceFileName",
    "sourceLang",
    "targetLang",
    "termBaseName",
    "tmName"
  ]);
  const PORTABLE_LABEL_CONTAINER_KEYS = new Set([
    "documents",
    "project",
    "projects",
    "resourceLinks",
    "resourceReferences",
    "sourceAssets"
  ]);
  const PORTABLE_RECORD_ID_KEYS = new Set([
    "id",
    "projectId",
    "documentId",
    "segmentId",
    "workspaceId",
    "ownerId",
    "createdBy"
  ]);

  let dbPromise;

  function requestToPromise(request) {
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  function txDone(tx) {
    return new Promise((resolve, reject) => {
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  }

  function ensureIndex(store, name, keyPath, options = {}) {
    if (!store.indexNames.contains(name)) store.createIndex(name, keyPath, options);
  }

  function ensureStores(db) {
    if (!db.objectStoreNames.contains("projects")) {
      const projects = db.createObjectStore("projects", { keyPath: "id" });
      projects.createIndex("updatedAt", "updatedAt");
    }
    if (!db.objectStoreNames.contains("segments")) {
      const segments = db.createObjectStore("segments", { keyPath: "id" });
      segments.createIndex("projectId", "projectId");
    }
    if (!db.objectStoreNames.contains("tmEntries")) {
      const tm = db.createObjectStore("tmEntries", { keyPath: "id" });
      tm.createIndex("languagePair", "languagePair");
      tm.createIndex("tmName", "tmName");
    }
    if (!db.objectStoreNames.contains("tmTokenIndex")) {
      const tmTokenIndex = db.createObjectStore("tmTokenIndex", { keyPath: "id" });
      tmTokenIndex.createIndex("languagePair", "languagePair");
      tmTokenIndex.createIndex("languagePairToken", ["languagePair", "token"]);
      tmTokenIndex.createIndex("tmEntryId", "tmEntryId");
      tmTokenIndex.createIndex("tmName", "tmName");
      tmTokenIndex.createIndex("tmNameToken", ["languagePair", "tmName", "token"]);
    }
    if (!db.objectStoreNames.contains("terms")) {
      const terms = db.createObjectStore("terms", { keyPath: "id" });
      terms.createIndex("languagePair", "languagePair");
      terms.createIndex("termBaseName", "termBaseName");
    }
    if (!db.objectStoreNames.contains("termTokenIndex")) {
      const termTokenIndex = db.createObjectStore("termTokenIndex", { keyPath: "id" });
      termTokenIndex.createIndex("languagePair", "languagePair");
      termTokenIndex.createIndex("languagePairToken", ["languagePair", "token"]);
      termTokenIndex.createIndex("termId", "termId");
      termTokenIndex.createIndex("termBaseName", "termBaseName");
      termTokenIndex.createIndex("termBaseNameToken", ["languagePair", "termBaseName", "token"]);
    }
    if (!db.objectStoreNames.contains("appMeta")) {
      db.createObjectStore("appMeta", { keyPath: "key" });
    }
    if (!db.objectStoreNames.contains("activityEvents")) {
      const activity = db.createObjectStore("activityEvents", { keyPath: "id" });
      activity.createIndex("projectId", "projectId");
      activity.createIndex("type", "type");
      activity.createIndex("createdAt", "createdAt");
    }
    if (!db.objectStoreNames.contains("trashEntries")) {
      const trash = db.createObjectStore("trashEntries", { keyPath: "id" });
      trash.createIndex("entityType", "entityType");
      trash.createIndex("projectId", "projectId");
      trash.createIndex("deletedAt", "deletedAt");
    }
  }

  function backfillStore(store, mapper) {
    store.openCursor().onsuccess = (event) => {
      const cursor = event.target.result;
      if (!cursor) return;
      const next = mapper(cursor.value);
      if (next) cursor.update(next);
      cursor.continue();
    };
  }

  function migrateToVersion2(db, tx) {
    const projects = tx.objectStore("projects");
    ensureIndex(projects, "languagePair", ["sourceLang", "targetLang"]);

    const segments = tx.objectStore("segments");
    ensureIndex(segments, "documentId", "documentId");
    ensureIndex(segments, "projectDocumentId", ["projectId", "documentId"]);
    ensureIndex(segments, "projectStatus", ["projectId", "status"]);
    ensureIndex(segments, "updatedAt", "updatedAt");
    backfillStore(segments, (segment) => ({
      ...segment,
      documentId: segment.documentId || "default-document",
      documentName: segment.documentName || "Imported document",
      documentType: segment.documentType || "docx",
      status: segment.status || (segment.target ? "draft" : "empty"),
      updatedAt: segment.updatedAt || segment.createdAt || new Date().toISOString()
    }));

    const tm = tx.objectStore("tmEntries");
    ensureIndex(tm, "signature", "signature");
    ensureIndex(tm, "updatedAt", "updatedAt");

    const terms = tx.objectStore("terms");
    ensureIndex(terms, "sourceTerm", "sourceTerm");
    ensureIndex(terms, "updatedAt", "updatedAt");

    tx.objectStore("appMeta").put({
      key: "schema",
      version: DB_VERSION,
      updatedAt: new Date().toISOString()
    });
  }

  function addTmsMetadata(value) {
    const now = new Date().toISOString();
    return {
      ...value,
      workspaceId: value.workspaceId || LOCAL_WORKSPACE_ID,
      ownerId: value.ownerId || LOCAL_USER_ID,
      createdBy: value.createdBy || LOCAL_USER_ID,
      updatedBy: value.updatedBy || LOCAL_USER_ID,
      createdAt: value.createdAt || now,
      updatedAt: value.updatedAt || value.createdAt || now
    };
  }

  function defaultAiSettings(settings = {}) {
    const source = settings && typeof settings === "object" ? settings : {};
    const localProvider =
      redactSensitiveText(source.localProvider || source.localProviderId || "ollama").trim() || "ollama";
    const localBaseUrl =
      redactSensitiveText(source.localBaseUrl || "http://localhost:11434").trim() || "http://localhost:11434";
    const localModel = redactSensitiveText(source.localModel || "translategemma").trim() || "translategemma";
    const localSourceCode = redactSensitiveText(source.localSourceCode || "").trim();
    const localTargetCode = redactSensitiveText(source.localTargetCode || "").trim();
    const localConcurrency = Number(source.localConcurrency);
    const localTimeoutMs = Number(source.localTimeoutMs);
    const localPretranslateMode = ["selected", "untranslated", "visible", "project"].includes(
      String(source.localPretranslateMode || "").trim()
    )
      ? String(source.localPretranslateMode).trim()
      : "untranslated";
    const localVariantMode = ["standard", "formal", "concise", "locale", "plain"].includes(
      String(source.localVariantMode || "").trim()
    )
      ? String(source.localVariantMode).trim()
      : "standard";
    const localAdaptMode = ["simplify", "formalize", "localize", "shorten"].includes(
      String(source.localAdaptMode || "").trim()
    )
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
      localTimeoutMs: Number.isFinite(localTimeoutMs)
        ? Math.min(600000, Math.max(5000, Math.round(localTimeoutMs)))
        : 120000,
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

  function sanitizedAiSuggestion(suggestion = {}, context = null) {
    const activeContext = context || createPortableSanitizerContext();
    const source = suggestion && typeof suggestion === "object" ? suggestion : {};
    const confidence = Number(source.confidence);
    return {
      id: cleanPortableRecordId(source.id, "", activeContext) || makeId("ai-suggestion"),
      provider: redactSensitiveText(source.provider || "AI").trim() || "AI",
      model: redactSensitiveText(source.model || "").trim(),
      segmentId: cleanPortableRecordId(source.segmentId, "", activeContext),
      suggestedTarget: String(source.suggestedTarget || ""),
      confidence: Number.isFinite(confidence) ? confidence : 0,
      explanation: Array.isArray(source.explanation)
        ? source.explanation
            .map((item) => redactSensitiveText(item || "").trim())
            .filter(Boolean)
            .slice(0, 8)
        : [],
      status: redactSensitiveText(source.status || "review").trim() || "review",
      createdAt: String(source.createdAt || "").trim()
    };
  }

  function isAiActivityType(type = "") {
    return /^ai(?:$|-)/i.test(String(type || "").trim());
  }

  function isActivityEventLike(value) {
    return Boolean(
      value &&
      typeof value === "object" &&
      typeof value.type === "string" &&
      Object.prototype.hasOwnProperty.call(value, "summary") &&
      Object.prototype.hasOwnProperty.call(value, "projectId")
    );
  }

  function redactSensitiveText(value) {
    return String(value || "").replace(new RegExp(SENSITIVE_TEXT_VALUE_PATTERN.source, "gi"), "[redacted secret]");
  }

  function redactSensitivePortableStrings(value) {
    if (typeof value === "string") return redactSensitiveText(value);
    if (Array.isArray(value)) return value.map((item) => redactSensitivePortableStrings(item));
    if (value && typeof value === "object") {
      const clean = {};
      Object.entries(value).forEach(([key, item]) => {
        clean[key] = redactSensitivePortableStrings(item);
      });
      return clean;
    }
    return value;
  }

  function isTermRecordLike(value) {
    return Boolean(
      value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      Object.prototype.hasOwnProperty.call(value, "notes") &&
      (Object.prototype.hasOwnProperty.call(value, "sourceTerm") ||
        Object.prototype.hasOwnProperty.call(value, "targetTerm"))
    );
  }

  function sanitizedTermRecord(term = {}, path = [], context = null) {
    const clean = {};
    Object.entries(term || {}).forEach(([itemKey, itemValue]) => {
      if (itemKey === "notes") {
        clean.notes = redactSensitiveText(itemValue || "").trim();
        return;
      }
      const sanitized = sanitizePortableValue(itemValue, itemKey, path, context);
      if (sanitized !== undefined) clean[itemKey] = sanitized;
    });
    return clean;
  }

  function isTmEntryLike(value) {
    return Boolean(
      value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      Object.prototype.hasOwnProperty.call(value, "projectName") &&
      Object.prototype.hasOwnProperty.call(value, "source") &&
      Object.prototype.hasOwnProperty.call(value, "target")
    );
  }

  function sanitizedTmEntryRecord(entry = {}, path = [], context = null) {
    const clean = {};
    Object.entries(entry || {}).forEach(([itemKey, itemValue]) => {
      if (itemKey === "projectName") {
        clean.projectName = redactSensitiveText(itemValue || "").trim();
        return;
      }
      const sanitized = sanitizePortableValue(itemValue, itemKey, path, context);
      if (sanitized !== undefined) clean[itemKey] = sanitized;
    });
    return clean;
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

  function createPortableSanitizerContext() {
    return {
      recordIdMap: new Map()
    };
  }

  function portableRecordIdReplacement(value, context) {
    const activeContext = context || createPortableSanitizerContext();
    const key = String(value || "");
    if (!activeContext.recordIdMap.has(key)) {
      activeContext.recordIdMap.set(key, makeId("redacted-id"));
    }
    return activeContext.recordIdMap.get(key);
  }

  function cleanPortableRecordId(value, fallback = "", context = null) {
    const clean = cleanText(value);
    if (!clean) return fallback;
    if (SENSITIVE_TEXT_VALUE_PATTERN.test(clean)) return portableRecordIdReplacement(clean, context);
    return clean;
  }

  function sanitizedActivityEvent(event = {}, context = null) {
    const activeContext = context || createPortableSanitizerContext();
    const source = event && typeof event === "object" ? event : {};
    const type = redactSensitiveText(source.type || "activity").trim() || "activity";
    const summary = isAiActivityType(type)
      ? "AI activity recorded"
      : redactSensitiveText(source.summary || type).trim() || type;
    return {
      id: cleanPortableRecordId(source.id, "", activeContext) || makeId("activity"),
      workspaceId: cleanPortableRecordId(source.workspaceId, "", activeContext) || LOCAL_WORKSPACE_ID,
      ownerId: cleanPortableRecordId(source.ownerId, "", activeContext) || LOCAL_USER_ID,
      projectId: cleanPortableRecordId(source.projectId, "", activeContext),
      type,
      summary,
      detail: redactSensitivePortableStrings(sanitizePortableValue(source.detail || {}, "", [], activeContext)),
      createdBy: cleanPortableRecordId(source.createdBy, "", activeContext) || LOCAL_USER_ID,
      createdAt: String(source.createdAt || "").trim()
    };
  }

  function sanitizedActivityDetail(detail = {}) {
    const source = detail && typeof detail === "object" ? detail : {};
    const clean = redactSensitivePortableStrings(sanitizePortableValue(source));
    return clean && typeof clean === "object" && !Array.isArray(clean) ? clean : {};
  }

  function localActivityEventRecord({ projectId = "", type, summary, detail = {} } = {}) {
    const safeType = redactSensitiveText(type || "activity").trim() || "activity";
    return {
      id: makeId("activity"),
      workspaceId: LOCAL_WORKSPACE_ID,
      ownerId: LOCAL_USER_ID,
      projectId: String(projectId || "").trim(),
      type: safeType,
      summary: redactSensitiveText(summary || safeType).trim() || safeType,
      detail: sanitizedActivityDetail(detail),
      createdBy: LOCAL_USER_ID,
      createdAt: new Date().toISOString()
    };
  }

  function normalizeProjectDocuments(project = {}) {
    const seen = new Set();
    return (Array.isArray(project.documents) ? project.documents : [])
      .map((document) => {
        if (!document || typeof document !== "object" || Array.isArray(document)) return null;
        const id = cleanText(document.id);
        if (!id || seen.has(id)) return null;
        seen.add(id);
        return addTmsMetadata({
          ...document,
          id,
          name: cleanPortableLabel(document.name, "Document"),
          type: cleanText(document.type, "file"),
          workspaceId: document.workspaceId || project.workspaceId || LOCAL_WORKSPACE_ID,
          ownerId: document.ownerId || project.ownerId || LOCAL_USER_ID
        });
      })
      .filter(Boolean);
  }

  function normalizeProjectResourceLinks(project = {}, mainTmName = "Default TM") {
    const rawLinks = Array.isArray(project.resourceLinks) ? project.resourceLinks : [];
    const links = [];
    const seen = new Set();
    rawLinks.forEach((link, index) => {
      if (!link || typeof link !== "object" || Array.isArray(link)) return;
      const type = String(link.type || "").trim();
      const name = cleanPortableLabel(link.name);
      if (!RESOURCE_LINK_TYPES.has(type) || !name) return;
      const key = `${type}::${name}`;
      if (seen.has(key)) return;
      seen.add(key);
      links.push({
        ...link,
        id:
          typeof link.id === "string" && link.id.trim()
            ? link.id
            : `${project.id || "project"}-${type}-link-${index + 1}`,
        type,
        name,
        role: type === "tm" && name === mainTmName ? "main" : type === "tm" ? "reference" : link.role
      });
    });
    if (!links.some((link) => link.type === "tm" && link.name === mainTmName)) {
      links.unshift({ id: `${project.id || "project"}-main-tm-link`, type: "tm", name: mainTmName, role: "main" });
    }
    if (!links.some((link) => link.type === "termbase")) {
      links.push({
        id: `${project.id || "project"}-tb-link`,
        type: "termbase",
        name: cleanPortableLabel(project.termBaseName, "Default TB")
      });
    }
    return links;
  }

  function normalizeProject(project = {}) {
    const { academicMetadata: _academicMetadata, ...projectWithoutAcademicMetadata } = project || {};
    const mainTmName = cleanPortableLabel(
      projectWithoutAcademicMetadata.mainTmName,
      cleanPortableLabel(projectWithoutAcademicMetadata.tmName, "Default TM")
    );
    const resourceLinks = normalizeProjectResourceLinks(projectWithoutAcademicMetadata, mainTmName);
    return {
      ...addTmsMetadata(projectWithoutAcademicMetadata),
      domain: redactSensitiveText(projectWithoutAcademicMetadata.domain || "").trim(),
      tmName: mainTmName,
      mainTmName,
      termBaseName:
        resourceLinks.find((link) => link.type === "termbase")?.name ||
        cleanPortableLabel(projectWithoutAcademicMetadata.termBaseName, "Default TB"),
      sourceFileName: cleanPortableLabel(projectWithoutAcademicMetadata.sourceFileName || ""),
      documents: normalizeProjectDocuments(projectWithoutAcademicMetadata),
      resourceLinks,
      qaSettings: projectWithoutAcademicMetadata.qaSettings || {
        enabledChecks: ["empty", "tag", "copy", "number", "punctuation", "term"]
      },
      aiSettings: defaultAiSettings(projectWithoutAcademicMetadata.aiSettings),
      qualityProfile: defaultQualityProfile(projectWithoutAcademicMetadata.qualityProfile),
      exportHistory: projectWithoutAcademicMetadata.exportHistory || []
    };
  }

  function normalizeSegment(segment) {
    return {
      ...addTmsMetadata(segment),
      reviewState: segment.reviewState || "",
      reviewNote: segment.reviewNote || "",
      comment: segment.comment || "",
      comments: segment.comments || [],
      aiSuggestions: Array.isArray(segment.aiSuggestions)
        ? segment.aiSuggestions.map((item) => sanitizedAiSuggestion(item))
        : [],
      targetHistory: segment.targetHistory || []
    };
  }

  function normalizeResource(item) {
    return addTmsMetadata(item);
  }

  function migrateToVersion3(db, tx) {
    ensureStores(db);
    const projects = tx.objectStore("projects");
    backfillStore(projects, normalizeProject);

    const segments = tx.objectStore("segments");
    backfillStore(segments, normalizeSegment);

    const tm = tx.objectStore("tmEntries");
    ensureIndex(tm, "workspaceId", "workspaceId");
    backfillStore(tm, normalizeResource);

    const terms = tx.objectStore("terms");
    ensureIndex(terms, "workspaceId", "workspaceId");
    backfillStore(terms, normalizeResource);

    tx.objectStore("appMeta").put({
      key: "schema",
      version: DB_VERSION,
      updatedAt: new Date().toISOString()
    });
  }

  function migrateToVersion4(db, tx) {
    ensureStores(db);
    tx.objectStore("appMeta").put({
      key: "schema",
      version: DB_VERSION,
      updatedAt: new Date().toISOString()
    });
  }

  function migrateToVersion5(db, tx) {
    ensureStores(db);
    tx.objectStore("appMeta").put({
      key: "schema",
      version: DB_VERSION,
      updatedAt: new Date().toISOString()
    });
  }

  function migrateToVersion6(db, tx) {
    ensureStores(db);
    tx.objectStore("appMeta").put({
      key: "schema",
      version: DB_VERSION,
      updatedAt: new Date().toISOString()
    });
  }

  function runMigrations(db, tx, oldVersion) {
    ensureStores(db);
    if (oldVersion < 2) migrateToVersion2(db, tx);
    if (oldVersion < 3) migrateToVersion3(db, tx);
    if (oldVersion < 4) migrateToVersion4(db, tx);
    if (oldVersion < 5) migrateToVersion5(db, tx);
    if (oldVersion < 6) migrateToVersion6(db, tx);
  }

  function openDatabase() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        runMigrations(db, request.transaction, request.oldVersion);
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    return dbPromise;
  }

  function makeId(prefix = "id") {
    if (crypto.randomUUID) return `${prefix}-${crypto.randomUUID()}`;
    return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  function isBrowserHandle(value) {
    return Boolean(
      value &&
      typeof value === "object" &&
      (typeof value.getFile === "function" ||
        typeof value.getFileHandle === "function" ||
        typeof value.getDirectoryHandle === "function" ||
        (["file", "directory"].includes(value.kind) && typeof value.queryPermission === "function"))
    );
  }

  function isSourceJsonPath(path = []) {
    const segments = path.map((item) => String(item || "")).filter(Boolean);
    return segments.some((segment, index) => {
      if (segment !== "sourceJson" || index < 2 || segments[index - 2] !== "localizationStructures") return false;
      const prefix = segments.slice(0, index - 2);
      if (!prefix.length) return true;
      if (prefix.length === 1 && (prefix[0] === "project" || prefix[0] === "projects")) return true;
      return prefix.length === 2 && prefix[0] === "projects" && /^\d+$/.test(prefix[1]);
    });
  }

  function isPortableLabelPath(path = []) {
    const segments = path.map((item) => String(item || "")).filter(Boolean);
    const key = segments[segments.length - 1] || "";
    if (!key || isSourceJsonPath(segments)) return false;
    if (PORTABLE_LABEL_VALUE_KEYS.has(key)) return true;
    return key === "name" && segments.some((segment) => PORTABLE_LABEL_CONTAINER_KEYS.has(segment));
  }

  function isPortableRecordIdPath(path = []) {
    const segments = path.map((item) => String(item || "")).filter(Boolean);
    const key = segments[segments.length - 1] || "";
    return Boolean(key && PORTABLE_RECORD_ID_KEYS.has(key) && !isSourceJsonPath(segments));
  }

  function sanitizePortableValue(value, key = "", path = [], context = null) {
    const activeContext = context || createPortableSanitizerContext();
    const currentPath = key ? [...path, key] : path;
    if (key === "aiSettings") return defaultAiSettings(value);
    if (key === "qualityProfile") return defaultQualityProfile(value);
    if (key === "aiSuggestions")
      return Array.isArray(value) ? value.map((item) => sanitizedAiSuggestion(item, activeContext)) : [];
    if (key === "activityEvents")
      return Array.isArray(value) ? value.map((item) => sanitizedActivityEvent(item, activeContext)) : [];
    if (isActivityEventLike(value)) return sanitizedActivityEvent(value, activeContext);
    if (key === "apiKeyMode") return "bring-your-own";
    if (key === "domain" && !isSourceJsonPath(currentPath)) return redactSensitiveText(value);
    if (key === "academicMetadata" && !isSourceJsonPath(currentPath)) return undefined;
    if (isPortableLabelPath(currentPath) && (typeof value === "string" || typeof value === "number"))
      return redactSensitiveText(value);
    if (isPortableRecordIdPath(currentPath) && (typeof value === "string" || typeof value === "number"))
      return cleanPortableRecordId(value, "", activeContext);
    if (key !== "apiKeyMode" && SECRET_FIELD_PATTERN.test(key) && !isSourceJsonPath(currentPath)) return undefined;
    if (PROVIDER_TRACE_FIELD_PATTERN.test(key) && !isSourceJsonPath(currentPath)) return undefined;
    if (RUNTIME_HANDLE_FIELD_PATTERN.test(key) && !isSourceJsonPath(currentPath)) return undefined;
    if (isBrowserHandle(value) || typeof value === "function" || typeof value === "symbol") return undefined;
    if (Array.isArray(value)) {
      return value
        .map((item) => sanitizePortableValue(item, "", currentPath, activeContext))
        .filter((item) => item !== undefined);
    }
    if (isTmEntryLike(value) && !isSourceJsonPath(currentPath))
      return sanitizedTmEntryRecord(value, currentPath, activeContext);
    if (isTermRecordLike(value) && !isSourceJsonPath(currentPath))
      return sanitizedTermRecord(value, currentPath, activeContext);
    if (value && typeof value === "object") {
      const clean = {};
      Object.entries(value).forEach(([itemKey, itemValue]) => {
        const sanitized = sanitizePortableValue(itemValue, itemKey, currentPath, activeContext);
        if (sanitized !== undefined) clean[itemKey] = sanitized;
      });
      return clean;
    }
    return value;
  }

  function portableRecordArray(value, label, context = null) {
    if (value === undefined) return [];
    if (!Array.isArray(value)) throw new Error(`${label} must be an array.`);
    return sanitizePortableValue(value, "", [], context);
  }

  function assertUniqueRecordIds(records, label) {
    const seen = new Set();
    records.forEach((record, index) => {
      if (!record || typeof record !== "object") return;
      if (!record.id) return;
      if (typeof record.id !== "string") throw new Error(`${label} record ${index + 1} ID must be a string.`);
      if (seen.has(record.id)) throw new Error(`${label} contain duplicate ID: ${record.id}.`);
      seen.add(record.id);
    });
  }

  function assertNoProjectScopedCollisions(records, existingRecords, label, ignoredProjectId = "") {
    const existingById = new Map((existingRecords || []).map((record) => [record.id, record]));
    records.forEach((record) => {
      const id = record?.id;
      if (!id) return;
      const existing = existingById.get(id);
      if (existing && (!ignoredProjectId || existing.projectId !== ignoredProjectId)) {
        throw new Error(`${label} ID ${id} already exists in another local project.`);
      }
    });
  }

  function assertSegmentsBelongToRestoredProjects(segments = [], projects = []) {
    const projectIds = new Set((projects || []).map((project) => project?.id).filter(Boolean));
    const orphaned = (segments || []).filter((segment) => segment?.projectId && !projectIds.has(segment.projectId));
    if (!orphaned.length) return;
    const preview = orphaned
      .slice(0, 3)
      .map((segment) => segment.id || segment.projectId)
      .join(", ");
    throw new Error(
      `${orphaned.length} segment${orphaned.length === 1 ? "" : "s"} belong to projects not present in the backup${preview ? `: ${preview}` : ""}.`
    );
  }

  function assertActivityEventsBelongToRestoredProjects(activityEvents = [], projects = []) {
    const projectIds = new Set((projects || []).map((project) => project?.id).filter(Boolean));
    const orphaned = (activityEvents || []).filter((event) => event?.projectId && !projectIds.has(event.projectId));
    if (!orphaned.length) return;
    const preview = orphaned
      .slice(0, 3)
      .map((event) => event.id || event.projectId)
      .join(", ");
    throw new Error(
      `${orphaned.length} activity event${orphaned.length === 1 ? "" : "s"} belong to projects not present in the backup${preview ? `: ${preview}` : ""}.`
    );
  }

  function projectDocumentIdMap(projects = [], label = "Project") {
    const byProjectId = new Map();
    (projects || []).forEach((project, projectIndex) => {
      if (!project?.id) return;
      if (project.documents === undefined) return;
      if (!Array.isArray(project.documents)) {
        throw new Error(`${label} ${project.id || projectIndex + 1} document manifest must be an array.`);
      }
      const documentIds = new Set();
      project.documents.forEach((documentInfo, documentIndex) => {
        if (!documentInfo || typeof documentInfo !== "object") {
          throw new Error(
            `${label} ${project.id || projectIndex + 1} document ${documentIndex + 1} manifest entry must be an object.`
          );
        }
        if (!documentInfo.id) return;
        if (documentIds.has(documentInfo.id))
          throw new Error(`Duplicate document ID in project manifest: ${documentInfo.id}.`);
        documentIds.add(documentInfo.id);
      });
      byProjectId.set(project.id, documentIds);
    });
    return byProjectId;
  }

  function assertProjectResourceLinks(projects = [], label = "Project") {
    (projects || []).forEach((project, projectIndex) => {
      if (!project?.id) return;
      const projectLabel = `${label} ${project.id || projectIndex + 1}`;
      if (project.resourceLinks === undefined) return;
      if (!Array.isArray(project.resourceLinks)) {
        throw new Error(`${projectLabel} resource links must be an array.`);
      }
      const linkIds = new Set();
      const linkKeys = new Set();
      let mainTmLinks = 0;
      project.resourceLinks.forEach((link, linkIndex) => {
        const linkLabel = `${projectLabel} resource link ${linkIndex + 1}`;
        if (!link || typeof link !== "object" || Array.isArray(link)) {
          throw new Error(`${linkLabel} must be an object.`);
        }
        const type = String(link.type || "").trim();
        const name = String(link.name || "").trim();
        if (!type) throw new Error(`${linkLabel} type is missing.`);
        if (!RESOURCE_LINK_TYPES.has(type)) throw new Error(`${linkLabel} uses unknown resource type "${link.type}".`);
        if (!name) throw new Error(`${linkLabel} name is missing.`);
        if (link.id !== undefined) {
          if (typeof link.id !== "string" || !link.id.trim())
            throw new Error(`${linkLabel} ID must be a non-empty string.`);
          if (linkIds.has(link.id)) throw new Error(`Duplicate resource link ID in project manifest: ${link.id}.`);
          linkIds.add(link.id);
        }
        const linkKey = `${type}::${name}`;
        if (linkKeys.has(linkKey)) throw new Error(`Duplicate resource link in project manifest: ${type}/${name}.`);
        linkKeys.add(linkKey);
        if (type === "tm" && link.role === "main") mainTmLinks += 1;
      });
      if (mainTmLinks > 1)
        throw new Error(`${projectLabel} resource links contain multiple main translation memories.`);
    });
  }

  function assertSegmentsBelongToProjectDocuments(segments = [], projects = [], label = "backup") {
    const documentIdsByProject = projectDocumentIdMap(projects, label);
    const orphaned = (segments || []).filter(
      (segment) =>
        segment?.projectId &&
        segment?.documentId &&
        documentIdsByProject.has(segment.projectId) &&
        !documentIdsByProject.get(segment.projectId).has(segment.documentId)
    );
    if (!orphaned.length) return;
    const preview = orphaned
      .slice(0, 3)
      .map((segment) => segment.id || segment.documentId)
      .join(", ");
    throw new Error(
      `${orphaned.length} ${label} segment${orphaned.length === 1 ? "" : "s"} refer to documents not present in their project manifest${preview ? `: ${preview}` : ""}.`
    );
  }

  function assertPackageRecordsBelongToProject(project, segments = [], activityEvents = []) {
    const projectId = project?.id || "";
    if (!projectId) throw new Error("Project package is missing project metadata.");
    const mismatchedSegments = (segments || []).filter(
      (segment) => segment?.projectId && segment.projectId !== projectId
    );
    if (mismatchedSegments.length) {
      const preview = mismatchedSegments
        .slice(0, 3)
        .map((segment) => segment.id || segment.projectId)
        .join(", ");
      throw new Error(
        `${mismatchedSegments.length} project package segment${mismatchedSegments.length === 1 ? "" : "s"} belong to a different project${preview ? `: ${preview}` : ""}.`
      );
    }
    const mismatchedEvents = (activityEvents || []).filter(
      (event) => event?.projectId && event.projectId !== projectId
    );
    if (mismatchedEvents.length) {
      const preview = mismatchedEvents
        .slice(0, 3)
        .map((event) => event.id || event.projectId)
        .join(", ");
      throw new Error(
        `${mismatchedEvents.length} project package activity event${mismatchedEvents.length === 1 ? "" : "s"} belong to a different project${preview ? `: ${preview}` : ""}.`
      );
    }
    assertSegmentsBelongToProjectDocuments(segments, [project], "project package");
    assertProjectResourceLinks([project], "project package");
  }

  function stableJson(value) {
    if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
    if (value && typeof value === "object") {
      return `{${Object.keys(value)
        .sort()
        .map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`)
        .join(",")}}`;
    }
    return JSON.stringify(value);
  }

  function assertNoGlobalResourceConflicts(records, existingRecords, label) {
    const existingById = new Map((existingRecords || []).map((record) => [record.id, record]));
    records.forEach((record) => {
      const id = record?.id;
      if (!id) return;
      const existing = existingById.get(id);
      if (existing && stableJson(existing) !== stableJson(record)) {
        throw new Error(`${label} ID ${id} already exists with different local content.`);
      }
    });
  }

  function languagePairOf(entry) {
    return entry.languagePair || `${entry.sourceLang || ""}::${entry.targetLang || ""}`;
  }

  async function put(storeName, value) {
    const db = await openDatabase();
    const tx = db.transaction(storeName, "readwrite");
    tx.objectStore(storeName).put(value);
    await txDone(tx);
    return value;
  }

  async function putIfRevisionNotOlder(storeName, value, revisionField = "revision") {
    const db = await openDatabase();
    const tx = db.transaction(storeName, "readwrite");
    const store = tx.objectStore(storeName);
    let saved = value;
    let stale = false;
    await new Promise((resolve, reject) => {
      const read = store.get(value.id);
      read.onsuccess = () => {
        const existing = read.result;
        const existingRevision = Number(existing?.[revisionField] || 0);
        const nextRevision = Number(value?.[revisionField] || 0);
        if (existing && existingRevision > nextRevision) {
          saved = existing;
          stale = true;
          resolve();
          return;
        }
        store.put(value);
        resolve();
      };
      read.onerror = () => reject(read.error);
    });
    await txDone(tx);
    return { value: saved, stale };
  }

  async function bulkPutIfRevisionNotOlder(storeName, values = [], revisionField = "revision") {
    if (!values.length) return { values: [], staleIndexes: [] };
    const db = await openDatabase();
    const tx = db.transaction(storeName, "readwrite");
    const store = tx.objectStore(storeName);
    const saved = new Array(values.length);
    const staleIndexes = [];

    await Promise.all(
      values.map(
        (value, index) =>
          new Promise((resolve, reject) => {
            const read = store.get(value.id);
            read.onsuccess = () => {
              const existing = read.result;
              const existingRevision = Number(existing?.[revisionField] || 0);
              const nextRevision = Number(value?.[revisionField] || 0);
              if (existing && existingRevision > nextRevision) {
                saved[index] = existing;
                staleIndexes.push(index);
                resolve();
                return;
              }
              const write = store.put(value);
              write.onsuccess = () => {
                saved[index] = value;
                resolve();
              };
              write.onerror = () => reject(write.error);
            };
            read.onerror = () => reject(read.error);
          })
      )
    );

    await txDone(tx);
    return { values: saved, staleIndexes };
  }

  async function bulkPut(storeName, values) {
    const db = await openDatabase();
    const tx = db.transaction(storeName, "readwrite");
    const store = tx.objectStore(storeName);
    values.forEach((value) => store.put(value));
    await txDone(tx);
    return values;
  }

  async function writeSegmentStructureAtomically({ segments = [], deleteSegmentIds = [] } = {}) {
    const records = Array.isArray(segments) ? segments : [];
    const deletedIds = Array.isArray(deleteSegmentIds) ? deleteSegmentIds : [];
    const recordIds = new Set();
    records.forEach((segment) => {
      if (!segment?.id) throw new Error("Every structural segment record requires an ID.");
      if (recordIds.has(segment.id)) throw new Error(`Duplicate structural segment ID: ${segment.id}`);
      recordIds.add(segment.id);
    });
    const uniqueDeletedIds = [...new Set(deletedIds.filter(Boolean))];
    if (uniqueDeletedIds.some((segmentId) => recordIds.has(segmentId))) {
      throw new Error("A structural segment cannot be written and deleted in the same transaction.");
    }
    if (!records.length && !uniqueDeletedIds.length) return { segments: [], deletedSegmentIds: [] };

    const db = await openDatabase();
    const tx = db.transaction("segments", "readwrite");
    const store = tx.objectStore("segments");
    const completion = txDone(tx);
    try {
      const writes = records.map(
        (segment) =>
          new Promise((resolve, reject) => {
            const read = store.get(segment.id);
            read.onsuccess = () => {
              try {
                const existingRevision = Number(read.result?.revision || 0);
                const nextRevision = Number(segment.revision || 0);
                if (read.result && existingRevision > nextRevision) {
                  throw new Error(`A newer revision of segment ${segment.id} is already stored.`);
                }
                const write = store.put(segment);
                write.onsuccess = () => resolve();
                write.onerror = () => reject(write.error);
              } catch (error) {
                try {
                  tx.abort();
                } catch (_abortError) {
                  // The transaction may already be aborting; retain the structural-write error.
                }
                reject(error);
              }
            };
            read.onerror = () => reject(read.error);
          })
      );
      const deletions = uniqueDeletedIds.map(
        (segmentId) =>
          new Promise((resolve, reject) => {
            const deletion = store.delete(segmentId);
            deletion.onsuccess = () => resolve();
            deletion.onerror = () => reject(deletion.error);
          })
      );
      await Promise.all([...writes, ...deletions]);
      await completion;
      return { segments: records, deletedSegmentIds: uniqueDeletedIds };
    } catch (error) {
      try {
        tx.abort();
      } catch (_abortError) {
        // The transaction may already have completed or aborted.
      }
      try {
        await completion;
      } catch (_transactionError) {
        // Preserve the original structural-write error.
      }
      throw error;
    }
  }

  function deleteWhereInStore(store, predicate) {
    return new Promise((resolve, reject) => {
      const request = store.openCursor();
      request.onsuccess = () => {
        try {
          const cursor = request.result;
          if (!cursor) {
            resolve();
            return;
          }
          if (predicate(cursor.value)) cursor.delete();
          cursor.continue();
        } catch (error) {
          try {
            store.transaction.abort();
          } catch (_abortError) {
            // The transaction may already be aborting; the original error is the useful one.
          }
          reject(error);
        }
      };
      request.onerror = () => reject(request.error);
    });
  }

  async function matchingKeys(storeName, predicate) {
    const db = await openDatabase();
    const tx = db.transaction(storeName, "readonly");
    const keys = [];
    await new Promise((resolve, reject) => {
      const request = tx.objectStore(storeName).openCursor();
      request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor) {
          resolve();
          return;
        }
        if (predicate(cursor.value)) keys.push(cursor.key);
        cursor.continue();
      };
      request.onerror = () => reject(request.error);
    });
    await txDone(tx);
    return keys;
  }

  async function writeStoresAtomically(recordsByStore) {
    const storeNames = Object.keys(recordsByStore).filter((storeName) => recordsByStore[storeName]);
    if (!storeNames.length) return recordsByStore;
    const db = await openDatabase();
    const tx = db.transaction(storeNames, "readwrite");
    storeNames.forEach((storeName) => {
      const store = tx.objectStore(storeName);
      (recordsByStore[storeName] || []).forEach((value) => store.put(value));
    });
    await txDone(tx);
    return recordsByStore;
  }

  async function replaceStoresAtomically(recordsByStore) {
    const storeNames = Object.keys(recordsByStore).filter((storeName) => recordsByStore[storeName]);
    if (!storeNames.length) return recordsByStore;
    const db = await openDatabase();
    const tx = db.transaction(storeNames, "readwrite");
    storeNames.forEach((storeName) => {
      const store = tx.objectStore(storeName);
      store.clear();
      (recordsByStore[storeName] || []).forEach((value) => store.put(value));
    });
    await txDone(tx);
    return recordsByStore;
  }

  async function deleteStoresWhereAtomically(predicatesByStore) {
    const storeNames = Object.keys(predicatesByStore).filter(
      (storeName) => typeof predicatesByStore[storeName] === "function"
    );
    if (!storeNames.length) return predicatesByStore;
    const db = await openDatabase();
    const tx = db.transaction(storeNames, "readwrite");
    await Promise.all(
      storeNames.map((storeName) => deleteWhereInStore(tx.objectStore(storeName), predicatesByStore[storeName]))
    );
    await txDone(tx);
    return predicatesByStore;
  }

  async function moveProjectToTrash(projectId, trashEntry) {
    const [project, segmentKeys, activityKeys] = await Promise.all([
      get("projects", projectId),
      matchingKeys("segments", (segment) => segment.projectId === projectId),
      matchingKeys("activityEvents", (event) => event.projectId === projectId)
    ]);
    if (!project) throw new Error("Project no longer exists.");
    const db = await openDatabase();
    const tx = db.transaction(["projects", "segments", "activityEvents", "trashEntries"], "readwrite");
    tx.objectStore("trashEntries").put(trashEntry);
    tx.objectStore("projects").delete(projectId);
    segmentKeys.forEach((key) => tx.objectStore("segments").delete(key));
    activityKeys.forEach((key) => tx.objectStore("activityEvents").delete(key));
    await txDone(tx);
    return trashEntry;
  }

  async function moveProjectDocumentToTrash(project, documentId, trashEntry) {
    const segmentKeys = await matchingKeys(
      "segments",
      (segment) => segment.projectId === project.id && segment.documentId === documentId
    );
    const db = await openDatabase();
    const tx = db.transaction(["projects", "segments", "trashEntries"], "readwrite");
    tx.objectStore("trashEntries").put(trashEntry);
    tx.objectStore("projects").put(project);
    segmentKeys.forEach((key) => tx.objectStore("segments").delete(key));
    await txDone(tx);
    return trashEntry;
  }

  async function restoreTrashRecords({ entryId, project = null, segments = [], activityEvents = [] }) {
    const db = await openDatabase();
    const stores = ["trashEntries", "projects", "segments", "activityEvents"];
    const tx = db.transaction(stores, "readwrite");
    if (project) tx.objectStore("projects").put(project);
    segments.forEach((segment) => tx.objectStore("segments").put(segment));
    activityEvents.forEach((event) => tx.objectStore("activityEvents").put(event));
    tx.objectStore("trashEntries").delete(entryId);
    await txDone(tx);
    return { project, segments, activityEvents };
  }

  function resourceTrashStorageConfig(resourceType) {
    if (resourceType === "tm") {
      return {
        entityStore: "tmEntries",
        indexStore: "tmTokenIndex",
        indexRecordId: "tmEntryId",
        nameField: "tmName",
        metaPrefix: TM_INDEX_META_PREFIX
      };
    }
    if (resourceType === "tb") {
      return {
        entityStore: "terms",
        indexStore: "termTokenIndex",
        indexRecordId: "termId",
        nameField: "termBaseName",
        metaPrefix: TERM_INDEX_META_PREFIX
      };
    }
    throw new Error(`Unsupported Trash resource type: ${resourceType}`);
  }

  function resourceTrashPayload(trashEntry, config) {
    const records = Array.isArray(trashEntry?.payload?.records) ? trashEntry.payload.records : [];
    if (!records.length) throw new Error("The resource Trash item has no records to preserve.");
    assertUniqueRecordIds(records, "Resource Trash records");
    records.forEach((record) => {
      if (!record?.id || !record?.[config.nameField]) {
        throw new Error("The resource Trash item is missing required record metadata.");
      }
    });
    return records;
  }

  async function moveResourceRecordsToTrash(resourceType, trashEntry) {
    const config = resourceTrashStorageConfig(resourceType);
    const records = resourceTrashPayload(trashEntry, config);
    const ids = new Set(records.map((record) => record.id));
    const db = await openDatabase();
    const tx = db.transaction([config.entityStore, config.indexStore, "trashEntries"], "readwrite");
    const completion = txDone(tx);
    const entityStore = tx.objectStore(config.entityStore);
    try {
      const existingRecords = await Promise.all(records.map((record) => requestToPromise(entityStore.get(record.id))));
      records.forEach((record, index) => {
        const existing = existingRecords[index];
        if (!existing) throw new Error("A resource record no longer exists. Nothing was moved to Trash.");
        if (stableJson(existing) !== stableJson(record)) {
          throw new Error("A resource record changed before deletion. Nothing was moved to Trash.");
        }
      });
      tx.objectStore("trashEntries").add(trashEntry);
      records.forEach((record) => entityStore.delete(record.id));
      await deleteWhereInStore(tx.objectStore(config.indexStore), (record) => ids.has(record[config.indexRecordId]));
      await completion;
      return trashEntry;
    } catch (error) {
      try {
        tx.abort();
      } catch (_abortError) {
        // The transaction may already have completed or aborted.
      }
      try {
        await completion;
      } catch (_transactionError) {
        // Preserve the resource snapshot or constraint error.
      }
      throw error;
    }
  }

  function sameResourceDescriptor(record, entry, config) {
    return (
      String(record?.[config.nameField] || "") === String(entry?.resourceName || "") &&
      languagePairOf(record) === String(entry?.languagePair || "")
    );
  }

  async function restoreResourceTrashRecords(entryId) {
    const entry = await get("trashEntries", entryId);
    if (!entry) throw new Error("Trash item no longer exists.");
    const config = resourceTrashStorageConfig(entry.resourceType);
    const records = resourceTrashPayload(entry, config);
    const existingRecords = await Promise.all(records.map((record) => get(config.entityStore, record.id)));
    if (existingRecords.some(Boolean)) {
      throw new Error("A resource record with the same ID already exists. The Trash item was preserved.");
    }
    if (entry.entityType === "translation-memory" || entry.entityType === "termbase") {
      const liveRecords = await getAll(config.entityStore);
      if (liveRecords.some((record) => sameResourceDescriptor(record, entry, config))) {
        throw new Error(
          "A resource with the same name and language pair already exists. The Trash item was preserved."
        );
      }
    }
    const now = new Date().toISOString();
    const languagePairs = new Set(records.map(languagePairOf).filter(Boolean));
    const db = await openDatabase();
    const tx = db.transaction([config.entityStore, "appMeta", "trashEntries"], "readwrite");
    const completion = txDone(tx);
    records.forEach((record) => tx.objectStore(config.entityStore).add(record));
    languagePairs.forEach((languagePair) => {
      tx.objectStore("appMeta").put({
        key: `${config.metaPrefix}${languagePair}`,
        languagePair,
        dirty: true,
        updatedAt: now
      });
    });
    tx.objectStore("trashEntries").delete(entryId);
    try {
      await completion;
    } catch (error) {
      if (error?.name === "ConstraintError") {
        throw new Error("A resource record conflict prevented restoration. The Trash item was preserved.");
      }
      throw error;
    }
    return entry;
  }

  async function importProjectPackageRecords({
    project,
    segments = [],
    tmEntries = [],
    terms = [],
    activityEvents = [],
    replaceProjectId = ""
  }) {
    const portableContext = createPortableSanitizerContext();
    const importedProject = sanitizePortableValue(project || {}, "", [], portableContext);
    const importedSegments = portableRecordArray(segments, "Project package segments", portableContext);
    const importedTmEntries = portableRecordArray(tmEntries, "Project package TM resources", portableContext);
    const importedTerms = portableRecordArray(terms, "Project package termbase resources", portableContext);
    const importedActivityEvents = portableRecordArray(
      activityEvents,
      "Project package activity events",
      portableContext
    );
    if (!importedProject?.id) throw new Error("Project package is missing project metadata.");
    assertUniqueRecordIds([importedProject], "Project package project");
    assertUniqueRecordIds(importedSegments, "Project package segments");
    assertUniqueRecordIds(importedTmEntries, "Project package TM resources");
    assertUniqueRecordIds(importedTerms, "Project package termbase resources");
    assertUniqueRecordIds(importedActivityEvents, "Project package activity events");
    assertPackageRecordsBelongToProject(importedProject, importedSegments, importedActivityEvents);
    const [
      segmentKeysToDelete,
      activityKeysToDelete,
      existingProject,
      existingSegments,
      existingActivityEvents,
      existingTmEntries,
      existingTerms
    ] = replaceProjectId
      ? await Promise.all([
          matchingKeys("segments", (segment) => segment.projectId === replaceProjectId),
          matchingKeys("activityEvents", (event) => event.projectId === replaceProjectId),
          get("projects", importedProject.id),
          getAll("segments"),
          getAll("activityEvents"),
          getAll("tmEntries"),
          getAll("terms")
        ])
      : await Promise.all([
          Promise.resolve([]),
          Promise.resolve([]),
          get("projects", importedProject.id),
          getAll("segments"),
          getAll("activityEvents"),
          getAll("tmEntries"),
          getAll("terms")
        ]);
    if (existingProject && existingProject.id !== replaceProjectId) {
      throw new Error(`Project ID ${importedProject.id} already exists locally.`);
    }
    assertNoProjectScopedCollisions(importedSegments, existingSegments, "Segment", replaceProjectId);
    assertNoProjectScopedCollisions(importedActivityEvents, existingActivityEvents, "Activity event", replaceProjectId);
    assertNoGlobalResourceConflicts(importedTmEntries, existingTmEntries, "TM resource");
    assertNoGlobalResourceConflicts(importedTerms, existingTerms, "Termbase resource");
    const db = await openDatabase();
    const tx = db.transaction(["projects", "segments", "tmEntries", "terms", "activityEvents"], "readwrite");
    if (replaceProjectId) {
      tx.objectStore("projects").delete(replaceProjectId);
      segmentKeysToDelete.forEach((key) => tx.objectStore("segments").delete(key));
      activityKeysToDelete.forEach((key) => tx.objectStore("activityEvents").delete(key));
    }
    tx.objectStore("projects").put(importedProject);
    importedSegments.forEach((segment) => tx.objectStore("segments").put(segment));
    importedTmEntries.forEach((entry) => tx.objectStore("tmEntries").put(entry));
    importedTerms.forEach((term) => tx.objectStore("terms").put(term));
    importedActivityEvents.forEach((event) => tx.objectStore("activityEvents").put(event));
    await txDone(tx);
    return {
      project: importedProject,
      segments: importedSegments,
      tmEntries: importedTmEntries,
      terms: importedTerms,
      activityEvents: importedActivityEvents
    };
  }

  async function get(storeName, key) {
    const db = await openDatabase();
    const tx = db.transaction(storeName, "readonly");
    return requestToPromise(tx.objectStore(storeName).get(key));
  }

  async function getMany(storeName, keys = []) {
    if (!keys.length) return [];
    const db = await openDatabase();
    const tx = db.transaction(storeName, "readonly");
    const store = tx.objectStore(storeName);
    return Promise.all(keys.map((key) => requestToPromise(store.get(key))));
  }

  async function getAll(storeName) {
    const db = await openDatabase();
    const tx = db.transaction(storeName, "readonly");
    return requestToPromise(tx.objectStore(storeName).getAll());
  }

  async function getAllByIndex(storeName, indexName, value) {
    const db = await openDatabase();
    const tx = db.transaction(storeName, "readonly");
    const index = tx.objectStore(storeName).index(indexName);
    return requestToPromise(index.getAll(value));
  }

  async function getAllByIndexMany(storeName, indexName, values = []) {
    if (!values.length) return [];
    const db = await openDatabase();
    const tx = db.transaction(storeName, "readonly");
    const index = tx.objectStore(storeName).index(indexName);
    return Promise.all(values.map((value) => requestToPromise(index.getAll(value))));
  }

  async function countByIndex(storeName, indexName, value) {
    const db = await openDatabase();
    const tx = db.transaction(storeName, "readonly");
    const index = tx.objectStore(storeName).index(indexName);
    return requestToPromise(index.count(value));
  }

  async function deleteByKey(storeName, key) {
    const db = await openDatabase();
    const tx = db.transaction(storeName, "readwrite");
    tx.objectStore(storeName).delete(key);
    await txDone(tx);
  }

  async function deleteWhere(storeName, predicate) {
    const db = await openDatabase();
    const tx = db.transaction(storeName, "readwrite");
    await deleteWhereInStore(tx.objectStore(storeName), predicate);
    await txDone(tx);
  }

  async function deleteProjectRecords(projectId) {
    if (!projectId) throw new Error("Project ID is required for deletion.");
    const db = await openDatabase();
    const tx = db.transaction(["projects", "segments", "activityEvents"], "readwrite");
    const segmentDelete = deleteWhereInStore(tx.objectStore("segments"), (segment) => segment.projectId === projectId);
    const activityDelete = deleteWhereInStore(
      tx.objectStore("activityEvents"),
      (event) => event.projectId === projectId
    );
    tx.objectStore("projects").delete(projectId);
    await Promise.all([segmentDelete, activityDelete]);
    await txDone(tx);
  }

  async function updateProjectAndDeleteDocumentSegments(project, documentId) {
    if (!project?.id) throw new Error("Project metadata is required for file deletion.");
    if (!documentId) throw new Error("Document ID is required for file deletion.");
    const db = await openDatabase();
    const tx = db.transaction(["projects", "segments"], "readwrite");
    const segmentDelete = deleteWhereInStore(
      tx.objectStore("segments"),
      (segment) => segment.projectId === project.id && segment.documentId === documentId
    );
    tx.objectStore("projects").put(project);
    await segmentDelete;
    await txDone(tx);
    return project;
  }

  async function updateProjectAndPutSegments(project, segments = []) {
    if (!project?.id) throw new Error("Project metadata is required for segment import.");
    const db = await openDatabase();
    const tx = db.transaction(["projects", "segments"], "readwrite");
    let syncError = null;
    try {
      const segmentStore = tx.objectStore("segments");
      segments.forEach((segment) => segmentStore.put(segment));
      tx.objectStore("projects").put(project);
    } catch (error) {
      syncError = error;
      try {
        tx.abort();
      } catch (_abortError) {
        // The transaction may already be aborting; the original write error is the useful one.
      }
    }
    if (syncError) {
      try {
        await txDone(tx);
      } catch (_abortError) {
        // Abort is expected after a synchronous write error.
      }
      throw syncError;
    }
    await txDone(tx);
    return { project, segments };
  }

  async function recordActivityEvent(activity = {}) {
    if (!activity?.type) return null;
    const event = localActivityEventRecord(activity);
    await put("activityEvents", event);
    return event;
  }

  async function listActivityEvents(projectId) {
    const events = projectId
      ? await getAllByIndex("activityEvents", "projectId", projectId)
      : await getAll("activityEvents");
    return events.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
  }

  async function exportAllData() {
    const [projects, segments, tmEntries, terms, activityEvents, trashEntries] = await Promise.all([
      getAll("projects"),
      getAll("segments"),
      getAll("tmEntries"),
      getAll("terms"),
      getAll("activityEvents"),
      getAll("trashEntries")
    ]);
    const portableContext = createPortableSanitizerContext();
    return {
      app: APP_NAME,
      version: 2,
      schemaVersion: DB_VERSION,
      exportedAt: new Date().toISOString(),
      projects: sanitizePortableValue(projects, "", [], portableContext),
      segments: sanitizePortableValue(segments, "", [], portableContext),
      tmEntries: sanitizePortableValue(tmEntries, "", [], portableContext),
      terms: sanitizePortableValue(terms, "", [], portableContext),
      activityEvents: sanitizePortableValue(activityEvents, "", [], portableContext),
      trashEntries: sanitizePortableValue(trashEntries, "", [], portableContext)
    };
  }

  async function importAllData(data) {
    if (!data || ![APP_NAME, LEGACY_APP_NAME].includes(data.app)) throw new Error("This is not a LoopCAT backup file.");
    const schemaVersion = Number(data.schemaVersion);
    if (Number.isFinite(schemaVersion) && schemaVersion > DB_VERSION) {
      throw new Error(
        `Backup schema version ${schemaVersion} is newer than this LoopCAT build supports. Update LoopCAT before restoring this backup.`
      );
    }
    const portableContext = createPortableSanitizerContext();
    const tmEntries = portableRecordArray(data.tmEntries, "Translation memory entries", portableContext);
    const projects = portableRecordArray(data.projects, "Projects", portableContext);
    const segments = portableRecordArray(data.segments, "Segments", portableContext);
    const terms = portableRecordArray(data.terms, "Termbase entries", portableContext);
    const activityEvents = portableRecordArray(data.activityEvents, "Activity events", portableContext);
    const trashEntries = portableRecordArray(data.trashEntries || [], "Trash entries", portableContext);
    assertUniqueRecordIds(projects, "Projects");
    assertUniqueRecordIds(segments, "Segments");
    assertUniqueRecordIds(tmEntries, "Translation memory entries");
    assertUniqueRecordIds(terms, "Termbase entries");
    assertUniqueRecordIds(activityEvents, "Activity events");
    assertUniqueRecordIds(trashEntries, "Trash entries");
    projectDocumentIdMap(projects, "backup");
    assertProjectResourceLinks(projects, "backup");
    assertSegmentsBelongToRestoredProjects(segments, projects);
    assertSegmentsBelongToProjectDocuments(segments, projects, "backup");
    assertActivityEventsBelongToRestoredProjects(activityEvents, projects);
    const tmLanguagePairs = Array.from(new Set(tmEntries.map(languagePairOf).filter((pair) => pair !== "::")));
    const termLanguagePairs = Array.from(new Set(terms.map(languagePairOf).filter((pair) => pair !== "::")));
    const existingAppMeta = await getAll("appMeta");
    const preservedAppMeta = existingAppMeta.filter((item) => {
      const key = String(item?.key || "");
      return !key.startsWith(TM_INDEX_META_PREFIX) && !key.startsWith(TERM_INDEX_META_PREFIX);
    });
    const now = new Date().toISOString();
    await replaceStoresAtomically({
      projects,
      segments,
      tmEntries,
      terms,
      activityEvents,
      trashEntries,
      tmTokenIndex: [],
      termTokenIndex: [],
      appMeta: [
        ...preservedAppMeta,
        ...tmLanguagePairs.map((languagePair) => ({
          key: `${TM_INDEX_META_PREFIX}${languagePair}`,
          languagePair,
          dirty: true,
          updatedAt: now
        })),
        ...termLanguagePairs.map((languagePair) => ({
          key: `${TERM_INDEX_META_PREFIX}${languagePair}`,
          languagePair,
          dirty: true,
          updatedAt: now
        }))
      ]
    });
  }

  window.CatHan = window.CatHan || {};
  window.CatHan.storage = {
    openDatabase,
    makeId,
    put,
    putIfRevisionNotOlder,
    bulkPutIfRevisionNotOlder,
    bulkPut,
    writeSegmentStructureAtomically,
    writeStoresAtomically,
    replaceStoresAtomically,
    deleteStoresWhereAtomically,
    moveProjectToTrash,
    moveProjectDocumentToTrash,
    moveResourceRecordsToTrash,
    restoreTrashRecords,
    restoreResourceTrashRecords,
    importProjectPackageRecords,
    get,
    getMany,
    getAll,
    getAllByIndex,
    getAllByIndexMany,
    countByIndex,
    deleteByKey,
    deleteWhere,
    deleteProjectRecords,
    updateProjectAndDeleteDocumentSegments,
    updateProjectAndPutSegments,
    recordActivityEvent,
    listActivityEvents,
    createPortableSanitizerContext,
    sanitizePortableValue,
    constants: {
      LOCAL_WORKSPACE_ID,
      LOCAL_USER_ID,
      SCHEMA_VERSION: DB_VERSION,
      PROJECT_PACKAGE_SCHEMA_VERSION,
      BACKUP_SCHEMA_VERSION
    },
    exportAllData,
    importAllData
  };
})();
