const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const test = require("node:test");

const root = path.resolve(__dirname, "../..");
const moduleAt = (relativePath) => import(pathToFileURL(path.join(root, relativePath)).href);

function createFile(name, type = "application/xml") {
  return {
    name,
    type,
    size: 24,
    arrayBuffer() {
      return Promise.resolve(new Uint8Array([1, 2, 3]).buffer);
    }
  };
}

function createHarness(createProjectResourceTransferController, overrides = {}) {
  const calls = [];
  const project = { id: "project-1", name: "Project Name", sourceLang: "en", targetLang: "tr" };
  const tmEntries = [
    { id: "tm-1", tmName: "Main TM" },
    { id: "tm-2", tmName: "Secondary TM" },
    { id: "tm-3", tmName: "Unlinked TM" }
  ];
  const importedTmEntries = [{ id: "imported-tm-1" }, { id: "imported-tm-2" }];
  const importedTerms = [{ id: "term-1" }, { id: "term-2" }];
  const exportedTerms = [{ id: "export-term-1" }];
  let currentProject = overrides.hasProject === false ? null : project;
  let mainTmIndex = 0;
  let selectedTermBaseIndex = 0;
  const mainTmNames = overrides.mainTmNames || ["Main TM"];
  const selectedTermBaseNames = overrides.selectedTermBaseNames || ["Selected TB"];

  const controller = createProjectResourceTransferController({
    session: {
      getProject() {
        calls.push(["getProject"]);
        return currentProject;
      }
    },
    files: {
      assertSize(file, label) {
        calls.push(["assertSize", file, label]);
        if (overrides.sizeFailure) throw overrides.sizeFailure;
      },
      readText(file) {
        calls.push(["readText", file]);
        return overrides.readFailure
          ? Promise.reject(overrides.readFailure)
          : Promise.resolve(`<content>${file.name}</content>`);
      },
      reportProgress(...args) {
        calls.push(["reportProgress", ...args]);
        return Promise.resolve();
      },
      progressDetail(done, total, unitLabel) {
        calls.push(["progressDetail", done, total, unitLabel]);
        return `${done}/${total} ${unitLabel}`;
      },
      yieldToUi() {
        calls.push(["yieldToUi"]);
        return Promise.resolve();
      }
    },
    parsers: {
      async parseTmx(text, defaults, options) {
        calls.push(["parseTmx", text, defaults, options]);
        await options.yieldFn();
        await options.onProgress({ percent: 50, entries: 1 });
        if (overrides.parseFailure) throw overrides.parseFailure;
        return importedTmEntries;
      },
      async parseTbx(text, defaults, options) {
        calls.push(["parseTbx", text, defaults, options]);
        await options.yieldFn();
        await options.onProgress({ percent: 75, terms: 2 });
        if (overrides.parseFailure) throw overrides.parseFailure;
        return importedTerms;
      },
      parseTermList(text, options) {
        calls.push(["parseTermList", text, options]);
        return importedTerms;
      },
      parseTermWorkbook(buffer, options) {
        calls.push(["parseTermWorkbook", buffer, options]);
        return importedTerms;
      }
    },
    repositories: {
      async importTmEntries(entries, options) {
        calls.push(["importTmEntries", entries, options]);
        await options.onProgress({ saved: 1, total: 2 });
        await options.onIndexProgress({ saved: 2, total: 2 });
        if (overrides.importFailure) throw overrides.importFailure;
      },
      async importTerms(terms, options) {
        calls.push(["importTerms", terms, options]);
        await options.onProgress({ saved: 1, total: 2 });
        await options.onIndexProgress({ saved: 2, total: 2 });
        if (overrides.importFailure) throw overrides.importFailure;
      },
      getAllByIndex(...args) {
        calls.push(["getAllByIndex", ...args]);
        return overrides.exportFailure ? Promise.reject(overrides.exportFailure) : Promise.resolve(tmEntries);
      },
      listTerms(query) {
        calls.push(["listTerms", query]);
        return overrides.exportFailure ? Promise.reject(overrides.exportFailure) : Promise.resolve(exportedTerms);
      }
    },
    resources: {
      mainTmName() {
        const value = mainTmNames[Math.min(mainTmIndex, mainTmNames.length - 1)];
        mainTmIndex += 1;
        calls.push(["mainTmName", value]);
        return value;
      },
      projectTmNames() {
        calls.push(["projectTmNames"]);
        return ["Main TM", "Secondary TM"];
      },
      selectedTermBaseName() {
        const value = selectedTermBaseNames[Math.min(selectedTermBaseIndex, selectedTermBaseNames.length - 1)];
        selectedTermBaseIndex += 1;
        calls.push(["selectedTermBaseName", value]);
        return value;
      },
      primaryTermBaseName() {
        calls.push(["primaryTermBaseName"]);
        return "Primary TB";
      },
      projectTermBaseNames() {
        calls.push(["projectTermBaseNames"]);
        return ["Primary TB", "Secondary TB"];
      },
      markProjectsUsingDirty(...args) {
        calls.push(["markProjectsUsingDirty", ...args]);
      }
    },
    refresh: {
      tmMatches() {
        calls.push(["refreshTmMatches"]);
        return Promise.resolve();
      },
      projectTerms(options) {
        calls.push(["refreshProjectTerms", options]);
        return Promise.resolve();
      },
      terms() {
        calls.push(["refreshTerms"]);
        return Promise.resolve();
      }
    },
    builders: {
      buildTmx(entries, options) {
        calls.push(["buildTmx", entries, options]);
        return "tmx-content";
      },
      buildTbx(terms, options) {
        calls.push(["buildTbx", terms, options]);
        return "tbx-content";
      }
    },
    fileSafeName(value) {
      calls.push(["fileSafeName", value]);
      return String(value || "")
        .replaceAll(" ", "-")
        .toLowerCase();
    },
    download(...args) {
      calls.push(["download", ...args]);
      if (overrides.downloadFailure) throw overrides.downloadFailure;
    },
    activity: {
      logOptionalProject(...args) {
        calls.push(["logOptionalProject", ...args]);
        return Promise.resolve(overrides.activityLogged === undefined ? true : overrides.activityLogged);
      }
    },
    status: {
      appendActivityWarning(message, logged) {
        calls.push(["appendActivityWarning", message, logged]);
        return logged ? message : `${message}; activity log failed`;
      },
      exportMode(mode, logged) {
        calls.push(["exportMode", mode, logged]);
        return logged ? mode : "dirty";
      },
      set(...args) {
        calls.push(["set", ...args]);
      }
    }
  });

  return {
    calls,
    controller,
    exportedTerms,
    importedTerms,
    importedTmEntries,
    project,
    tmEntries,
    setProject(value) {
      currentProject = value;
    }
  };
}

