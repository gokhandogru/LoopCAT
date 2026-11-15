const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const test = require("node:test");

const root = path.resolve(__dirname, "../..");

function loadFactory() {
  return import(pathToFileURL(path.join(root, "src/app/localization-download-mime-type-service.js")).href);
}

function createHarness(createLocalizationDownloadMimeTypeService, overrides = {}) {
  const calls = [];
  const documentTypes = overrides.documentTypes || new Set(["xlf", "xliff", "sdlxliff"]);
  const normalizeExtension =
    overrides.normalizeExtension ||
    ((value) => {
      calls.push(["normalize", value]);
      return String(value || "").toLowerCase();
    });
  const mimeType =
    overrides.mimeType ||
    ((version) => {
      calls.push(["xliff", version]);
      return `application/xliff+xml;version=${version}`;
    });
  const service = createLocalizationDownloadMimeTypeService({
    normalizeExtension,
    xliff: { documentTypes, mimeType }
  });
  return { calls, documentTypes, service };
}

test("LocalizationDownloadMimeTypeService normalizes every input and exposes an immutable API", async () => {
  const { createLocalizationDownloadMimeTypeService } = await loadFactory();
  const { calls, service } = createHarness(createLocalizationDownloadMimeTypeService);
  assert.equal(Object.isFrozen(service), true);
  for (const [extension, expected] of [
    [undefined, "text/plain"],
    [null, "text/plain"],
    [false, "text/plain"],
    [0, "text/plain"],
    [42, "text/plain"],
    ["unknown", "text/plain"],
    ["HTML", "text/html"]
  ]) {
    assert.equal(service.forExtension(extension), expected);
  }
  assert.deepEqual(
    calls.filter(([name]) => name === "normalize").map(([, value]) => value),
    [undefined, null, false, 0, 42, "unknown", "HTML"]
  );
});

