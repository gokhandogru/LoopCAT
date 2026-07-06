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

function tbxResourceOptions(options = {}, { requireTermBaseName = false } = {}) {
  const source = options || {};
  const sourceLang = requiredPortableLabel(source.sourceLang, "TBX source language is required.");
  const targetLang = requiredPortableLabel(source.targetLang, "TBX target language is required.");
  const termBaseName = requireTermBaseName ? requiredPortableLabel(source.termBaseName, "Termbase name is required.") : cleanPortableLabel(source.termBaseName);
  return { sourceLang, targetLang, termBaseName };
}

function languageMatches(value, rawExpected, portableExpected) {
  const raw = cleanText(value).toLowerCase();
  const rawTarget = cleanText(rawExpected).toLowerCase();
  if (raw && rawTarget && raw === rawTarget) return true;
  return rawTarget === String(portableExpected || "").toLowerCase() &&
    cleanPortableLabel(value).toLowerCase() === String(portableExpected || "").toLowerCase();
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

function parseTbx(text, options = {}) {
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

window.CatHan.tbx = { parseTbx, buildTbx };
})();
