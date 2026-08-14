const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const test = require("node:test");

const root = path.resolve(__dirname, "../..");
const moduleAt = (relativePath) => import(pathToFileURL(path.join(root, relativePath)).href);

function createHarness(createResourceLibraryExportController, overrides = {}) {
  const calls = [];
  const info = { name: "Library / Name", sourceLang: "en", targetLang: "tr", languagePair: "en::tr" };
  const items = overrides.items || [{ id: "one" }, { id: "two" }];
  const controller = createResourceLibraryExportController({
    resources: {
      labelFromKey(key) {
        calls.push(["labelFromKey", key]);
        if (overrides.lookupFailure) throw overrides.lookupFailure;
        return info;
      },
      items(type, key) {
        calls.push(["items", type, key]);
        return items;
      }
    },
    builders: {
      buildTmx(exportedItems, metadata) {
        calls.push(["buildTmx", exportedItems, metadata]);
        return "tmx-content";
      },
      buildTbx(exportedItems, metadata) {
        calls.push(["buildTbx", exportedItems, metadata]);
        return "tbx-content";
      }
    },
    fileSafeName(value) {
      calls.push(["fileSafeName", value]);
      return "Library_Name";
    },
    download(filename, content, type) {
      calls.push(["download", filename, content, type]);
      if (overrides.downloadFailure) throw overrides.downloadFailure;
    },
    status: {
      set(message, mode) {
        calls.push(["set", message, mode]);
      }
    }
  });
  return { calls, controller, info, items };
}

const names = (calls) => calls.map(([name]) => name);
const firstCall = (calls, name) => calls.find(([callName]) => callName === name);

test("ResourceLibraryExportController preserves TMX lookup, metadata, filename, XML download, singular copy, and return", async () => {
  const { createResourceLibraryExportController } = await moduleAt(
    "src/features/resources/resource-library-export-controller.js"
  );
  const harness = createHarness(createResourceLibraryExportController, { items: [{ id: "one" }] });
  assert.equal(harness.controller.exportResource("tm", "Library::en::tr"), undefined);
  assert.deepEqual(names(harness.calls), ["labelFromKey", "items", "fileSafeName", "buildTmx", "download", "set"]);
  assert.deepEqual(firstCall(harness.calls, "buildTmx").slice(1), [harness.items, harness.info]);
  assert.deepEqual(firstCall(harness.calls, "download").slice(1), [
    "Library_Name_en-tr.tmx",
    "tmx-content",
    "application/xml"
  ]);
  assert.deepEqual(harness.calls.at(-1), ["set", "Exported 1 TM entry", "saved"]);
});

test("ResourceLibraryExportController preserves TBX lookup, metadata, filename, XML download, and plural copy", async () => {
  const { createResourceLibraryExportController } = await moduleAt(
    "src/features/resources/resource-library-export-controller.js"
  );
  const harness = createHarness(createResourceLibraryExportController);
  harness.controller.exportResource("tb", "Library::en::tr");
  assert.equal(names(harness.calls).includes("buildTmx"), false);
  assert.deepEqual(firstCall(harness.calls, "buildTbx").slice(1), [harness.items, harness.info]);
  assert.deepEqual(firstCall(harness.calls, "download").slice(1), [
    "Library_Name_en-tr.tbx",
    "tbx-content",
    "application/xml"
  ]);
  assert.deepEqual(harness.calls.at(-1), ["set", "Exported 2 terms", "saved"]);
});

test("ResourceLibraryExportController contains lookup and download failures and exposes an immutable checked API", async () => {
  const { createResourceLibraryExportController } = await moduleAt(
    "src/features/resources/resource-library-export-controller.js"
  );
  const lookupFailure = new Error("lookup failed");
  const lookup = createHarness(createResourceLibraryExportController, { lookupFailure });
  lookup.controller.exportResource("tm", "bad");
  assert.deepEqual(lookup.calls.at(-1), ["set", "lookup failed", "dirty"]);
  assert.equal(names(lookup.calls).includes("download"), false);

  const downloadFailure = new Error("download failed");
  const download = createHarness(createResourceLibraryExportController, { downloadFailure });
  download.controller.exportResource("tb", "Library::en::tr");
  assert.deepEqual(download.calls.at(-1), ["set", "download failed", "dirty"]);
  assert.equal(Object.isFrozen(download.controller), true);
  assert.throws(
    () => createResourceLibraryExportController(),
    /requires resource, builder, filename, download, and status/
  );
});
