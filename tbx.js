(() => {
const { makeId } = window.CatHan.storage;
const SENSITIVE_TEXT_VALUE_PATTERN = /(sk-[A-Za-z0-9_-]{8,}|Bearer\s+[A-Za-z0-9._~+/=-]{8,}|gh[pousr]_[A-Za-z0-9_]{8,}|npm_[A-Za-z0-9_]{8,}|(?:session|cookie)[=:][A-Za-z0-9._~+/=-]{8,})/i;

function esc(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function redactSensitiveText(value) {
  return String(value || "").replace(new RegExp(SENSITIVE_TEXT_VALUE_PATTERN.source, "gi"), "[redacted secret]");
}

function cleanText(value) {
  return String(value ?? "").trim();
}

function cleanPortableLabel(value) {
  return redactSensitiveText(cleanText(value)).trim();
}

function canonicalLanguageCode(value) {
  const clean = cleanText(value);
  if (!clean) return "";
  const parentheticalCode = clean.match(/\(([A-Za-z]{2,3}(?:[-_][A-Za-z0-9]{2,8})*)\)\s*$/);
  const leadingCode = clean.match(/^([A-Za-z]{2,3}(?:[-_][A-Za-z0-9]{2,8})*)\s+-\s+/);
  const rawCode = parentheticalCode?.[1] || leadingCode?.[1] || clean;
  return rawCode
    .replace(/_/g, "-")
    .trim()
    .toLowerCase();
}

function baseLanguage(value) {
  return canonicalLanguageCode(value).split("-")[0] || "";
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

function tbxResourceOptions(options = {}, { requireTermBaseName = false } = {}) {
  const source = options || {};
  const sourceLang = requiredPortableLabel(source.sourceLang, "TBX source language is required.");
  const targetLang = requiredPortableLabel(source.targetLang, "TBX target language is required.");
  const termBaseName = requireTermBaseName ? requiredPortableLabel(source.termBaseName, "Termbase name is required.") : cleanPortableLabel(source.termBaseName);
  return { sourceLang, targetLang, termBaseName };
}

function languageMatches(value, rawExpected, portableExpected) {
  return languageMatchScore(value, rawExpected, portableExpected) > 0;
}

function languageMatchScore(value, rawExpected, portableExpected) {
  const actual = canonicalLanguageCode(value);
  if (!actual) return 0;
  const expected = [rawExpected, portableExpected]
    .map(canonicalLanguageCode)
    .filter(Boolean);
  if (expected.some((item) => item === actual)) return 3;
  const actualBase = baseLanguage(actual);
  if (actualBase && expected.some((item) => baseLanguage(item) === actualBase)) return 2;
  return 0;
}

function tbxTermRecord(term = {}, defaults = {}) {
  const sourceTerm = requiredText(term.sourceTerm, "TBX source term is required.");
  const targetTerm = requiredText(term.targetTerm, "TBX target term is required.");
  const sourceLang = cleanPortableLabel(term.sourceLang) || defaults.sourceLang;
  const targetLang = cleanPortableLabel(term.targetLang) || defaults.targetLang;
  return {
    ...term,
    sourceTerm,
    targetTerm,
    sourceLang,
    targetLang,
    notes: redactSensitiveText(term.notes || "").trim()
  };
}

function langOf(node) {
  return node.getAttribute("xml:lang") || node.getAttribute("lang") || "";
}

function descripType(node) {
  return String(node.getAttribute("type") || "").replace(/[-_\s]/g, "").toLowerCase();
}

function decodeXmlEntities(value) {
  return String(value || "").replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (match, entity) => {
    const clean = entity.toLowerCase();
    if (clean === "amp") return "&";
    if (clean === "lt") return "<";
    if (clean === "gt") return ">";
    if (clean === "quot") return '"';
    if (clean === "apos") return "'";
    if (clean.startsWith("#x")) return String.fromCodePoint(Number.parseInt(clean.slice(2), 16));
    if (clean.startsWith("#")) return String.fromCodePoint(Number.parseInt(clean.slice(1), 10));
    return match;
  });
}

function xmlTextContent(value) {
  return decodeXmlEntities(String(value || "")
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<\?[\s\S]*?\?>/g, "")
    .replace(/<[^>]+>/g, ""));
}

function createElementBlockRegex(tagName) {
  return new RegExp(`<((?:[A-Za-z_][\\w.-]*:)?${tagName})\\b([^>]*)>([\\s\\S]*?)<\\/\\1>`, "gi");
}

function createAnyElementBlockRegex(tagNames) {
  const names = tagNames.join("|");
  return new RegExp(`<((?:[A-Za-z_][\\w.-]*:)?(?:${names}))\\b([^>]*)>([\\s\\S]*?)<\\/\\1>`, "gi");
}

function firstElementInner(text, tagNames) {
  const pattern = Array.isArray(tagNames) ? createAnyElementBlockRegex(tagNames) : createElementBlockRegex(tagNames);
  const match = pattern.exec(String(text || ""));
  return match ? match[3] : "";
}

function getAttribute(attrs, name) {
  const pattern = new RegExp(`(?:^|\\s)(?:[A-Za-z_][\\w.-]*:)?${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, "i");
  const match = pattern.exec(String(attrs || ""));
  return decodeXmlEntities(match?.[1] || match?.[2] || "");
}

function descripTypeFromAttrs(attrs) {
  return String(getAttribute(attrs, "type") || "").replace(/[-_\s]/g, "").toLowerCase();
}

function validateTbxEnvelope(text) {
  const value = String(text || "");
  if (!/<(?:[A-Za-z_][\w.-]*:)?tbx\b/i.test(value) || !/<\/(?:[A-Za-z_][\w.-]*:)?tbx>/i.test(value)) {
    throw new Error("The TBX file could not be parsed.");
  }
}

function bestVariantIndex(variants, rawExpected, portableExpected, excluded = new Set()) {
  let bestIndex = -1;
  let bestScore = 0;
  variants.forEach((variant, index) => {
    if (excluded.has(index) || !variant.term) return;
    const score = languageMatchScore(variant.lang, rawExpected, portableExpected);
    if (score > bestScore) {
      bestScore = score;
      bestIndex = index;
    }
  });
  return bestIndex;
}

function firstTermVariantIndex(variants, excluded = new Set()) {
  return variants.findIndex((variant, index) => !excluded.has(index) && Boolean(variant.term));
}

function pairedVariantIndexes(variants, options, defaults) {
  const usable = variants.filter((variant) => variant.term);
  if (usable.length < 2) return { sourceIndex: -1, targetIndex: -1 };
  let sourceIndex = bestVariantIndex(variants, options.sourceLang, defaults.sourceLang);
  let targetIndex = bestVariantIndex(variants, options.targetLang, defaults.targetLang, new Set(sourceIndex >= 0 ? [sourceIndex] : []));
  if (sourceIndex < 0 && targetIndex >= 0) sourceIndex = firstTermVariantIndex(variants, new Set([targetIndex]));
  if (targetIndex < 0 && sourceIndex >= 0) targetIndex = firstTermVariantIndex(variants, new Set([sourceIndex]));
  if (sourceIndex < 0 && targetIndex < 0) {
    sourceIndex = firstTermVariantIndex(variants);
    targetIndex = firstTermVariantIndex(variants, new Set([sourceIndex]));
  }
  return { sourceIndex, targetIndex };
}

function tbxTermFromEntry(entryInner, defaults, options, now) {
  const descrips = [];
  const descripPattern = createAnyElementBlockRegex(["descrip", "note"]);
  let descripMatch;
  while ((descripMatch = descripPattern.exec(entryInner))) {
    descrips.push({
      type: descripTypeFromAttrs(descripMatch[2]) || descripMatch[1].split(":").pop().toLowerCase(),
      text: cleanText(xmlTextContent(descripMatch[3]))
    });
  }
  const status = descrips
    .filter((node) => ["termstatus", "status"].includes(node.type))
    .map((node) => String(node.text || "").trim().toLowerCase())
    .join(" ");
  const rawNotes = descrips
    .filter((node) => ["context", "note", "definition", "explanation", "usagenote"].includes(node.type))
    .map((node) => String(node.text || "").trim())
    .filter(Boolean)
    .join("; ");
  const notes = redactSensitiveText(rawNotes).trim();
  const variants = [];
  const langPattern = createAnyElementBlockRegex(["langSet", "langSec"]);
  let langMatch;
  while ((langMatch = langPattern.exec(entryInner))) {
    const termInner = firstElementInner(langMatch[3], "term");
    variants.push({
      lang: getAttribute(langMatch[2], "lang"),
      term: cleanText(xmlTextContent(termInner || langMatch[3]))
    });
  }
  const { sourceIndex, targetIndex } = pairedVariantIndexes(variants, options, defaults);
  const sourceTerm = variants[sourceIndex]?.term || "";
  const targetTerm = variants[targetIndex]?.term || "";
  if (!sourceTerm || !targetTerm) return null;
  return {
    id: window.CatHan.storage.makeId("term"),
    sourceTerm,
    targetTerm,
    sourceLang: defaults.sourceLang,
    targetLang: defaults.targetLang,
    languagePair: `${defaults.sourceLang}::${defaults.targetLang}`,
    notes,
    termBaseName: defaults.termBaseName,
    isForbidden: status.includes("forbidden"),
    createdAt: now,
    updatedAt: now
  };
}

function parseTbx(text, options = {}) {
  const { sourceLang, targetLang, termBaseName } = tbxResourceOptions(options, { requireTermBaseName: true });
  validateTbxEnvelope(text);
  const now = new Date().toISOString();
  const terms = [];
  const defaults = { sourceLang, targetLang, termBaseName };
  const entryPattern = createAnyElementBlockRegex(["termEntry", "conceptEntry"]);
  let entryMatch;
  while ((entryMatch = entryPattern.exec(String(text || "")))) {
    const term = tbxTermFromEntry(entryMatch[3], defaults, options, now);
    if (term) terms.push(term);
  }
  return terms;
}

function defaultYield() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

async function parseTbxAsync(text, options = {}, progress = {}) {
  const { sourceLang, targetLang, termBaseName } = tbxResourceOptions(options, { requireTermBaseName: true });
  validateTbxEnvelope(text);
  const value = String(text || "");
  const now = new Date().toISOString();
  const terms = [];
  const defaults = { sourceLang, targetLang, termBaseName };
  const entryPattern = createAnyElementBlockRegex(["termEntry", "conceptEntry"]);
  const reportEveryUnits = Math.max(100, Number(progress.reportEveryUnits || 500));
  const reportEveryChars = Math.max(256 * 1024, Number(progress.reportEveryChars || 2 * 1024 * 1024));
  const yieldFn = typeof progress.yieldFn === "function" ? progress.yieldFn : defaultYield;
  let unitCount = 0;
  let lastReportedUnits = 0;
  let lastReportedChars = 0;
  let entryMatch;

  const report = async (force = false) => {
    const processedChars = entryPattern.lastIndex || value.length;
    if (!force && unitCount - lastReportedUnits < reportEveryUnits && processedChars - lastReportedChars < reportEveryChars) return;
    lastReportedUnits = unitCount;
    lastReportedChars = processedChars;
    if (typeof progress.onProgress === "function") {
      await progress.onProgress({
        terms: terms.length,
        units: unitCount,
        processedChars,
        totalChars: value.length,
        percent: value.length ? Math.min(99, Math.floor((processedChars / value.length) * 100)) : 100
      });
    }
    await yieldFn();
  };

  while ((entryMatch = entryPattern.exec(value))) {
    unitCount += 1;
    const term = tbxTermFromEntry(entryMatch[3], defaults, options, now);
    if (term) terms.push(term);
    await report(false);
  }
  await report(true);
  return terms;
}

function parseTbxDom(text, options = {}) {
  const { sourceLang, targetLang, termBaseName } = tbxResourceOptions(options, { requireTermBaseName: true });
  const xml = new DOMParser().parseFromString(text, "application/xml");
  if (xml.querySelector("parsererror")) throw new Error("The TBX file could not be parsed.");
  const now = new Date().toISOString();
  const terms = [];
  Array.from(xml.getElementsByTagNameNS("*", "termEntry")).forEach((entry) => {
    let sourceTerm = "";
    let targetTerm = "";
    const descrips = Array.from(entry.getElementsByTagNameNS("*", "descrip"));
    const status = descrips
      .filter((node) => ["termstatus", "status"].includes(descripType(node)))
      .map((node) => String(node.textContent || "").trim().toLowerCase())
      .join(" ");
    const rawNotes = descrips
      .filter((node) => ["context", "note", "definition", "explanation"].includes(descripType(node)))
      .map((node) => String(node.textContent || "").trim())
      .filter(Boolean)
      .join("; ");
    const notes = redactSensitiveText(rawNotes).trim();
    Array.from(entry.getElementsByTagNameNS("*", "langSet")).forEach((langSet) => {
      const lang = langOf(langSet).toLowerCase();
      const term = cleanText(langSet.getElementsByTagNameNS("*", "term")[0]?.textContent || "");
      if (languageMatches(lang, options.sourceLang, sourceLang)) sourceTerm = term;
      if (languageMatches(lang, options.targetLang, targetLang)) targetTerm = term;
    });
    if (sourceTerm && targetTerm) {
      terms.push({
        id: makeId("term"),
        sourceTerm,
        targetTerm,
        sourceLang,
        targetLang,
        languagePair: `${sourceLang}::${targetLang}`,
        notes,
        termBaseName,
        isForbidden: status.includes("forbidden"),
        createdAt: now,
        updatedAt: now
      });
    }
  });
  return terms;
}

function buildTbx(terms, optionsInput = {}) {
  const options = tbxResourceOptions(optionsInput);
  const body = (terms || [])
    .map((term) => tbxTermRecord(term, options))
    .map((term) => {
      const notes = redactSensitiveText(term.notes || "").trim();
      return `      <termEntry id="${esc(term.id)}">
        <langSet xml:lang="${esc(term.sourceLang)}"><tig><term>${esc(term.sourceTerm)}</term></tig></langSet>
        <langSet xml:lang="${esc(term.targetLang)}"><tig><term>${esc(term.targetTerm)}</term></tig></langSet>
        ${term.isForbidden ? `<descrip type="termStatus">forbidden</descrip>` : ""}
        ${notes ? `<descrip type="context">${esc(notes)}</descrip>` : ""}
      </termEntry>`;
    })
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<tbx>
  <text>
    <body>
${body}
    </body>
  </text>
</tbx>`;
}

window.CatHan.tbx = { parseTbx, parseTbxAsync, parseTbxDom, buildTbx };
})();
