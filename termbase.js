(() => {
const { bulkPut, countByIndex, deleteByKey, deleteStoresWhereAtomically, deleteWhere, get, getAll, getAllByIndex, makeId, put, constants } = window.CatHan.storage;
const { normalizeText } = window.CatHan.tm;
const LOCAL_WORKSPACE_ID = constants?.LOCAL_WORKSPACE_ID || "local-workspace";
const LOCAL_USER_ID = constants?.LOCAL_USER_ID || "local-user";
const TERM_INDEX_META_PREFIX = "term-token-index:";
const MAX_TERM_INDEX_TOKENS = 12;
const MAX_TERM_SOURCE_TOKENS = 40;
const MAX_TERM_CANDIDATES = 1200;
const RESOURCE_IMPORT_CHUNK_SIZE = 1000;
const SENSITIVE_TEXT_VALUE_PATTERN = /(sk-[A-Za-z0-9_-]{8,}|Bearer\s+[A-Za-z0-9._~+/=-]{8,}|gh[pousr]_[A-Za-z0-9_]{8,}|npm_[A-Za-z0-9_]{8,}|(?:session|cookie)[=:][A-Za-z0-9._~+/=-]{8,})/i;
const textDecoder = new TextDecoder("utf-8");

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

function languagePairFromFields(sourceLang, targetLang) {
  const source = cleanPortableLabel(sourceLang);
  const target = cleanPortableLabel(targetLang);
  return source && target ? `${source}::${target}` : "";
}

function languagePairOf(term = {}) {
  return cleanPortableLabel(term.languagePair) || languagePairFromFields(term.sourceLang, term.targetLang);
}

function tokens(text) {
  return Array.from(new Set(normalizeText(text).split(" ").filter((token) => token.length > 1)));
}

function termIndexMetaKey(languagePair) {
  return `${TERM_INDEX_META_PREFIX}${languagePair}`;
}

function termTokens(term) {
  return tokens(term.sourceTerm).slice(0, MAX_TERM_INDEX_TOKENS);
}

function indexRecordsForTerm(term) {
  const languagePair = languagePairOf(term);
  if (!languagePair) return [];
  return termTokens(term).map((token) => ({
    id: `${term.id}::${token}`,
    termId: term.id,
    languagePair,
    termBaseName: term.termBaseName || "",
    token,
    updatedAt: term.updatedAt || term.createdAt || new Date().toISOString()
  }));
}

function latestTermTimestamp(terms) {
  return (terms || []).reduce((latest, term) => {
    const value = term.updatedAt || term.createdAt || "";
    return value > latest ? value : latest;
  }, "");
}

async function writeTermIndexMeta(languagePair, terms) {
  await put("appMeta", {
    key: termIndexMetaKey(languagePair),
    languagePair,
    termCount: terms.length,
    latestTermUpdatedAt: latestTermTimestamp(terms),
    dirty: false,
    updatedAt: new Date().toISOString()
  });
}

async function writeTermIndexMetaClean(languagePair) {
  if (!languagePair) return;
  const existing = await get("appMeta", termIndexMetaKey(languagePair));
  await put("appMeta", {
    ...(existing || {}),
    key: termIndexMetaKey(languagePair),
    languagePair,
    dirty: false,
    updatedAt: new Date().toISOString()
  });
}

async function markTermIndexDirty(languagePair) {
  await put("appMeta", {
    key: termIndexMetaKey(languagePair),
    languagePair,
    dirty: true,
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

async function rebuildTermIndex(languagePair, terms = null, options = {}) {
  const sourceTerms = terms || await getAllByIndex("terms", "languagePair", languagePair);
  await deleteWhere("termTokenIndex", (record) => record.languagePair === languagePair);
  const records = sourceTerms.flatMap(indexRecordsForTerm);
  if (records.length) {
    await bulkPutInChunks("termTokenIndex", records, {
      chunkSize: options.chunkSize,
      onProgress: options.onProgress
    });
  }
  await writeTermIndexMeta(languagePair, sourceTerms);
  return sourceTerms.length;
}

async function rebuildAllTermIndexes(options = {}) {
  const terms = await getAll("terms");
  const byPair = new Map();
  terms.forEach((term) => {
    const languagePair = languagePairOf(term);
    if (!languagePair) return;
    if (!byPair.has(languagePair)) byPair.set(languagePair, []);
    byPair.get(languagePair).push(term);
  });
  await deleteWhere("termTokenIndex", () => true);
  let indexed = 0;
  for (const [languagePair, pairTerms] of byPair) {
    const records = pairTerms.flatMap(indexRecordsForTerm);
    if (records.length) {
      await bulkPutInChunks("termTokenIndex", records, {
        chunkSize: options.chunkSize,
        onProgress: options.onProgress
      });
    }
    await writeTermIndexMeta(languagePair, pairTerms);
    indexed += pairTerms.length;
  }
  return indexed;
}

async function ensureTermIndex(languagePair) {
  const meta = await get("appMeta", termIndexMetaKey(languagePair));
  if (meta && !meta.dirty) return;
  await rebuildTermIndex(languagePair);
}

async function putTermIndexRecords(terms) {
  const records = (terms || []).flatMap(indexRecordsForTerm);
  if (records.length) await bulkPut("termTokenIndex", records);
}

function containsNormalizedTerm(text, term) {
  const normalizedTerm = normalizeText(term);
  if (!normalizedTerm) return false;
  return ` ${normalizeText(text)} `.includes(` ${normalizedTerm} `);
}

function tokenSpans(text) {
  const spans = [];
  const pattern = /[\p{L}\p{N}]+/gu;
  let match;
  while ((match = pattern.exec(text || ""))) {
    const normalized = normalizeText(match[0]);
    if (!normalized) continue;
    spans.push({
      token: normalized,
      start: match.index,
      end: match.index + match[0].length
    });
  }
  return spans;
}

function termRanges(text, terms) {
  const spans = tokenSpans(text);
  if (!spans.length) return [];
  const matches = [];
  (terms || []).forEach((term) => {
    const sourceTerm = term.sourceTerm || "";
    const termTokens = normalizeText(sourceTerm).split(" ").filter(Boolean);
    if (!termTokens.length || termTokens.length > spans.length) return;
    for (let index = 0; index <= spans.length - termTokens.length; index += 1) {
      const matched = termTokens.every((token, offset) => spans[index + offset].token === token);
      if (!matched) continue;
      const start = spans[index].start;
      const end = spans[index + termTokens.length - 1].end;
      matches.push({
        index: start,
        length: end - start,
        text: String(text || "").slice(start, end),
        term
      });
    }
  });
  return matches
    .sort((a, b) => a.index - b.index || b.length - a.length)
    .reduce((accepted, match) => {
      const overlaps = accepted.some((item) => match.index < item.index + item.length && item.index < match.index + match.length);
      if (!overlaps) accepted.push(match);
      return accepted;
    }, []);
}

function normalizeTerm(term) {
  return {
    ...term,
    notes: redactSensitiveText(term?.notes || "").trim(),
    isForbidden: Boolean(term?.isForbidden || term?.forbidden)
  };
}

function termRecord(term = {}, { requireId = false, preserveUpdatedAt = false, now = new Date().toISOString() } = {}) {
  const sourceTerm = requiredText(term.sourceTerm, "Term source text is required.");
  const targetTerm = requiredText(term.targetTerm, "Term target text is required.");
  const sourceLang = requiredPortableLabel(term.sourceLang, "Term source language is required.");
  const targetLang = requiredPortableLabel(term.targetLang, "Term target language is required.");
  const termBaseName = requiredPortableLabel(term.termBaseName, "Termbase name is required.");
  const id = cleanText(term.id) || (requireId ? "" : makeId("term"));
  if (!id) throw new Error("Term ID is required.");
  return {
    ...normalizeTerm(term),
    id,
    workspaceId: cleanText(term.workspaceId) || LOCAL_WORKSPACE_ID,
    ownerId: cleanText(term.ownerId) || LOCAL_USER_ID,
    sourceTerm,
    targetTerm,
    sourceLang,
    targetLang,
    languagePair: `${sourceLang}::${targetLang}`,
    termBaseName,
    createdBy: cleanText(term.createdBy) || LOCAL_USER_ID,
    updatedBy: LOCAL_USER_ID,
    createdAt: cleanText(term.createdAt) || now,
    updatedAt: preserveUpdatedAt ? cleanText(term.updatedAt) || now : now
  };
}

function countDelimiter(line, delimiter) {
  let count = 0;
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"') {
      if (quoted && line[index + 1] === '"') index += 1;
      else quoted = !quoted;
    } else if (!quoted && char === delimiter) {
      count += 1;
    }
  }
  return count;
}

function detectTermListDelimiter(text, fileName = "") {
  if (/\.tsv$/i.test(fileName)) return "\t";
  const sample = String(text || "").split(/\r?\n/).find((line) => line.trim()) || "";
  return [",", ";", "\t"]
    .map((delimiter) => ({ delimiter, count: countDelimiter(sample, delimiter) }))
    .sort((a, b) => b.count - a.count)[0]?.delimiter || ",";
}

function parseDelimitedRows(text, delimiter) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;
  const value = String(text || "").replace(/^\uFEFF/, "");
  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];
    if (char === '"') {
      if (quoted && value[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (!quoted && char === delimiter) {
      row.push(cell);
      cell = "";
    } else if (!quoted && (char === "\n" || char === "\r")) {
      if (char === "\r" && value[index + 1] === "\n") index += 1;
      row.push(cell);
      if (row.some((item) => String(item || "").trim())) rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }
  row.push(cell);
  if (row.some((item) => String(item || "").trim())) rows.push(row);
  return rows;
}

function normalizedHeader(value) {
  return normalizeText(value).replace(/\s+/g, "");
}

function headerIndex(headers, aliases) {
  const normalizedAliases = new Set(aliases.map(normalizedHeader));
  return headers.findIndex((header) => normalizedAliases.has(normalizedHeader(header)));
}

function parseForbiddenFlag(value, header = "") {
  const normalized = normalizedHeader(value);
  if (!normalized) return false;
  const headerName = normalizedHeader(header);
  const truthy = new Set(["1", "true", "yes", "y", "forbidden", "prohibited", "deprecated", "donotuse", "blocked", "avoid"]);
  const falsey = new Set(["0", "false", "no", "n", "approved", "preferred", "allowed", "use"]);
  if (["allowed", "approved", "preferred"].includes(headerName)) {
    if (truthy.has(normalized) || falsey.has(normalized)) return ["0", "false", "no", "n", "forbidden", "prohibited", "deprecated", "donotuse", "blocked", "avoid"].includes(normalized);
  }
  return truthy.has(normalized);
}

function rowsToTerms(rows, options = {}) {
  const { sourceLang, targetLang, termBaseName } = options || {};
  if (!rows.length) throw new Error("The term list is empty.");

  const sourceAliases = ["source", "source term", "sourceTerm", "src", "term", sourceLang].filter(Boolean);
  const targetAliases = ["target", "target term", "targetTerm", "translation", "preferred term", "approved term", "tgt", targetLang].filter(Boolean);
  const noteAliases = ["note", "notes", "comment", "comments", "context"];
  const forbiddenAliases = ["forbidden", "is forbidden", "isForbidden", "status", "term status", "usage", "allowed", "approved"];
  const firstRow = rows[0] || [];
  const headerSource = headerIndex(firstRow, sourceAliases);
  const headerTarget = headerIndex(firstRow, targetAliases);
  const hasHeader = headerSource >= 0 && headerTarget >= 0;
  const headers = hasHeader ? firstRow : [];
  const sourceIndex = hasHeader ? headerSource : 0;
  const targetIndex = hasHeader ? headerTarget : 1;
  const notesIndex = hasHeader ? headerIndex(headers, noteAliases) : 2;
  const forbiddenIndex = hasHeader ? headerIndex(headers, forbiddenAliases) : 3;
  const now = new Date().toISOString();
  const terms = rows.slice(hasHeader ? 1 : 0)
    .map((row) => {
      const sourceTerm = row[sourceIndex] || "";
      const targetTerm = row[targetIndex] || "";
      if (!sourceTerm || !targetTerm) return null;
      return termRecord({
        sourceTerm,
        targetTerm,
        sourceLang,
        targetLang,
        notes: redactSensitiveText(notesIndex >= 0 ? row[notesIndex] || "" : "").trim(),
        termBaseName,
        isForbidden: forbiddenIndex >= 0 ? parseForbiddenFlag(row[forbiddenIndex], headers[forbiddenIndex]) : false,
        createdAt: now,
        updatedAt: now
      }, { preserveUpdatedAt: true, now });
    })
    .filter(Boolean);
  if (!terms.length) throw new Error("No valid term rows were found. Use source and target columns, or a two-column term list.");
  return terms;
}

function parseTermList(text, options = {}) {
  const { sourceLang, targetLang, termBaseName, fileName = "" } = options || {};
  const delimiter = detectTermListDelimiter(text, fileName);
  const rows = parseDelimitedRows(text, delimiter).map((row) => row.map((cell) => String(cell || "").trim()));
  return rowsToTerms(rows, { sourceLang, targetLang, termBaseName });
}

function readUint16(view, offset) {
  return view.getUint16(offset, true);
}

function readUint32(view, offset) {
  return view.getUint32(offset, true);
}

function findEndOfCentralDirectory(bytes) {
  for (let index = bytes.length - 22; index >= Math.max(0, bytes.length - 66000); index -= 1) {
    if (bytes[index] === 0x50 && bytes[index + 1] === 0x4b && bytes[index + 2] === 0x05 && bytes[index + 3] === 0x06) return index;
  }
  throw new Error("Could not read the XLSX zip directory.");
}

async function inflateRaw(bytes) {
  if (!("DecompressionStream" in window)) {
    throw new Error("This browser cannot decompress XLSX files locally. Try a recent Chromium, Edge, or Safari version.");
  }
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function unzipEntries(arrayBufferOrBytes) {
  const bytes = arrayBufferOrBytes instanceof Uint8Array ? arrayBufferOrBytes : new Uint8Array(arrayBufferOrBytes);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const eocd = findEndOfCentralDirectory(bytes);
  const entryCount = readUint16(view, eocd + 10);
  const centralDirectoryOffset = readUint32(view, eocd + 16);
  const entries = new Map();
  let ptr = centralDirectoryOffset;

  for (let index = 0; index < entryCount; index += 1) {
    if (readUint32(view, ptr) !== 0x02014b50) throw new Error("Invalid XLSX central directory.");
    const compressionMethod = readUint16(view, ptr + 10);
    const compressedSize = readUint32(view, ptr + 20);
    const uncompressedSize = readUint32(view, ptr + 24);
    const fileNameLength = readUint16(view, ptr + 28);
    const extraLength = readUint16(view, ptr + 30);
    const commentLength = readUint16(view, ptr + 32);
    const localHeaderOffset = readUint32(view, ptr + 42);
    const name = textDecoder.decode(bytes.slice(ptr + 46, ptr + 46 + fileNameLength)).replaceAll("\\", "/");
    const localNameLength = readUint16(view, localHeaderOffset + 26);
    const localExtraLength = readUint16(view, localHeaderOffset + 28);
    const dataStart = localHeaderOffset + 30 + localNameLength + localExtraLength;
    const compressed = bytes.slice(dataStart, dataStart + compressedSize);
    let data;
    if (compressionMethod === 0) data = compressed;
    else if (compressionMethod === 8) data = await inflateRaw(compressed);
    else throw new Error(`Unsupported XLSX compression method: ${compressionMethod}`);
    if (data.length !== uncompressedSize && uncompressedSize > 0) throw new Error(`XLSX entry ${name} has an unexpected decompressed size.`);
    entries.set(name, data);
    ptr += 46 + fileNameLength + extraLength + commentLength;
  }
  return entries;
}

function readZipText(entries, path) {
  const data = entries.get(path);
  return data ? textDecoder.decode(data) : "";
}

function parseXml(text, label) {
  const xml = new DOMParser().parseFromString(text, "application/xml");
  if (xml.querySelector("parsererror")) throw new Error(`Could not parse the XLSX ${label} XML.`);
  return xml;
}

function xmlNodeText(node) {
  return Array.from(node?.childNodes || []).map((child) => child.nodeType === Node.TEXT_NODE ? child.nodeValue : child.nodeType === Node.ELEMENT_NODE ? xmlNodeText(child) : "").join("");
}

function normalizeXlsxPath(target) {
  const value = String(target || "").replaceAll("\\", "/");
  if (!value) return "";
  if (value.startsWith("/")) return value.slice(1);
  if (value.startsWith("xl/")) return value;
  return `xl/${value}`;
}

function firstWorksheetPath(entries) {
  const fallback = Array.from(entries.keys()).find((path) => /^xl\/worksheets\/sheet\d+\.xml$/i.test(path));
  const workbookXml = readZipText(entries, "xl/workbook.xml");
  const relsXml = readZipText(entries, "xl/_rels/workbook.xml.rels");
  if (!workbookXml || !relsXml) return fallback || "";
  const workbook = parseXml(workbookXml, "workbook");
  const rels = parseXml(relsXml, "workbook relationships");
  const firstSheet = Array.from(workbook.getElementsByTagNameNS("*", "sheet"))[0];
  const relId = firstSheet?.getAttribute("r:id") || firstSheet?.getAttribute("id");
  if (!relId) return fallback || "";
  const relationship = Array.from(rels.getElementsByTagNameNS("*", "Relationship")).find((rel) => rel.getAttribute("Id") === relId);
  return normalizeXlsxPath(relationship?.getAttribute("Target")) || fallback || "";
}

function sharedStrings(entries) {
  const text = readZipText(entries, "xl/sharedStrings.xml");
  if (!text) return [];
  const xml = parseXml(text, "shared strings");
  return Array.from(xml.getElementsByTagNameNS("*", "si")).map((item) => xmlNodeText(item));
}

function columnIndex(cellRef, fallback) {
  const letters = String(cellRef || "").match(/^[A-Z]+/i)?.[0] || "";
  if (!letters) return fallback;
  return Array.from(letters.toUpperCase()).reduce((value, letter) => value * 26 + letter.charCodeAt(0) - 64, 0) - 1;
}

function cellValue(cell, shared) {
  const type = cell.getAttribute("t") || "";
  if (type === "inlineStr") return xmlNodeText(cell);
  const value = Array.from(cell.getElementsByTagNameNS("*", "v"))[0]?.textContent || "";
  if (type === "s") return shared[Number(value)] || "";
  if (type === "b") return value === "1" ? "true" : "false";
  return value;
}

async function parseTermWorkbook(arrayBufferOrBytes, options = {}) {
  const { sourceLang, targetLang, termBaseName } = options || {};
  const entries = await unzipEntries(arrayBufferOrBytes);
  const worksheetPath = firstWorksheetPath(entries);
  if (!worksheetPath || !entries.has(worksheetPath)) throw new Error("No worksheet was found in the XLSX file.");
  const shared = sharedStrings(entries);
  const sheet = parseXml(readZipText(entries, worksheetPath), "worksheet");
  const rows = Array.from(sheet.getElementsByTagNameNS("*", "row")).map((row) => {
    const cells = [];
    Array.from(row.getElementsByTagNameNS("*", "c")).forEach((cell, fallbackIndex) => {
      cells[columnIndex(cell.getAttribute("r"), fallbackIndex)] = String(cellValue(cell, shared) || "").trim();
    });
    return cells;
  }).filter((row) => row.some((cell) => String(cell || "").trim()));
  return rowsToTerms(rows, { sourceLang, targetLang, termBaseName });
}

async function saveTerm(input = {}) {
  const { sourceTerm, targetTerm, sourceLang, targetLang, notes, termBaseName, isForbidden = false } = input || {};
  const term = termRecord({ sourceTerm, targetTerm, sourceLang, targetLang, notes, termBaseName, isForbidden });
  await ensureTermIndex(term.languagePair);
  await put("terms", term);
  await putTermIndexRecords([term]);
  await writeTermIndexMetaClean(term.languagePair);
  return term;
}

async function importTerms(terms, options = {}) {
  const normalizedTerms = (terms || []).map((term) => termRecord(term, { preserveUpdatedAt: true }));
  const pairs = new Set(normalizedTerms.map(languagePairOf).filter(Boolean));
  const pairIndexModes = new Map();
  await Promise.all(Array.from(pairs, async (languagePair) => {
    const [meta, existingCount] = await Promise.all([
      get("appMeta", termIndexMetaKey(languagePair)),
      countByIndex ? countByIndex("terms", "languagePair", languagePair) : Promise.resolve(0)
    ]);
    pairIndexModes.set(languagePair, { rebuild: existingCount > 0 && (!meta || meta.dirty) });
  }));
  const chunkSize = Math.max(100, Number(options.chunkSize || RESOURCE_IMPORT_CHUNK_SIZE));
  let saved = 0;
  for (let index = 0; index < normalizedTerms.length; index += chunkSize) {
    const chunk = normalizedTerms.slice(index, index + chunkSize);
    await bulkPut("terms", chunk);
    await putTermIndexRecords(chunk);
    saved += chunk.length;
    if (typeof options.onProgress === "function") {
      await options.onProgress({ saved, total: normalizedTerms.length, chunkSize: chunk.length });
    }
  }
  for (const languagePair of pairs) {
    if (pairIndexModes.get(languagePair)?.rebuild) {
      await rebuildTermIndex(languagePair, null, {
        chunkSize,
        onProgress: options.onIndexProgress
      });
    } else {
      await writeTermIndexMetaClean(languagePair);
    }
  }
  return normalizedTerms.length;
}

async function deleteTerm(id) {
  await deleteTerms([id]);
}

async function deleteTerms(ids) {
  const idSet = new Set((ids || []).map((id) => String(id || "")).filter(Boolean));
  if (!idSet.size) return 0;
  const existingTerms = (await Promise.all(Array.from(idSet, (id) => get("terms", id)))).filter(Boolean);
  if (deleteStoresWhereAtomically) {
    await deleteStoresWhereAtomically({
      terms: (term) => idSet.has(term.id),
      termTokenIndex: (record) => idSet.has(record.termId)
    });
  } else {
    for (const id of idSet) {
      await deleteByKey("terms", id);
      await deleteWhere("termTokenIndex", (record) => record.termId === id);
    }
  }
  const languagePairs = new Set(existingTerms.map(languagePairOf).filter(Boolean));
  for (const languagePair of languagePairs) await ensureTermIndex(languagePair);
  for (const languagePair of languagePairs) await writeTermIndexMetaClean(languagePair);
  return idSet.size;
}

async function updateTerm(term = {}) {
  const updated = termRecord(term, { requireId: true });
  const previous = await get("terms", updated.id);
  const languagePairsToEnsure = new Set([languagePairOf(previous), updated.languagePair].filter(Boolean));
  for (const languagePair of languagePairsToEnsure) await ensureTermIndex(languagePair);
  await deleteWhere("termTokenIndex", (record) => record.termId === updated.id);
  await put("terms", updated);
  await putTermIndexRecords([updated]);
  const languagePairs = new Set([languagePairOf(previous), updated.languagePair].filter(Boolean));
  for (const languagePair of languagePairs) await writeTermIndexMetaClean(languagePair);
  return updated;
}

function resourceNameSet(names, legacyName) {
  return new Set([...(Array.isArray(names) ? names : []), legacyName].map((name) => String(name || "").trim()).filter(Boolean));
}

async function findTerms(options = {}) {
  const { source, sourceLang, targetLang, termBaseName, termBaseNames } = options || {};
  const languagePair = languagePairFromFields(sourceLang, targetLang);
  if (!languagePair || !normalizeText(source)) return [];
  const sourceTokens = tokens(source).slice(0, MAX_TERM_SOURCE_TOKENS);
  let terms;
  if (sourceTokens.length) {
    await ensureTermIndex(languagePair);
    const allowedNames = resourceNameSet(termBaseNames, termBaseName);
    const candidateHits = new Map();
    const tokenRows = await Promise.all(sourceTokens.map((token) => getAllByIndex("termTokenIndex", "languagePairToken", [languagePair, token])));
    tokenRows.flat().forEach((record) => {
      if (allowedNames.size && !allowedNames.has(record.termBaseName)) return;
      candidateHits.set(record.termId, (candidateHits.get(record.termId) || 0) + 1);
    });
    const candidateIds = Array.from(candidateHits.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, MAX_TERM_CANDIDATES)
      .map(([id]) => id);
    terms = (await Promise.all(candidateIds.map((id) => get("terms", id)))).filter(Boolean);
  } else {
    terms = await getAllByIndex("terms", "languagePair", languagePair);
  }
  const allowedNames = resourceNameSet(termBaseNames, termBaseName);
  return terms
    .filter((term) => !allowedNames.size || allowedNames.has(term.termBaseName))
    .filter((term) => containsNormalizedTerm(source, term.sourceTerm))
    .sort((a, b) => b.sourceTerm.length - a.sourceTerm.length);
}

async function listTerms(options = {}) {
  const { sourceLang, targetLang, termBaseName, termBaseNames } = options || {};
  const languagePair = languagePairFromFields(sourceLang, targetLang);
  if (!languagePair) return [];
  const terms = await getAllByIndex("terms", "languagePair", languagePair);
  const allowedNames = resourceNameSet(termBaseNames, termBaseName);
  return terms.filter((term) => !allowedNames.size || allowedNames.has(term.termBaseName));
}

window.CatHan.termbase = {
  containsNormalizedTerm,
  termRanges,
  normalizeTerm,
  rebuildTermIndex,
  rebuildAllTermIndexes,
  parseTermList,
  parseTermWorkbook,
  saveTerm,
  importTerms,
  deleteTerm,
  deleteTerms,
  updateTerm,
  findTerms,
  listTerms
};
})();
