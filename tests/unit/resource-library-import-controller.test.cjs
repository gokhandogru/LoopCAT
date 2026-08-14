const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const test = require("node:test");

const root = path.resolve(__dirname, "../..");
const moduleAt = (relativePath) => import(pathToFileURL(path.join(root, relativePath)).href);

function createFile(name, type = "application/xml") {
  const buffer = new Uint8Array([1, 2, 3]).buffer;
  return {
    name,
    type,
    size: 12,
    arrayBuffer: () => Promise.resolve(buffer)
  };
}

function createHarness(createResourceLibraryImportController, overrides = {}) {
  const calls = [];
  const inputs = {
    tmSource: { id: "tm-source", normalized: overrides.tmSourceLang ?? "en" },
    tmTarget: { id: "tm-target", normalized: overrides.tmTargetLang ?? "tr" },
    tbSource: { id: "tb-source", normalized: overrides.tbSourceLang ?? "en" },
    tbTarget: { id: "tb-target", normalized: overrides.tbTargetLang ?? "tr" }
  };
  const entries = overrides.entries || [{ id: "tm-1" }, { id: "tm-2" }];
  const terms = overrides.terms || [{ id: "term-1" }, { id: "term-2" }];
  const controller = createResourceLibraryImportController({
    forms: {
      tmName() {
        calls.push(["tmName"]);
        return overrides.tmName ?? "  Library TM  ";
      },
      tbName() {
        calls.push(["tbName"]);
        return overrides.tbName ?? "  Library TB  ";
      },
      tmSourceLanguageInput: inputs.tmSource,
      tmTargetLanguageInput: inputs.tmTarget,
      tbSourceLanguageInput: inputs.tbSource,
      tbTargetLanguageInput: inputs.tbTarget,
      normalizeLanguageInput(input) {
        calls.push(["normalize", input.id]);
        return input.normalized;
      }
    },
    files: {
      assertSize(file, label) {
        calls.push(["assertSize", file.name, label]);
        if (overrides.sizeFailure) throw overrides.sizeFailure;
      },
      readText(file) {
        calls.push(["readText", file.name]);
        return Promise.resolve("decoded resource text");
      },
      reportProgress(phase, file, detail) {
        calls.push(["progress", phase, file.name, detail]);
        return Promise.resolve();
      },
      progressDetail(done, total, label) {
        calls.push(["progressDetail", done, total, label]);
        return `${done}/${total} ${label}`;
      },
      yieldToUi() {
        calls.push(["yieldToUi"]);
      }
    },
    parsers: {
      async parseTmx(text, defaults, options) {
        calls.push(["parseTmx", text, defaults, options.yieldFn]);
        if (overrides.parseFailure) throw overrides.parseFailure;
        await options.onProgress({ percent: 50, entries: 1 });
        return entries;
      },
      async parseTbx(text, defaults, options) {
        calls.push(["parseTbx", text, defaults, options.yieldFn]);
        if (overrides.parseFailure) throw overrides.parseFailure;
        await options.onProgress({ percent: 60, terms: 1 });
        return terms;
      },
      parseTermList(text, options) {
        calls.push(["parseTermList", text, options]);
        if (overrides.parseFailure) throw overrides.parseFailure;
        return Promise.resolve(terms);
      },
      parseTermWorkbook(buffer, options) {
        calls.push(["parseTermWorkbook", buffer.byteLength, options]);
        return Promise.resolve(terms);
      }
    },
    repositories: {
      async importTmEntries(importedEntries, options) {
        calls.push(["importTmEntries", importedEntries]);
        await options.onProgress({ saved: 1, total: importedEntries.length });
        await options.onIndexProgress({ saved: importedEntries.length, total: importedEntries.length });
      },
      async importTerms(importedTerms, options) {
        calls.push(["importTerms", importedTerms]);
        await options.onProgress({ saved: 1, total: importedTerms.length });
        await options.onIndexProgress({ saved: importedTerms.length, total: importedTerms.length });
      }
    },
    resources: {
      markProjectsUsingDirty(type, name, sourceLang, targetLang) {
        calls.push(["markDirty", type, name, sourceLang, targetLang]);
      },
      open(type, key, options) {
        calls.push(["open", type, key, options]);
      },
      refresh() {
        calls.push(["refreshResources"]);
        return Promise.resolve();
      },
      refreshProjectTerms(options) {
        calls.push(["refreshProjectTerms", options]);
        return Promise.resolve();
      }
    },
    alert(message) {
      calls.push(["alert", message]);
    },
    status: {
      set(message, mode) {
        calls.push(["set", message, mode]);
      }
    }
  });
  return { calls, controller, entries, terms };
}

const names = (calls) => calls.map(([name]) => name);
const firstCall = (calls, name) => calls.find(([callName]) => callName === name);

