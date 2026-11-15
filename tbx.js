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
  return String(value || "").split(/(<!\[CDATA\[[\s\S]*?\]\]>)/g).map((part) => {
    if (part.startsWith("<![CDATA[")) return part.slice(9, -3);
    return decodeXmlEntities(part.replace(/<!--[\s\S]*?-->/g, "").replace(/<\?[\s\S]*?\?>/g, "").replace(/<[^>]+>/g, ""));
  }).join("");
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
  if (typeof DOMParser !== "undefined") {
    const parserInput = window.CatHan?.appRuntime?.safeHtml?.trusted?.(value) || value;
    const xml = new DOMParser().parseFromString(parserInput, "application/xml");
    if (xml.getElementsByTagName("parsererror").length || !["tbx", "martif"].includes(xml.documentElement?.localName)) {
      throw new Error("The TBX file could not be parsed.");
    }
  } else if (!/<(?:[A-Za-z_][\w.-]*:)?(?:tbx|martif)\b/i.test(value) || !/<\/(?:[A-Za-z_][\w.-]*:)?(?:tbx|martif)>/i.test(value)) {
    throw new Error("The TBX file could not be parsed.");
  }
  // Protect literal CDATA markup from the streaming matcher and ignore comments.
  return value.replace(/<!\[CDATA\[([\s\S]*?)\]\]>|<!--[\s\S]*?-->/g, (match, cdata) => cdata === undefined ? "" : esc(cdata));
}

function bestVariantIndex(variants, rawExpected, portableExpected, excluded = new Set()) {
  let bestIndex = -1;
  let bestScore = 0;
  let tied = false;
  variants.forEach((variant, index) => {
    if (excluded.has(index) || !variant.term) return;
    const score = languageMatchScore(variant.lang, rawExpected, portableExpected);
    if (score > bestScore) {
      bestScore = score;
      bestIndex = index;
      tied = false;
    } else if (score > 0 && score === bestScore) {
      tied = true;
    }
  });
  if (tied) throw new Error(`TBX language ${cleanText(rawExpected)} has ambiguous variants. Choose an exact locale.`);
  return bestIndex;
}

function firstTermVariantIndex(variants, excluded = new Set()) {
  return variants.findIndex((variant, index) => !excluded.has(index) && !canonicalLanguageCode(variant.lang) && Boolean(variant.term));
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

function tbxTermFromEntry(entryInner, defaults, options, now, entryAttrs = "") {
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
    .filter((node) => ["context", "note", "explanation", "usagenote"].includes(node.type))
    .map((node) => String(node.text || "").trim())
    .filter(Boolean)
    .join("; ");
  const notes = redactSensitiveText(rawNotes).trim();
  const metadata = Object.fromEntries(descrips.map((item) => [item.type, item.text]));
  const variants = [];
  const langPattern = createAnyElementBlockRegex(["langSet", "langSec"]);
  let langMatch;
  while ((langMatch = langPattern.exec(entryInner))) {
    const termInner = firstElementInner(langMatch[3], "term");
    const designations = [];
    const designationPattern = createAnyElementBlockRegex(["tig", "ntig", "termSec"]);
    let designation;
    while ((designation = designationPattern.exec(langMatch[3]))) {
      const term = cleanText(xmlTextContent(firstElementInner(designation[3], "term")));
      if (!term) continue;
      const notePattern = createElementBlockRegex("termNote");
      const termNotes = {};
      let note;
      while ((note = notePattern.exec(designation[3]))) termNotes[descripTypeFromAttrs(note[2])] = cleanText(xmlTextContent(note[3]));
      designations.push({ term, id: getAttribute(designation[2], "id"), notes: termNotes });
    }
    variants.push({
      lang: getAttribute(langMatch[2], "lang"),
      term: cleanText(xmlTextContent(termInner)),
      designations: designations.length ? designations : [{ term: cleanText(xmlTextContent(termInner)), id: "", notes: {} }]
    });
  }
  const { sourceIndex, targetIndex } = pairedVariantIndexes(variants, options, defaults);
  const sourceTerm = variants[sourceIndex]?.term || "";
  const targetTerm = variants[targetIndex]?.term || "";
  if (!sourceTerm || !targetTerm) return [];
  const base = {
    id: window.CatHan.storage.makeId("term"),
    conceptId: cleanText(metadata.xloopcatconceptid || metadata.loopcatconceptid || metadata.conceptid || getAttribute(entryAttrs, "id")),
    sourceDesignationId: cleanText(
      metadata.xloopcatsourcedesignationid || metadata.loopcatsourcedesignationid || metadata.sourcedesignationid
    ),
    targetDesignationId: cleanText(
      metadata.xloopcattargetdesignationid || metadata.loopcattargetdesignationid || metadata.targetdesignationid
    ),
    sourceTerm,
    targetTerm,
    sourceLang: defaults.sourceLang,
    targetLang: defaults.targetLang,
    languagePair: `${defaults.sourceLang}::${defaults.targetLang}`,
    notes: metadata.xloopcatnotes == null ? notes : redactSensitiveText(metadata.xloopcatnotes),
    definition: cleanText(metadata.definition),
    subject: cleanText(metadata.subjectfield || metadata.subject),
    domain: cleanText(metadata.domain),
    partOfSpeech: cleanText(metadata.partofspeech),
    usageExample: cleanText(metadata.context || metadata.usageexample),
    status: status.includes("forbidden") ? "forbidden" : status.includes("admitted") ? "admitted" : "preferred",
    caseSensitivity: ["sensitive", "initial-sensitive", "insensitive"].includes(metadata.casesensitivity)
      ? metadata.casesensitivity
      : "insensitive",
    matchMode: ["exact", "prefix", "fuzzy"].includes(metadata.matchmode) ? metadata.matchmode : "exact",
    fuzzyThreshold: Math.max(50, Math.min(100, Number(metadata.fuzzythreshold) || 85)),
    termBaseName: defaults.termBaseName,
    isForbidden: status.includes("forbidden"),
    createdAt: now,
    updatedAt: now
  };
  return variants[sourceIndex].designations.flatMap((source) => variants[targetIndex].designations.map((target) => {
    const administrativeStatus = String(target.notes.administrativestatus || target.notes.termstatus || "").toLowerCase();
    const designationStatus = administrativeStatus.includes("deprecated") || administrativeStatus.includes("forbidden")
      ? "forbidden" : administrativeStatus.includes("admitted") ? "admitted" : administrativeStatus.includes("preferred") ? "preferred" : base.status;
    return {
      ...base,
      id: window.CatHan.storage.makeId("term"),
      sourceTerm: source.term,
      targetTerm: target.term,
      sourceDesignationId: base.sourceDesignationId || source.id,
      targetDesignationId: base.targetDesignationId || target.id,
      status: designationStatus,
      isForbidden: designationStatus === "forbidden",
      partOfSpeech: target.notes.partofspeech || source.notes.partofspeech || base.partOfSpeech
    };
  }));
}

function parseTbx(text, options = {}) {
  const { sourceLang, targetLang, termBaseName } = tbxResourceOptions(options, { requireTermBaseName: true });
  text = validateTbxEnvelope(text);
  const now = new Date().toISOString();
  const terms = [];
  const defaults = { sourceLang, targetLang, termBaseName };
  const entryPattern = createAnyElementBlockRegex(["termEntry", "conceptEntry"]);
  let entryMatch;
  while ((entryMatch = entryPattern.exec(String(text || "")))) {
    terms.push(...tbxTermFromEntry(entryMatch[3], defaults, options, now, entryMatch[2]));
  }
  return terms;
}

function defaultYield() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

async function parseTbxAsync(text, options = {}, progress = {}) {
  const { sourceLang, targetLang, termBaseName } = tbxResourceOptions(options, { requireTermBaseName: true });
  text = validateTbxEnvelope(text);
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
    terms.push(...tbxTermFromEntry(entryMatch[3], defaults, options, now, entryMatch[2]));
    await report(false);
  }
  await report(true);
  return terms;
}

