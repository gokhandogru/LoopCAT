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
  const raw = cleanText(value).toLowerCase();
  const rawTarget = cleanText(rawExpected).toLowerCase();
  if (raw && rawTarget && raw === rawTarget) return true;
  return rawTarget === String(portableExpected || "").toLowerCase() &&
    cleanPortableLabel(value).toLowerCase() === String(portableExpected || "").toLowerCase();
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

function parseTmx(text, options = {}) {
  const { sourceLang, targetLang, tmName, projectName } = tmxResourceOptions(options, { requireTmName: true });
  const xml = new DOMParser().parseFromString(text, "application/xml");
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

window.CatHan.tmx = { parseTmx, buildTmx };
})();