const names = (calls) => calls.map(([name]) => name);
const firstCall = (calls, name) => calls.find(([callName]) => callName === name);
const callsNamed = (calls, name) => calls.filter(([callName]) => callName === name);

test("ProjectResourceTransferController preserves TMX read, parse, progress, persistence, dirtiness, refresh, activity, and status", async () => {
  const { createProjectResourceTransferController } = await moduleAt(
    "src/features/import-export/project-resource-transfer-controller.js"
  );
  const harness = createHarness(createProjectResourceTransferController, {
    mainTmNames: ["Parse TM", "Dirty TM", "Activity TM"],
    activityLogged: false
  });
  const file = createFile("memory.tmx");
  await harness.controller.importTmx(file);
  assert.deepEqual(names(harness.calls).slice(0, 6), [
    "getProject",
    "assertSize",
    "reportProgress",
    "readText",
    "reportProgress",
    "getProject"
  ]);
  assert.deepEqual(firstCall(harness.calls, "assertSize").slice(1), [file, "TMX file"]);
  assert.deepEqual(firstCall(harness.calls, "parseTmx").slice(1, 3), [
    "<content>memory.tmx</content>",
    {
      sourceLang: "en",
      targetLang: "tr",
      tmName: "Parse TM",
      projectName: "Project Name TMX import"
    }
  ]);
  assert(
    callsNamed(harness.calls, "reportProgress").some((call) => call[1] === "Parsing TMX" && call[3] === "50% - 1 entry")
  );
  assert(
    callsNamed(harness.calls, "reportProgress").some(
      (call) => call[1] === "Indexing TM entries" && call[3] === "2/2 index rows"
    )
  );
  assert.deepEqual(firstCall(harness.calls, "markProjectsUsingDirty").slice(1), ["tm", "Dirty TM", "en", "tr"]);
  assert(names(harness.calls).indexOf("markProjectsUsingDirty") < names(harness.calls).indexOf("refreshTmMatches"));
  assert.deepEqual(firstCall(harness.calls, "logOptionalProject").slice(1), [
    "resource-import",
    "TMX imported",
    { fileName: "memory.tmx", entryCount: 2, tmName: "Activity TM" },
    "TMX import"
  ]);
  assert.deepEqual(harness.calls.at(-1), ["set", "Imported 2 TM entries; activity log failed", "dirty"]);
});

