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
  if (clean === "*all*") return clean;
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

function tmxResourceOptions(options = {}, { requireTmName = false } = {}) {
  const source = options || {};
  const sourceLang = requiredPortableLabel(source.sourceLang, "TMX source language is required.");
  const targetLang = requiredPortableLabel(source.targetLang, "TMX target language is required.");
  const tmName = requireTmName ? requiredPortableLabel(source.tmName, "TMX name is required.") : cleanPortableLabel(source.tmName);
  const projectName = redactSensitiveText(source.projectName || "TMX import").trim() || "TMX import";
  return { sourceLang, targetLang, tmName, projectName };
}

function languageMatches(value, rawExpected, portableExpected) {
  return languageMatchScore(value, rawExpected, portableExpected) > 0;
}

function languageMatchScore(value, rawExpected, portableExpected) {
  const actual = canonicalLanguageCode(value);
  if (!actual || actual === "*all*") return 0;
  const expected = [rawExpected, portableExpected]
    .map(canonicalLanguageCode)
    .filter(Boolean);
  if (expected.some((item) => item === actual)) return 3;
  const actualBase = baseLanguage(actual);
  if (actualBase && expected.some((item) => baseLanguage(item) === actualBase)) return 2;
  return 0;
}

function tmxEntryRecord(entry = {}, defaults = {}) {
  const source = requiredText(entry.source, "TMX entry source text is required.");
  const target = requiredText(entry.target, "TMX entry target text is required.");
  const sourceLang = cleanPortableLabel(entry.sourceLang) || defaults.sourceLang;
  const targetLang = cleanPortableLabel(entry.targetLang) || defaults.targetLang;
  return {
    ...entry,
    source,
    target,
    sourceLang,
    targetLang,
    projectName: redactSensitiveText(entry.projectName || "").trim()
  };
}

