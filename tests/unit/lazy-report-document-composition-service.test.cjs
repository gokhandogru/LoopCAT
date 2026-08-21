const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const test = require("node:test");

const root = path.resolve(__dirname, "../..");
const moduleAt = (relativePath) => import(pathToFileURL(path.join(root, relativePath)).href);

function createDependencies() {
  return {
    localization: { source() {}, sourceHtml() {}, locale() {}, direction() {} },
    presentation: {
      countTableHtml() {},
      listHtml() {},
      qaChecksTableHtml() {},
      qualityCategoryCountTableHtml() {},
      safeLabel() {}
    },
    escapeHtml() {},
    redactSensitiveText() {},
    defaultQualityProfile() {},
    sanitizeValidationReportForDisplay() {},
    languagePairDisplay() {},
    formatDateTime() {},
    qualityLabel() {},
    qualityCategoryName() {},
    qualityRiskLevelLabel() {}
  };
}

test("lazy report documents preserve synchronous validation, captured dependencies, and the frozen two-method API", async () => {
  const { createLazyReportDocumentCompositionService } = await moduleAt(
    "src/reports/lazy-report-document-composition-service.js"
  );
  assert.throws(
    () => createLazyReportDocumentCompositionService(),
    /requires localization, presentation, escaping, redaction, quality, validation, language, and date boundaries/
  );
  const dependencies = createDependencies();
  const originalEscape = dependencies.escapeHtml;
  let capturedDependencies;
  const service = createLazyReportDocumentCompositionService(dependencies, {
    load: () => (captured) => {
      capturedDependencies = captured;
      return { projectReportHtml() {}, qualityPassportHtml() {} };
    }
  });
  dependencies.escapeHtml = () => "replacement";

  await service.projectReportHtml({});
  assert.equal(capturedDependencies.escapeHtml, originalEscape);
  assert.deepEqual(Object.keys(service), ["projectReportHtml", "qualityPassportHtml"]);
  assert.equal(Object.isFrozen(service), true);
});

test("lazy report documents share one concurrent load and preserve delegate receivers, arguments, and results", async () => {
  const { createLazyReportDocumentCompositionService } = await moduleAt(
    "src/reports/lazy-report-document-composition-service.js"
  );
  let resolveLoad;
  let loadCount = 0;
  const loadGate = new Promise((resolve) => {
    resolveLoad = resolve;
  });
  const calls = [];
  const projectResult = { kind: "project" };
  const passportResult = { kind: "passport" };
  const implementation = {
    projectReportHtml(...args) {
      calls.push(["projectReportHtml", this, args]);
      return projectResult;
    },
    qualityPassportHtml(...args) {
      calls.push(["qualityPassportHtml", this, args]);
      return passportResult;
    }
  };
  const service = createLazyReportDocumentCompositionService(createDependencies(), {
    load() {
      loadCount += 1;
      return loadGate;
    }
  });
  const project = service.projectReportHtml({ id: "project" }, { anonymized: true });
  const passport = service.qualityPassportHtml({ id: "passport" });
  await Promise.resolve();
  assert.equal(loadCount, 1);
  resolveLoad(() => implementation);

  assert.equal(await project, projectResult);
  assert.equal(await passport, passportResult);
  assert.deepEqual(
    calls.map(([method, receiver, args]) => [method, receiver === implementation, args]),
    [
      ["projectReportHtml", true, [{ id: "project" }, { anonymized: true }]],
      ["qualityPassportHtml", true, [{ id: "passport" }]]
    ]
  );
  assert.equal(loadCount, 1);
});

test("lazy report documents propagate load failure identity and retry the next first use", async () => {
  const { createLazyReportDocumentCompositionService } = await moduleAt(
    "src/reports/lazy-report-document-composition-service.js"
  );
  const expectedError = new Error("report chunk unavailable");
  let loadCount = 0;
  const service = createLazyReportDocumentCompositionService(createDependencies(), {
    load() {
      loadCount += 1;
      if (loadCount === 1) throw expectedError;
      return () => ({ projectReportHtml: () => "ready", qualityPassportHtml: () => "ready" });
    }
  });

  await assert.rejects(service.projectReportHtml({}), (error) => error === expectedError);
  assert.equal(await service.projectReportHtml({}), "ready");
  assert.equal(loadCount, 2);
});

test("lazy report documents reject incomplete installation and permit a repaired retry", async () => {
  const { createLazyReportDocumentCompositionService } = await moduleAt(
    "src/reports/lazy-report-document-composition-service.js"
  );
  let loadCount = 0;
  const service = createLazyReportDocumentCompositionService(createDependencies(), {
    load() {
      loadCount += 1;
      return loadCount === 1
        ? () => ({ projectReportHtml() {} })
        : () => ({ projectReportHtml: () => "ready", qualityPassportHtml: () => "ready" });
    }
  });

  await assert.rejects(service.qualityPassportHtml({}), /did not install its implementation/);
  assert.equal(await service.qualityPassportHtml({}), "ready");
  assert.equal(loadCount, 2);
});

test("lazy report documents validate the loader boundary", async () => {
  const { createLazyReportDocumentCompositionService } = await moduleAt(
    "src/reports/lazy-report-document-composition-service.js"
  );
  assert.throws(
    () => createLazyReportDocumentCompositionService(createDependencies(), { load: false }),
    /requires a load function/
  );
  const service = createLazyReportDocumentCompositionService(createDependencies(), { load: () => null });
  await assert.rejects(service.projectReportHtml({}), /did not load its factory/);
});
