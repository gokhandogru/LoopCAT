const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const test = require("node:test");

const root = path.resolve(__dirname, "../..");
const moduleAt = (relativePath) => import(pathToFileURL(path.join(root, relativePath)).href);

test("UiLocalizationService preserves delegation, labels, locale, and one-time escaping", async () => {
  const { createUiLocalizationService } = await moduleAt("src/i18n/ui-localization-service.js");
  const calls = [];
  const i18n = {
    t(key, values) {
      assert.equal(this, i18n);
      calls.push(["t", key, values]);
      return `t:${key}:${values.count ?? ""}`;
    },
    source(text, values) {
      assert.equal(this, i18n);
      calls.push(["source", text, values]);
      return `s:${text}:${values.count ?? ""}`;
    },
    getLocale() {
      assert.equal(this, i18n);
      return "ca-ES";
    },
    localeDir(locale) {
      assert.equal(this, i18n);
      calls.push(["localeDir", locale]);
      return "rtl";
    }
  };
  const escaped = [];
  const service = createUiLocalizationService({
    i18n,
    documentElement: { lang: "tr-TR" },
    escapeHtml(value) {
      escaped.push(value);
      return `escaped:${value}`;
    },
    confirm: () => true,
    alert: () => {}
  });

  assert.equal(service.translate, service.translate);
  assert.equal(service.source, service.source);
  assert.equal(Object.isFrozen(service), true);
  assert.equal(service.translate("app.saved"), "t:app.saved:");
  assert.equal(service.source("Saved", { count: 2 }), "s:Saved:2");
  assert.equal(service.locale(), "ca-ES");
  assert.equal(service.direction(), "rtl");
  assert.equal(service.label("files", { count: 3 }), "t:ui.label.files:3");
  assert.equal(service.labelHtml("files", { count: 4 }), "escaped:t:ui.label.files:4");
  assert.equal(service.sourceHtml("Open", { count: 5 }), "escaped:s:Open:5");
  assert.deepEqual(escaped, ["t:ui.label.files:4", "s:Open:5"]);
  assert.deepEqual(calls.slice(0, 2), [
    ["t", "app.saved", {}],
    ["source", "Saved", { count: 2 }]
  ]);
});

test("UiLocalizationService preserves missing-i18n and locale fallbacks", async () => {
  const { createUiLocalizationService } = await moduleAt("src/i18n/ui-localization-service.js");
  const service = createUiLocalizationService({
    i18n: {},
    documentElement: { lang: "tr-TR" },
    escapeHtml: (value) => `[${value}]`,
    confirm: () => true,
    alert: () => {}
  });

  assert.equal(service.translate("missing.key"), "missing.key");
  assert.equal(service.source("Original"), "Original");
  assert.equal(service.source(0), "");
  assert.equal(service.locale(), "tr-TR");
  assert.equal(service.direction(), "ltr");
  assert.equal(service.label("empty"), "ui.label.empty");
  assert.equal(service.labelHtml("empty"), "[ui.label.empty]");
  assert.equal(service.sourceHtml("<Open>"), "[<Open>]");

  const defaultLocale = createUiLocalizationService({
    i18n: null,
    documentElement: { lang: "" },
    escapeHtml: String,
    confirm: () => true,
    alert: () => {}
  });
  assert.equal(defaultLocale.locale(), "en-US");
  assert.equal(defaultLocale.direction(), "ltr");
});

test("UiLocalizationService preserves translated confirm, alert, and delegate failures", async () => {
  const { createUiLocalizationService } = await moduleAt("src/i18n/ui-localization-service.js");
  const dialogs = [];
  const service = createUiLocalizationService({
    i18n: { source: (text, values) => `${text}:${values.value ?? ""}` },
    documentElement: { lang: "en-US" },
    escapeHtml: String,
    confirm(message) {
      dialogs.push(["confirm", message]);
      return false;
    },
    alert(message) {
      dialogs.push(["alert", message]);
    }
  });

  assert.equal(service.confirm("Continue", { value: 1 }), false);
  assert.equal(service.alert("Stopped"), undefined);
  assert.deepEqual(dialogs, [
    ["confirm", "Continue:1"],
    ["alert", "Stopped:"]
  ]);

  const failure = new Error("translation failed");
  const throwing = createUiLocalizationService({
    i18n: {
      source() {
        throw failure;
      }
    },
    documentElement: { lang: "en-US" },
    escapeHtml: String,
    confirm: () => assert.fail("confirm must not run after translation failure"),
    alert: () => assert.fail("alert must not run after translation failure")
  });
  assert.throws(
    () => throwing.confirm("Continue"),
    (error) => error === failure
  );
  assert.throws(
    () => throwing.alert("Stopped"),
    (error) => error === failure
  );
  const directionFailure = new Error("direction failed");
  const throwingDirection = createUiLocalizationService({
    i18n: {
      getLocale: () => "ar-SA",
      localeDir() {
        throw directionFailure;
      }
    },
    documentElement: { lang: "en-US" },
    escapeHtml: String,
    confirm: () => true,
    alert: () => {}
  });
  assert.throws(
    () => throwingDirection.direction(),
    (error) => error === directionFailure
  );
  assert.throws(() => createUiLocalizationService(), /HTML escaping boundary/);
});
