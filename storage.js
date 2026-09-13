(() => {
  const DB_NAME = "cathan-local-cat";
  const DB_VERSION = 8;
  const PROJECT_PACKAGE_SCHEMA_VERSION = 6;
  const BACKUP_SCHEMA_VERSION = 7;
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
  const AUTHORITATIVE_STORES = [
    "projects",
    "segments",
    "resources",
    "tmEntries",
    "tmContributions",
    "terms",
    "termConcepts",
    "termDesignations",
    "activityEvents",
    "trashEntries"
  ];
  const writerId = makeId("writer");
  const ownedProjects = new Map();
  const ownershipRequests = new Map();
  const knownVersions = new Map();
  const LEASE_MS = 60000;
  let workspaceBarrier = null;
  let checkpointJob = null;
  /** @type {Promise<any>} */
  let mutationTail = Promise.resolve(undefined);
  function serializeMutation(action) {
    const operation = mutationTail.then(action);
    mutationTail = operation.catch(() => {});
    return operation;
  }

  function withWorkspaceBarrier(action) {
    return serializeMutation(() => globalThis.navigator?.locks
      ? navigator.locks.request("loopcat-workspace-mutation", () => runWorkspaceBarrier(action))
      : runWorkspaceBarrier(action));
  }

  async function runWorkspaceBarrier(action) {
    while (workspaceBarrier) await workspaceBarrier;
    let release;
    workspaceBarrier = new Promise((resolve) => { release = resolve; });
    let db;
    let heartbeat;
    let token;
    try {
      db = await openDatabase();
      const heldLocks = globalThis.navigator?.locks?.query ? new Set((await navigator.locks.query()).held.map((lock) => lock.name)) : null;
      const tx = strictTransaction(db, ["ownershipLeases"]);
      const done = txDone(tx);
      const store = tx.objectStore("ownershipLeases");
      const leases = await requestToPromise(store.getAll());
      if (leases.some((lease) => lease.owner !== writerId && (heldLocks && lease.mechanism === "web-lock"
        ? heldLocks.has("loopcat-project:" + lease.id.slice("project:".length)) : lease.expiresAt > Date.now()))) {
        await done;
        throw new Error("Close other editing windows before replacing the workspace. No records were changed.");
      }
      token = (Number(leases.find((lease) => lease.id === "workspace")?.token) || 0) + 1;
      store.put({ id: "workspace", owner: writerId, token, expiresAt: Date.now() + LEASE_MS });
      await done;
      heartbeat = setInterval(async () => {
        try {
          const renew = strictTransaction(db, ["ownershipLeases"]);
          const finished = txDone(renew);
          const leases = renew.objectStore("ownershipLeases");
          const current = await requestToPromise(leases.get("workspace"));
          if (current?.owner === writerId && current.token === token) leases.put({ ...current, expiresAt: Date.now() + LEASE_MS });
          await finished;
        } catch { /* The final transaction checks the fence again. */ }
      }, LEASE_MS / 3);
      /** @type {any} */ (heartbeat).unref?.();
      return await action({ token });
    } finally {
      clearInterval(heartbeat);
      try {
        if (token) {
          const tx = strictTransaction(db, ["ownershipLeases"]);
          const done = txDone(tx);
          const store = tx.objectStore("ownershipLeases");
          const current = await requestToPromise(store.get("workspace"));
          if (current?.owner === writerId && current.token === token) store.put({ ...current, expiresAt: 0 });
          await done;
        }
      } finally { workspaceBarrier = null; release(); }
    }
  }

  async function digestBlob(blob) {
    const digest = await crypto.subtle.digest("SHA-256", await blob.arrayBuffer());
    return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
  }

  const checkpointText = (asset) => asset.json !== undefined ? Promise.resolve(asset.json) : asset.blob.text();
  async function checkpointDigest(asset) {
    if (asset.json === undefined) return digestBlob(asset.blob);
    const bytes = new TextEncoder().encode(asset.json);
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
  }

  function createCheckpoint(reason = "automatic") {
    const action = () => window.document && window.CatHan?.archive?.createCheckpoint
      ? window.CatHan.archive.createCheckpoint(reason) : globalThis.navigator?.locks
        ? navigator.locks.request("loopcat-checkpoint-writer", () => captureCheckpoint(reason)) : captureCheckpoint(reason);
    const operation = (checkpointJob || Promise.resolve()).catch(() => {}).then(action);
    checkpointJob = operation;
    operation.finally(() => { if (checkpointJob === operation) checkpointJob = null; }).catch(() => {});
    return operation;
  }

  async function captureCheckpoint(reason) {
    const db = await openDatabase();
    const id = makeId("checkpoint");
    const checkpoint = { id, format: 2, reason, rollback: reason === "pre-restore", verified: false,
      createdAt: new Date().toISOString(), counts: {}, projects: [], recordCount: 0 };
    const tx = strictTransaction(db, [...AUTHORITATIVE_STORES, "appMeta", "checkpoints", "restoreStaging", "binaryAssets"]);
    const done = txDone(tx);
    const generationRead = requestToPromise(tx.objectStore("appMeta").get("committed-generation"));
    const captures = AUTHORITATIVE_STORES.map((storeName) => new Promise((resolve, reject) => {
      checkpoint.counts[storeName] = 0;
      const cursor = tx.objectStore(storeName).openCursor();
      cursor.onerror = () => reject(cursor.error);
      cursor.onsuccess = () => {
        const row = cursor.result;
        if (!row) { resolve(undefined); return; }
        const record = row.value;
        const asset = "record:" + JSON.stringify([storeName, row.key, record.storageGeneration || 0, record.storageVersion || 0, record.storageWriter || "legacy"]);
        const found = tx.objectStore("binaryAssets").get(asset);
        found.onerror = () => reject(found.error);
        found.onsuccess = () => {
          const rawJson = found.result ? null : JSON.stringify(record);
          const rawBlob = rawJson && rawJson.length > 256 * 1024 ? new Blob([rawJson], { type: "application/json" }) : null;
          if (rawJson !== null) tx.objectStore("binaryAssets").put({ id: asset, ...(rawBlob ? { rawBlob } : { rawJson }) });
          tx.objectStore("restoreStaging").put({ id: id + ":" + String(checkpoint.recordCount++).padStart(12, "0"), checkpointId: id, store: storeName, key: row.key, asset, bytes: rawBlob?.size || (rawJson?.length || found.result?.json?.length || found.result?.rawJson?.length || 0) * 4 || found.result?.blob?.size || found.result?.rawBlob?.size || 0 });
          checkpoint.counts[storeName]++;
          if (storeName === "projects") checkpoint.projects.push({ id: record.id, name: record.name, documents: Array.isArray(record.documents) ? record.documents.map((document) => ({ id: document.id })) : record.documents });
          row.continue();
        };
      };
    }));
    await Promise.all(captures);
    checkpoint.generation = Number((await generationRead)?.value) || 0;
    tx.objectStore("checkpoints").put(checkpoint);
    await done;
    const hashes = [];
    const verifiedParts = new Set();
    const exportErrors = [];
    const assetMigrations = [];
    const projectMap = new Map(checkpoint.projects.map((project) => [project.id, project]));
    for await (const batch of checkpointAssetBatches(id)) {
      const converted = [];
      for (const { row, asset: captured } of batch) {
      let asset = captured;
      if (!asset.digest) {
        const raw = asset.rawJson !== undefined ? JSON.parse(asset.rawJson) : asset.rawBlob ? JSON.parse(await asset.rawBlob.text()) : asset.raw;
        let legacyDocxDocumentId;
        if (row.store === "projects" && raw.docxStructure && raw.docxStructures) {
          const original = JSON.stringify(raw.docxStructure);
          legacyDocxDocumentId = Object.keys(raw.docxStructures).find((key) => JSON.stringify(raw.docxStructures[key]) === original);
        }
        const separated = window.CatHan?.archiveAssets
          ? await window.CatHan.archiveAssets.separateAssets(raw, async (hash, bytes) => {
              const partId = "part:" + hash;
              if (!await get("binaryAssets", partId)) await put("binaryAssets", { id: partId, blob: new Blob([bytes]) });
            }) : { value: raw, assets: [] };
        const json = JSON.stringify(separated);
        asset = { id: row.asset, ...(json.length <= 256 * 1024 ? { json } : { blob: new Blob([json], { type: "application/json" }) }), partIds: separated.assets.flatMap((source) => source.parts.map((part) => "part:" + part.sha256)) };
        asset.digest = await checkpointDigest(asset);
        if (legacyDocxDocumentId) asset.legacyDocxDocumentId = legacyDocxDocumentId;
        converted.push(asset);
      }
      hashes.push(JSON.stringify([row.store, row.key, asset.digest]));
      }
      if (converted.length) await bulkPut("binaryAssets", converted);
      const savedRecords = await getMany("binaryAssets", batch.map(({ row }) => row.asset));
      for (let index = 0; index < savedRecords.length; index++) {
      const readback = savedRecords[index];
      const expected = converted.find((asset) => asset.id === batch[index].row.asset) || batch[index].asset;
      if (!readback || await checkpointDigest(readback) !== expected.digest) throw new Error("Checkpoint record verification failed. Existing work was preserved.");
      const separatedRecord = JSON.parse(await checkpointText(readback));
      const record = separatedRecord.value;
      if (batch[index].row.store === "projects" && readback.legacyDocxDocumentId)
        assetMigrations.push({ projectId: record.id, expectedVersion: record.storageVersion || 0, documentId: readback.legacyDocxDocumentId });
      try {
        if (batch[index].row.store === "projects") {
          projectDocumentIdMap([record], "backup"); assertProjectResourceLinks([record], "backup");
        } else if (batch[index].row.store === "segments") {
          const project = projectMap.get(record.projectId);
          assertSegmentsBelongToRestoredProjects([record], project ? [project] : []);
          assertSegmentsBelongToProjectDocuments([record], project ? [project] : [], "backup");
        } else if (batch[index].row.store === "activityEvents") {
          assertActivityEventsBelongToRestoredProjects([record], checkpoint.projects);
        }
      } catch (error) { if (exportErrors.length < 100) exportErrors.push(error.message); }
      for (const sourceAsset of separatedRecord.assets || []) for (const part of sourceAsset.parts) {
        if (verifiedParts.has(part.sha256)) continue;
        const saved = await get("binaryAssets", "part:" + part.sha256);
        if (!saved || saved.blob.size !== part.bytes || await digestBlob(saved.blob) !== part.sha256) throw new Error("Checkpoint source asset verification failed.");
        verifiedParts.add(part.sha256);
      }
      }
    }
    const manifest = new Blob(hashes, { type: "application/json" });
    const verified = { ...checkpoint, digest: await digestBlob(manifest), verified: true, exportErrors, assetMigrations };
    await put("checkpoints", verified);
    await pruneCheckpoints();
    await compactRecoveryStorage();
    return verified;
  }

  async function migrateCheckpointAssets(checkpointId, projectId) {
    const checkpoint = await get("checkpoints", checkpointId);
    if (!checkpoint?.verified || checkpoint.exportErrors?.length) return null;
    const candidate = checkpoint.assetMigrations?.find((item) => item.projectId === projectId);
    if (!candidate) return null;
    const project = await get("projects", projectId);
    if (!project?.docxStructure || project.storageVersion !== candidate.expectedVersion || !project.docxStructures?.[candidate.documentId]) return null;
    const value = { ...project, legacyDocxDocumentId: candidate.documentId };
    delete value.docxStructure;
    return (await commitMutation(candidate.expectedVersion, null, { changes: [{ store: "projects", value }] })).values[0];
  }

  async function* checkpointRows(id) {
    const db = await openDatabase();
    let after = id + ":";
    while (true) {
      const tx = db.transaction("restoreStaging", "readonly");
      const rows = await requestToPromise(tx.objectStore("restoreStaging").getAll(IDBKeyRange.bound(after, id + ":\uffff", true), 100));
      if (!rows.length) return;
      for (const row of rows) { if (row.checkpointId !== id) throw new Error("Invalid checkpoint reference."); yield row; }
      after = rows.at(-1).id;
    }
  }

  async function* checkpointAssetBatches(id) {
    let rows = [];
    let bytes = 0;
    async function loadRows() {
      const assets = await getMany("binaryAssets", rows.map((row) => row.asset));
      return rows.map((row, index) => ({ row, asset: assets[index] }));
    }
    for await (const row of checkpointRows(id)) {
      // Project records may contain large original documents; process each alone.
      const size = row.bytes || 4 * 1024 * 1024;
      if (rows.length && (row.store === "projects" || bytes + size > 4 * 1024 * 1024)) { yield await loadRows(); rows = []; bytes = 0; }
      rows.push(row);
      bytes += size;
      if (row.store === "projects" || rows.length >= 64) { yield await loadRows(); rows = []; bytes = 0; }
    }
    if (rows.length) yield await loadRows();
  }

  async function* checkpointRecords(id, { portable = false } = {}) {
    const checkpoint = await get("checkpoints", id);
    if (!checkpoint?.verified) throw new Error("Checkpoint is missing or unverified.");
    if (checkpoint.format !== 2) {
      if (await digestBlob(checkpoint.blob) !== checkpoint.digest) throw new Error("Checkpoint integrity check failed.");
      const records = JSON.parse(await checkpoint.blob.text());
      for (const store of AUTHORITATIVE_STORES) for (const value of records[store] || []) yield { store, value };
      return;
    }
    const hashes = [];
    const context = createPortableSanitizerContext();
    let count = 0;
    for await (const batch of checkpointAssetBatches(id)) for (const { row, asset } of batch) {
      if (!asset || await checkpointDigest(asset) !== asset.digest) throw new Error("Checkpoint record integrity check failed.");
      hashes.push(JSON.stringify([row.store, row.key, asset.digest]));
      const separated = JSON.parse(await checkpointText(asset));
      const value = window.CatHan?.archiveAssets ? await window.CatHan.archiveAssets.combineAssets(separated, async (hash) => {
        const part = await get("binaryAssets", "part:" + hash);
        if (!part) throw new Error("Checkpoint source asset is missing.");
        return new Uint8Array(await part.blob.arrayBuffer());
      }) : separated.value;
      count++;
      yield { store: row.store, value: portable ? sanitizePortableValue(value, "", [], context) : value };
    }
    if (count !== checkpoint.recordCount || await digestBlob(new Blob(hashes)) !== checkpoint.digest) throw new Error("Checkpoint manifest integrity check failed.");
  }

  async function checkpointArchiveSource(id) {
    const checkpoint = await get("checkpoints", id);
    if (!checkpoint?.verified) throw new Error("Choose a verified checkpoint.");
    return { checkpointId: id, projects: checkpoint.projects, counts: checkpoint.counts, archiveSource: { async *records() {
      yield { store: "metadata", value: { app: APP_NAME, schemaVersion: BACKUP_SCHEMA_VERSION, exportedAt: checkpoint.createdAt } };
      yield* checkpointRecords(id, { portable: true });
    } } };
  }

  async function createArchiveExport() {
    const generation = Number((await get("appMeta", "committed-generation"))?.value) || 0;
    const latest = (await getAll("checkpoints")).filter((item) => item.verified && item.generation === generation).sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
    const checkpoint = latest || await createCheckpoint("export");
    if (checkpoint.exportErrors?.length) {
      const error = /** @type {Error & { validation: any }} */ (new Error("Cannot export backup: " + checkpoint.exportErrors.join(" ")));
      error.validation = { ok: false, errors: checkpoint.exportErrors, warnings: [], preserved: [], simplified: [], skipped: [], risky: [] };
      throw error;
    }
    return { checkpointId: checkpoint.id, app: APP_NAME, schemaVersion: BACKUP_SCHEMA_VERSION, projects: checkpoint.projects, counts: checkpoint.counts, generation: checkpoint.generation };
  }

  async function pruneCheckpoints() {
    const allCheckpoints = await getAll("checkpoints");
    const checkpoints = allCheckpoints.filter((item) => item.verified).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const keep = new Set(checkpoints.slice(0, 10).map((item) => item.id));
    const days = new Set();
    const oldestDaily = Date.now() - 7 * 86400000;
    for (const item of checkpoints) {
      const day = item.createdAt.slice(0, 10);
      if (item.rollback) keep.add(item.id);
      if (days.size < 7 && Date.parse(item.createdAt) >= oldestDaily && !days.has(day)) { keep.add(item.id); days.add(day); }
    }
    // Under the checkpoint Web Lock, an unverified predecessor is an interrupted
    // job. Remove its references only after this replacement has verified.
    for (const item of allCheckpoints) if (!keep.has(item.id) && (item.verified || globalThis.navigator?.locks)) {
      const db = await openDatabase();
      const tx = strictTransaction(db, ["checkpoints", "restoreStaging"]);
      const done = txDone(tx);
      tx.objectStore("checkpoints").delete(item.id);
      tx.objectStore("restoreStaging").delete(IDBKeyRange.bound(item.id + ":", item.id + ":\uffff"));
      await done;
    }
  }

  async function compactRecoveryStorage() {
    const checkpoints = (await getAll("checkpoints")).filter((item) => item.verified).sort((a, b) => b.generation - a.generation);
    if (checkpoints.length < 2) return;
    const floor = Math.min(checkpoints[0].generation, checkpoints[1].generation);
    const db = await openDatabase();
    const tx = strictTransaction(db, ["journal", "restoreStaging", "binaryAssets"]);
    const done = txDone(tx);
    await new Promise((resolve, reject) => {
      const request = tx.objectStore("journal").index("generation").openCursor(IDBKeyRange.upperBound(floor));
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor) { resolve(undefined); return; }
        const id = cursor.value.restoreStageId;
        if (id) {
          tx.objectStore("restoreStaging").delete(id);
          tx.objectStore("restoreStaging").delete(IDBKeyRange.bound(id + ":", id + ":\uffff"));
        }
        cursor.delete(); cursor.continue();
      };
    });
    // All retained checkpoint references are inspected in the same transaction
    // as deletion. The checkpoint Web Lock excludes an unfinished asset conversion.
    if (globalThis.navigator?.locks) {
      const used = new Set();
      await new Promise((resolve, reject) => {
        const request = tx.objectStore("restoreStaging").openCursor();
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const cursor = request.result;
          if (!cursor) { resolve(undefined); return; }
          if (cursor.value.checkpointId && cursor.value.asset) used.add(cursor.value.asset);
          cursor.continue();
        };
      });
      const references = [...used];
      for (let start = 0; start < references.length; start += 256) {
        const assets = await Promise.all(references.slice(start, start + 256).map((id) => requestToPromise(tx.objectStore("binaryAssets").get(id))));
        for (const asset of assets) for (const part of asset?.partIds || []) used.add(part);
      }
      await deleteWhereInStore(tx.objectStore("binaryAssets"), (record) => /^(record:|part:)/.test(record.id) && !used.has(record.id));
    }
    await done;
  }

  function strictTransaction(db, stores) {
    try { return db.transaction(stores, "readwrite", { durability: "strict" }); }
    catch (error) {
      if (!(error instanceof TypeError)) throw error;
      return db.transaction(stores, "readwrite");
    }
  }

  function requestToPromise(request) {
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  function txDone(tx) {
    return new Promise((resolve, reject) => {
      tx.oncomplete = resolve;
      // Request errors bubble before tx.error is populated. Wait for the abort
      // event so callers receive the actual failure and never a null rejection.
      tx.onabort = () => reject(tx.error || new Error("Database transaction aborted."));
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
    if (!db.objectStoreNames.contains("resources")) {
      const resources = db.createObjectStore("resources", { keyPath: "id" });
      resources.createIndex("type", "type");
      resources.createIndex("name", "name");
      resources.createIndex("typeName", ["type", "name"]);
      resources.createIndex("languagePair", "languagePair");
      resources.createIndex("languages", "languages", { multiEntry: true });
      resources.createIndex("updatedAt", "updatedAt");
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
    if (!db.objectStoreNames.contains("tmContributions")) {
      const contributions = db.createObjectStore("tmContributions", { keyPath: "id" });
      contributions.createIndex("resourceId", "resourceId");
      contributions.createIndex("tmEntryId", "tmEntryId");
      contributions.createIndex("projectId", "projectId");
      contributions.createIndex("segmentId", "segmentId");
      contributions.createIndex("projectSegment", ["projectId", "segmentId"]);
      contributions.createIndex("resourceSegment", ["resourceId", "segmentId"]);
      contributions.createIndex("confirmedAt", "confirmedAt");
    }
    if (!db.objectStoreNames.contains("termConcepts")) {
      const concepts = db.createObjectStore("termConcepts", { keyPath: "id" });
      concepts.createIndex("resourceId", "resourceId");
      concepts.createIndex("updatedAt", "updatedAt");
    }
    if (!db.objectStoreNames.contains("termDesignations")) {
      const designations = db.createObjectStore("termDesignations", { keyPath: "id" });
      designations.createIndex("resourceId", "resourceId");
      designations.createIndex("conceptId", "conceptId");
      designations.createIndex("language", "language");
      designations.createIndex("resourceLanguage", ["resourceId", "language"]);
      designations.createIndex("normalizedText", "normalizedText");
      designations.createIndex("updatedAt", "updatedAt");
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
    /** @type {any} */
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
    /** @type {any} */
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
    /** @type {any} */
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
    /** @type {any} */
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
    /** @type {any} */
    const source = detail && typeof detail === "object" ? detail : {};
    const clean = redactSensitivePortableStrings(sanitizePortableValue(source));
    return clean && typeof clean === "object" && !Array.isArray(clean) ? clean : {};
  }

  function localActivityEventRecord({ projectId = "", type = "", summary = "", detail = {} } = {}) {
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

  /** @param {any} project */
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

  function migrateToVersion8(db, tx) {
    ensureStores(db);
    const resources = tx.objectStore("resources");
    ensureIndex(resources, "type", "type");
    ensureIndex(resources, "name", "name");
    ensureIndex(resources, "typeName", ["type", "name"]);
    ensureIndex(resources, "languagePair", "languagePair");
    ensureIndex(resources, "languages", "languages", { multiEntry: true });
    ensureIndex(resources, "updatedAt", "updatedAt");

    const tm = tx.objectStore("tmEntries");
    ensureIndex(tm, "resourceId", "resourceId");
    ensureIndex(tm, "resourceSource", ["resourceId", "normalizedSource"]);

    const tmTokens = tx.objectStore("tmTokenIndex");
    ensureIndex(tmTokens, "resourceId", "resourceId");
    ensureIndex(tmTokens, "resourceToken", ["resourceId", "token"]);

    const terms = tx.objectStore("terms");
    ensureIndex(terms, "resourceId", "resourceId");
    ensureIndex(terms, "conceptId", "conceptId");

    const termTokens = tx.objectStore("termTokenIndex");
    ensureIndex(termTokens, "resourceId", "resourceId");
    ensureIndex(termTokens, "resourceToken", ["resourceId", "token"]);

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
    if (oldVersion < 7) {
      for (const name of ["journal", "checkpoints", "ownershipLeases", "conflictCopies", "restoreStaging", "binaryAssets"]) {
        if (!db.objectStoreNames.contains(name)) db.createObjectStore(name, { keyPath: "id" });
      }
      ensureIndex(tx.objectStore("journal"), "projectId", "projectId");
      ensureIndex(tx.objectStore("journal"), "generation", "generation");
      for (const name of AUTHORITATIVE_STORES) {
        backfillStore(tx.objectStore(name), (value) => ({ ...value, storageVersion: Number(value.storageVersion) || 0 }));
      }
      tx.objectStore("appMeta").put({ key: "schema", version: DB_VERSION });
    }
    if (oldVersion < 8) migrateToVersion8(db, tx);
  }

  function normalizedResourceText(value) {
    return String(value || "")
      .normalize("NFKC")
      .toLocaleLowerCase("en-US")
      .replace(/[^\p{L}\p{N}\s]/gu, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function resourceIdentityKey(type, name, sourceLang = "", targetLang = "") {
    return [type, cleanText(name).toLocaleLowerCase("en-US"), cleanText(sourceLang), cleanText(targetLang)].join("::");
  }

  async function ensureResourceMigration(db) {
    const markerKey = "resources-v2-migration";
    const read = db.transaction("appMeta", "readonly");
    const existingMarker = await requestToPromise(read.objectStore("appMeta").get(markerKey));
    if (existingMarker?.complete) return existingMarker;

    const storeNames = [
      "projects",
      "resources",
      "tmEntries",
      "tmTokenIndex",
      "terms",
      "termTokenIndex",
      "termConcepts",
      "termDesignations",
      "appMeta"
    ];
    const tx = strictTransaction(db, storeNames);
    const done = txDone(tx);
    try {
      const [projects, existingResources, tmEntries, tmTokens, terms, termTokens, existingConcepts, existingDesignations] =
        await Promise.all([
          requestToPromise(tx.objectStore("projects").getAll()),
          requestToPromise(tx.objectStore("resources").getAll()),
          requestToPromise(tx.objectStore("tmEntries").getAll()),
          requestToPromise(tx.objectStore("tmTokenIndex").getAll()),
          requestToPromise(tx.objectStore("terms").getAll()),
          requestToPromise(tx.objectStore("termTokenIndex").getAll()),
          requestToPromise(tx.objectStore("termConcepts").getAll()),
          requestToPromise(tx.objectStore("termDesignations").getAll())
        ]);
      const resourcesByIdentity = new Map();
      const resourcesById = new Map();
      const warnings = [];
      const identitiesByResourceName = new Map();
      const warnedResourceNames = new Set();
      const now = new Date().toISOString();
      const resourceStore = tx.objectStore("resources");

      function noteResourceIdentity(type, name, identityKey) {
        const nameKey = `${type}::${cleanText(name).toLocaleLowerCase("en-US")}`;
        const identities = identitiesByResourceName.get(nameKey) || new Set();
        identities.add(identityKey);
        identitiesByResourceName.set(nameKey, identities);
        if (identities.size > 1 && !warnedResourceNames.has(nameKey)) {
          warnings.push(
            `Ambiguous legacy resource name kept as separate language identities: ${cleanPortableLabel(name, "Unnamed resource")}`
          );
          warnedResourceNames.add(nameKey);
        }
      }

      function registerResource(type, name, sourceLang, targetLang, preferredId = "") {
        const cleanName = cleanPortableLabel(name, type === "tm" ? "Default TM" : "Default terminology");
        const source = cleanPortableLabel(sourceLang, "und");
        const target = cleanPortableLabel(targetLang, "und");
        const key = resourceIdentityKey(type, cleanName, source, target);
        noteResourceIdentity(type, cleanName, key);
        const known = resourcesByIdentity.get(key);
        if (known) return known;
        const preferred = preferredId && resourcesById.get(preferredId);
        if (preferred) return preferred;
        const id = preferredId && !resourcesById.has(preferredId) ? preferredId : makeId("resource");
        const record = addTmsMetadata({
          id,
          type,
          name: cleanName,
          cachedName: cleanName,
          ...(type === "tm"
            ? { sourceLang: source, targetLang: target, languagePair: `${source}::${target}` }
            : { languages: [...new Set([source, target])], languagePair: `${source}::${target}` }),
          createdAt: now,
          updatedAt: now
        });
        resourcesByIdentity.set(key, record);
        resourcesById.set(record.id, record);
        resourceStore.put(record);
        return record;
      }

      for (const resource of existingResources) {
        const source = resource.sourceLang || resource.languages?.[0] || "und";
        const target = resource.targetLang || resource.languages?.[1] || "und";
        const key = resourceIdentityKey(resource.type, resource.name, source, target);
        noteResourceIdentity(resource.type, resource.name, key);
        if (resourcesByIdentity.has(key) && resourcesByIdentity.get(key).id !== resource.id) {
          continue;
        }
        resourcesByIdentity.set(key, resource);
        resourcesById.set(resource.id, resource);
      }

      const resourceIdByTmEntry = new Map();
      for (const entry of tmEntries) {
        const resource = registerResource("tm", entry.tmName, entry.sourceLang, entry.targetLang, entry.resourceId);
        resourceIdByTmEntry.set(entry.id, resource.id);
        tx.objectStore("tmEntries").put({
          ...entry,
          resourceId: resource.id,
          normalizedSource: entry.normalizedSource || normalizedResourceText(entry.source),
          normalizedTarget: entry.normalizedTarget || normalizedResourceText(entry.target),
          isSeeded: entry.isSeeded !== false
        });
      }
      for (const token of tmTokens) {
        const resourceId = token.resourceId || resourceIdByTmEntry.get(token.tmEntryId) || "";
        if (resourceId) tx.objectStore("tmTokenIndex").put({ ...token, resourceId });
      }

      const conceptIds = new Set(existingConcepts.map((concept) => concept.id));
      const designationIds = new Set(existingDesignations.map((designation) => designation.id));
      const resourceIdByTerm = new Map();
      for (const term of terms) {
        const resource = registerResource(
          "termbase",
          term.termBaseName,
          term.sourceLang,
          term.targetLang,
          term.resourceId
        );
        const conceptId = term.conceptId || `concept-${term.id}`;
        resourceIdByTerm.set(term.id, resource.id);
        const sourceDesignationId = term.sourceDesignationId || `designation-source-${term.id}`;
        const targetDesignationId = term.targetDesignationId || `designation-target-${term.id}`;
        tx.objectStore("terms").put({
          ...term,
          resourceId: resource.id,
          conceptId,
          sourceDesignationId,
          targetDesignationId
        });
        if (!conceptIds.has(conceptId)) {
          tx.objectStore("termConcepts").put(
            addTmsMetadata({
              id: conceptId,
              resourceId: resource.id,
              definition: term.definition || "",
              subject: term.subject || "",
              domain: term.domain || "",
              notes: term.notes || "",
              createdAt: term.createdAt || now,
              updatedAt: term.updatedAt || now
            })
          );
          conceptIds.add(conceptId);
        }
        const designations = [
          {
            id: sourceDesignationId,
            language: term.sourceLang,
            text: term.sourceTerm,
            status: "preferred"
          },
          {
            id: targetDesignationId,
            language: term.targetLang,
            text: term.targetTerm,
            status: term.isForbidden ? "forbidden" : term.status || "preferred"
          }
        ];
        for (const designation of designations) {
          if (!designation.text || designationIds.has(designation.id)) continue;
          tx.objectStore("termDesignations").put(
            addTmsMetadata({
              ...designation,
              conceptId,
              resourceId: resource.id,
              normalizedText: normalizedResourceText(designation.text),
              caseSensitivity: term.caseSensitivity || "insensitive",
              matchMode: term.matchMode || "exact",
              fuzzyThreshold: Number(term.fuzzyThreshold) || 85,
              partOfSpeech: term.partOfSpeech || "",
              usageExample: term.usageExample || "",
              createdAt: term.createdAt || now,
              updatedAt: term.updatedAt || now
            })
          );
          designationIds.add(designation.id);
        }
      }
      for (const token of termTokens) {
        const resourceId = token.resourceId || resourceIdByTerm.get(token.termId) || "";
        if (resourceId) tx.objectStore("termTokenIndex").put({ ...token, resourceId });
      }

      for (const project of projects) {
        const rawLinks = Array.isArray(project.resourceLinks) ? project.resourceLinks : [];
        const mainName = cleanPortableLabel(project.mainTmName, cleanPortableLabel(project.tmName, `${project.name || "Project"} TM`));
        const sourceLang = cleanPortableLabel(project.sourceLang, "und");
        const targetLang = cleanPortableLabel(project.targetLang, "und");
        const incoming = rawLinks.length
          ? rawLinks
          : [
              { type: "tm", name: mainName, role: "main" },
              ...(project.termBaseName ? [{ type: "termbase", name: project.termBaseName }] : [])
            ];
        const deduped = [];
        const seen = new Set();
        for (const rawLink of incoming) {
          const type = rawLink.type === "tb" ? "termbase" : rawLink.type;
          if (!RESOURCE_LINK_TYPES.has(type)) continue;
          const name = cleanPortableLabel(rawLink.cachedName || rawLink.name);
          if (!name) continue;
          const resource = registerResource(type, name, sourceLang, targetLang, rawLink.resourceId);
          const key = `${type}::${resource.id}`;
          if (seen.has(key)) continue;
          seen.add(key);
          deduped.push({ ...rawLink, type, name: resource.name, cachedName: resource.name, resourceId: resource.id });
        }
        if (!deduped.some((link) => link.type === "tm")) {
          const resource = registerResource("tm", mainName, sourceLang, targetLang);
          deduped.unshift({ type: "tm", name: resource.name, cachedName: resource.name, resourceId: resource.id });
        }
        const requestedMain = deduped.find((link) => link.type === "tm" && link.role === "main") ||
          deduped.find((link) => link.type === "tm" && link.name === mainName) ||
          deduped.find((link) => link.type === "tm");
        let tmPriority = 0;
        let tbPriority = 0;
        let firstWritableTermbaseId = "";
        const links = deduped.map((link) => {
          if (link.type === "tm") {
            return {
              ...link,
              id: link.id || makeId("resource-link"),
              role: link.resourceId === requestedMain.resourceId ? "main" : "reference",
              lookup: link.lookup !== false,
              priority: Number.isFinite(Number(link.priority)) ? Number(link.priority) : tmPriority++,
              penalty: Math.max(0, Math.min(30, Number(link.penalty) || 0))
            };
          }
          const contribute = link.contribute === undefined ? !firstWritableTermbaseId : Boolean(link.contribute);
          if (contribute && !firstWritableTermbaseId) firstWritableTermbaseId = link.resourceId;
          return {
            ...link,
            id: link.id || makeId("resource-link"),
            role: "termbase",
            lookup: link.lookup !== false,
            qa: link.qa !== false,
            contribute,
            priority: Number.isFinite(Number(link.priority)) ? Number(link.priority) : tbPriority++
          };
        });
        const activeCandidate = links.find(
          (link) => link.type === "termbase" && link.contribute && link.resourceId === project.activeTermBaseId
        );
        const activeTermBaseId = activeCandidate?.resourceId || firstWritableTermbaseId || null;
        const main = links.find((link) => link.type === "tm" && link.role === "main");
        const firstTb = links.find((link) => link.type === "termbase");
        tx.objectStore("projects").put({
          ...project,
          resourceLinks: links,
          activeTermBaseId,
          tmName: main.name,
          mainTmName: main.name,
          termBaseName: firstTb?.name || ""
        });
      }

      const report = {
        key: markerKey,
        complete: true,
        resourceCount: resourcesById.size,
        tmEntryCount: tmEntries.length,
        legacyTermCount: terms.length,
        conceptCount: conceptIds.size,
        designationCount: designationIds.size,
        warnings,
        updatedAt: now
      };
      tx.objectStore("appMeta").put(report);
      await done;
      return report;
    } catch (error) {
      try {
        tx.abort();
      } catch {
        // Preserve the migration error.
      }
      await done.catch(() => {});
      throw error;
    }
  }

  function openDatabase() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = (event) => {
        const db = request.result;
        runMigrations(db, request.transaction, event.oldVersion);
      };
      request.onblocked = () => {
        window.dispatchEvent?.(new CustomEvent("loopcat-storage-status", { detail: "Database upgrade is waiting for another LoopCAT window to close." }));
      };
      request.onsuccess = async () => {
        const db = request.result;
        db.onversionchange = () => { db.close(); dbPromise = undefined; };
        db.onclose = () => { dbPromise = undefined; };
        try {
          await ensureResourceMigration(db);
          resolve(db);
        } catch (error) {
          db.close();
          reject(error);
        }
      };
      request.onerror = () => reject(request.error);
    }).catch((error) => { dbPromise = undefined; throw error; });
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

  /** @returns {any} */
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
    if (["storageVersion", "storageWriter", "storageGeneration", "legacyDocxDocumentId"].includes(key) && !isSourceJsonPath(currentPath)) return undefined;
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
      if (!isSourceJsonPath(currentPath) && value.legacyDocxDocumentId && value.docxStructures?.[value.legacyDocxDocumentId])
        value = { ...value, docxStructure: value.docxStructure || value.docxStructures[value.legacyDocxDocumentId] };
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
      const comparable = (value) => Object.fromEntries(Object.entries(value).filter(([key]) => !["storageVersion", "storageWriter", "storageGeneration"].includes(key)));
      if (existing && stableJson(comparable(existing)) !== stableJson(comparable(record))) {
        throw new Error(`${label} ID ${id} already exists with different local content.`);
      }
    });
  }

  function languagePairOf(entry) {
    return entry.languagePair || `${entry.sourceLang || ""}::${entry.targetLang || ""}`;
  }

  function acquireProject(projectId) {
    if (ownershipRequests.has(projectId)) return ownershipRequests.get(projectId);
    const pending = globalThis.navigator?.locks
      ? navigator.locks.request("loopcat-workspace-mutation", { mode: "shared" }, () => acquireProjectOnce(projectId))
      : acquireProjectOnce(projectId);
    ownershipRequests.set(projectId, pending);
    const cleanup = () => ownershipRequests.delete(projectId);
    pending.then(cleanup, cleanup);
    return pending;
  }

  async function acquireProjectOnce(projectId) {
    if (!projectId) throw new Error("Project ownership requires an ID.");
    if (ownedProjects.has(projectId)) return ownedProjects.get(projectId).token;
    let releaseLock = null;
    if (globalThis.navigator?.locks) {
      const acquired = await new Promise((resolve, reject) => {
        navigator.locks.request(`loopcat-project:${projectId}`, { ifAvailable: true }, async (lock) => {
          if (!lock) { resolve(false); return; }
          await new Promise((release) => { releaseLock = release; resolve(true); });
        }).catch(reject);
      });
      if (!acquired) return null;
    }
    try {
      const db = await openDatabase();
      const tx = strictTransaction(db, ["ownershipLeases"]);
      const done = txDone(tx);
      const store = tx.objectStore("ownershipLeases");
      const id = `project:${projectId}`;
      const barrier = await requestToPromise(store.get("workspace"));
      if (barrier?.owner !== writerId && barrier?.expiresAt > Date.now()) {
        await done;
        releaseLock?.();
        return null;
      }
      const existing = await requestToPromise(store.get(id));
      if (existing?.owner !== writerId && existing?.expiresAt > Date.now() && !(releaseLock && existing.mechanism === "web-lock")) {
        await done;
        releaseLock?.();
        return null;
      }
      const token = (Number(existing?.token) || 0) + 1;
      store.put({ id, owner: writerId, token, mechanism: releaseLock ? "web-lock" : "lease", expiresAt: Date.now() + LEASE_MS });
      await done;
      const heartbeat = setInterval(() => renewProject(projectId).catch(() => {}), LEASE_MS / 3);
      /** @type {any} */ (heartbeat).unref?.();
      ownedProjects.set(projectId, { token, releaseLock, heartbeat });
      return token;
    } catch (error) { releaseLock?.(); throw error; }
  }

  async function renewProject(projectId) {
    const held = ownedProjects.get(projectId);
    if (!held) return false;
    const db = await openDatabase();
    const tx = strictTransaction(db, ["ownershipLeases"]);
    const done = txDone(tx);
    const store = tx.objectStore("ownershipLeases");
    const lease = await requestToPromise(store.get(`project:${projectId}`));
    if (lease?.owner === writerId && lease.token === held.token) {
      store.put({ ...lease, expiresAt: Date.now() + LEASE_MS });
      await done;
      return true;
    }
    await done;
    clearInterval(held.heartbeat);
    held.releaseLock?.();
    ownedProjects.delete(projectId);
    window.dispatchEvent?.(new CustomEvent("loopcat-ownership-lost", { detail: { projectId } }));
    return false;
  }

  async function releaseProject(projectId) {
    const held = ownedProjects.get(projectId);
    if (!held) return;
    const db = await openDatabase();
    const tx = strictTransaction(db, ["ownershipLeases"]);
    const done = txDone(tx);
    const store = tx.objectStore("ownershipLeases");
    const lease = await requestToPromise(store.get(`project:${projectId}`));
    if (lease?.owner === writerId && lease.token === held.token) store.put({ ...lease, expiresAt: 0 });
    await done;
    clearInterval(held.heartbeat);
    ownedProjects.delete(projectId);
    held.releaseLock?.();
  }

  // All record checks, edits, generations, and recovery entries share one commit.
  function commitMutation(expectedVersion, fencingToken, mutation) {
    const snapshot = structuredClone(mutation);
    return serializeMutation(() => commitMutationNow(expectedVersion, fencingToken, snapshot));
  }

  async function commitMutationNow(expectedVersion, fencingToken, mutation) {
    const changes = structuredClone(mutation.changes || []);
    const projectIds = [...new Set(changes.map((change) => change.projectId ||
      (change.store === "projects" ? change.value?.id || change.key : change.value?.projectId)).filter(Boolean))];
    for (const projectId of projectIds) {
      if (!ownedProjects.has(projectId) && await acquireProject(projectId) === null) {
        throw new Error("This project is read-only: another LoopCAT window owns it.");
      }
    }
    const db = await openDatabase();
    const stores = [...new Set([...changes.map((change) => change.store), "journal", "appMeta", "ownershipLeases"])];
    const tx = strictTransaction(db, stores);
    const done = txDone(tx);
    const values = [];
    let generation = 0;
    try {
      const leases = tx.objectStore("ownershipLeases");
      const workspaceLease = await requestToPromise(leases.get("workspace"));
      if (workspaceLease?.expiresAt > Date.now() && workspaceLease.owner !== writerId) {
        throw new Error("Workspace replacement is in progress. Your changes remain pending.");
      }
      for (const projectId of projectIds) {
        const lease = await requestToPromise(leases.get(`project:${projectId}`));
        const expectedToken = fencingToken ?? ownedProjects.get(projectId)?.token;
        if (lease?.owner !== writerId || lease.token !== expectedToken || (lease.expiresAt <= Date.now() && !ownedProjects.get(projectId)?.releaseLock)) {
          throw new Error("Project ownership expired. Your changes remain pending; reopen the project to recover ownership.");
        }
      }
      const meta = tx.objectStore("appMeta");
      const current = await requestToPromise(meta.get("committed-generation"));
      generation = (Number(current?.value) || 0) + 1;
      const expanded = [];
      for (const guard of mutation.guards || []) {
        const records = await requestToPromise(tx.objectStore(guard.store).index(guard.index).getAll(guard.value));
        if (records.some((record) => languagePairOf(record) === guard.languagePair)) throw new Error("A resource with the same name and language pair already exists. The Trash item was preserved.");
      }
      for (const change of changes) {
        if (!change.where) { expanded.push(change); continue; }
        const store = tx.objectStore(change.store);
        const indexed = Object.entries(change.where).find(([name]) => store.indexNames.contains(name));
        const records = indexed
          ? await requestToPromise(store.index(indexed[0]).getAll(indexed[1]))
          : await requestToPromise(store.getAll());
        const excluded = new Set(change.excludeIds || []);
        for (const value of records) if (!excluded.has(value.id) && Object.entries(change.where).every(([key, expected]) => value[key] === expected)) {
          expanded.push({ store: change.store, key: value.id, value, delete: true });
        }
      }
      changes.splice(0, changes.length, ...expanded);
      const journal = [];
      for (const change of changes) {
        const store = tx.objectStore(change.store);
        const key = change.key ?? change.value?.id;
        if (!AUTHORITATIVE_STORES.includes(change.store)) {
          if (change.delete) store.delete(key); else store.put(change.value);
          values.push(change.value || null);
          continue;
        }
        const previous = await requestToPromise(store.get(key));
        if (change.assertValue && stableJson(previous) !== stableJson(change.assertValue)) throw new Error("A record changed before this operation. Existing work was preserved.");
        if (change.identicalOrInsert && previous) {
          assertNoGlobalResourceConflicts([change.value], [previous], "Shared resource");
          values.push(previous);
          continue;
        }
        const version = Number(previous?.storageVersion) || 0;
        const expected = expectedVersion ?? change.expectedVersion ?? change.value?.storageVersion ?? 0;
        const deletedVersion = !previous && expected !== 0 ? await requestToPromise(meta.get(`deleted-record:${change.store}:${key}`)) : null;
        const knownLocal = mutation.rebaseLocal && previous?.storageWriter === writerId &&
          knownVersions.get(`${change.store}:${key}`) === version &&
          change.store === "segments" && Number(change.value?.revision || 0) > Number(previous.revision || 0);
        if ((!previous && deletedVersion && expected !== 0 && !change.delete) || (previous && (change.insertOnly || (expected !== version && !knownLocal)))) {
          const error = new Error(`Save conflict in ${change.store} (${redactSensitiveText(String(key)).slice(0, 80)}; expected ${expected}, stored ${version}). Your output was preserved as a conflict copy.`);
          error.name = "StorageConflictError";
          throw error;
        }
        if (change.delete) { store.delete(key); meta.put({ key: `deleted-record:${change.store}:${key}`, value: generation }); values.push(null); }
        else {
          const next = { ...change.value, storageVersion: generation, storageWriter: writerId, storageGeneration: generation };
          store.put(next);
          values.push(next);
        }
        journal.push({ store: change.store, key, before: previous || null, after: values.at(-1) });
      }
      for (const projectId of projectIds) meta.put({ key: `project-generation:${projectId}`, value: generation });
      meta.put({ key: "committed-generation", value: generation });
      tx.objectStore("journal").put({ id: makeId("journal"), generation, projectId: projectIds[0] || "", projectIds,
        createdAt: new Date().toISOString(), changes: journal });
      await done;
    } catch (error) {
      try { tx.abort(); } catch { /* Already aborted or completed. */ }
      await done.catch(() => {});
      if (error.name === "StorageConflictError") {
        const conflictTx = strictTransaction(db, ["conflictCopies"]);
        const conflictDone = txDone(conflictTx);
        conflictTx.objectStore("conflictCopies").put({ id: makeId("conflict"), createdAt: new Date().toISOString(), changes });
        await conflictDone;
        window.dispatchEvent?.(new CustomEvent("loopcat-storage-status", { detail: error.message }));
      }
      throw error;
    }
    changes.forEach((change, index) => {
      if (values[index]) knownVersions.set(`${change.store}:${values[index].id}`, values[index].storageVersion);
    });
    window.dispatchEvent?.(new CustomEvent("loopcat-committed", { detail: { generation, projectIds } }));
    return { generation, values };
  }

  async function put(storeName, value) {
    if (AUTHORITATIVE_STORES.includes(storeName)) {
      return (await commitMutation(null, null, { changes: [{ store: storeName, value }], rebaseLocal: true })).values[0];
    }
    const db = await openDatabase();
    const tx = db.transaction(storeName, "readwrite");
    tx.objectStore(storeName).put(value);
    await txDone(tx);
    return value;
  }

  async function putIfRevisionNotOlder(storeName, value, revisionField = "revision") {
    if (AUTHORITATIVE_STORES.includes(storeName)) {
      return { value: await put(storeName, value), stale: false };
    }
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
          resolve(undefined);
          return;
        }
        store.put(value);
        resolve(undefined);
      };
      read.onerror = () => reject(read.error);
    });
    await txDone(tx);
    return { value: saved, stale };
  }

  async function bulkPutIfRevisionNotOlder(storeName, values = [], revisionField = "revision") {
    if (!values.length) return { values: [], staleIndexes: [] };
    if (AUTHORITATIVE_STORES.includes(storeName)) return { values: await bulkPut(storeName, values), staleIndexes: [] };
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
                resolve(undefined);
                return;
              }
              const write = store.put(value);
              write.onsuccess = () => {
                saved[index] = value;
                resolve(undefined);
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
    if (AUTHORITATIVE_STORES.includes(storeName)) {
      return (await commitMutation(null, null, { changes: values.map((value) => ({ store: storeName, value })), rebaseLocal: true })).values;
    }
    const db = await openDatabase();
    const tx = db.transaction(storeName, "readwrite");
    const store = tx.objectStore(storeName);
    values.forEach((value) => store.put(value));
    await txDone(tx);
    return values;
  }

  async function writeSegmentStructureAtomically({ segments = [], deleteSegmentIds = [] } = {}) {
    const ids = new Set();
    for (const segment of segments) {
      if (!segment?.id || ids.has(segment.id)) throw new Error("Every structural segment requires a unique ID.");
      ids.add(segment.id);
    }
    if (deleteSegmentIds.some((id) => ids.has(id))) throw new Error("A structural segment cannot be written and deleted in the same transaction.");
    const deleted = (await getMany("segments", [...new Set(deleteSegmentIds)])).filter(Boolean);
    const result = await commitMutation(null, null, { rebaseLocal: true, changes: [
      ...segments.map((value) => ({ store: "segments", value })),
      ...deleted.map((value) => ({ store: "segments", value, delete: true }))
    ] });
    return { segments: result.values.slice(0, segments.length), deletedSegmentIds: [...new Set(deleteSegmentIds)] };
  }

  function deleteWhereInStore(store, predicate) {
    return new Promise((resolve, reject) => {
      const request = store.openCursor();
      request.onsuccess = () => {
        try {
          const cursor = request.result;
          if (!cursor) {
            resolve(undefined);
            return;
          }
          if (predicate(cursor.value)) cursor.delete();
          cursor.continue();
        } catch (error) {
          try {
            store.transaction.abort();
          } catch {
            // The transaction may already be aborting; the original error is the useful one.
          }
          reject(error);
        }
      };
      request.onerror = () => reject(request.error);
    });
  }

  async function writeStoresAtomically(recordsByStore) {
    const storeNames = Object.keys(recordsByStore).filter((storeName) => recordsByStore[storeName]);
    if (!storeNames.length) return recordsByStore;
    const changes = storeNames.flatMap((store) =>
      recordsByStore[store].map((value) => ({ store, key: value.id ?? value.key, value })));
    const committed = await commitMutation(null, null, { changes, rebaseLocal: true });
    let valueIndex = 0;
    return Object.fromEntries(storeNames.map((storeName) => [
      storeName,
      recordsByStore[storeName].map(() => committed.values[valueIndex++])
    ]));
  }

  async function replaceStoresAtomically(recordsByStore) {
    const storeNames = Object.keys(recordsByStore).filter((storeName) => recordsByStore[storeName]);
    if (!storeNames.length) return recordsByStore;
    return await withWorkspaceBarrier(async ({ token }) => {
      const rollback = await createCheckpoint("pre-restore");
      const db = await openDatabase();
      const restoreStageId = makeId("restore-image");
      const tx = strictTransaction(db, [...new Set([...storeNames, "ownershipLeases", "journal", "appMeta", "restoreStaging"])]);
      const done = txDone(tx);
      try {
        const lease = await requestToPromise(tx.objectStore("ownershipLeases").get("workspace"));
        if (lease?.owner !== writerId || lease.token !== token || lease.expiresAt <= Date.now()) throw new Error("Restore ownership expired; retry restore.");
        const meta = tx.objectStore("appMeta");
        const previous = await requestToPromise(meta.get("committed-generation"));
        const generation = (Number(previous?.value) || 0) + 1;
        storeNames.forEach((storeName) => {
          const store = tx.objectStore(storeName);
          store.clear();
          (recordsByStore[storeName] || []).forEach((value) => store.put(AUTHORITATIVE_STORES.includes(storeName)
            ? { ...value, storageVersion: generation, storageWriter: writerId, storageGeneration: generation } : value));
          if (AUTHORITATIVE_STORES.includes(storeName)) for (const value of recordsByStore[storeName] || []) {
            tx.objectStore("restoreStaging").put({ id: `${restoreStageId}:record:${storeName}:${JSON.stringify(value.id)}`, store: storeName, value });
          }
        });
        tx.objectStore("restoreStaging").put({ id: restoreStageId, journalPinned: true, format: 2 });
        meta.put({ key: "committed-generation", value: generation });
        tx.objectStore("journal").put({ id: makeId("restore"), generation, createdAt: new Date().toISOString(),
          type: "restore", mode: "replace", restoreStageId, rollbackCheckpoint: rollback.id });
        await done;
        knownVersions.clear();
        return recordsByStore;
      } catch (error) {
        try { tx.abort(); } catch { /* Retain original error. */ }
        await done.catch(() => {});
        throw error;
      }
    });
  }

  async function deleteStoresWhereAtomically(predicatesByStore) {
    const changes = [];
    for (const [store, predicate] of Object.entries(predicatesByStore)) {
      if (typeof predicate !== "function") continue;
      for (const value of await getAll(store)) if (predicate(value)) changes.push({ store, value, delete: true });
    }
    if (changes.length) await commitMutation(null, null, { changes, rebaseLocal: true });
    return predicatesByStore;
  }

  async function moveProjectToTrash(projectId, trashEntry) {
    const project = await get("projects", projectId);
    if (!project) throw new Error("Project no longer exists.");
    await commitMutation(null, null, { rebaseLocal: true, changes: [
      { store: "trashEntries", value: trashEntry },
      { store: "segments", projectId, where: { projectId } },
      { store: "activityEvents", projectId, where: { projectId } },
      { store: "projects", value: project, delete: true }
    ] });
    return trashEntry;
  }

  async function moveProjectDocumentToTrash(project, documentId, trashEntry) {
    const result = await commitMutation(null, null, { rebaseLocal: true, changes: [
      { store: "trashEntries", value: trashEntry },
      { store: "projects", value: project },
      { store: "segments", projectId: project.id, where: { projectId: project.id, documentId } }
    ] });
    Object.assign(project, result.values[1]);
    return trashEntry;
  }

  async function restoreTrashRecords({ entryId, project = null, segments = [], activityEvents = [] }) {
    const entry = await get("trashEntries", entryId);
    const existing = project && await get("projects", project.id);
    if (existing && entry?.entityType !== "document" && entry?.entityType !== "project-document") throw new Error("Project already exists. The Trash item was preserved.");
    await commitMutation(null, null, { rebaseLocal: true, changes: [
      ...(project ? [{ store: "projects", value: { ...project, storageVersion: existing?.storageVersion || 0 }, insertOnly: !existing }] : []),
      ...segments.map((value) => ({ store: "segments", value: { ...value, storageVersion: 0 }, insertOnly: true })),
      ...activityEvents.map((value) => ({ store: "activityEvents", value: { ...value, storageVersion: 0 }, insertOnly: true })),
      ...(entry ? [{ store: "trashEntries", value: entry, delete: true }] : [])
    ] });
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
    await commitMutation(null, null, { changes: [
      { store: "trashEntries", value: trashEntry, insertOnly: true },
      ...records.map((value) => ({ store: config.entityStore, value, delete: true, assertValue: value })),
      ...records.map((value) => ({ store: config.indexStore, where: { [config.indexRecordId]: value.id } })),
      ...[...new Set(records.map(languagePairOf))].map((languagePair) => ({ store: "appMeta", key: config.metaPrefix + languagePair,
        value: { key: config.metaPrefix + languagePair, languagePair, dirty: true, updatedAt: new Date().toISOString() } }))
    ] });
    return trashEntry;
  }

  async function restoreResourceTrashRecords(entryId) {
    const entry = await get("trashEntries", entryId);
    if (!entry) throw new Error("Trash item no longer exists.");
    const config = resourceTrashStorageConfig(entry.resourceType);
    const records = resourceTrashPayload(entry, config);
    await commitMutation(null, null, {
      guards: ["translation-memory", "termbase"].includes(entry.entityType) ? [{ store: config.entityStore,
        index: config.nameField, value: entry.resourceName, languagePair: entry.languagePair }] : [],
      changes: [
        ...records.map((value) => ({ store: config.entityStore, value: { ...value, storageVersion: 0 }, insertOnly: true })),
        ...[...new Set(records.map(languagePairOf))].map((languagePair) => ({ store: "appMeta", key: config.metaPrefix + languagePair,
          value: { key: config.metaPrefix + languagePair, languagePair, dirty: true, updatedAt: new Date().toISOString() } })),
        { store: "trashEntries", value: entry, delete: true }
      ]
    });
    return entry;
  }

  async function importProjectPackageRecords({
    project,
    segments = [],
    resources = [],
    tmEntries = [],
    tmContributions = [],
    terms = [],
    termConcepts = [],
    termDesignations = [],
    activityEvents = [],
    replaceProjectId = ""
  }) {
    const portableContext = createPortableSanitizerContext();
    const importedProject = sanitizePortableValue(project || {}, "", [], portableContext);
    const importedSegments = portableRecordArray(segments, "Project package segments", portableContext);
    const importedResources = portableRecordArray(resources, "Project package resources", portableContext);
    const importedTmEntries = portableRecordArray(tmEntries, "Project package TM resources", portableContext);
    const importedTmContributions = portableRecordArray(
      tmContributions,
      "Project package TM contributions",
      portableContext
    );
    const importedTerms = portableRecordArray(terms, "Project package termbase resources", portableContext);
    const importedTermConcepts = portableRecordArray(termConcepts, "Project package term concepts", portableContext);
    const importedTermDesignations = portableRecordArray(
      termDesignations,
      "Project package term designations",
      portableContext
    );
    const importedActivityEvents = portableRecordArray(
      activityEvents,
      "Project package activity events",
      portableContext
    );
    if (!importedProject?.id) throw new Error("Project package is missing project metadata.");
    assertUniqueRecordIds([importedProject], "Project package project");
    assertUniqueRecordIds(importedSegments, "Project package segments");
    assertUniqueRecordIds(importedResources, "Project package resources");
    assertUniqueRecordIds(importedTmEntries, "Project package TM resources");
    assertUniqueRecordIds(importedTmContributions, "Project package TM contributions");
    assertUniqueRecordIds(importedTerms, "Project package termbase resources");
    assertUniqueRecordIds(importedTermConcepts, "Project package term concepts");
    assertUniqueRecordIds(importedTermDesignations, "Project package term designations");
    assertUniqueRecordIds(importedActivityEvents, "Project package activity events");
    assertPackageRecordsBelongToProject(importedProject, importedSegments, importedActivityEvents);
    const [
      _segmentKeysToDelete,
      _activityKeysToDelete,
      existingProject,
      existingSegments,
      existingActivityEvents,
      existingResources,
      existingTmEntries,
      existingTmContributions,
      existingTerms,
      existingTermConcepts,
      existingTermDesignations
    ] = replaceProjectId
      ? await Promise.all([
          Promise.resolve([]),
          Promise.resolve([]),
          get("projects", importedProject.id),
          getMany("segments", importedSegments.map((record) => record.id)).then((records) => records.filter(Boolean)),
          getMany("activityEvents", importedActivityEvents.map((record) => record.id)).then((records) => records.filter(Boolean)),
          getMany("resources", importedResources.map((record) => record.id)).then((records) => records.filter(Boolean)),
          getMany("tmEntries", importedTmEntries.map((record) => record.id)).then((records) => records.filter(Boolean)),
          getMany("tmContributions", importedTmContributions.map((record) => record.id)).then((records) => records.filter(Boolean)),
          getMany("terms", importedTerms.map((record) => record.id)).then((records) => records.filter(Boolean)),
          getMany("termConcepts", importedTermConcepts.map((record) => record.id)).then((records) => records.filter(Boolean)),
          getMany("termDesignations", importedTermDesignations.map((record) => record.id)).then((records) => records.filter(Boolean))
        ])
      : await Promise.all([
          Promise.resolve([]),
          Promise.resolve([]),
          get("projects", importedProject.id),
          getMany("segments", importedSegments.map((record) => record.id)).then((records) => records.filter(Boolean)),
          getMany("activityEvents", importedActivityEvents.map((record) => record.id)).then((records) => records.filter(Boolean)),
          getMany("resources", importedResources.map((record) => record.id)).then((records) => records.filter(Boolean)),
          getMany("tmEntries", importedTmEntries.map((record) => record.id)).then((records) => records.filter(Boolean)),
          getMany("tmContributions", importedTmContributions.map((record) => record.id)).then((records) => records.filter(Boolean)),
          getMany("terms", importedTerms.map((record) => record.id)).then((records) => records.filter(Boolean)),
          getMany("termConcepts", importedTermConcepts.map((record) => record.id)).then((records) => records.filter(Boolean)),
          getMany("termDesignations", importedTermDesignations.map((record) => record.id)).then((records) => records.filter(Boolean))
        ]);
    if (existingProject && existingProject.id !== replaceProjectId) {
      throw new Error(`Project ID ${importedProject.id} already exists locally.`);
    }
    assertNoProjectScopedCollisions(importedSegments, existingSegments, "Segment", replaceProjectId);
    assertNoProjectScopedCollisions(importedActivityEvents, existingActivityEvents, "Activity event", replaceProjectId);
    assertNoProjectScopedCollisions(importedTmContributions, existingTmContributions, "TM contribution", replaceProjectId);
    assertNoGlobalResourceConflicts(importedResources, existingResources, "Resource");
    assertNoGlobalResourceConflicts(importedTmEntries, existingTmEntries, "TM resource");
    assertNoGlobalResourceConflicts(importedTerms, existingTerms, "Termbase resource");
    assertNoGlobalResourceConflicts(importedTermConcepts, existingTermConcepts, "Term concept");
    assertNoGlobalResourceConflicts(importedTermDesignations, existingTermDesignations, "Term designation");
    const byId = (records) => new Map(records.map((record) => [record.id, record]));
    const segmentVersions = byId(existingSegments);
    const eventVersions = byId(existingActivityEvents);
    const existingResourceRecords = byId(existingResources);
    const existingTm = byId(existingTmEntries);
    const contributionVersions = byId(existingTmContributions);
    const existingTb = byId(existingTerms);
    const existingConceptRecords = byId(existingTermConcepts);
    const existingDesignationRecords = byId(existingTermDesignations);
    const changes = [
      ...(replaceProjectId ? [
        { store: "segments", projectId: replaceProjectId, where: { projectId: replaceProjectId }, excludeIds: importedSegments.map((record) => record.id) },
        { store: "activityEvents", projectId: replaceProjectId, where: { projectId: replaceProjectId }, excludeIds: importedActivityEvents.map((record) => record.id) },
        { store: "tmContributions", projectId: replaceProjectId, where: { projectId: replaceProjectId }, excludeIds: importedTmContributions.map((record) => record.id) }
      ] : []),
      { store: "projects", value: { ...importedProject, storageVersion: existingProject?.storageVersion || 0 }, insertOnly: !existingProject },
      ...importedSegments.map((value) => ({ store: "segments", value: { ...value, storageVersion: segmentVersions.get(value.id)?.storageVersion || 0 }, insertOnly: !segmentVersions.has(value.id) })),
      ...importedActivityEvents.map((value) => ({ store: "activityEvents", value: { ...value, storageVersion: eventVersions.get(value.id)?.storageVersion || 0 }, insertOnly: !eventVersions.has(value.id) })),
      ...importedResources.map((value) => ({ store: "resources", value, identicalOrInsert: true, assertValue: existingResourceRecords.get(value.id) })),
      ...importedTmEntries.map((value) => ({ store: "tmEntries", value, identicalOrInsert: true, assertValue: existingTm.get(value.id) })),
      ...importedTmContributions.map((value) => ({ store: "tmContributions", value: { ...value, storageVersion: contributionVersions.get(value.id)?.storageVersion || 0 }, insertOnly: !contributionVersions.has(value.id) })),
      ...importedTerms.map((value) => ({ store: "terms", value, identicalOrInsert: true, assertValue: existingTb.get(value.id) })),
      ...importedTermConcepts.map((value) => ({ store: "termConcepts", value, identicalOrInsert: true, assertValue: existingConceptRecords.get(value.id) })),
      ...importedTermDesignations.map((value) => ({ store: "termDesignations", value, identicalOrInsert: true, assertValue: existingDesignationRecords.get(value.id) }))
    ];
    await serializeMutation(async () => {
      if (replaceProjectId) {
        if (await acquireProject(replaceProjectId) === null) throw new Error("Project is read-only in this window.");
        await createCheckpoint("pre-restore");
      }
      await commitMutationNow(null, null, { changes });
    });
    await ensureResourceMigration(await openDatabase());
    return {
      project: importedProject,
      segments: importedSegments,
      resources: importedResources,
      tmEntries: importedTmEntries,
      tmContributions: importedTmContributions,
      terms: importedTerms,
      termConcepts: importedTermConcepts,
      termDesignations: importedTermDesignations,
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
    if (AUTHORITATIVE_STORES.includes(storeName)) {
      const value = await get(storeName, key);
      if (!value) return;
      await commitMutation(null, null, { changes: [{ store: storeName, key, value, delete: true }], rebaseLocal: true });
      return;
    }
    const db = await openDatabase();
    const tx = db.transaction(storeName, "readwrite");
    tx.objectStore(storeName).delete(key);
    await txDone(tx);
  }

  async function deleteWhere(storeName, predicate) {
    return await deleteStoresWhereAtomically({ [storeName]: predicate });
  }

  async function deleteProjectRecords(projectId) {
    if (!projectId) throw new Error("Project ID is required for deletion.");
    const project = await get("projects", projectId);
    await commitMutation(null, null, { rebaseLocal: true, changes: [
      { store: "segments", projectId, where: { projectId } },
      { store: "activityEvents", projectId, where: { projectId } },
      ...(project ? [{ store: "projects", value: project, delete: true }] : [])
    ] });
  }

  async function updateProjectAndDeleteDocumentSegments(project, documentId) {
    if (!project?.id) throw new Error("Project metadata is required for file deletion.");
    if (!documentId) throw new Error("Document ID is required for file deletion.");
    const result = await commitMutation(null, null, { rebaseLocal: true, changes: [
      { store: "projects", value: project },
      { store: "segments", projectId: project.id, where: { projectId: project.id, documentId } }
    ] });
    return result.values[0];
  }

  async function updateProjectAndPutSegments(project, segments = []) {
    if (!project?.id) throw new Error("Project metadata is required for segment import.");
    const result = await commitMutation(null, null, { rebaseLocal: true, changes: [
      { store: "projects", value: project }, ...segments.map((value) => ({ store: "segments", value }))
    ] });
    return { project: result.values[0], segments: result.values.slice(1) };
  }

  async function recordActivityEvent(activity = {}) {
    if (!activity?.type) return null;
    const event = localActivityEventRecord(activity);
    return await put("activityEvents", event);
  }

  async function listActivityEvents(projectId) {
    const events = projectId
      ? await getAllByIndex("activityEvents", "projectId", projectId)
      : await getAll("activityEvents");
    return events.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
  }

  async function exportProjectSnapshot(projectId) {
    await mutationTail;
    const db = await openDatabase();
    const tx = db.transaction([...AUTHORITATIVE_STORES, "appMeta"], "readonly");
    const done = txDone(tx);
    const project = await requestToPromise(tx.objectStore("projects").get(projectId));
    if (!project) { await done; throw new Error("Project no longer exists. Export canceled."); }
    const pair = `${project.sourceLang}::${project.targetLang}`;
    const linkedResourceIds = new Set(
      (Array.isArray(project.resourceLinks) ? project.resourceLinks : []).map((link) => link.resourceId).filter(Boolean)
    );
    const [segments, allResources, allTmEntries, allTerms, allConcepts, allDesignations, contributions, activityEvents, generation] = await Promise.all([
      requestToPromise(tx.objectStore("segments").index("projectId").getAll(projectId)),
      requestToPromise(tx.objectStore("resources").getAll()),
      requestToPromise(tx.objectStore("tmEntries").index("languagePair").getAll(pair)),
      requestToPromise(tx.objectStore("terms").index("languagePair").getAll(pair)),
      requestToPromise(tx.objectStore("termConcepts").getAll()),
      requestToPromise(tx.objectStore("termDesignations").getAll()),
      requestToPromise(tx.objectStore("tmContributions").index("projectId").getAll(projectId)),
      requestToPromise(tx.objectStore("activityEvents").index("projectId").getAll(projectId)),
      requestToPromise(tx.objectStore("appMeta").get("committed-generation"))
    ]);
    await done;
    const legacyTmNames = new Set(
      (project.resourceLinks || []).filter((link) => link.type === "tm").map((link) => link.name || link.cachedName)
    );
    const legacyTbNames = new Set(
      (project.resourceLinks || []).filter((link) => link.type === "termbase").map((link) => link.name || link.cachedName)
    );
    const resources = allResources.filter((resource) => linkedResourceIds.has(resource.id));
    const tmEntries = allTmEntries.filter(
      (entry) => linkedResourceIds.has(entry.resourceId) || legacyTmNames.has(entry.tmName)
    );
    const terms = allTerms.filter(
      (term) => linkedResourceIds.has(term.resourceId) || legacyTbNames.has(term.termBaseName)
    );
    const termConcepts = allConcepts.filter((concept) => linkedResourceIds.has(concept.resourceId));
    const conceptIds = new Set(termConcepts.map((concept) => concept.id));
    const termDesignations = allDesignations.filter(
      (designation) => conceptIds.has(designation.conceptId) || linkedResourceIds.has(designation.resourceId)
    );
    return {
      project,
      segments,
      resources,
      tmEntries,
      tmContributions: contributions,
      terms,
      termConcepts,
      termDesignations,
      activityEvents,
      generation: generation?.value || 0
    };
  }

  async function exportAllData() {
    const db = await openDatabase();
    const tx = db.transaction(AUTHORITATIVE_STORES, "readonly");
    const done = txDone(tx);
    const values = await Promise.all(AUTHORITATIVE_STORES.map((name) => requestToPromise(tx.objectStore(name).getAll())));
    await done;
    const portableContext = createPortableSanitizerContext();
    const records = Object.fromEntries(AUTHORITATIVE_STORES.map((name, index) => [name, values[index]]));
    return {
      app: APP_NAME,
      version: 2,
      schemaVersion: BACKUP_SCHEMA_VERSION,
      exportedAt: new Date().toISOString(),
      ...Object.fromEntries(
        AUTHORITATIVE_STORES.map((name) => [name, sanitizePortableValue(records[name], "", [], portableContext)])
      )
    };
  }

  async function importAllData(data, { prepareOnly = false } = {}) {
    if (!data || ![APP_NAME, LEGACY_APP_NAME].includes(data.app)) throw new Error("This is not a LoopCAT backup file.");
    const schemaVersion = Number(data.schemaVersion);
    if (Number.isFinite(schemaVersion) && schemaVersion > BACKUP_SCHEMA_VERSION) {
      throw new Error(
        `Backup schema version ${schemaVersion} is newer than this LoopCAT build supports. Update LoopCAT before restoring this backup.`
      );
    }
    const portableContext = createPortableSanitizerContext();
    const resources = portableRecordArray(data.resources || [], "Resources", portableContext);
    const tmEntries = portableRecordArray(data.tmEntries, "Translation memory entries", portableContext);
    const tmContributions = portableRecordArray(data.tmContributions || [], "TM contributions", portableContext);
    const projects = portableRecordArray(data.projects, "Projects", portableContext);
    const segments = portableRecordArray(data.segments, "Segments", portableContext);
    const terms = portableRecordArray(data.terms, "Termbase entries", portableContext);
    const termConcepts = portableRecordArray(data.termConcepts || [], "Term concepts", portableContext);
    const termDesignations = portableRecordArray(data.termDesignations || [], "Term designations", portableContext);
    const activityEvents = portableRecordArray(data.activityEvents, "Activity events", portableContext);
    const trashEntries = portableRecordArray(data.trashEntries || [], "Trash entries", portableContext);
    assertUniqueRecordIds(resources, "Resources");
    assertUniqueRecordIds(projects, "Projects");
    assertUniqueRecordIds(segments, "Segments");
    assertUniqueRecordIds(tmEntries, "Translation memory entries");
    assertUniqueRecordIds(tmContributions, "TM contributions");
    assertUniqueRecordIds(terms, "Termbase entries");
    assertUniqueRecordIds(termConcepts, "Term concepts");
    assertUniqueRecordIds(termDesignations, "Term designations");
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
      return !key.startsWith(TM_INDEX_META_PREFIX) &&
        !key.startsWith(TERM_INDEX_META_PREFIX) &&
        key !== "resources-v2-migration";
    });
    const now = new Date().toISOString();
    const records = {
      projects,
      segments,
      resources,
      tmEntries,
      tmContributions,
      terms,
      termConcepts,
      termDesignations,
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
    };
    if (prepareOnly) return records;
    await replaceStoresAtomically(records);
    await ensureResourceMigration(await openDatabase());
  }

  async function* stagingRows(id, prefix = "record") {
    const db = await openDatabase();
    let after = id + ":" + prefix + ":";
    const upper = after + "\uffff";
    while (true) {
      const tx = db.transaction("restoreStaging", "readonly");
      const rows = await requestToPromise(tx.objectStore("restoreStaging").getAll(IDBKeyRange.bound(after, upper, true), 50));
      if (!rows.length) return;
      for (const row of rows) yield row;
      after = rows.at(-1).id;
    }
  }

  async function stageBackupRecords(read) {
    const locks = globalThis.navigator?.locks;
    if (!locks) return stageBackupRecordsUnlocked(read);
    // A killed archive worker releases this lock. Sweep only unfinished jobs,
    // and only while no other tab/worker is currently staging a backup.
    await locks.request("loopcat-restore-staging", { ifAvailable: true }, async (lock) => {
      if (!lock) return;
      const db = await openDatabase();
      const tx = strictTransaction(db, ["restoreStaging"]);
      const done = txDone(tx);
      const store = tx.objectStore("restoreStaging");
      const request = store.openCursor(IDBKeyRange.bound("archive-stage-", "archive-stage-\uffff"));
      request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor) return;
        const id = String(cursor.key).split(":")[0];
        if (cursor.key === id && cursor.value.inProgress && !cursor.value.journalPinned) {
          cursor.delete();
          store.delete(IDBKeyRange.bound(id + ":", id + ":\uffff"));
        }
        cursor.continue(id + ":\uffff");
      };
      await done;
    });
    return locks.request("loopcat-restore-staging", { mode: "shared" }, () => stageBackupRecordsUnlocked(read));
  }

  async function stageBackupRecordsUnlocked(read) {
    const id = makeId("archive-stage");
    const context = createPortableSanitizerContext();
    const counts = Object.fromEntries(AUTHORITATIVE_STORES.map((store) => [store, 0]));
    const projects = [];
    let metadata;
    let totalBytes = 0;
    const capacity = await globalThis.navigator?.storage?.estimate?.();
    const freeBytes = capacity?.quota ? Math.max(0, capacity.quota - capacity.usage) : Infinity;
    const db = await openDatabase();
    await put("restoreStaging", { id, inProgress: true, createdAt: new Date().toISOString() });
    try {
    await read(async ({ store, value }) => {
      if (store === "metadata") {
        if (metadata || ![APP_NAME, LEGACY_APP_NAME].includes(value?.app) || !Number.isInteger(value.schemaVersion) || value.schemaVersion > BACKUP_SCHEMA_VERSION || value.schemaVersion < 1) throw new Error("Unsupported or duplicate backup metadata.");
        metadata = value;
        return;
      }
      if (!metadata || !AUTHORITATIVE_STORES.includes(store)) throw new Error("Backup metadata must precede its records.");
      const record = portableRecordArray([value], store, context)[0];
      assertUniqueRecordIds([record], store);
      if (store === "projects") {
        projectDocumentIdMap([record], "backup");
        assertProjectResourceLinks([record], "backup");
        projects.push({ id: record.id, name: record.name, documents: (record.documents || []).map((document) => ({ id: document.id })) });
      }
      const blob = new Blob([JSON.stringify(record)]);
      totalBytes += blob.size;
      if (totalBytes > 32 * 1024 * 1024 * 1024 || totalBytes * 3 > freeBytes) throw new Error("Insufficient staging capacity for this backup and a rollback copy.");
      const tx = strictTransaction(db, ["restoreStaging"]);
      const done = txDone(tx);
      tx.objectStore("restoreStaging").add({ id: id + ":record:" + store + ":" + JSON.stringify(record.id), store, value: record });
      await done;
      counts[store]++;
    });
    if (!metadata) throw new Error("Backup metadata is missing.");
    const projectMap = new Map(projects.map((project) => [project.id, project]));
    const hashes = [];
    for await (const row of stagingRows(id)) {
      const value = row.value;
      if (["segments", "activityEvents"].includes(row.store)) {
        const project = projectMap.get(value.projectId);
        if (value.projectId && !project) throw new Error("A staged record refers to a missing project.");
        if (row.store === "segments") {
          assertSegmentsBelongToRestoredProjects([value], project ? [project] : []);
          if (project) assertSegmentsBelongToProjectDocuments([value], [project], "backup");
        }
      }
      hashes.push(await digestBlob(new Blob([JSON.stringify([row.store, row.value])])));
    }
    const header = { id, format: 2, verified: true, projects, counts, bytes: totalBytes, metadata,
      digest: await digestBlob(new Blob(hashes)), createdAt: new Date().toISOString() };
    await put("restoreStaging", header);
    return { archiveStagingId: id, app: APP_NAME, schemaVersion: BACKUP_SCHEMA_VERSION, projects, counts,
      validation: { ok: true, errors: [], warnings: [], preserved: ["Archive integrity and record relationships verified."], simplified: [], skipped: [], risky: [] } };
    } catch (error) {
      await removeStaging(id).catch(() => {});
      throw error;
    }
  }

  async function stageCheckpoint(id) {
    return await stageBackupRecords(async (accept) => {
      await accept({ store: "metadata", value: { app: APP_NAME, schemaVersion: BACKUP_SCHEMA_VERSION } });
      for await (const record of checkpointRecords(id, { portable: true })) await accept(record);
    });
  }

  async function prepareJournalBase() {
    const checkpoints = (await getAll("checkpoints")).filter((item) => item.verified).sort((a, b) => b.generation - a.generation);
    if (!checkpoints.length) return null;
    for (const checkpoint of checkpoints) {
      const id = makeId("journal-base");
      await put("restoreStaging", { id, inProgress: true, createdAt: new Date().toISOString() });
      try {
        for await (const record of checkpointRecords(checkpoint.id)) {
          await put("restoreStaging", { id: id + ":record:" + record.store + ":" + JSON.stringify(record.value.id), ...record });
        }
        return { id, generation: checkpoint.generation };
      } catch { await removeStaging(id); }
    }
    throw new Error("Recovery checkpoints failed verification. Current records were preserved; restore a verified external backup.");
  }

  async function removeStaging(id) {
    const db = await openDatabase();
    const tx = strictTransaction(db, ["restoreStaging"]);
    const done = txDone(tx);
    tx.objectStore("restoreStaging").delete(id);
    tx.objectStore("restoreStaging").delete(IDBKeyRange.bound(id + ":", id + ":\uffff"));
    await done;
  }

  async function replayCommittedJournal() {
    return await withWorkspaceBarrier(async ({ token }) => {
      const base = window.document && window.CatHan?.archive?.prepareJournalBase
        ? await window.CatHan.archive.prepareJournalBase() : await prepareJournalBase();
      const db = await openDatabase();
      const tx = strictTransaction(db, [...AUTHORITATIVE_STORES, "journal", "appMeta", "restoreStaging", "ownershipLeases"]);
      const done = txDone(tx);
      let repaired = 0;
      try {
        const lease = await requestToPromise(tx.objectStore("ownershipLeases").get("workspace"));
        if (lease?.owner !== writerId || lease.token !== token) throw new Error("Recovery ownership was lost.");
        async function applyChange(change, generation) {
          if (!AUTHORITATIVE_STORES.includes(change.store)) throw new Error("Journal contains an unsupported store.");
          const store = tx.objectStore(change.store);
          const current = await requestToPromise(store.get(change.key));
          if (current && Number(current.storageGeneration || 0) >= generation) return;
          if (change.after) store.put({ ...change.after, storageVersion: change.after.storageVersion || generation, storageGeneration: generation });
          else if (current) store.delete(change.key);
          repaired++;
        }
        if (base) {
          for (const name of AUTHORITATIVE_STORES) await deleteWhereInStore(tx.objectStore(name), (value) => Number(value.storageGeneration || 0) <= base.generation);
          await new Promise((resolve, reject) => {
            const rows = tx.objectStore("restoreStaging").openCursor(IDBKeyRange.bound(base.id + ":record:", base.id + ":record:\uffff"));
            rows.onerror = () => reject(rows.error);
            rows.onsuccess = () => {
              const row = rows.result;
              if (!row) { resolve(undefined); return; }
              applyChange({ store: row.value.store, key: row.value.value.id, after: row.value.value }, Number(row.value.value.storageGeneration || 0)).then(() => row.continue(), reject);
            };
          });
        }
        await new Promise((resolve, reject) => {
          const request = tx.objectStore("journal").index("generation").openCursor();
          request.onerror = () => reject(request.error);
          request.onsuccess = () => {
            const cursor = request.result;
            if (!cursor) { resolve(undefined); return; }
            const entry = cursor.value;
            if (base && entry.generation <= base.generation) { cursor.continue(); return; }
            const apply = async () => {
              if (!Number.isSafeInteger(entry.generation) || entry.generation < 1) throw new Error("Journal generation is invalid.");
              if (entry.type === "restore" && entry.restoreStageId) {
                const staged = await requestToPromise(tx.objectStore("restoreStaging").get(entry.restoreStageId));
                if (!staged?.journalPinned) throw new Error("The journal needs a retained restore checkpoint.");
                if (entry.mode === "replace") for (const name of AUTHORITATIVE_STORES) {
                  await deleteWhereInStore(tx.objectStore(name), (value) => Number(value.storageGeneration || 0) <= entry.generation);
                }
                await new Promise((finish, fail) => {
                  const rows = tx.objectStore("restoreStaging").openCursor(IDBKeyRange.bound(staged.id + ":record:", staged.id + ":record:\uffff"));
                  rows.onerror = () => fail(rows.error);
                  rows.onsuccess = () => {
                    const row = rows.result;
                    if (!row) { finish(undefined); return; }
                    applyChange({ store: row.value.store, key: row.value.value.id, after: row.value.value }, entry.generation).then(() => row.continue(), fail);
                  };
                });
              } else for (const change of entry.changes || []) await applyChange(change, entry.generation);
              cursor.continue();
            };
            apply().catch(reject);
          };
        });
        await done;
        if (base) await removeStaging(base.id).catch(() => {});
        knownVersions.clear();
        return { repaired };
      } catch (error) { try { tx.abort(); } catch { /* Preserve the recovery error. */ } await done.catch(() => {}); throw error; }
    });
  }

  async function prepareStagedRestore(data, mode) {
    const original = await get("restoreStaging", data.archiveStagingId);
    if (!original?.verified || original.format !== 2) throw new Error("Restore staging is missing or unverified.");
    const id = makeId("restore-plan");
    const ids = new Map();
    const namespace = makeId("copy");
    const hashes = [];
    for await (const row of stagingRows(original.id)) {
      ids.set(row.value.id, namespace + ":" + row.value.id);
      hashes.push(await digestBlob(new Blob([JSON.stringify([row.store, row.value])])));
    }
    if (await digestBlob(new Blob(hashes)) !== original.digest) throw new Error("Restore staging integrity check failed.");
    function remap(value, key = "", path = []) {
      if (isSourceJsonPath(path)) return value;
      if (typeof value === "string") {
        if (((key === "id" && path.length === 1) || /^(projectId|segmentId|segmentIds|ownerProjectId|tmEntryId|termId|resourceId|activeTermBaseId|conceptId|designationId|contributionId|parentSegmentId|linkedSegmentId)$/.test(key)) && ids.has(value)) return ids.get(value);
        if (/^(tmName|mainTmName|tmNames|termBaseName|termBaseNames)$/.test(key)) return value + " (restored " + namespace.slice(-8) + ")";
        return value;
      }
      if (Array.isArray(value)) return value.map((item) => remap(item, key, path));
      if (!value || typeof value !== "object") return value;
      const result = {};
      for (const [name, item] of Object.entries(value)) {
        if (["storageVersion", "storageWriter", "storageGeneration"].includes(name)) continue;
        let next = remap(item, name, [...path, name]);
        if (name === "name" && (path.includes("resourceLinks") || path.length === 0) && ["tm", "termbase"].includes(value.type)) next += " (restored " + namespace.slice(-8) + ")";
        if (name === "cachedName" && path.includes("resourceLinks") && ["tm", "termbase"].includes(value.type)) next += " (restored " + namespace.slice(-8) + ")";
        Object.defineProperty(result, name, { value: next, enumerable: true, configurable: true, writable: true });
      }
      return result;
    }
    const readyHashes = [];
    const projects = [];
    for await (const row of stagingRows(original.id)) {
      const value = mode === "copy" ? remap(row.value) : row.value;
      if (row.store === "projects") {
        if (mode === "copy") value.name += " (restored copy)";
        projects.push({ id: value.id, name: value.name });
      }
      await put("restoreStaging", { id: id + ":record:" + row.store + ":" + JSON.stringify(value.id), store: row.store, value });
      readyHashes.push(await digestBlob(new Blob([JSON.stringify([row.store, value])])));
    }
    const header = { id, format: 2, mode, verified: true, projects, counts: original.counts,
      digest: await digestBlob(new Blob(readyHashes)), sourceStageId: original.id, createdAt: new Date().toISOString() };
    await put("restoreStaging", header);
    return { id, mode, projects, affectedProjects: (await getAll("projects")).map((project) => ({ id: project.id, name: project.name })) };
  }

  async function commitStagedRestore(plan) {
    return await withWorkspaceBarrier(async ({ token }) => {
      const staged = await get("restoreStaging", plan.id);
      if (!staged?.verified || staged.format !== 2) throw new Error("Restore staging is missing or unverified.");
      const hashes = [];
      for await (const row of stagingRows(staged.id)) hashes.push(await digestBlob(new Blob([JSON.stringify([row.store, row.value])])));
      if (await digestBlob(new Blob(hashes)) !== staged.digest) throw new Error("Prepared restore integrity check failed.");
      const rollback = staged.mode === "replace" ? await createCheckpoint("pre-restore") : null;
      const db = await openDatabase();
      const tx = strictTransaction(db, [...AUTHORITATIVE_STORES, "restoreStaging", "appMeta", "journal", "ownershipLeases", "tmTokenIndex", "termTokenIndex"]);
      const done = txDone(tx);
      let generation;
      try {
        const lease = await requestToPromise(tx.objectStore("ownershipLeases").get("workspace"));
        if (lease?.owner !== writerId || lease.token !== token || lease.expiresAt <= Date.now()) throw new Error("Restore ownership expired. No records were replaced.");
        const meta = tx.objectStore("appMeta");
        generation = (Number((await requestToPromise(meta.get("committed-generation")))?.value) || 0) + 1;
        if (staged.mode === "replace") AUTHORITATIVE_STORES.forEach((store) => tx.objectStore(store).clear());
        tx.objectStore("tmTokenIndex").clear();
        tx.objectStore("termTokenIndex").clear();
        await new Promise((resolve, reject) => {
          const cursor = tx.objectStore("restoreStaging").openCursor(IDBKeyRange.bound(staged.id + ":record:", staged.id + ":record:\uffff"));
          cursor.onerror = () => reject(cursor.error);
          cursor.onsuccess = () => {
            const row = cursor.result;
            if (!row) { resolve(undefined); return; }
            const record = row.value;
            const next = { ...record.value, storageVersion: generation, storageWriter: writerId, storageGeneration: generation };
            tx.objectStore(record.store).add(next);
            if (["tmEntries", "terms"].includes(record.store)) {
              const languagePair = languagePairOf(next);
              const prefix = record.store === "tmEntries" ? TM_INDEX_META_PREFIX : TERM_INDEX_META_PREFIX;
              meta.put({ key: prefix + languagePair, languagePair, dirty: true, updatedAt: new Date().toISOString() });
            }
            row.continue();
          };
        });
        for (const project of staged.projects) meta.put({ key: "project-generation:" + project.id, value: generation });
        meta.put({ key: "committed-generation", value: generation });
        tx.objectStore("journal").put({ id: makeId("restore"), generation, createdAt: new Date().toISOString(), type: "restore",
          mode: staged.mode, restoreStageId: staged.id, rollbackCheckpoint: rollback?.id || null });
        tx.objectStore("restoreStaging").put({ ...staged, journalPinned: true });
        await done;
      } catch (error) { try { tx.abort(); } catch { /* Preserve original error. */ } await done.catch(() => {}); throw error; }
      knownVersions.clear();
      window.dispatchEvent?.(new CustomEvent("loopcat-committed", { detail: { generation, projectIds: staged.projects.map((project) => project.id), checkpointNow: true } }));
      return { mode: staged.mode, projectIds: staged.projects.map((project) => project.id), rollbackCheckpoint: rollback?.id || null };
    });
  }

  async function prepareRestore(data, { mode = "copy" } = {}) {
    if (!["copy", "replace"].includes(mode)) throw new Error("Choose import as copies or full replacement.");
    if (data.archiveStagingId) return window.document && window.CatHan?.archive?.prepareRestore
      ? window.CatHan.archive.prepareRestore(data, mode) : prepareStagedRestore(data, mode);
    const records = await importAllData(data, { prepareOnly: true });
    const blob = new Blob([JSON.stringify(records)], { type: "application/json" });
    const estimate = await globalThis.navigator?.storage?.estimate?.();
    if (estimate?.quota && estimate.quota - estimate.usage < blob.size * 3) throw new Error("Insufficient storage for staging, replacement and rollback. Free space or import into a fresh profile.");
    const plan = { id: makeId("restore-plan"), mode, digest: await digestBlob(blob), blob,
      projects: records.projects.map((project) => ({ id: project.id, name: project.name })),
      affectedProjects: (await getAll("projects")).map((project) => ({ id: project.id, name: project.name })) };
    await put("restoreStaging", plan);
    return { id: plan.id, mode, projects: plan.projects, affectedProjects: plan.affectedProjects };
  }

  async function commitRestore(plan) {
    const staged = await get("restoreStaging", plan.id);
    if (staged?.format === 2) return commitStagedRestore(plan);
    if (!staged || await digestBlob(staged.blob) !== staged.digest) throw new Error("Restore staging is missing or damaged. Select the backup again.");
    let records = JSON.parse(await staged.blob.text());
    if (staged.mode === "copy") {
      const ids = new Map(AUTHORITATIVE_STORES.flatMap((store) => records[store].map((record) => [record.id, makeId(store)])));
      const suffix = " (restored " + makeId("copy").slice(-8) + ")";
      const remap = (value, key = "", path = []) => {
        if (isSourceJsonPath(path)) return value;
        if (typeof value === "string") {
          if (((key === "id" && path.length === 1) || /^(projectId|segmentId|segmentIds|ownerProjectId|tmEntryId|termId|resourceId|activeTermBaseId|conceptId|designationId|contributionId|parentSegmentId|linkedSegmentId)$/.test(key)) && ids.has(value)) return ids.get(value);
          if (/^(tmName|mainTmName|tmNames|termBaseName|termBaseNames)$/.test(key)) return value + suffix;
          return value;
        }
        if (Array.isArray(value)) return value.map((item) => remap(item, key, path));
        if (!value || typeof value !== "object") return value;
        return Object.fromEntries(Object.entries(value).filter(([name]) => !["storageVersion", "storageWriter", "storageGeneration"].includes(name))
          .map(([name, item]) => [name,
            ((name === "name" && (path.includes("resourceLinks") || path.length === 0)) ||
              (name === "cachedName" && path.includes("resourceLinks"))) && ["tm", "termbase"].includes(value.type)
              ? item + suffix
              : remap(item, name, [...path, name])
          ]));
      };
      for (const store of AUTHORITATIVE_STORES) records[store] = records[store].map((record) => remap(record));
      records.projects.forEach((project) => { project.name = `${project.name} (restored copy)`; });
      await writeStoresAtomically(Object.fromEntries(AUTHORITATIVE_STORES.map((store) => [store, records[store]])));
    } else await replaceStoresAtomically(records);
    await deleteByKey("restoreStaging", plan.id).catch(() => {});
    return { mode: staged.mode, projectIds: records.projects.map((project) => project.id) };
  }

  window.CatHan = window.CatHan || {};
  window.CatHan.storage = {
    openDatabase,
    commitMutation,
    acquireProject,
    releaseProject,
    renewProject,
    withWorkspaceBarrier,
    createCheckpoint,
    checkpointRecords,
    migrateCheckpointAssets,
    checkpointArchiveSource,
    createArchiveExport,
    flushMutations: () => mutationTail,
    prepareRestore,
    stageBackupRecords,
    stageCheckpoint,
    replayCommittedJournal,
    prepareJournalBase,
    commitRestore,
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
    exportProjectSnapshot,
    importAllData
  };
})();
