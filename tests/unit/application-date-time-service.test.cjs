const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const test = require("node:test");

const root = path.resolve(__dirname, "..", "..");

function loadFactory() {
  return import(pathToFileURL(path.join(root, "src/app/application-date-time-service.js")).href);
}

function createHarness(createApplicationDateTimeService, overrides = {}) {
  const calls = [];
  const formatterOptions = [];
  const model = {
    locale: Object.hasOwn(overrides, "locale") ? overrides.locale : "tr-TR",
    localizedNever: Object.hasOwn(overrides, "localizedNever") ? overrides.localizedNever : "Asla"
  };
  const formattedResult = Object.hasOwn(overrides, "formattedResult") ? overrides.formattedResult : "formatted-result";
  const dependencies = {
    localization: {
      source(value) {
        calls.push(["localize", value]);
        if (overrides.localizationError) throw overrides.localizationError;
        return model.localizedNever;
      }
    },
    locale: {
      get() {
        calls.push(["getLocale"]);
        if (overrides.localeError) throw overrides.localeError;
        return model.locale;
      }
    },
    formatter: {
      create(currentLocale, options) {
        calls.push(["createFormatter", currentLocale, { ...options }]);
        formatterOptions.push(options);
        if (overrides.formatterError) throw overrides.formatterError;
        if (overrides.createFormatter) return overrides.createFormatter({ calls, currentLocale, options });
        const instance = {
          format(value) {
            calls.push(["format", value, this === instance]);
            if (overrides.formatError) throw overrides.formatError;
            return formattedResult;
          }
        };
        return instance;
      }
    },
    date: {
      create(value) {
        calls.push(["createDate", value]);
        if (overrides.dateError) throw overrides.dateError;
        return { dateValue: value };
      }
    }
  };
  return {
    calls,
    formatterOptions,
    model,
    dependencies,
    service: createApplicationDateTimeService(dependencies)
  };
}

test("ApplicationDateTimeService preserves every falsy Never fallback without consulting date dependencies", async () => {
  const { createApplicationDateTimeService } = await loadFactory();
  const harness = createHarness(createApplicationDateTimeService);
  for (const value of [undefined, null, false, 0, -0, 0n, "", Number.NaN]) {
    assert.equal(harness.service.date(value), "Asla");
    assert.equal(harness.service.dateTime(value), "Asla");
  }
  assert.deepEqual(
    harness.calls,
    Array.from({ length: 16 }, () => ["localize", "Never"])
  );
});

test("ApplicationDateTimeService preserves medium-date options, call order, raw value, and formatter receiver", async () => {
  const { createApplicationDateTimeService } = await loadFactory();
  const harness = createHarness(createApplicationDateTimeService);
  const value = { raw: "date-input" };
  assert.equal(harness.service.date(value), "formatted-result");
  assert.deepEqual(harness.calls, [
    ["getLocale"],
    ["createFormatter", "tr-TR", { dateStyle: "medium" }],
    ["createDate", value],
    ["format", { dateValue: value }, true]
  ]);
});

test("ApplicationDateTimeService preserves medium-date short-time options and fresh formatter inputs", async () => {
  const { createApplicationDateTimeService } = await loadFactory();
  const harness = createHarness(createApplicationDateTimeService);
  assert.equal(harness.service.dateTime("first"), "formatted-result");
  assert.equal(harness.service.dateTime("second"), "formatted-result");
  assert.deepEqual(harness.calls, [
    ["getLocale"],
    ["createFormatter", "tr-TR", { dateStyle: "medium", timeStyle: "short" }],
    ["createDate", "first"],
    ["format", { dateValue: "first" }, true],
    ["getLocale"],
    ["createFormatter", "tr-TR", { dateStyle: "medium", timeStyle: "short" }],
    ["createDate", "second"],
    ["format", { dateValue: "second" }, true]
  ]);
  assert.notStrictEqual(harness.formatterOptions[0], harness.formatterOptions[1]);
});

test("ApplicationDateTimeService preserves falsy locale fallback and live per-call locale reads", async () => {
  const { createApplicationDateTimeService } = await loadFactory();
  const harness = createHarness(createApplicationDateTimeService, { locale: "" });
  const falsyLocales = ["", null, false, 0, Number.NaN, undefined];
  for (const currentLocale of falsyLocales) {
    harness.model.locale = currentLocale;
    harness.service.date("value");
  }
  harness.model.locale = "ca-ES";
  harness.service.dateTime("value");
  assert.deepEqual(
    harness.calls.filter(([name]) => name === "createFormatter").map(([, currentLocale]) => currentLocale),
    [...falsyLocales.map(() => undefined), "ca-ES"]
  );
});

