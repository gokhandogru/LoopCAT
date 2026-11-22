const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

test("compiled Exchange UI catalogs localize pack removal, scoped project names and catalog review without changing values", () => {
  const directory = path.resolve(__dirname, "../..");
  const document = {
    documentElement: {},
    querySelectorAll: () => [],
    createTreeWalker: () => ({ nextNode: () => false })
  };
  const context = vm.createContext({
    window: { dispatchEvent: () => {} },
    document,
    Node: { ELEMENT_NODE: 1 },
    NodeFilter: {},
    CustomEvent: class {}
  });
  function load(name) {
    vm.runInContext(fs.readFileSync(path.join(directory, name), "utf8"), context);
  }
  load("i18n.js");
  load("i18n/source.en-US.js");
  const i18n = context.window.CatHan.i18n;
  const prompt = "Uninstall {pack}? Affected projects: {projects}. Accepted translations and copied terms are kept.";
  for (const [locale, expected] of [
    ["en-US", "Uninstall from this device"],
    ["tr-TR", "Bu cihazdan kaldır"],
    ["ca-ES", "Desinstal·la d'aquest dispositiu"],
    ["es-ES", "Desinstalar de este dispositivo"],
    ["ar", "إزالة التثبيت من هذا الجهاز"]
  ]) {
    load(`i18n/locales/${locale}.js`);
    i18n.setLocale(locale);
    assert.equal(i18n.source("Uninstall from this device"), expected);
    assert.equal(document.documentElement.dir, locale === "ar" ? "rtl" : "ltr");
    const value = i18n.source(prompt, { pack: "Private Pack Name", projects: "ABC & XYZ" });
    assert.match(value, /Private Pack Name/);
    assert.match(value, /ABC & XYZ/);
    assert.ok(!value.includes("{"));
    const count = i18n.source("{count} of {total} releases", { count: 3, total: 17 });
    assert.match(count, /3/);
    assert.match(count, /17/);
    assert.ok(!count.includes("{"));
    const direction = i18n.source("Translation from {from} into {to}", { from: "EN", to: "TR" });
    assert.match(direction, /EN/);
    assert.match(direction, /TR/);
    if (locale !== "en-US") {
      assert.notEqual(
        i18n.source("Trust this fingerprint for this session"),
        "Trust this fingerprint for this session"
      );
      assert.notEqual(i18n.source("QA pack"), "QA pack");
      for (const label of ["Any", "Search catalog", "Generate a translation", "Pack details"])
        assert.notEqual(i18n.source(label), label, locale + " " + label);
    }
  }
});
