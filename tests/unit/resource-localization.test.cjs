const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");
const { collectResourceMessages } = require("../../scripts/resource-i18n-messages.cjs");
const root = path.resolve(__dirname, "../..");

test("resource helper labels and service errors have nonempty translations in every supported UI locale", () => {
  const source = JSON.parse(fs.readFileSync(path.join(root, "i18n/source.en-US.json"), "utf8"));
  const keys = new Map(Object.entries(source.messages).map(([key, entry]) => [entry.message, key]));
  const catalogs = ["en-US", "tr-TR", "es-ES", "ca-ES", "ar"].map((locale) => [
    locale,
    JSON.parse(fs.readFileSync(path.join(root, `i18n/locales/${locale}.json`), "utf8"))
  ]);
  for (const [message] of collectResourceMessages(root)) {
    assert.ok(keys.has(message), `Missing resource source message: ${message}`);
    for (const [locale, catalog] of catalogs) {
      assert.ok(catalog.messages[keys.get(message)]?.trim(), `Missing ${locale} resource translation: ${message}`);
    }
  }
});

test("compiled resource catalogs localize source-based helper labels and placeholders with Arabic direction", () => {
  const document = {
    documentElement: {},
    querySelectorAll: () => [],
    createTreeWalker: () => ({ nextNode: () => false })
  };
  const context = vm.createContext({
    window: { dispatchEvent() {} },
    document,
    Node: { ELEMENT_NODE: 1 },
    NodeFilter: {},
    CustomEvent: class {}
  });
  const load = (name) => vm.runInContext(fs.readFileSync(path.join(root, name), "utf8"), context);
  load("i18n.js");
  load("i18n/source.en-US.js");
  const i18n = context.window.CatHan.i18n;
  for (const [locale, expected] of [
    ["tr-TR", "Kaynak düzenleyicisi"],
    ["es-ES", "Editor de recursos"],
    ["ca-ES", "Editor de recursos"],
    ["ar", "محرر الموارد"]
  ]) {
    load(`i18n/locales/${locale}.js`);
    i18n.setLocale(locale);
    assert.equal(i18n.source("Resource editor"), expected);
    assert.notEqual(i18n.source("Save and next"), "Save and next");
    assert.notEqual(i18n.source("Your draft"), "Your draft");
    assert.equal(document.documentElement.dir, locale === "ar" ? "rtl" : "ltr");
    const column = i18n.source("Column {number}", { number: 17 });
    assert.ok(column.includes("17"));
    assert.ok(!column.includes("{"));
    const failure = i18n.source("Could not parse {label}.", { label: "Excel worksheet" });
    assert.ok(!failure.includes("Excel worksheet"));
    assert.ok(!failure.includes("{"));
  }
});
