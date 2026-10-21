const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const root = path.resolve(__dirname, "../..");

function loadModules() {
  const browserWindow = { CatHan: {} };
  const context = vm.createContext({ window: browserWindow, TextDecoder, TextEncoder });
  for (const file of ["protected-tags.js", "localization.js", "validation.js"]) {
    vm.runInContext(fs.readFileSync(path.join(root, file), "utf8"), context);
  }
  browserWindow.CatHan.docx = browserWindow.CatHan.protectedTags;
  return browserWindow.CatHan;
}

async function preparePoExport(modules, source) {
  const parsed = await modules.localization.parseLocalizationFile({
    name: "messages.po",
    text: () => Promise.resolve(source)
  });
  return {
    project: { localizationStructures: { messages: parsed.structure } },
    documentInfo: { id: "messages", name: "messages.po", type: "po" },
    format: "po",
    segments: parsed.segments.map((segment) => ({ ...segment, source: segment.text, status: "confirmed" }))
  };
}

test("PO export preflight discards stale percent-plus-word tags from saved projects", async () => {
  const modules = loadModules();
  const request = await preparePoExport(
    modules,
    ['msgid "%0 eats too much of %1\'s cake"', 'msgstr "%0 come demasiado del pastel de %1"'].join("\n")
  );
  request.segments[0].tags = [{ text: "%0 e", type: "placeholder" }];

  assert.equal(modules.validation.missingProtectedTags(request.segments[0]).length, 0);
  const report = modules.validation.validateExportReadiness(request);
  assert.equal(report.canExport, true);
  assert.equal(report.risky.length, 0);
});

test("PO export preflight permits normal percentages in Turkish", async () => {
  const modules = loadModules();
  const request = await preparePoExport(
    modules,
    ['msgid "A 1% increase"', 'msgstr "%1 artış"', "", 'msgid "İndirim %10"', 'msgstr "%10 indirim"'].join("\n")
  );

  assert.equal(modules.validation.validateExportReadiness(request).canExport, true);
});

test("Qt export preflight counts exact placeholder tokens and blocks missing repeated arguments", async () => {
  const modules = loadModules();
  const request = await preparePoExport(
    modules,
    ["#, qt-format", 'msgid "%1 and %10 and %1"', 'msgstr "%10 ve %1"'].join("\n")
  );
  // An empty saved tag array must not bypass the format metadata.
  request.segments[0].tags = [];
  const missing = modules.validation.missingProtectedTags(request.segments[0]);
  assert.deepEqual(
    Array.from(missing, (tag) => tag.text),
    ["%1"]
  );
  const report = modules.validation.validateExportReadiness(request);
  assert.equal(report.canExport, false);
  assert.match(report.risky.join(" "), /missing protected placeholders/);

  request.segments[0].target = "%10 ve %1 ve %1";
  assert.equal(modules.validation.missingProtectedTags(request.segments[0]).length, 0);
  assert.equal(modules.validation.validateExportReadiness(request).canExport, true);
});

test("non-PO export retains custom protected tags and occurrence checks", () => {
  const { validation } = loadModules();
  const segment = {
    source: "First custom token, second custom token",
    target: "First @CODE@",
    structure: { format: "json" },
    tags: [{ text: "@CODE@" }, { text: "@CODE@" }]
  };

  assert.equal(validation.missingProtectedTags(segment).length, 1);
  segment.target += " second @CODE@";
  assert.equal(validation.missingProtectedTags(segment).length, 0);
});
