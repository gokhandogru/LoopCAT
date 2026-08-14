const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const test = require("node:test");

const root = path.resolve(__dirname, "../..");
const moduleAt = (relativePath) => import(pathToFileURL(path.join(root, relativePath)).href);

const entries = [
  ["en", "English"],
  ["tr", "Turkish"],
  ["ca", "Català"],
  ["en-US", "English (USA)"],
  ["es-419", "Spanish (Latin America)"],
  ["ur-Latn-PK", "Urdu (Latin script)"],
  ["en", "Duplicate English"],
  ["fr", ""]
];

function createHarness(createLanguageInputService, overrides = {}) {
  const calls = [];
  const datalists = overrides.datalists || {
    labels: { id: "labels" },
    codes: { id: "codes" },
    names: { id: "names" }
  };
  const service = createLanguageInputService({
    entries: overrides.entries || entries,
    aliases: overrides.aliases || { english: "en", turkish: "tr", catalan: "ca" },
    redact(value) {
      calls.push(["redact", value]);
      return String(value || "").replace("SECRET", "");
    },
    localization: {
      source(text) {
        calls.push(["source", text]);
        return `localized:${text}`;
      }
    },
    getLocale: () => overrides.locale || "en-US",
    getNavigatorLanguage: () => overrides.navigatorLanguage || "tr-TR",
    intl: overrides.intl || Intl,
    datalists,
    escapeHtml(value) {
      calls.push(["escapeHtml", value]);
      return `escaped:${value}`;
    },
    replaceSafeHtml(element, html) {
      calls.push(["replaceSafeHtml", element.id, html]);
    }
  });
  return { calls, datalists, service };
}

test("LanguageInputService preserves Intl canonicalization, underscore conversion, and manual casing fallback", async () => {
  const { createLanguageInputService } = await moduleAt("src/i18n/language-input-service.js");
  const { service } = createHarness(createLanguageInputService);

  assert.equal(service.canonicalCode(" EN_us "), "en-US");
  assert.equal(service.canonicalCode("es_419"), "es-419");
  assert.equal(service.canonicalCode(""), "");

  const manual = createHarness(createLanguageInputService, {
    intl: {
      getCanonicalLocales() {
        throw new RangeError("unsupported");
      },
      DisplayNames: Intl.DisplayNames
    }
  }).service;
  assert.equal(manual.canonicalCode("ZH_hans_cn"), "zh-Hans-CN");
  assert.equal(manual.canonicalCode("ES_419"), "es-419");
});

test("LanguageInputService preserves configured-name localization, Intl fallback, catalog deduplication, ordering, and caching", async () => {
  const { createLanguageInputService } = await moduleAt("src/i18n/language-input-service.js");
  class DisplayNames {
    constructor(locales, options) {
      assert.deepEqual(locales, ["ca-ES"]);
      assert.deepEqual(options, { type: "language" });
    }
    of(code) {
      return code === "fr" ? "français" : code;
    }
  }
  const { service } = createHarness(createLanguageInputService, {
    locale: "ca-ES",
    intl: { getCanonicalLocales: Intl.getCanonicalLocales, DisplayNames }
  });

  assert.equal(service.nameForUi("en"), "localized:English");
  assert.equal(service.nameForUi("fr"), "français");
  assert.equal(service.optionValue("en"), "localized:English (en)");
  assert.equal(service.optionValue(""), "");
  const firstCatalog = service.catalog();
  assert.equal(service.catalog(), firstCatalog);
  assert.equal(firstCatalog.filter((item) => item.code === "en").length, 1);
  assert.equal(firstCatalog.find((item) => item.code === "en").name, "English");
  assert.deepEqual(
    firstCatalog.map((item) => item.name),
    [...firstCatalog.map((item) => item.name)].sort((a, b) => a.localeCompare(b))
  );
});