function parseTbxDom(text, options = {}) {
  return parseTbx(text, options);
}

function buildTbx(terms, optionsInput = {}) {
  const options = tbxResourceOptions(optionsInput);
  const body = (terms || [])
    .map((term) => tbxTermRecord(term, options))
    .map((term, index) => {
      const notes = redactSensitiveText(term.notes || "").trim();
      const metadata = [
        ["x-loopcat-conceptId", term.conceptId],
        ["x-loopcat-sourceDesignationId", term.sourceDesignationId],
        ["x-loopcat-targetDesignationId", term.targetDesignationId],
        ["termStatus", term.status || (term.isForbidden ? "forbidden" : "preferred")],
        ["definition", term.definition],
        ["subjectField", term.subject],
        ["domain", term.domain],
        ["partOfSpeech", term.partOfSpeech],
        ["context", term.usageExample || notes],
        ["x-loopcat-notes", term.usageExample && notes ? notes : ""],
        ["caseSensitivity", term.caseSensitivity],
        ["matchMode", term.matchMode],
        ["fuzzyThreshold", term.matchMode === "fuzzy" ? term.fuzzyThreshold || 85 : ""]
      ].filter(([, value]) => value !== undefined && value !== null && String(value).trim());
      const entryId = /^[A-Za-z_][A-Za-z0-9_.-]*$/.test(String(term.id || "")) ? term.id : `term-${index + 1}`;
      return `      <termEntry id="${esc(entryId)}">
        ${metadata.map(([type, value]) => `<descrip type="${esc(type)}">${esc(value)}</descrip>`).join("\n        ")}
        <langSet xml:lang="${esc(term.sourceLang)}"><tig><term>${esc(term.sourceTerm)}</term></tig></langSet>
        <langSet xml:lang="${esc(term.targetLang)}"><tig><term>${esc(term.targetTerm)}</term></tig></langSet>
      </termEntry>`;
    })
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<martif type="TBX" xml:lang="${esc(options.sourceLang)}">
  <martifHeader><fileDesc><sourceDesc><p>LoopCAT terminology export</p></sourceDesc></fileDesc></martifHeader>
  <text>
    <body>
${body}
    </body>
  </text>
</martif>`;
}

window.CatHan.tbx = { parseTbx, parseTbxAsync, parseTbxDom, buildTbx };
})();
