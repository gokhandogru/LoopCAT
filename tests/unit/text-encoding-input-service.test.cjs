const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const test = require("node:test");

const root = path.resolve(__dirname, "../..");
const moduleAt = (relativePath) => import(pathToFileURL(path.join(root, relativePath)).href);

function createHarness(createTextEncodingInputService, overrides = {}) {
  const calls = [];
  const select = overrides.select === undefined ? { id: "encoding", value: "legacy" } : overrides.select;
  const service = createTextEncodingInputService({
    select,
    getOptions() {
      calls.push(["getOptions"]);
      return Object.hasOwn(overrides, "encodingOptions")
        ? overrides.encodingOptions
        : [
            ["windows-1254", "Turkish <legacy>"],
            ['utf-8\" unsafe', "UTF-8 & Unicode"]
          ];
    },
    escapeHtml(value) {
      calls.push(["escapeHtml", value]);
      return `escaped:${value}`;
    },
    replaceSafeHtml(element, html) {
      calls.push(["replaceSafeHtml", element.id, html]);
    }
  });
  return { calls, select, service };
}

test("TextEncodingInputService preserves configured option order, safe escaping, and the auto reset", async () => {
  const { createTextEncodingInputService } = await moduleAt(
    "src/features/import-export/text-encoding-input-service.js"
  );
  const { calls, select, service } = createHarness(createTextEncodingInputService);

  assert.equal(service.renderOptions(), undefined);
  assert.deepEqual(calls, [
    ["getOptions"],
    ["escapeHtml", "windows-1254"],
    ["escapeHtml", "Turkish <legacy>"],
    ["escapeHtml", 'utf-8\" unsafe'],
    ["escapeHtml", "UTF-8 & Unicode"],
    [
      "replaceSafeHtml",
      "encoding",
      '<option value="escaped:windows-1254">escaped:Turkish <legacy></option><option value="escaped:utf-8" unsafe">escaped:UTF-8 & Unicode</option>'
    ]
  ]);
  assert.equal(select.value, "auto");
});

test("TextEncodingInputService preserves the Auto and UTF-8 fallback only for absent configured options", async () => {
  const { createTextEncodingInputService } = await moduleAt(
    "src/features/import-export/text-encoding-input-service.js"
  );
  const absent = createHarness(createTextEncodingInputService, { encodingOptions: null });
  absent.service.renderOptions();
  assert.equal(
    absent.calls.find(([name]) => name === "replaceSafeHtml")[2],
    '<option value="escaped:auto">escaped:Auto</option><option value="escaped:utf-8">escaped:UTF-8</option>'
  );

  const empty = createHarness(createTextEncodingInputService, { encodingOptions: [] });
  empty.service.renderOptions();
  assert.equal(empty.calls.find(([name]) => name === "replaceSafeHtml")[2], "");
  assert.equal(empty.select.value, "auto");
});

test("TextEncodingInputService contains absent selectors without reading configured options", async () => {
  const { createTextEncodingInputService } = await moduleAt(
    "src/features/import-export/text-encoding-input-service.js"
  );
  const { calls, service } = createHarness(createTextEncodingInputService, { select: null });

  assert.equal(service.renderOptions(), undefined);
  assert.deepEqual(calls, []);
  assert.equal(service.selectedEncoding(), "auto");
  assert.deepEqual(service.decodingOptions(), { encoding: "auto" });
});

test("TextEncodingInputService preserves selected values, empty fallback, and fresh decoding option objects", async () => {
  const { createTextEncodingInputService } = await moduleAt(
    "src/features/import-export/text-encoding-input-service.js"
  );
  const { select, service } = createHarness(createTextEncodingInputService);

  select.value = "shift_jis";
  assert.equal(service.selectedEncoding(), "shift_jis");
  const first = service.decodingOptions();
  const second = service.decodingOptions();
  assert.deepEqual(first, { encoding: "shift_jis" });
  assert.deepEqual(second, first);
  assert.notEqual(second, first);
  select.value = "";
  assert.equal(service.selectedEncoding(), "auto");
  assert.deepEqual(service.decodingOptions(), { encoding: "auto" });
});

test("TextEncodingInputService validates boundaries and exposes an immutable API", async () => {
  const { createTextEncodingInputService } = await moduleAt(
    "src/features/import-export/text-encoding-input-service.js"
  );
  assert.throws(
    () => createTextEncodingInputService({}),
    /requires encoding-option, escaping, and safe-presentation boundaries/
  );
  const { service } = createHarness(createTextEncodingInputService);
  assert.equal(Object.isFrozen(service), true);
});