test("ResourceLibraryImportController preserves TM form normalization, parser progress, persistence, dirtiness, selection, refresh, and status", async () => {
  const { createResourceLibraryImportController } = await moduleAt(
    "src/features/resources/resource-library-import-controller.js"
  );
  const harness = createHarness(createResourceLibraryImportController);
  await harness.controller.importTmx(createFile("library.tmx"));

  assert.deepEqual(names(harness.calls).slice(0, 4), ["assertSize", "tmName", "normalize", "normalize"]);
  assert.deepEqual(firstCall(harness.calls, "parseTmx").slice(1, 3), [
    "decoded resource text",
    {
      sourceLang: "en",
      targetLang: "tr",
      tmName: "Library TM",
      projectName: "Resources import"
    }
  ]);
  assert.equal(typeof firstCall(harness.calls, "parseTmx")[3], "function");
  assert.deepEqual(firstCall(harness.calls, "markDirty"), ["markDirty", "tm", "Library TM", "en", "tr"]);
  assert.deepEqual(firstCall(harness.calls, "open"), [
    "open",
    "tm",
    "Library TM::en::tr",
    { render: false, focus: false }
  ]);
  assert.deepEqual(names(harness.calls).slice(-4), ["progress", "open", "refreshResources", "set"]);
  assert.deepEqual(harness.calls.at(-1), ["set", "Imported 2 TM entries", "saved"]);
  assert.deepEqual(
    harness.calls.filter(([name]) => name === "progressDetail").map((call) => call.slice(1)),
    [
      [1, 2, "entry"],
      [2, 2, "index rows"]
    ]
  );
});

test("ResourceLibraryImportController preserves TBX form policy and resource-before-project-term refresh order", async () => {
  const { createResourceLibraryImportController } = await moduleAt(
    "src/features/resources/resource-library-import-controller.js"
  );
  const harness = createHarness(createResourceLibraryImportController, { terms: [{ id: "one" }] });
  await harness.controller.importTbx(createFile("library.tbx"));

  assert.deepEqual(firstCall(harness.calls, "parseTbx").slice(1, 3), [
    "decoded resource text",
    { sourceLang: "en", targetLang: "tr", termBaseName: "Library TB" }
  ]);
  assert.deepEqual(firstCall(harness.calls, "markDirty"), ["markDirty", "termbase", "Library TB", "en", "tr"]);
  assert.deepEqual(names(harness.calls).slice(-5), [
    "progress",
    "open",
    "refreshResources",
    "refreshProjectTerms",
    "set"
  ]);
  assert.deepEqual(harness.calls.at(-1), ["set", "Imported 1 terms", "saved"]);
});

test("ResourceLibraryImportController preserves decoded text and XLSX term-list routing with exact term status", async () => {
  const { createResourceLibraryImportController } = await moduleAt(
    "src/features/resources/resource-library-import-controller.js"
  );
  const textHarness = createHarness(createResourceLibraryImportController, { terms: [{ id: "one" }] });
  await textHarness.controller.importTermList(createFile("terms.CSV", "text/csv"));
  assert.deepEqual(firstCall(textHarness.calls, "parseTermList").slice(1), [
    "decoded resource text",
    {
      sourceLang: "en",
      targetLang: "tr",
      termBaseName: "Library TB",
      fileName: "terms.CSV"
    }
  ]);
  assert.deepEqual(textHarness.calls.at(-1), ["set", "Imported 1 term", "saved"]);

  const workbookHarness = createHarness(createResourceLibraryImportController);
  await workbookHarness.controller.importTermList(
    createFile("terms.XLSX", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
  );
  assert.deepEqual(firstCall(workbookHarness.calls, "parseTermWorkbook").slice(1), [
    3,
    {
      sourceLang: "en",
      targetLang: "tr",
      termBaseName: "Library TB",
      fileName: "terms.XLSX"
    }
  ]);
  assert.equal(names(workbookHarness.calls).includes("readText"), false);
  assert.deepEqual(workbookHarness.calls.at(-1), ["set", "Imported 2 terms", "saved"]);
});

test("ResourceLibraryImportController preserves size-first validation, missing-field returns, parser failure propagation, and immutability", async () => {
  const { createResourceLibraryImportController } = await moduleAt(
    "src/features/resources/resource-library-import-controller.js"
  );
  const missing = createHarness(createResourceLibraryImportController, { tmName: " " });
  await missing.controller.importTmx(createFile("missing.tmx"));
  assert.deepEqual(names(missing.calls), ["assertSize", "tmName", "normalize", "normalize", "alert"]);
  assert.deepEqual(missing.calls.at(-1), [
    "alert",
    "Enter a TM name, source language, and target language before importing."
  ]);

  const sizeFailure = new Error("too large");
  const oversized = createHarness(createResourceLibraryImportController, { sizeFailure });
  await assert.rejects(oversized.controller.importTbx(createFile("huge.tbx")), (error) => error === sizeFailure);
  assert.deepEqual(names(oversized.calls), ["assertSize"]);

  const parseFailure = new Error("broken resource");
  const malformed = createHarness(createResourceLibraryImportController, { parseFailure });
  await assert.rejects(malformed.controller.importTbx(createFile("broken.tbx")), (error) => error === parseFailure);
  assert.equal(names(malformed.calls).includes("importTerms"), false);
  assert.equal(Object.isFrozen(malformed.controller), true);
  assert.throws(
    () => createResourceLibraryImportController(),
    /requires form, file, parser, repository, resource, alert, and status/
  );
});