test("LocalizationDownloadMimeTypeService preserves every non-XLIFF format mapping", async () => {
  const { createLocalizationDownloadMimeTypeService } = await loadFactory();
  const { calls, service } = createHarness(createLocalizationDownloadMimeTypeService);
  const families = [
    [["html", "htm"], "text/html"],
    [["xhtml"], "application/xhtml+xml"],
    [["md", "markdown"], "text/markdown"],
    [["json"], "application/json"],
    [["yaml", "yml"], "application/yaml"],
    [["vtt"], "text/vtt"],
    [["csv"], "text/csv"],
    [["tsv"], "text/tab-separated-values"],
    [["xml", "tmx", "dita", "txml", "ttx", "xini", "resx", "wix", "ts", "icml"], "application/xml"],
    [["idml"], "application/vnd.adobe.indesign-idml-package"],
    [["docx"], "application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
    [["docm"], "application/vnd.ms-word.document.macroEnabled.12"],
    [["dotx"], "application/vnd.openxmlformats-officedocument.wordprocessingml.template"],
    [["dotm"], "application/vnd.ms-word.template.macroEnabled.12"],
    [["xlsx"], "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"],
    [["xlsm"], "application/vnd.ms-excel.sheet.macroEnabled.12"],
    [["xltx"], "application/vnd.openxmlformats-officedocument.spreadsheetml.template"],
    [["xltm"], "application/vnd.ms-excel.template.macroEnabled.12"],
    [["pptx"], "application/vnd.openxmlformats-officedocument.presentationml.presentation"],
    [["pptm"], "application/vnd.ms-powerpoint.presentation.macroEnabled.12"],
    [["ppsx"], "application/vnd.openxmlformats-officedocument.presentationml.slideshow"],
    [["ppsm"], "application/vnd.ms-powerpoint.slideshow.macroEnabled.12"],
    [["potx"], "application/vnd.openxmlformats-officedocument.presentationml.template"],
    [["potm"], "application/vnd.ms-powerpoint.template.macroEnabled.12"],
    [["odt"], "application/vnd.oasis.opendocument.text"],
    [["ott"], "application/vnd.oasis.opendocument.text-template"],
    [["ods"], "application/vnd.oasis.opendocument.spreadsheet"],
    [["ots"], "application/vnd.oasis.opendocument.spreadsheet-template"],
    [["odp"], "application/vnd.oasis.opendocument.presentation"],
    [["otp"], "application/vnd.oasis.opendocument.presentation-template"]
  ];
  for (const [extensions, expected] of families) {
    for (const extension of extensions) assert.equal(service.forExtension(extension), expected, extension);
  }
  assert.equal(service.forExtension("ts", { format: "code-string" }), "text/plain");
  assert.equal(
    calls.some(([name]) => name === "xliff"),
    false
  );
});

test("LocalizationDownloadMimeTypeService preserves XLIFF versions and fallback arguments", async () => {
  const { createLocalizationDownloadMimeTypeService } = await loadFactory();
  const { calls, service } = createHarness(createLocalizationDownloadMimeTypeService);
  for (const [extension, structure, version] of [
    ["xlf", { version: "2.2" }, "2.2"],
    ["XLIFF", { version: "2.0" }, "2.0"],
    ["sdlxliff", null, "1.2"],
    ["xlf", undefined, "1.2"],
    ["xlf", {}, "1.2"],
    ["xlf", { version: "" }, "1.2"],
    ["xlf", { version: 0 }, "1.2"]
  ]) {
    assert.equal(service.forExtension(extension, structure), `application/xliff+xml;version=${version}`);
  }
  assert.deepEqual(
    calls.filter(([name]) => name === "xliff").map(([, version]) => version),
    ["2.2", "2.0", "1.2", "1.2", "1.2", "1.2", "1.2"]
  );
});

test("LocalizationDownloadMimeTypeService retains live XLIFF type-set ownership", async () => {
  const { createLocalizationDownloadMimeTypeService } = await loadFactory();
  const { documentTypes, service } = createHarness(createLocalizationDownloadMimeTypeService);
  assert.equal(service.forExtension("custom"), "text/plain");
  documentTypes.add("custom");
  assert.equal(service.forExtension("custom", { version: "9" }), "application/xliff+xml;version=9");
});

test("LocalizationDownloadMimeTypeService preserves normalization and resolver failure timing", async () => {
  const { createLocalizationDownloadMimeTypeService } = await loadFactory();
  const normalizeError = new Error("normalize failed");
  const resolverError = new Error("resolver failed");
  const normalizeHarness = createHarness(createLocalizationDownloadMimeTypeService, {
    normalizeExtension() {
      throw normalizeError;
    }
  });
  assert.throws(
    () => normalizeHarness.service.forExtension("html"),
    (error) => error === normalizeError
  );

  const resolverHarness = createHarness(createLocalizationDownloadMimeTypeService, {
    mimeType() {
      throw resolverError;
    }
  });
  assert.throws(
    () => resolverHarness.service.forExtension("xlf", { version: "2.2" }),
    (error) => error === resolverError
  );
  const structure = {};
  Object.defineProperty(structure, "version", {
    get() {
      throw new Error("version must stay unread");
    }
  });
  assert.equal(resolverHarness.service.forExtension("html", structure), "text/html");
});

test("LocalizationDownloadMimeTypeService validates every injected boundary", async () => {
  const { createLocalizationDownloadMimeTypeService } = await loadFactory();
  const valid = {
    normalizeExtension: (value) => String(value || "").toLowerCase(),
    xliff: { documentTypes: new Set(), mimeType: () => "application/xliff+xml" }
  };
  for (const value of [
    undefined,
    null,
    {},
    { ...valid, normalizeExtension: null },
    { ...valid, xliff: null },
    { ...valid, xliff: { ...valid.xliff, documentTypes: [] } },
    { ...valid, xliff: { ...valid.xliff, mimeType: null } }
  ]) {
    assert.throws(() => createLocalizationDownloadMimeTypeService(value), /checked normalization and XLIFF boundaries/);
  }
});
