(() => {
const { bulkPut, countByIndex, deleteByKey, deleteStoresWhereAtomically, deleteWhere, get, getAll, getAllByIndex, makeId, put, constants } = window.CatHan.storage;
const LOCAL_WORKSPACE_ID = constants?.LOCAL_WORKSPACE_ID || "local-workspace";
const LOCAL_USER_ID = constants?.LOCAL_USER_ID || "local-user";
const TM_INDEX_META_PREFIX = "tm-token-index:";
const MAX_INDEX_TOKENS = 24;
const MAX_INDEX_CANDIDATES = 600;
const RESOURCE_IMPORT_CHUNK_SIZE = 1000;
const SENSITIVE_TEXT_VALUE_PATTERN = /(sk-[A-Za-z0-9_-]{8,}|Bearer\s+[A-Za-z0-9._~+/=-]{8,}|gh[pousr]_[A-Za-z0-9_]{8,}|npm_[A-Za-z0-9_]{8,}|(?:session|cookie)[=:][A-Za-z0-9._~+/=-]{8,})/i;

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
  return Array.from(new Set(normalizeText(text).split(" ").filter((token) => token.length > 2)));
}

function tokenSignature(text) {
  return tokens(text).slice(0, MAX_INDEX_TOKENS).join("|");
}

function tokenOverlap(source, candidate) {
  const a = tokens(source);
  const b = new Set(tokens(candidate));
  if (!a.length || !b.size) return 0;
  return a.filter((token) => b.has(token)).length / Math.max(a.length, b.size);
}

function memoryKey(entry = {}) {
  return [
    languagePairOf(entry),
    entry.tmName || "",
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
    id,
    workspaceId: cleanText(entry.workspaceId) || existing?.workspaceId || LOCAL_WORKSPACE_ID,
    ownerId: cleanText(entry.ownerId) || existing?.ownerId || LOCAL_USER_ID,
    source,
    target,
    sourceLang,
    targetLang,
    languagePair: `${sourceLang}::${targetLang}`,
    projectName: redactSensitiveText(entry.projectName || "").trim(),
    tmName,
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
  if (!a && !b) return 100;
  if (!a || !b) return 0;
  const max = Math.max(a.length, b.length);
  return Math.max(0, Math.round((1 - levenshtein(a, b) / max) * 100));
}

async function saveTmEntry(input = {}) {
  const { source, target, sourceLang, targetLang, projectName, tmName } = input || {};
  const candidate = tmEntryRecord({ source, target, sourceLang, targetLang, projectName, tmName });
  const languagePair = candidate.languagePair;
  await ensureTmIndex(languagePair);
  const existing = (await getAllByIndex("tmEntries", "languagePair", languagePair)).find((entry) =>
    entry.tmName === candidate.tmName &&
    normalizeText(entry.source) === normalizeText(candidate.source) &&
    normalizeText(entry.target) === normalizeText(candidate.target)
  );
  const entry = tmEntryRecord(candidate, { existing });
  if (existing?.id) await deleteWhere("tmTokenIndex", (record) => record.tmEntryId === existing.id);
  await put("tmEntries", entry);
  await putTmIndexRecords([entry]);
  await writeIndexMetaClean(languagePair);
  return entry;
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
  return uniqueEntries.length;
}

async function updateTmEntry(entry = {}) {
  const previous = entry?.id ? await get("tmEntries", entry.id) : null;
  const previousLanguagePair = languagePairOf(previous || entry);
  const updated = tmEntryRecord(entry, { requireId: true });
  const languagePairsToEnsure = new Set([previousLanguagePair, updated.languagePair].filter(Boolean));
  for (const languagePair of languagePairsToEnsure) await ensureTmIndex(languagePair);
  await deleteWhere("tmTokenIndex", (record) => record.tmEntryId === updated.id);
  await put("tmEntries", updated);
  await putTmIndexRecords([updated]);
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
  return existingIds.size;
}

function resourceNameSet(names, legacyName) {
  return new Set([...(Array.isArray(names) ? names : []), legacyName].map((name) => String(name || "").trim()).filter(Boolean));
}

function scoreTmEntries(entries, options = {}) {
  const { source, sourceLang, targetLang, tmName, tmNames, limit = 6 } = options || {};
  const sourceText = cleanText(source);
  const normalizedSource = normalizeText(sourceText);
  if (!normalizedSource) return [];
  const languagePair = languagePairFromFields(sourceLang, targetLang);
  const allowedNames = resourceNameSet(tmNames, tmName);
  const byKey = new Map();
  (entries || [])
    .filter((entry) => !languagePair || languagePairOf(entry) === languagePair)
    .filter((entry) => !allowedNames.size || allowedNames.has(entry.tmName))
    .filter((entry) => normalizeText(entry.source) === normalizedSource || tokenOverlap(sourceText, entry.source) >= 0.15)
    .forEach((entry) => {
      const scored = { ...entry, score: similarity(sourceText, entry.source) };
      if (scored.score < 45) return;
      const existing = byKey.get(memoryKey(entry));
      if (!existing || scored.score > existing.score || new Date(scored.updatedAt) > new Date(existing.updatedAt)) {
        byKey.set(memoryKey(entry), scored);
      }
    });
  return Array.from(byKey.values())
    .sort((a, b) => b.score - a.score || new Date(b.updatedAt) - new Date(a.updatedAt))
    .slice(0, limit);
}

async function getTmMatchCandidates(options = {}) {
  const { source, sourceLang, targetLang, tmName, tmNames } = options || {};
  const languagePair = languagePairFromFields(sourceLang, targetLang);
  if (!languagePair || !normalizeText(source)) return [];
  const sourceTokens = tokens(source).slice(0, MAX_INDEX_TOKENS);
  if (!sourceTokens.length) {
    return getAllByIndex("tmEntries", "languagePair", languagePair);
  }
  await ensureTmIndex(languagePair);
  const allowedNames = resourceNameSet(tmNames, tmName);
  const candidateHits = new Map();
  const tokenRows = await Promise.all(sourceTokens.map((token) => getAllByIndex("tmTokenIndex", "languagePairToken", [languagePair, token])));
  tokenRows.flat().forEach((record) => {
    if (allowedNames.size && !allowedNames.has(record.tmName)) return;
    candidateHits.set(record.tmEntryId, (candidateHits.get(record.tmEntryId) || 0) + 1);
  });
  const candidateIds = Array.from(candidateHits.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, MAX_INDEX_CANDIDATES)
    .map(([id]) => id);
  if (!candidateIds.length) return [];
  return (await Promise.all(candidateIds.map((id) => get("tmEntries", id)))).filter(Boolean);
}

async function findTmMatches(options = {}) {
  const { source, sourceLang, targetLang, tmName, tmNames, limit = 6 } = options || {};
  const candidates = await getTmMatchCandidates({ source, sourceLang, targetLang, tmName, tmNames });
  return scoreTmEntries(candidates, { source, sourceLang, targetLang, tmName, tmNames, limit });
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
  rebuildTmIndex,
  rebuildAllTmIndexes,
  saveTmEntry,
  importTmEntries,
  listTmEntries,
  updateTmEntry,
  deleteTmEntry,
  deleteTmEntries,
  findTmMatches
};
})();