test("ProjectResourceTransferController preserves TBX call-time termbase selection, indexed persistence, refresh order, and activity", async () => {
  const { createProjectResourceTransferController } = await moduleAt(
    "src/features/import-export/project-resource-transfer-controller.js"
  );
  const harness = createHarness(createProjectResourceTransferController, {
    selectedTermBaseNames: ["Parse TB", "Dirty TB", "Activity TB"]
  });
  const file = createFile("terms.tbx");
  await harness.controller.importTbx(file);
  assert.equal(firstCall(harness.calls, "parseTbx")[2].termBaseName, "Parse TB");
  assert.deepEqual(firstCall(harness.calls, "markProjectsUsingDirty").slice(1), ["termbase", "Dirty TB", "en", "tr"]);
  assert(
    callsNamed(harness.calls, "reportProgress").some((call) => call[1] === "Parsing TBX" && call[3] === "75% - 2 terms")
  );
  assert.deepEqual(
    names(harness.calls).filter((name) => ["refreshProjectTerms", "refreshTerms"].includes(name)),
    ["refreshProjectTerms", "refreshTerms"]
  );
  assert.deepEqual(firstCall(harness.calls, "logOptionalProject").slice(1), [
    "resource-import",
    "TBX imported",
    { fileName: "terms.tbx", termCount: 2, termBaseName: "Activity TB" },
    "TBX import"
  ]);
  assert.deepEqual(harness.calls.at(-1), ["set", "Imported 2 terms", "saved"]);
});