test("LanguageInputService preserves parenthetical, leading-code, alias, name, label, accent, and unknown input normalization", async () => {
  const { createLanguageInputService } = await moduleAt("src/i18n/language-input-service.js");
  const { service } = createHarness(createLanguageInputService);

  assert.equal(service.normalizeInput("English (en)"), "en");
  assert.equal(service.normalizeInput("es-419 - Spanish"), "es-419");
  assert.equal(service.normalizeInput("Turkish"), "tr");
  assert.equal(service.normalizeInput("Catala"), "ca");
  assert.equal(service.normalizeInput("English (USA)"), "en-US");
  assert.equal(service.normalizeInput("Spanish (Latin America) (es-419)"), "es-419");
  assert.equal(service.normalizeInput("Urdu (Latin script) (ur-Latn-PK)"), "ur-Latn-PK");
  assert.equal(service.normalizeInput("DE_de"), "de-DE");
  assert.equal(service.normalizeInput(" SECRET "), "");
});

test("LanguageInputService preserves friendly display and input mutation flags", async () => {
  const { createLanguageInputService } = await moduleAt("src/i18n/language-input-service.js");
  const { service } = createHarness(createLanguageInputService);
  const input = { value: "English" };

  assert.equal(service.displayInput("English"), "localized:English (en)");
  assert.equal(service.setInput(input, "Turkish"), undefined);
  assert.equal(input.value, "localized:Turkish (tr)");
  service.setInput(input, "English", { codeOnly: true });
  assert.equal(input.value, "en");
  input.value = "Catalan";
  assert.equal(service.normalizeElement(input, { updateDisplay: false }), "ca");
  assert.equal(input.value, "Catalan");
  assert.equal(service.normalizeElement(input, { codeOnly: true }), "ca");
  assert.equal(input.value, "ca");
  assert.equal(service.normalizeElement(null), "");
  assert.equal(service.setInput(null, "en"), undefined);
});

test("LanguageInputService preserves live-sync eligibility for catalog, aliases, canonical raw codes, and incomplete input", async () => {
  const { createLanguageInputService } = await moduleAt("src/i18n/language-input-service.js");
  const { service } = createHarness(createLanguageInputService);

  assert.equal(service.shouldLiveSync({ value: "English" }), true);
  assert.equal(service.shouldLiveSync({ value: "catalan" }), true);
  assert.equal(service.shouldLiveSync({ value: "de-DE" }), true);
  assert.equal(service.shouldLiveSync({ value: "unknown language" }), true);
  assert.equal(service.shouldLiveSync({ value: "" }), false);
  assert.equal(service.shouldLiveSync(null), false);
});

test("LanguageInputService preserves localized pair display, missing-side placeholders, and empty result", async () => {
  const { createLanguageInputService } = await moduleAt("src/i18n/language-input-service.js");
  const { service } = createHarness(createLanguageInputService);

  assert.equal(service.pairDisplay("en", "tr"), "localized:English (en) -> localized:Turkish (tr)");
  assert.equal(service.pairDisplay("", "tr"), "- -> localized:Turkish (tr)");
  assert.equal(service.pairDisplay("en", ""), "localized:English (en) -> -");
  assert.equal(service.pairDisplay("", ""), "");
});

test("LanguageInputService preserves all escaped datalist shapes and absent-list behavior", async () => {
  const { createLanguageInputService } = await moduleAt("src/i18n/language-input-service.js");
  const { calls, service } = createHarness(createLanguageInputService);

  assert.equal(service.renderDatalists(), undefined);

  const replacements = calls.filter(([name]) => name === "replaceSafeHtml");
  assert.equal(replacements.length, 3);
  assert.match(
    replacements.find((entry) => entry[1] === "labels")[2],
    /<option value="escaped:English \(en\)"><\/option>/
  );
  assert.match(
    replacements.find((entry) => entry[1] === "codes")[2],
    /<option value="escaped:en" label="escaped:English"><\/option>/
  );
  assert.match(
    replacements.find((entry) => entry[1] === "names")[2],
    /<option value="escaped:English" label="escaped:en"><\/option>/
  );

  const absent = createHarness(createLanguageInputService, { datalists: {} });
  absent.service.renderDatalists();
  assert.equal(
    absent.calls.some(([name]) => name === "replaceSafeHtml"),
    false
  );
});

test("LanguageInputService validates boundaries and exposes an immutable API", async () => {
  const { createLanguageInputService } = await moduleAt("src/i18n/language-input-service.js");
  assert.throws(
    () => createLanguageInputService({}),
    /requires entries, aliases, redaction, localization, locale, Intl, and safe-presentation boundaries/
  );
  const { service } = createHarness(createLanguageInputService);
  assert.equal(Object.isFrozen(service), true);
});