test("ApplicationDateTimeService returns localization and formatter values without normalization", async () => {
  const { createApplicationDateTimeService } = await loadFactory();
  const localizedResult = { localized: true };
  const formattedResult = { formatted: true };
  const harness = createHarness(createApplicationDateTimeService, {
    localizedNever: localizedResult,
    formattedResult
  });
  assert.strictEqual(harness.service.date(null), localizedResult);
  assert.strictEqual(harness.service.dateTime(17), formattedResult);
  assert.deepEqual(harness.calls.at(-2), ["createDate", 17]);
});

test("ApplicationDateTimeService preserves dependency failure timing and short circuits", async () => {
  const { createApplicationDateTimeService } = await loadFactory();
  const localizationError = new Error("localization failed");
  const localizationHarness = createHarness(createApplicationDateTimeService, { localizationError });
  assert.throws(() => localizationHarness.service.date(""), localizationError);
  assert.deepEqual(localizationHarness.calls, [["localize", "Never"]]);

  const localeError = new Error("locale failed");
  const localeHarness = createHarness(createApplicationDateTimeService, { localeError });
  assert.throws(() => localeHarness.service.date("value"), localeError);
  assert.deepEqual(localeHarness.calls, [["getLocale"]]);

  const formatterError = new Error("formatter failed");
  const formatterHarness = createHarness(createApplicationDateTimeService, { formatterError });
  assert.throws(() => formatterHarness.service.dateTime("value"), formatterError);
  assert.deepEqual(formatterHarness.calls, [
    ["getLocale"],
    ["createFormatter", "tr-TR", { dateStyle: "medium", timeStyle: "short" }]
  ]);

  const getterError = new Error("format getter failed");
  const getterHarness = createHarness(createApplicationDateTimeService, {
    createFormatter({ calls }) {
      return Object.defineProperty({}, "format", {
        get() {
          calls.push(["getFormat"]);
          throw getterError;
        }
      });
    }
  });
  assert.throws(() => getterHarness.service.date("value"), getterError);
  assert.deepEqual(getterHarness.calls, [
    ["getLocale"],
    ["createFormatter", "tr-TR", { dateStyle: "medium" }],
    ["getFormat"]
  ]);

  const dateError = new Error("date failed");
  const dateHarness = createHarness(createApplicationDateTimeService, {
    dateError,
    createFormatter({ calls }) {
      return Object.defineProperty({}, "format", {
        get() {
          calls.push(["getFormat"]);
          return () => "unreachable";
        }
      });
    }
  });
  assert.throws(() => dateHarness.service.date("value"), dateError);
  assert.deepEqual(dateHarness.calls, [
    ["getLocale"],
    ["createFormatter", "tr-TR", { dateStyle: "medium" }],
    ["getFormat"],
    ["createDate", "value"]
  ]);

  const formatError = new Error("format failed");
  const formatHarness = createHarness(createApplicationDateTimeService, { formatError });
  assert.throws(() => formatHarness.service.dateTime("value"), formatError);
  assert.deepEqual(formatHarness.calls.at(-2), ["createDate", "value"]);
  assert.deepEqual(formatHarness.calls.at(-1), ["format", { dateValue: "value" }, true]);
});

test("ApplicationDateTimeService keeps date and date-time policy independent", async () => {
  const { createApplicationDateTimeService } = await loadFactory();
  const harness = createHarness(createApplicationDateTimeService);
  harness.service.date("date");
  harness.service.dateTime("date-time");
  assert.deepEqual(
    harness.calls.filter(([name]) => name === "createFormatter").map(([, , options]) => options),
    [{ dateStyle: "medium" }, { dateStyle: "medium", timeStyle: "short" }]
  );
});

test("ApplicationDateTimeService validates boundaries and exposes an immutable API", async () => {
  const { createApplicationDateTimeService } = await loadFactory();
  const valid = createHarness(createApplicationDateTimeService).dependencies;
  for (const [owner, method] of [
    ["localization", "source"],
    ["locale", "get"],
    ["formatter", "create"],
    ["date", "create"]
  ]) {
    for (const invalid of [undefined, null, {}, { [method]: null }]) {
      assert.throws(
        () => createApplicationDateTimeService({ ...valid, [owner]: invalid }),
        /checked localization, locale, formatter, and date boundaries/
      );
    }
  }
  const service = createApplicationDateTimeService(valid);
  assert.equal(Object.isFrozen(service), true);
  assert.deepEqual(Object.keys(service), ["date", "dateTime"]);
  assert.throws(() => {
    "use strict";
    service.date = () => "changed";
  }, TypeError);
});