test("ProjectResourceTransferController preserves text/workbook term-list parsing and captures one selected termbase", async () => {
  const { createProjectResourceTransferController } = await moduleAt(
    "src/features/import-export/project-resource-transfer-controller.js"
  );
  const textHarness = createHarness(createProjectResourceTransferController, {
    selectedTermBaseNames: ["Captured TB", "Unexpected TB"]
  });
  const csv = createFile("terms.csv", "text/csv");
  await textHarness.controller.importTermList(csv);
  assert.equal(names(textHarness.calls).includes("parseTermWorkbook"), false);
  assert.deepEqual(firstCall(textHarness.calls, "parseTermList").slice(1), [
    "<content>terms.csv</content>",
    {
      sourceLang: "en",
      targetLang: "tr",
      termBaseName: "Captured TB",
      fileName: "terms.csv"
    }
  ]);
  assert.equal(callsNamed(textHarness.calls, "selectedTermBaseName").length, 1);
  assert.deepEqual(firstCall(textHarness.calls, "markProjectsUsingDirty").slice(1, 3), ["termbase", "Captured TB"]);

  const workbookHarness = createHarness(createProjectResourceTransferController);
  const workbook = createFile("TERMS.XLSX", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  await workbookHarness.controller.importTermList(workbook);
  assert.equal(names(workbookHarness.calls).includes("readText"), false);
  assert.equal(names(workbookHarness.calls).includes("parseTermWorkbook"), true);
  assert.equal(firstCall(workbookHarness.calls, "parseTermWorkbook")[2].fileName, "TERMS.XLSX");
});

test("ProjectResourceTransferController preserves linked TMX filtering, metadata, download-before-activity, and warning status", async () => {
  const { createProjectResourceTransferController } = await moduleAt(
    "src/features/import-export/project-resource-transfer-controller.js"
  );
  const harness = createHarness(createProjectResourceTransferController, { activityLogged: false });
  await harness.controller.exportTmx();
  assert.deepEqual(firstCall(harness.calls, "getAllByIndex").slice(1), ["tmEntries", "languagePair", "en::tr"]);
  assert.deepEqual(firstCall(harness.calls, "buildTmx").slice(1), [
    harness.tmEntries.slice(0, 2),
    { ...harness.project, tmName: "Main TM" }
  ]);
  assert.deepEqual(firstCall(harness.calls, "download").slice(1), [
    "project-name_project-tms.tmx",
    "tmx-content",
    "application/xml"
  ]);
  assert(names(harness.calls).indexOf("download") < names(harness.calls).indexOf("logOptionalProject"));
  assert.deepEqual(firstCall(harness.calls, "logOptionalProject").slice(1), [
    "resource-export",
    "TMX exported",
    { entryCount: 2, tmNames: ["Main TM", "Secondary TM"] },
    "TMX export"
  ]);
  assert.deepEqual(harness.calls.at(-1), ["set", "Exported 2 project TM entries; activity log failed", "dirty"]);
});

test("ProjectResourceTransferController preserves project TBX query, primary metadata, filename, activity, and status", async () => {
  const { createProjectResourceTransferController } = await moduleAt(
    "src/features/import-export/project-resource-transfer-controller.js"
  );
  const harness = createHarness(createProjectResourceTransferController);
  await harness.controller.exportTbx();
  assert.deepEqual(firstCall(harness.calls, "listTerms")[1], {
    sourceLang: "en",
    targetLang: "tr",
    termBaseNames: ["Primary TB", "Secondary TB"]
  });
  assert.deepEqual(firstCall(harness.calls, "buildTbx").slice(1), [
    harness.exportedTerms,
    { ...harness.project, termBaseName: "Primary TB" }
  ]);
  assert.deepEqual(firstCall(harness.calls, "download").slice(1), [
    "project-name_project-termbases.tbx",
    "tbx-content",
    "application/xml"
  ]);
  assert.deepEqual(firstCall(harness.calls, "logOptionalProject").slice(1), [
    "resource-export",
    "TBX exported",
    { termCount: 1, termBaseNames: ["Primary TB", "Secondary TB"] },
    "TBX export"
  ]);
  assert.deepEqual(harness.calls.at(-1), ["set", "Exported 1 project term", "saved"]);
});

test("ProjectResourceTransferController preserves no-project, size/parser failure propagation, export containment, and immutability", async () => {
  const { createProjectResourceTransferController } = await moduleAt(
    "src/features/import-export/project-resource-transfer-controller.js"
  );
  const noProject = createHarness(createProjectResourceTransferController, { hasProject: false });
  await noProject.controller.importTmx(createFile("memory.tmx"));
  await noProject.controller.exportTmx();
  await noProject.controller.importTbx(createFile("terms.tbx"));
  await noProject.controller.importTermList(createFile("terms.csv"));
  await noProject.controller.exportTbx();
  assert.deepEqual(names(noProject.calls), Array(5).fill("getProject"));

  const sizeFailure = new Error("too large");
  const oversized = createHarness(createProjectResourceTransferController, { sizeFailure });
  await assert.rejects(oversized.controller.importTmx(createFile("huge.tmx")), (error) => error === sizeFailure);
  assert.equal(names(oversized.calls).includes("reportProgress"), false);

  const parseFailure = new Error("parse failed");
  const malformed = createHarness(createProjectResourceTransferController, { parseFailure });
  await assert.rejects(malformed.controller.importTbx(createFile("broken.tbx")), (error) => error === parseFailure);
  assert.equal(names(malformed.calls).includes("importTerms"), false);

  const exportFailure = new Error("query failed");
  const failedExport = createHarness(createProjectResourceTransferController, { exportFailure });
  await failedExport.controller.exportTmx();
  assert.deepEqual(failedExport.calls.at(-1), ["set", "query failed", "dirty"]);
  assert.equal(names(failedExport.calls).includes("download"), false);
  assert.equal(Object.isFrozen(failedExport.controller), true);
  assert.throws(() => createProjectResourceTransferController(), /requires session, file, parser, repository/);
});
