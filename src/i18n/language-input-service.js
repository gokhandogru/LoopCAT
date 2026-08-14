/**
 * Owns shared language-code, friendly-input, display, catalog, and datalist
 * policy. Project-specific language-pair state and desktop spellcheck effects
 * remain outside this service.
 *
 * @param {{
 *   entries: Array<[string, string]>,
 *   aliases: Record<string, string>,
 *   redact: (value: unknown) => string,
 *   localization: { source: (text: string) => string },
 *   getLocale: () => string,
 *   getNavigatorLanguage: () => string,
 *   intl: typeof Intl,
 *   datalists?: { labels?: any, codes?: any, names?: any },
 *   escapeHtml: (value: unknown) => string,
 *   replaceSafeHtml: (element: any, html: string) => void
 * }} options
 */
export function createLanguageInputService(options) {
  const entries = options?.entries;
  const aliases = options?.aliases;
  const redact = options?.redact;
  const localization = options?.localization;
  const getLocale = options?.getLocale;
  const getNavigatorLanguage = options?.getNavigatorLanguage;
  const intl = options?.intl;
  const datalists = options?.datalists || {};
  const escapeHtml = options?.escapeHtml;
  const replaceSafeHtml = options?.replaceSafeHtml;
  if (
    !Array.isArray(entries) ||
    !aliases ||
    typeof redact !== "function" ||
    typeof localization?.source !== "function" ||
    typeof getLocale !== "function" ||
    typeof getNavigatorLanguage !== "function" ||
    !intl ||
    typeof escapeHtml !== "function" ||
    typeof replaceSafeHtml !== "function"
  ) {
    throw new TypeError(
      "LanguageInputService requires entries, aliases, redaction, localization, locale, Intl, and safe-presentation boundaries."
    );
  }

  let catalogCache = null;
  let entryNameCache = null;

  function canonicalCode(value) {
    const clean = redact(value || "")
      .trim()
      .replaceAll("_", "-");
    if (!clean) return "";
    try {
      if (typeof intl.getCanonicalLocales === "function") return intl.getCanonicalLocales(clean)[0] || clean;
    } catch {}
    return clean
      .split("-")
      .map((part, index) => {
        if (index === 0) return part.toLowerCase();
        if (part.length === 2 || /^\d{3}$/.test(part)) return part.toUpperCase();
        if (part.length === 4) return part[0].toUpperCase() + part.slice(1).toLowerCase();
        return part;
      })
      .join("-");
  }

  function entryNames() {
    if (entryNameCache) return entryNameCache;
    entryNameCache = new Map();
    entries.forEach(([code, name]) => {
      const clean = canonicalCode(code);
      if (clean && !entryNameCache.has(clean)) entryNameCache.set(clean, name);
    });
    return entryNameCache;
  }

  function configuredName(code) {
    return entryNames().get(canonicalCode(code)) || "";
  }

  function nameForUi(code) {
    const clean = canonicalCode(code);
    if (!clean) return "";
    const configured = configuredName(clean);
    if (configured) return localization.source(configured);
    try {
      if (typeof intl.DisplayNames === "function") {
        const names = new intl.DisplayNames([getLocale() || getNavigatorLanguage() || "en"], { type: "language" });
        const label = names.of(clean);
        if (label && label !== clean) return label;
      }
    } catch {}
    return clean;
  }

  function optionValue(code) {
    const clean = canonicalCode(code);
    if (!clean) return "";
    const name = nameForUi(clean);
    return name && name !== clean ? `${name} (${clean})` : clean;
  }

  function stableLookup(value) {
    return String(value || "")
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "");
  }

  function catalog() {
    if (catalogCache) return catalogCache;
    const seen = new Set();
    catalogCache = entries
      .map(([code, name]) => ({ code: canonicalCode(code), name: name || "" }))
      .filter((item) => {
        if (!item.code || seen.has(item.code)) return false;
        seen.add(item.code);
        return true;
      })
      .map((item) => {
        const name = item.name || nameForUi(item.code);
        return {
          code: item.code,
          name,
          label: name && name !== item.code ? `${name} (${item.code})` : item.code
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name) || a.code.localeCompare(b.code));
    return catalogCache;
  }

  function normalizeInput(value) {
    const clean = redact(value || "").trim();
    if (!clean) return "";
    const parentheticalCode = clean.match(/\(([A-Za-z]{2,3}(?:[-_][A-Za-z0-9]{2,8})*)\)\s*$/);
    if (parentheticalCode) {
      const candidate = canonicalCode(parentheticalCode[1]);
      if (entryNames().has(candidate) || candidate.includes("-")) return candidate;
    }
    const leadingCode = clean.match(/^([A-Za-z]{2,3}(?:[-_][A-Za-z0-9]{2,8})*)\s+-\s+/);
    if (leadingCode) {
      const candidate = canonicalCode(leadingCode[1]);
      if (entryNames().has(candidate) || candidate.includes("-")) return candidate;
    }
    const lookup = stableLookup(clean);
    const alias = aliases[lookup];
    if (alias) return canonicalCode(alias);
    const match = catalog().find(
      (item) =>
        stableLookup(item.code) === lookup || stableLookup(item.name) === lookup || stableLookup(item.label) === lookup
    );
    if (match) return match.code;
    return canonicalCode(clean);
  }

  function displayInput(value) {
    const code = normalizeInput(value);
    return code ? optionValue(code) : "";
  }

  function setInput(input, value, inputOptions = {}) {
    if (!input) return;
    const code = normalizeInput(value);
    input.value = inputOptions.codeOnly ? code : displayInput(code);
  }

  function normalizeElement(input, inputOptions = {}) {
    if (!input) return "";
    const code = normalizeInput(input.value);
    if (code && inputOptions.updateDisplay !== false) {
      input.value = inputOptions.codeOnly ? code : displayInput(code);
    }
    return code;
  }

  function shouldLiveSync(input) {
    const raw = redact(input?.value || "").trim();
    if (!raw) return false;
    const code = normalizeInput(raw);
    if (!code) return false;
    if (catalog().some((item) => item.code === code)) return true;
    const lookup = stableLookup(raw);
    return Boolean(aliases[lookup]) || lookup === stableLookup(code);
  }

  function pairDisplay(sourceLang, targetLang) {
    const source = normalizeInput(sourceLang);
    const target = normalizeInput(targetLang);
    if (!source && !target) return "";
    return `${optionValue(source) || source || "-"} -> ${optionValue(target) || target || "-"}`;
  }

  function renderDatalists() {
    if (datalists.labels) {
      replaceSafeHtml(
        datalists.labels,
        catalog()
          .map((item) => `<option value="${escapeHtml(item.label)}"></option>`)
          .join("")
      );
    }
    if (datalists.codes) {
      replaceSafeHtml(
        datalists.codes,
        catalog()
          .map((item) => `<option value="${escapeHtml(item.code)}" label="${escapeHtml(item.name)}"></option>`)
          .join("")
      );
    }
    if (datalists.names) {
      replaceSafeHtml(
        datalists.names,
        catalog()
          .map((item) => `<option value="${escapeHtml(item.name)}" label="${escapeHtml(item.code)}"></option>`)
          .join("")
      );
    }
  }

  return Object.freeze({
    canonicalCode,
    catalog,
    nameForUi,
    optionValue,
    normalizeInput,
    displayInput,
    setInput,
    normalizeElement,
    shouldLiveSync,
    pairDisplay,
    renderDatalists
  });
}
