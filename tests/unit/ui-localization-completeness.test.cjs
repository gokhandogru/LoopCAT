const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const test = require("node:test");
const root = path.resolve(__dirname, "../..");
const source = require("../../i18n/source.en-US.json");

function runtime(locale) {
  const element = { nodeType: 1, querySelectorAll: () => [], hasAttribute: () => false };
  const document = {
    documentElement: {},
    body: element,
    querySelectorAll: () => [],
    createTreeWalker: () => ({ nextNode: () => null })
  };
  const window = { localStorage: { setItem() {} }, dispatchEvent() {} };
  const context = vm.createContext({
    window,
    document,
    Intl,
    Node: { ELEMENT_NODE: 1 },
    NodeFilter: { SHOW_TEXT: 4 },
    CustomEvent: class {}
  });
  vm.runInContext(fs.readFileSync(path.join(root, "i18n.js"), "utf8"), context);
  const i18n = window.CatHan.i18n;
  i18n.registerSource(source);
  i18n.registerLocale(require(`../../i18n/locales/${locale}.json`));
  i18n.setLocale(locale);
  return { i18n, document };
}

for (const locale of ["ca-ES", "es-ES", "tr-TR", "ar"]) {
  test(`${locale} catalog has complete entries and runtime resolves dynamic inflections`, () => {
    const catalog = require(`../../i18n/locales/${locale}.json`);
    const { i18n, document } = runtime(locale);
    assert.deepEqual(Object.keys(catalog.messages).sort(), Object.keys(source.messages).sort());
    assert.equal(document.documentElement.dir, locale === "ar" ? "rtl" : "ltr");
    for (const key of Object.keys(source.messages)) {
      const translation = catalog.messages[key];
      assert.ok(translation?.trim(), key);
      if (!translation.includes(", select,")) continue;
      for (const suffix of ["", "s", "ies"]) {
        const params = Object.fromEntries(
          Array.from({ length: 10 }, (_, i) => [`value${i + 1}`, i === 1 || i === 3 ? suffix : "2"])
        );
        const rendered = i18n.t(key, params);
        assert.doesNotMatch(rendered, /\{value\d+|\bselect\s*,/, `${key}: ${rendered}`);
      }
    }
    const pretranslation = i18n.source("Pretranslated 2 segments at 95%+; Undo is available");
    assert.doesNotMatch(pretranslation, /Pretranslated|Undo|\{value/);
    assert.match(pretranslation, /2|٢/);
    if (locale === "es-ES") {
      const entry = Object.entries(source.messages).find(
        ([, value]) => value.message === "{count, plural, one {# entry} other {# entries}}"
      );
      assert.ok(entry);
      assert.equal(i18n.t(entry[0], { count: 1 }), "1 entrada");
      assert.equal(i18n.t(entry[0], { count: 2 }), "2 entradas");
      assert.match(i18n.source("Pretranslated 1 segment at 95%+; Undo is available"), /Segmentos pretraducidos: 1/);
      assert.match(i18n.source("Pretranslated 2 segments at 95%+; Undo is available"), /Segmentos pretraducidos: 2/);
    }
  });
}
