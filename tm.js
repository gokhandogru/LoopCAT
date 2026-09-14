(() => {
const { bulkPut, commitMutation, countByIndex, deleteByKey, deleteStoresWhereAtomically, deleteWhere, get, getMany, getAll, getAllByIndex, getAllByIndexMany, makeId, put, constants } = window.CatHan.storage;
const LOCAL_WORKSPACE_ID = constants?.LOCAL_WORKSPACE_ID || "local-workspace";
const LOCAL_USER_ID = constants?.LOCAL_USER_ID || "local-user";
const TM_INDEX_META_PREFIX = "tm-token-index:";
const MAX_INDEX_TOKENS = 24;
const MAX_INDEX_CANDIDATES = 600;
const RESOURCE_IMPORT_CHUNK_SIZE = 1000;
const SENSITIVE_TEXT_VALUE_PATTERN = /(sk-[A-Za-z0-9_-]{8,}|Bearer\s+[A-Za-z0-9._~+/=-]{8,}|gh[pousr]_[A-Za-z0-9_]{8,}|npm_[A-Za-z0-9_]{8,}|(?:session|cookie)[=:][A-Za-z0-9._~+/=-]{8,})/i;
let tmSignatureIndexAvailable = true;
let confirmationTail = Promise.resolve();

function redactSensitiveText(value) {
  return String(value || "").replace(new RegExp(SENSITIVE_TEXT_VALUE_PATTERN.source, "gi"), "[redacted secret]");
}

function cleanText(value) {
  return String(value ?? "").trim();
}

function cleanPortableLabel(value) {
  return redactSensitiveText(cleanText(value)).trim();
}

function requiredText(value, message) {
  const text = cleanText(value);
  if (!text) throw new Error(message);
  return text;
}

function requiredPortableLabel(value, message) {
  const text = cleanPortableLabel(value);
  if (!text) throw new Error(message);
  return text;
}

function normalizeText(text) {
  return String(text ?? "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokens(text) {
  return tokensFromNormalized(normalizeText(text));
}

function tokensFromNormalized(text) {
  return Array.from(new Set(String(text || "").split(" ").filter((token) => token.length > 2)));
}

function tokenSignature(text) {
  return tokens(text).slice(0, MAX_INDEX_TOKENS).join("|");
}

function tokenOverlap(source, candidate) {
  return tokenOverlapTokens(tokens(source), tokens(candidate));
}

function tokenOverlapTokens(sourceTokens, candidateTokens) {
  const a = sourceTokens;
  const b = new Set(candidateTokens);
  if (!a.length || !b.size) return 0;
  return a.filter((token) => b.has(token)).length / Math.max(a.length, b.size);
}

function memoryKey(entry = {}) {
  return [
    languagePairOf(entry),
    entry.resourceId || entry.tmName || "",
    normalizeText(entry.source),
    normalizeText(entry.target)
  ].join("::");
}

function languagePairOf(entry = {}) {
  return cleanPortableLabel(entry.languagePair) || languagePairFromFields(entry.sourceLang, entry.targetLang);
}

function languagePairFromFields(sourceLang, targetLang) {
  const source = cleanPortableLabel(sourceLang);
  const target = cleanPortableLabel(targetLang);
  return source && target ? `${source}::${target}` : "";
}

function tmEntryRecord(entry = {}, { existing = null, requireId = false, preserveUpdatedAt = false } = {}) {
  const now = new Date().toISOString();
  const source = requiredText(entry.source, "TM source text is required.");
  const target = requiredText(entry.target, "TM target text is required.");
  const sourceLang = requiredPortableLabel(entry.sourceLang, "TM source language is required.");
  const targetLang = requiredPortableLabel(entry.targetLang, "TM target language is required.");
  const tmName = requiredPortableLabel(entry.tmName, "TM name is required.");
  const id = existing?.id || cleanText(entry.id) || (requireId ? "" : makeId("tm"));
  if (!id) throw new Error("TM entry ID is required.");
  return {
    ...entry,
    ...(existing ? { storageVersion: existing.storageVersion || 0 } : {}),
    id,
    workspaceId: cleanText(entry.workspaceId) || existing?.workspaceId || LOCAL_WORKSPACE_ID,
    ownerId: cleanText(entry.ownerId) || existing?.ownerId || LOCAL_USER_ID,
    source,
    target,
    sourceLang,
    targetLang,
    languagePair: `${sourceLang}::${targetLang}`,
    projectName: redactSensitiveText(entry.projectName || "").trim(),
    domain: redactSensitiveText(entry.domain || existing?.domain || "").trim(),
    tmName,
    resourceId: cleanText(entry.resourceId) || existing?.resourceId || "",
    normalizedSource: normalizeText(source),
    normalizedTarget: normalizeText(target),
    isSeeded: entry.isSeeded === undefined ? existing?.isSeeded !== false : Boolean(entry.isSeeded),
    signature: tokenSignature(source),
    createdBy: cleanText(entry.createdBy) || existing?.createdBy || LOCAL_USER_ID,
    updatedBy: LOCAL_USER_ID,
    createdAt: existing?.createdAt || cleanText(entry.createdAt) || now,
    updatedAt: preserveUpdatedAt ? cleanText(entry.updatedAt) || now : now
  };
}

function tmIndexMetaKey(languagePair) {
  return `${TM_INDEX_META_PREFIX}${languagePair}`;
}

function entryTokens(entry) {
  return tokens(entry.source).slice(0, MAX_INDEX_TOKENS);
}

function indexRecordsForEntry(entry) {
  const languagePair = languagePairOf(entry);
  if (!languagePair) return [];
  return entryTokens(entry).map((token) => ({
    id: `${entry.id}::${token}`,
    tmEntryId: entry.id,
    resourceId: entry.resourceId || "",
    languagePair,
    tmName: entry.tmName || "",
    token,
    updatedAt: entry.updatedAt || entry.createdAt || new Date().toISOString()
  }));
}

function latestEntryTimestamp(entries) {
  return (entries || []).reduce((latest, entry) => {
    const value = entry.updatedAt || entry.createdAt || "";
    return value > latest ? value : latest;
  }, "");
}

async function writeIndexMeta(languagePair, entries) {
  await put("appMeta", {
    key: tmIndexMetaKey(languagePair),
    languagePair,
    entryCount: entries.length,
    latestEntryUpdatedAt: latestEntryTimestamp(entries),
    dirty: false,
    updatedAt: new Date().toISOString()
  });
}

async function writeIndexMetaClean(languagePair) {
  if (!languagePair) return;
  const existing = await get("appMeta", tmIndexMetaKey(languagePair));
  await put("appMeta", {
    ...(existing || {}),
    key: tmIndexMetaKey(languagePair),
    languagePair,
    dirty: false,
    updatedAt: new Date().toISOString()
  });
}

async function bulkPutInChunks(storeName, records, options = {}) {
  const chunkSize = Math.max(100, Number(options.chunkSize || RESOURCE_IMPORT_CHUNK_SIZE));
  let saved = 0;
  for (let index = 0; index < records.length; index += chunkSize) {
    const chunk = records.slice(index, index + chunkSize);
    if (chunk.length) await bulkPut(storeName, chunk);
    saved += chunk.length;
    if (typeof options.onProgress === "function") {
      await options.onProgress({ saved, total: records.length, chunkSize: chunk.length, storeName });
    }
  }
  return saved;
}

async function markTmIndexDirty(languagePair) {
  await put("appMeta", {
    key: tmIndexMetaKey(languagePair),
    languagePair,
    dirty: true,
    updatedAt: new Date().toISOString()
  });
}

async function rebuildTmIndex(languagePair, entries = null, options = {}) {
  const sourceEntries = entries || await getAllByIndex("tmEntries", "languagePair", languagePair);
  await deleteWhere("tmTokenIndex", (record) => record.languagePair === languagePair);
  const records = sourceEntries.flatMap(indexRecordsForEntry);
  if (records.length) {
    await bulkPutInChunks("tmTokenIndex", records, {
      chunkSize: options.chunkSize,
      onProgress: options.onProgress
    });
  }
  await writeIndexMeta(languagePair, sourceEntries);
  return sourceEntries.length;
}

async function rebuildAllTmIndexes(options = {}) {
  const entries = await getAll("tmEntries");
  const byPair = new Map();
  entries.forEach((entry) => {
    const languagePair = languagePairOf(entry);
    if (!languagePair) return;
    if (!byPair.has(languagePair)) byPair.set(languagePair, []);
    byPair.get(languagePair).push(entry);
  });
  await deleteWhere("tmTokenIndex", () => true);
  for (const [languagePair, pairEntries] of byPair) {
    const records = pairEntries.flatMap(indexRecordsForEntry);
    if (records.length) {
      await bulkPutInChunks("tmTokenIndex", records, {
        chunkSize: options.chunkSize,
        onProgress: options.onProgress
      });
    }
    await writeIndexMeta(languagePair, pairEntries);
  }
  return entries.length;
}

async function ensureTmIndex(languagePair) {
  const meta = await get("appMeta", tmIndexMetaKey(languagePair));
  if (meta && !meta.dirty) return;
  await rebuildTmIndex(languagePair);
}

async function putTmIndexRecords(entries) {
  const records = (entries || []).flatMap(indexRecordsForEntry);
  if (records.length) await bulkPut("tmTokenIndex", records);
}

function levenshtein(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  const curr = new Array(b.length + 1);
  for (let i = 1; i <= a.length; i += 1) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    for (let j = 0; j <= b.length; j += 1) prev[j] = curr[j];
  }
  return prev[b.length];
}

function similarity(source, candidate) {
  const a = normalizeText(source);
  const b = normalizeText(candidate);
  return similarityNormalized(a, b);
}

function similarityNormalized(a, b) {
  if (!a && !b) return 100;
  if (!a || !b) return 0;
  const max = Math.max(a.length, b.length);
  return Math.max(0, Math.round((1 - levenshtein(a, b) / max) * 100));
}

function orderedTokenSimilarity(aTokens, bTokens) {
  if (!aTokens.length || !bTokens.length) return 0;
  let cursor = 0;
  let inOrder = 0;
  for (const token of aTokens) {
    const index = bTokens.indexOf(token, cursor);
    if (index < 0) continue;
    inOrder += 1;
    cursor = index + 1;
  }
  return inOrder / Math.max(aTokens.length, bTokens.length);
}

function sourceDifferences(source, candidate) {
  const sourceTokens = String(source || "").match(/[\p{L}\p{N}]+|[^\p{L}\p{N}\s]+/gu) || [];
  const candidateTokens = String(candidate || "").match(/[\p{L}\p{N}]+|[^\p{L}\p{N}\s]+/gu) || [];
  const maximum = Math.max(sourceTokens.length, candidateTokens.length);
  const differences = [];
  for (let index = 0; index < maximum; index += 1) {
    if (sourceTokens[index] === candidateTokens[index]) continue;
    differences.push({ index, source: sourceTokens[index] || "", candidate: candidateTokens[index] || "" });
  }
  return differences;
}

function adaptableParts(value) {
  const pattern = /(?:\{\{?[\p{L}\p{N}_.-]+\}?\}|%\d*\$?[sdif]|<\/?[\p{L}][^>]*>|[-+]?\d+(?:[.,]\d+)*)/gu;
  const parts = [];
  const skeleton = String(value || "").replace(pattern, (text) => {
    const type = /^[-+]?\d/.test(text) ? "number" : "placeholder";
    parts.push({ text, type });
    return ` ${type.toUpperCase()} `;
  });
  return { parts, skeleton: normalizeText(skeleton) };
}

function adaptedMatch(source, entry) {
  const current = adaptableParts(source);
  const remembered = adaptableParts(entry.source);
  if (!current.parts.length || current.skeleton !== remembered.skeleton || current.parts.length !== remembered.parts.length) return null;
  if (current.parts.some((part, index) => part.type !== remembered.parts[index]?.type)) return null;
  let target = String(entry.target || "");
  const replacements = [];
  remembered.parts.forEach((part, index) => {
    const replacement = current.parts[index].text;
    if (part.text === replacement || !target.includes(part.text)) return;
    target = target.split(part.text).join(replacement);
    replacements.push({ from: part.text, to: replacement, type: part.type });
  });
  return replacements.length ? { target, replacements, safe: true } : null;
}

function contextMatches(entry, context = {}) {
  const previous = normalizeText(context.previousSource || "");
  const next = normalizeText(context.nextSource || "");
  const documentKey = cleanText(context.documentKey);
  const previousMatch = previous && previous === normalizeText(entry.previousSource || "");
  const nextMatch = next && next === normalizeText(entry.nextSource || "");
  const documentMatch = documentKey && documentKey === cleanText(entry.documentKey);
  return Boolean(documentMatch || previousMatch && nextMatch || previousMatch && !next || nextMatch && !previous);
}

function segmentDocumentKey(segment = {}, context = {}) {
  const explicit = cleanText(context.documentKey || segment.contextKey);
  if (explicit) return explicit;
  const documentName = cleanText(segment.documentName || segment.documentId);
  const stableIndex = Number.isFinite(Number(segment.index)) ? Number(segment.index) : -1;
  return documentName && stableIndex >= 0 ? `${documentName}#${stableIndex}` : documentName;
}

function resourceLinkMap(options = {}) {
  return new Map((options.resourceLinks || [])
    .filter((link) => link?.type === "tm" && link.lookup !== false)
    .map((link, index) => [link.resourceId || link.name, {
      ...link,
      priority: Number.isFinite(Number(link.priority)) ? Number(link.priority) : index,
      penalty: Math.max(0, Math.min(30, Math.round(Number(link.penalty) || 0)))
    }]));
}

async function matchingTmResourceId(input = {}) {
  if (cleanText(input.resourceId)) return cleanText(input.resourceId);
  const tmName = cleanPortableLabel(input.tmName);
  const languagePair = languagePairFromFields(input.sourceLang, input.targetLang);
  if (!tmName || !languagePair) return "";
  const matches = (await getAllByIndex("resources", "typeName", ["tm", tmName])).filter(
    (resource) => languagePairOf(resource) === languagePair
  );
  return matches.length === 1 ? matches[0].id : "";
}

async function saveTmEntry(input = {}) {
  const { source, target, sourceLang, targetLang, projectName, tmName } = input || {};
  const resourceId = await matchingTmResourceId(input);
  const candidate = tmEntryRecord({ source, target, sourceLang, targetLang, projectName, tmName, resourceId });
  const languagePair = candidate.languagePair;
  await ensureTmIndex(languagePair);
  let existingCandidates;
  if (tmSignatureIndexAvailable) {
    try {
      existingCandidates = await getAllByIndex("tmEntries", "signature", candidate.signature);
    } catch (error) {
      if (error?.name !== "NotFoundError") throw error;
      tmSignatureIndexAvailable = false;
    }
  }
  if (!existingCandidates) {
    existingCandidates = await getTmMatchCandidates({
      source: candidate.source,
      sourceLang: candidate.sourceLang,
      targetLang: candidate.targetLang,
      tmName: candidate.tmName
    });
  }
  const existing = existingCandidates.find((entry) =>
    languagePairOf(entry) === languagePair &&
    (candidate.resourceId ? entry.resourceId === candidate.resourceId : entry.tmName === candidate.tmName) &&
    normalizeText(entry.source) === normalizeText(candidate.source) &&
    normalizeText(entry.target) === normalizeText(candidate.target)
  );
  const entry = tmEntryRecord(candidate, { existing });
  Object.assign(entry, await put("tmEntries", entry));
  // An exact existing unit keeps the same language, resource, source, and token rows.
  // Rewriting those rows would turn every confirmation into a full index deletion scan.
  if (!existing) await putTmIndexRecords([entry]);
  if (entry.resourceId) {
    const resource = await get("resources", entry.resourceId);
    if (resource) await put("resources", { ...resource, updatedAt: entry.updatedAt });
  }
  await writeIndexMetaClean(languagePair);
  return entry;
}

async function confirmSegmentWithMainTm(project, segment, context = {}) {
  const snapshot = structuredClone(segment);
  const result = await serializeConfirmation(() => commitSegmentWithMainTm(project, snapshot, context));
  acknowledgeSegmentCommit(segment, result.segment);
  return result;
}

function serializeConfirmation(action) {
  // Two rapid confirmations can both read the same resource/contribution
  // versions before either commits. Keep their read/modify/write phases ordered.
  const operation = confirmationTail.then(action);
  confirmationTail = operation.catch(() => {});
  return operation;
}

async function commitSegmentWithMainTm(project, segment, context) {
  if (!project?.id || !segment?.id || !cleanText(segment.source) || !cleanText(segment.target)) {
    throw new Error("A project and a translated segment are required for TM confirmation.");
  }
  const mainLink = (project.resourceLinks || []).find((link) => link.type === "tm" && link.role === "main");
  if (!mainLink) throw new Error("This project has no main translation memory. Review Optional Resource Settings.");
  const resourceId = cleanText(mainLink.resourceId);
  if (!resourceId) throw new Error("The main translation memory has no stable resource identity. Review project resources.");
  const now = new Date().toISOString();
  const mainResource = await get("resources", resourceId);
  const normalizedSource = normalizeText(segment.source);
  const normalizedTarget = normalizeText(segment.target);
  let candidates = [];
  try {
    candidates = await getAllByIndex("tmEntries", "resourceSource", [resourceId, normalizedSource]);
  } catch (error) {
    if (error?.name !== "NotFoundError") throw error;
    candidates = await getAllByIndex("tmEntries", "resourceId", resourceId);
  }
  const existingEntry = candidates.find((entry) => normalizeText(entry.source) === normalizedSource && normalizeText(entry.target) === normalizedTarget);
  const entry = tmEntryRecord({
    source: segment.source,
    target: segment.target,
    sourceLang: project.sourceLang,
    targetLang: project.targetLang,
    projectName: project.name,
    domain: project.domain || "",
    tmName: mainLink.cachedName || mainLink.name || project.mainTmName,
    resourceId,
    isSeeded: existingEntry ? existingEntry.isSeeded !== false : false,
    documentKey: segmentDocumentKey(segment, context),
    previousSource: cleanText(context.previousSource),
    nextSource: cleanText(context.nextSource),
    updatedAt: now
  }, { existing: existingEntry });
  const previousContributions = await getAllByIndex("tmContributions", "projectSegment", [project.id, segment.id]);
  const existingContribution = previousContributions.find((item) => item.resourceId === resourceId) || previousContributions[0];
  const contribution = {
    ...(existingContribution || {}),
    id: existingContribution?.id || makeId("tm-contribution"),
    resourceId,
    tmEntryId: entry.id,
    projectId: project.id,
    documentId: segment.documentId || "",
    segmentId: segment.id,
    segmentRevision: Number(segment.revision) || 0,
    documentKey: segmentDocumentKey(segment, context),
    previousSource: cleanText(context.previousSource),
    nextSource: cleanText(context.nextSource),
    confirmedAt: now,
    updatedAt: now,
    createdAt: existingContribution?.createdAt || now
  };
  const segmentRecord = { ...segment, updatedAt: now };
  const indexRecords = existingEntry ? [] : indexRecordsForEntry(entry);
  const changes = [
    { store: "segments", value: segmentRecord },
    { store: "tmEntries", value: entry },
    { store: "tmContributions", value: contribution },
    ...indexRecords.map((value) => ({ store: "tmTokenIndex", value })),
    ...(mainResource ? [{ store: "resources", value: { ...mainResource, updatedAt: now } }] : [])
  ];
  if (existingContribution?.tmEntryId && existingContribution.tmEntryId !== entry.id) {
    const [previousEntry, previousEntryContributions] = await Promise.all([
      get("tmEntries", existingContribution.tmEntryId),
      getAllByIndex("tmContributions", "tmEntryId", existingContribution.tmEntryId)
    ]);
    const stillReferenced = previousEntryContributions.some((item) => item.id !== existingContribution.id);
    if (previousEntry && previousEntry.isSeeded === false && !stillReferenced) {
      changes.push(
        { store: "tmEntries", value: previousEntry, delete: true },
        { store: "tmTokenIndex", where: { tmEntryId: previousEntry.id } }
      );
    }
  }
  const committed = await commitMutation(null, null, { changes, rebaseLocal: true });
  const savedSegment = committed.values[0] || segmentRecord;
  return { segment: savedSegment, entry: committed.values[1] || entry, contribution: committed.values[2] || contribution };
}

async function restoreSegmentWithMainTm(project, segment, context = {}) {
  if (!project?.id || !segment?.id) throw new Error("A project and segment are required for TM-aware restoration.");
  if (segment.status === "confirmed" && cleanText(segment.target)) {
    return confirmSegmentWithMainTm(project, segment, context);
  }
  const snapshot = structuredClone(segment);
  const result = await serializeConfirmation(() => commitRestoredSegmentWithMainTm(project, snapshot));
  acknowledgeSegmentCommit(segment, result.segment);
  return result;
}

async function commitRestoredSegmentWithMainTm(project, segment) {
  const contributions = await getAllByIndex("tmContributions", "projectSegment", [project.id, segment.id]);
  const changes = [{ store: "segments", value: segment }];
  const now = new Date().toISOString();
  const resources = await Promise.all(
    Array.from(new Set(contributions.map((item) => item.resourceId).filter(Boolean)), (resourceId) =>
      get("resources", resourceId)
    )
  );
  resources.filter(Boolean).forEach((resource) => {
    changes.push({ store: "resources", value: { ...resource, updatedAt: now } });
  });
  const contributionIds = new Set(contributions.map((item) => item.id));
  for (const contribution of contributions) changes.push({ store: "tmContributions", value: contribution, delete: true });
  for (const tmEntryId of new Set(contributions.map((item) => item.tmEntryId).filter(Boolean))) {
    const [entry, linked] = await Promise.all([
      get("tmEntries", tmEntryId),
      getAllByIndex("tmContributions", "tmEntryId", tmEntryId)
    ]);
    if (entry?.isSeeded === false && !linked.some((item) => !contributionIds.has(item.id))) {
      changes.push(
        { store: "tmEntries", value: entry, delete: true },
        { store: "tmTokenIndex", where: { tmEntryId } }
      );
    }
  }
  const committed = await commitMutation(null, null, { changes, rebaseLocal: true });
  const savedSegment = committed.values[0] || segment;
  return { segment: savedSegment, removedContributions: contributions.length };
}

function acknowledgeSegmentCommit(segment, saved) {
  if (Number(segment.revision || 0) === Number(saved.revision || 0)) {
    Object.assign(segment, saved);
  } else if (Number(segment.storageVersion || 0) <= Number(saved.storageVersion || 0)) {
    // Newer typing retains its own target, status, history, and timestamp.
    for (const key of ["storageVersion", "storageWriter", "storageGeneration"]) {
      if (saved[key] !== undefined) segment[key] = saved[key];
    }
  }
}

async function importTmEntries(entries, options = {}) {
  const byKey = new Map();
  (entries || []).map((entry) => tmEntryRecord(entry, { preserveUpdatedAt: true })).forEach((entry) => {
    byKey.set(memoryKey(entry), entry);
  });
  const uniqueEntries = Array.from(byKey.values());
  const pairs = new Set(uniqueEntries.map(languagePairOf).filter(Boolean));
  const pairIndexModes = new Map();
  await Promise.all(Array.from(pairs, async (languagePair) => {
    const [meta, existingCount] = await Promise.all([
      get("appMeta", tmIndexMetaKey(languagePair)),
      countByIndex ? countByIndex("tmEntries", "languagePair", languagePair) : Promise.resolve(0)
    ]);
    pairIndexModes.set(languagePair, { rebuild: existingCount > 0 && (!meta || meta.dirty) });
  }));
  const chunkSize = Math.max(100, Number(options.chunkSize || RESOURCE_IMPORT_CHUNK_SIZE));
  let saved = 0;
  for (let index = 0; index < uniqueEntries.length; index += chunkSize) {
    const chunk = uniqueEntries.slice(index, index + chunkSize);
    await bulkPut("tmEntries", chunk);
    const indexRecords = chunk.flatMap(indexRecordsForEntry);
    if (indexRecords.length) await bulkPutInChunks("tmTokenIndex", indexRecords, { chunkSize });
    saved += chunk.length;
    if (typeof options.onProgress === "function") {
      await options.onProgress({ saved, total: uniqueEntries.length, chunkSize: chunk.length });
    }
  }
  for (const languagePair of pairs) {
    if (pairIndexModes.get(languagePair)?.rebuild) {
      await rebuildTmIndex(languagePair, null, {
        chunkSize,
        onProgress: options.onIndexProgress
      });
    } else {
      await writeIndexMetaClean(languagePair);
    }
  }
  for (const resourceId of new Set(uniqueEntries.map((entry) => entry.resourceId).filter(Boolean))) {
    const resource = await get("resources", resourceId);
    if (resource) await put("resources", { ...resource, updatedAt: new Date().toISOString() });
  }
  return uniqueEntries.length;
}

async function updateTmEntry(entry = {}) {
  const previous = entry?.id ? await get("tmEntries", entry.id) : null;
  const previousLanguagePair = languagePairOf(previous || entry);
  const updated = tmEntryRecord(entry, { requireId: true });
  const languagePairsToEnsure = new Set([previousLanguagePair, updated.languagePair].filter(Boolean));
  for (const languagePair of languagePairsToEnsure) await ensureTmIndex(languagePair);
  await deleteWhere("tmTokenIndex", (record) => record.tmEntryId === updated.id);
  Object.assign(updated, await put("tmEntries", updated));
  await putTmIndexRecords([updated]);
  if (updated.resourceId) {
    const resource = await get("resources", updated.resourceId);
    if (resource) await put("resources", { ...resource, updatedAt: updated.updatedAt });
  }
  if (previousLanguagePair && previousLanguagePair !== updated.languagePair) await writeIndexMetaClean(previousLanguagePair);
  await writeIndexMetaClean(updated.languagePair);
  return updated;
}

async function deleteTmEntry(id) {
  await deleteTmEntries([id]);
}

async function deleteTmEntries(ids) {
  const idSet = new Set((ids || []).map((id) => String(id || "")).filter(Boolean));
  if (!idSet.size) return 0;
  const existingEntries = (await Promise.all(Array.from(idSet, (id) => get("tmEntries", id)))).filter(Boolean);
  const existingIds = new Set(existingEntries.map((entry) => entry.id));
  if (!existingIds.size) return 0;
  if (deleteStoresWhereAtomically) {
    await deleteStoresWhereAtomically({
      tmEntries: (entry) => existingIds.has(entry.id),
      tmTokenIndex: (record) => existingIds.has(record.tmEntryId)
    });
  } else {
    for (const id of existingIds) {
      await deleteByKey("tmEntries", id);
      await deleteWhere("tmTokenIndex", (record) => record.tmEntryId === id);
    }
  }
  const languagePairs = new Set(existingEntries.map(languagePairOf).filter(Boolean));
  for (const languagePair of languagePairs) await ensureTmIndex(languagePair);
  for (const languagePair of languagePairs) await writeIndexMetaClean(languagePair);
  for (const resourceId of new Set(existingEntries.map((entry) => entry.resourceId).filter(Boolean))) {
    const resource = await get("resources", resourceId);
    if (resource) await put("resources", { ...resource, updatedAt: new Date().toISOString() });
  }
  return existingIds.size;
}

function resourceNameSet(names, legacyName) {
  return new Set([...(Array.isArray(names) ? names : []), legacyName].map((name) => String(name || "").trim()).filter(Boolean));
}

function scoreTmEntries(entries, options = {}) {
  const { source, sourceLang, targetLang, tmName, tmNames, limit = 6, context = {} } = options || {};
  if (
    Object.prototype.hasOwnProperty.call(options, "resourceLinks") &&
    !(options.resourceLinks || []).some((link) => link?.type === "tm" && link.lookup !== false)
  ) return [];
  const sourceText = cleanText(source);
  const normalizedSource = normalizeText(sourceText);
  if (!normalizedSource) return [];
  const sourceTokens = tokensFromNormalized(normalizedSource);
  const languagePair = languagePairFromFields(sourceLang, targetLang);
  const allowedNames = resourceNameSet(tmNames, tmName);
  const links = resourceLinkMap(options);
  const byKey = new Map();
  (entries || []).forEach((entry) => {
    if (languagePair && languagePairOf(entry) !== languagePair) return;
    const link = links.get(entry.resourceId || entry.tmName);
    if (links.size && !link) return;
    if (!links.size && allowedNames.size && !allowedNames.has(entry.tmName)) return;
    const normalizedCandidate = normalizeText(entry.source);
    const candidateTokens = tokensFromNormalized(normalizedCandidate);
    const overlapRatio = tokenOverlapTokens(sourceTokens, candidateTokens);
    const characterScore = similarityNormalized(normalizedSource, normalizedCandidate);
    if (
      normalizedCandidate !== normalizedSource &&
      overlapRatio < 0.15 &&
      characterScore < 45
    ) return;
    const overlapScore = Math.round(overlapRatio * 100);
    const orderScore = Math.round(orderedTokenSimilarity(sourceTokens, candidateTokens) * 100);
    let rawScore;
    let matchKind;
    if (cleanText(entry.source) === sourceText && contextMatches(entry, context)) {
      rawScore = 101;
      matchKind = "context-exact";
    } else if (cleanText(entry.source) === sourceText) {
      rawScore = 100;
      matchKind = "exact";
    } else if (normalizedCandidate === normalizedSource) {
      rawScore = 99;
      matchKind = "normalized-exact";
    } else {
      const combined = Math.round(characterScore * 0.55 + overlapScore * 0.3 + orderScore * 0.15);
      rawScore = Math.min(98, overlapScore ? combined : Math.max(combined, characterScore - 3));
      matchKind = "fuzzy";
    }
    if (rawScore < 45) return;
    const penalty = link?.penalty || 0;
    const effectiveScore = Math.max(0, Math.min(101, rawScore - penalty));
    const scored = {
      ...entry,
      score: effectiveScore,
      rawScore,
      penalty,
      effectiveScore,
      matchKind,
      resourceId: entry.resourceId || link?.resourceId || "",
      resourceName: entry.tmName || link?.cachedName || link?.name || "",
      resourcePriority: link?.priority ?? 999,
      sameDomainProvenance: Boolean(
        cleanText(context.domain) && normalizeText(entry.domain) === normalizeText(context.domain)
      ),
      sourceDifferences: sourceDifferences(sourceText, entry.source),
      provenance: [{
        resourceId: entry.resourceId || link?.resourceId || "",
        resourceName: entry.tmName || link?.cachedName || link?.name || "",
        projectName: entry.projectName || "",
        domain: entry.domain || "",
        updatedAt: entry.updatedAt || ""
      }]
    };
    const adaptation = adaptedMatch(sourceText, entry);
    if (adaptation) {
      scored.adaptedTarget = adaptation.target;
      scored.adaptation = adaptation;
    }
    const key = [languagePairOf(entry), normalizedCandidate, normalizeText(entry.target)].join("::");
    const existing = byKey.get(key);
    if (existing) {
      const combined = [...(existing.provenance || []), ...scored.provenance]
        .filter((item, index, all) => all.findIndex((candidate) => candidate.resourceId === item.resourceId) === index);
      existing.provenance = combined;
    }
    if (!existing || scored.effectiveScore > existing.effectiveScore || new Date(scored.updatedAt) > new Date(existing.updatedAt)) {
      if (existing) scored.provenance = existing.provenance;
      byKey.set(key, scored);
    }
  });
  return Array.from(byKey.values())
    .sort((a, b) =>
      b.effectiveScore - a.effectiveScore ||
      a.resourcePriority - b.resourcePriority ||
      Number(b.sameDomainProvenance) - Number(a.sameDomainProvenance) ||
      new Date(b.updatedAt) - new Date(a.updatedAt)
    )
    .slice(0, limit);
}

async function getTmMatchCandidates(options = {}) {
  const { source, sourceLang, targetLang, tmName, tmNames, resourceLinks = [] } = options || {};
  if (
    Object.prototype.hasOwnProperty.call(options, "resourceLinks") &&
    !resourceLinks.some((link) => link?.type === "tm" && link.lookup !== false)
  ) return [];
  const languagePair = languagePairFromFields(sourceLang, targetLang);
  if (!languagePair || !normalizeText(source)) return [];
  const sourceTokens = tokens(source).slice(0, MAX_INDEX_TOKENS);
  if (!sourceTokens.length) {
    return getAllByIndex("tmEntries", "languagePair", languagePair);
  }
  await ensureTmIndex(languagePair);
  const allowedNames = resourceNameSet(tmNames, tmName);
  const allowedResourceIds = new Set(resourceLinks.filter((link) => link?.type === "tm" && link.lookup !== false).map((link) => link.resourceId).filter(Boolean));
  const candidateHits = new Map();
  const tokenRows = await Promise.all(sourceTokens.map((token) => getAllByIndex("tmTokenIndex", "languagePairToken", [languagePair, token])));
  tokenRows.flat().forEach((record) => {
    if (allowedResourceIds.size ? !allowedResourceIds.has(record.resourceId) : allowedNames.size && !allowedNames.has(record.tmName)) return;
    candidateHits.set(record.tmEntryId, (candidateHits.get(record.tmEntryId) || 0) + 1);
  });
  const candidateIds = Array.from(candidateHits.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, MAX_INDEX_CANDIDATES)
    .map(([id]) => id);
  if (!candidateIds.length) {
    const entries = await getAllByIndex("tmEntries", "languagePair", languagePair);
    return entries
      .filter((entry) =>
        allowedResourceIds.size
          ? allowedResourceIds.has(entry.resourceId)
          : !allowedNames.size || allowedNames.has(entry.tmName)
      )
      .sort((a, b) => new Date(b.updatedAt || b.createdAt || 0) - new Date(a.updatedAt || a.createdAt || 0))
      .slice(0, MAX_INDEX_CANDIDATES);
  }
  const entries = getMany
    ? await getMany("tmEntries", candidateIds)
    : await Promise.all(candidateIds.map((id) => get("tmEntries", id)));
  return entries.filter(Boolean);
}

async function getTmMatchCandidateBatches(optionsList = []) {
  const requests = Array.isArray(optionsList) ? optionsList : [];
  const results = requests.map(() => []);
  const groups = new Map();

  requests.forEach((options, index) => {
    const source = cleanText(options?.source);
    const languagePair = languagePairFromFields(options?.sourceLang, options?.targetLang);
    if (!source || !languagePair) return;
    if (!groups.has(languagePair)) groups.set(languagePair, []);
    groups.get(languagePair).push({ index, options: options || {}, sourceTokens: tokens(source).slice(0, MAX_INDEX_TOKENS) });
  });

  await Promise.all(Array.from(groups, async ([languagePair, group]) => {
    await ensureTmIndex(languagePair);
    const uniqueTokens = Array.from(new Set(group.flatMap((request) => request.sourceTokens)));
    const tokenRows = uniqueTokens.length
      ? (getAllByIndexMany
          ? await getAllByIndexMany("tmTokenIndex", "languagePairToken", uniqueTokens.map((token) => [languagePair, token]))
          : await Promise.all(uniqueTokens.map((token) => getAllByIndex("tmTokenIndex", "languagePairToken", [languagePair, token]))))
      : [];
    const rowsByToken = new Map(uniqueTokens.map((token, index) => [token, tokenRows[index] || []]));
    const candidateIdsByRequest = new Map();
    const allCandidateIds = new Set();
    let allPairEntries = null;

    for (const request of group) {
      if (
        Object.prototype.hasOwnProperty.call(request.options, "resourceLinks") &&
        !(request.options.resourceLinks || []).some((link) => link?.type === "tm" && link.lookup !== false)
      ) {
        results[request.index] = [];
        continue;
      }
      if (!request.sourceTokens.length) {
        allPairEntries ||= await getAllByIndex("tmEntries", "languagePair", languagePair);
        results[request.index] = allPairEntries;
        continue;
      }
      const allowedNames = resourceNameSet(request.options.tmNames, request.options.tmName);
      const allowedResourceIds = new Set((request.options.resourceLinks || []).filter((link) => link?.type === "tm" && link.lookup !== false).map((link) => link.resourceId).filter(Boolean));
      const candidateHits = new Map();
      request.sourceTokens.forEach((token) => {
        (rowsByToken.get(token) || []).forEach((record) => {
          if (allowedResourceIds.size ? !allowedResourceIds.has(record.resourceId) : allowedNames.size && !allowedNames.has(record.tmName)) return;
          candidateHits.set(record.tmEntryId, (candidateHits.get(record.tmEntryId) || 0) + 1);
        });
      });
      const ids = Array.from(candidateHits.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, MAX_INDEX_CANDIDATES)
        .map(([id]) => id);
      if (!ids.length) {
        allPairEntries ||= await getAllByIndex("tmEntries", "languagePair", languagePair);
        results[request.index] = allPairEntries
          .filter((entry) =>
            allowedResourceIds.size
              ? allowedResourceIds.has(entry.resourceId)
              : !allowedNames.size || allowedNames.has(entry.tmName)
          )
          .sort((a, b) => new Date(b.updatedAt || b.createdAt || 0) - new Date(a.updatedAt || a.createdAt || 0))
          .slice(0, MAX_INDEX_CANDIDATES);
        continue;
      }
      candidateIdsByRequest.set(request.index, ids);
      ids.forEach((id) => allCandidateIds.add(id));
    }

    const ids = Array.from(allCandidateIds);
    if (!ids.length) return;
    const entries = getMany
      ? await getMany("tmEntries", ids)
      : await Promise.all(ids.map((id) => get("tmEntries", id)));
    const entriesById = new Map(entries.filter(Boolean).map((entry) => [entry.id, entry]));
    candidateIdsByRequest.forEach((candidateIds, requestIndex) => {
      results[requestIndex] = candidateIds.map((id) => entriesById.get(id)).filter(Boolean);
    });
  }));

  return results;
}

async function findTmMatches(options = {}) {
  const { source, sourceLang, targetLang, tmName, tmNames, resourceLinks, context, limit = 6 } = options || {};
  const request = {
    source,
    sourceLang,
    targetLang,
    tmName,
    tmNames,
    context,
    limit,
    ...(resourceLinks === undefined ? {} : { resourceLinks })
  };
  const candidates = await getTmMatchCandidates(request);
  return scoreTmEntries(candidates, request);
}

async function findTmMatchesBatch(optionsList = []) {
  const requests = Array.isArray(optionsList) ? optionsList : [];
  const candidates = await getTmMatchCandidateBatches(requests);
  return candidates.map((entries, index) => scoreTmEntries(entries, requests[index] || {}));
}

async function listTmEntries(options = {}) {
  const { sourceLang, targetLang, tmName, tmNames } = options || {};
  const languagePair = languagePairFromFields(sourceLang, targetLang);
  const hasLanguageFilter = Boolean(cleanText(sourceLang) || cleanText(targetLang));
  if (hasLanguageFilter && !languagePair) return [];
  const entries = languagePair ? await getAllByIndex("tmEntries", "languagePair", languagePair) : await getAll("tmEntries");
  const allowedNames = resourceNameSet(tmNames, tmName);
  return entries.filter((entry) => !allowedNames.size || allowedNames.has(entry.tmName));
}

  window.CatHan.tm = {
  normalizeText,
  similarity,
  tokenSignature,
  scoreTmEntries,
  getTmMatchCandidates,
  getTmMatchCandidateBatches,
  rebuildTmIndex,
  rebuildAllTmIndexes,
  saveTmEntry,
    confirmSegmentWithMainTm,
    restoreSegmentWithMainTm,
  importTmEntries,
  listTmEntries,
  updateTmEntry,
  deleteTmEntry,
  deleteTmEntries,
  findTmMatches,
  findTmMatchesBatch
};
})();