function getLang(element) {
  return element.getAttribute("xml:lang") || element.getAttribute("lang") || "";
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

function firstElementInner(text, tagName) {
  const match = createElementBlockRegex(tagName).exec(String(text || ""));
  return match ? match[3] : "";
}

function getAttribute(attrs, name) {
  const pattern = new RegExp(`(?:^|\\s)(?:[A-Za-z_][\\w.-]*:)?${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, "i");
  const match = pattern.exec(String(attrs || ""));
  return decodeXmlEntities(match?.[1] || match?.[2] || "");
}

function validateTmxEnvelope(text) {
  const value = String(text || "");
  if (!/<(?:[A-Za-z_][\w.-]*:)?tmx\b/i.test(value) || !/<\/(?:[A-Za-z_][\w.-]*:)?tmx>/i.test(value)) {
    throw new Error("The TMX file could not be parsed.");
  }
}

function bestVariantIndex(variants, rawExpected, portableExpected, excluded = new Set()) {
  let bestIndex = -1;
  let bestScore = 0;
  variants.forEach((variant, index) => {
    if (excluded.has(index) || !variant.text) return;
    const score = languageMatchScore(variant.lang, rawExpected, portableExpected);
    if (score > bestScore) {
      bestScore = score;
      bestIndex = index;
    }
  });
  return bestIndex;
}

function firstTextVariantIndex(variants, excluded = new Set()) {
  return variants.findIndex((variant, index) => !excluded.has(index) && Boolean(variant.text));
}

function pairedVariantIndexes(variants, options, defaults) {
  const usable = variants.filter((variant) => variant.text);
  if (usable.length < 2) return { sourceIndex: -1, targetIndex: -1 };
  let sourceIndex = bestVariantIndex(variants, options.sourceLang, defaults.sourceLang);
  let targetIndex = bestVariantIndex(variants, options.targetLang, defaults.targetLang, new Set(sourceIndex >= 0 ? [sourceIndex] : []));
  if (sourceIndex < 0 && targetIndex >= 0) sourceIndex = firstTextVariantIndex(variants, new Set([targetIndex]));
  if (targetIndex < 0 && sourceIndex >= 0) targetIndex = firstTextVariantIndex(variants, new Set([sourceIndex]));
  if (sourceIndex < 0 && targetIndex < 0) {
    sourceIndex = firstTextVariantIndex(variants);
    targetIndex = firstTextVariantIndex(variants, new Set([sourceIndex]));
  }
  return { sourceIndex, targetIndex };
}

function tmxEntryFromTu(tuInner, tuAttrs, defaults, options, now) {
  const tuSourceLang = getAttribute(tuAttrs, "srclang");
  const variants = [];
  const tuvPattern = createElementBlockRegex("tuv");
  let tuvMatch;
  while ((tuvMatch = tuvPattern.exec(tuInner))) {
    const segInner = firstElementInner(tuvMatch[3], "seg");
    const text = cleanText(xmlTextContent(segInner || tuvMatch[3]));
    variants.push({
      lang: getAttribute(tuvMatch[2], "lang") || tuSourceLang,
      text
    });
  }
  const { sourceIndex, targetIndex } = pairedVariantIndexes(variants, options, defaults);
  const source = variants[sourceIndex]?.text || "";
  const target = variants[targetIndex]?.text || "";
  if (!source || !target) return null;
  return {
    id: makeId("tm"),
    source,
    target,
    sourceLang: defaults.sourceLang,
    targetLang: defaults.targetLang,
    languagePair: `${defaults.sourceLang}::${defaults.targetLang}`,
    projectName: defaults.projectName,
    tmName: defaults.tmName,
    createdAt: now,
    updatedAt: now
  };
}

function parseTmx(text, options = {}) {
  const { sourceLang, targetLang, tmName, projectName } = tmxResourceOptions(options, { requireTmName: true });
  validateTmxEnvelope(text);
  const now = new Date().toISOString();
  const entries = [];
  const defaults = { sourceLang, targetLang, tmName, projectName };
  const tuPattern = createElementBlockRegex("tu");
  let tuMatch;
  while ((tuMatch = tuPattern.exec(String(text || "")))) {
    const entry = tmxEntryFromTu(tuMatch[3], tuMatch[2], defaults, options, now);
    if (entry) entries.push(entry);
  }
  return entries;
}

function defaultYield() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

async function parseTmxAsync(text, options = {}, progress = {}) {
  const { sourceLang, targetLang, tmName, projectName } = tmxResourceOptions(options, { requireTmName: true });
  validateTmxEnvelope(text);
  const value = String(text || "");
  const now = new Date().toISOString();
  const entries = [];
  const defaults = { sourceLang, targetLang, tmName, projectName };
  const tuPattern = createElementBlockRegex("tu");
  const reportEveryUnits = Math.max(100, Number(progress.reportEveryUnits || 500));
  const reportEveryChars = Math.max(256 * 1024, Number(progress.reportEveryChars || 2 * 1024 * 1024));
  const yieldFn = typeof progress.yieldFn === "function" ? progress.yieldFn : defaultYield;
  let unitCount = 0;
  let lastReportedUnits = 0;
  let lastReportedChars = 0;
  let tuMatch;

  const report = async (force = false) => {
    const processedChars = tuPattern.lastIndex || value.length;
    if (!force && unitCount - lastReportedUnits < reportEveryUnits && processedChars - lastReportedChars < reportEveryChars) return;
    lastReportedUnits = unitCount;
    lastReportedChars = processedChars;
    if (typeof progress.onProgress === "function") {
      await progress.onProgress({
        entries: entries.length,
        units: unitCount,
        processedChars,
        totalChars: value.length,
        percent: value.length ? Math.min(99, Math.floor((processedChars / value.length) * 100)) : 100
      });
    }
    await yieldFn();
  };

  while ((tuMatch = tuPattern.exec(value))) {
    unitCount += 1;
    const entry = tmxEntryFromTu(tuMatch[3], tuMatch[2], defaults, options, now);
    if (entry) entries.push(entry);
    await report(false);
  }
  await report(true);
  return entries;
}

function parseTmxDom(text, options = {}) {
  const { sourceLang, targetLang, tmName, projectName } = tmxResourceOptions(options, { requireTmName: true });
  const parserInput = window.CatHan?.appRuntime?.safeHtml?.trusted?.(text) || text;
  const xml = new DOMParser().parseFromString(parserInput, "application/xml");
  if (xml.querySelector("parsererror")) throw new Error("The TMX file could not be parsed.");
  const now = new Date().toISOString();
  const entries = [];
  Array.from(xml.getElementsByTagNameNS("*", "tu")).forEach((tu) => {
    let source = "";
    let target = "";
    Array.from(tu.getElementsByTagNameNS("*", "tuv")).forEach((tuv) => {
      const lang = getLang(tuv);
      const seg = cleanText(tuv.getElementsByTagNameNS("*", "seg")[0]?.textContent || "");
      if (languageMatches(lang, options.sourceLang, sourceLang)) source = seg;
      if (languageMatches(lang, options.targetLang, targetLang)) target = seg;
    });
    if (source && target) {
      entries.push({
        id: makeId("tm"),
        source,
        target,
        sourceLang,
        targetLang,
        languagePair: `${sourceLang}::${targetLang}`,
        projectName,
        tmName,
        createdAt: now,
        updatedAt: now
      });
    }
  });
  return entries;
}

function buildTmx(entries, optionsInput = {}) {
  const options = tmxResourceOptions(optionsInput);
  const body = (entries || [])
    .map((entry) => tmxEntryRecord(entry, options))
    .map((entry) => `    <tu creationdate="${esc(entry.createdAt || "")}" changedate="${esc(entry.updatedAt || "")}">
      <prop type="origin">${esc(redactSensitiveText(entry.projectName || "").trim())}</prop>
      <tuv xml:lang="${esc(entry.sourceLang)}"><seg>${esc(entry.source)}</seg></tuv>
      <tuv xml:lang="${esc(entry.targetLang)}"><seg>${esc(entry.target)}</seg></tuv>
    </tu>`)
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<tmx version="1.4">
  <header creationtool="LoopCAT" creationtoolversion="1.0" segtype="sentence" adminlang="en" srclang="${esc(options.sourceLang)}" datatype="PlainText"/>
  <body>
${body}
  </body>
</tmx>`;
}

window.CatHan.tmx = { parseTmx, parseTmxAsync, parseTmxDom, buildTmx };
})();
