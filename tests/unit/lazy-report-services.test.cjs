const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const test = require("node:test");

const root = path.resolve(__dirname, "../..");
const moduleAt = (relativePath) => import(pathToFileURL(path.join(root, relativePath)).href);

function createDataDependencies() {
  return {
    session: { getProject() {}, getSegments() {} },
    autosave: { flush() {} },
    resources: { getTmNames() {}, getTermBaseNames() {}, summarize() {} },
    repositories: { getAllByIndex() {}, listTerms() {}, listActivityEvents() {} },
    portable: { sanitize() {} },
    reporting: {
      validateExportReadiness() {},
      analyzeProject() {},
      runQaChecks() {},
      buildQualityPassportData() {}
    },
    worker: null,
    tags: { forSegment() {}, missing() {} },
    redactSensitiveText() {},
    timestamp() {}
  };
}

function createExportDependencies() {
  return {
    session: { getProject() {}, replaceQaChecks() {}, replaceQualityRiskQueue() {} },
    application: { clearQaFilter() {} },
    documents: { projectReportHtml() {}, qualityPassportHtml() {} },
    fileSafeName() {},
    download() {},
    presentation: { renderQaResults() {}, renderQualityWorkbench() {}, renderValidationReport() {} },
    validation: { reportCount() {} },
    activity: { logOptionalProject() {} },
    status: { appendActivityWarning() {}, exportMode() {}, set() {} }
  };
}

test("lazy report services preserve data validation, captured dependencies, and the frozen build facade", async () => {
  const { createLazyReportServices } = await moduleAt("src/reports/lazy-report-services.js");
  assert.throws(
    () => createLazyReportServices(),
    /requires session, autosave, resource, repository, portable, reporting, tag, redaction, and clock boundaries/
  );
  const dataDependencies = createDataDependencies();
  const originalTimestamp = dataDependencies.timestamp;
  let installedOptions;
  const services = createLazyReportServices(
    { data: dataDependencies },
    {
      load: () => (options) => {
        installedOptions = options;
        return {
          data: { build() {} },
          exports: { exportProjectReport() {}, exportAnonymizedReport() {}, exportQualityPassport() {} }
        };
      }
    }
  );
  dataDependencies.timestamp = () => "replacement";
  services.createExports(createExportDependencies());
  await services.data.build();

  assert.equal(installedOptions.data.timestamp, originalTimestamp);
  assert.deepEqual(Object.keys(services.data), ["build"]);
  assert.equal(Object.isFrozen(services.data), true);
  assert.equal(Object.isFrozen(services), true);
});

test("lazy report services preserve export validation, captured dependencies, and the frozen three-method facade", async () => {
  const { createLazyReportServices } = await moduleAt("src/reports/lazy-report-services.js");
  const services = createLazyReportServices({ data: createDataDependencies() }, { load() {} });
  assert.throws(
    () => services.createExports(),
    /requires session, application, data, document, download, presentation, validation, activity, and status boundaries/
  );
  const dependencies = createExportDependencies();
  const exports = services.createExports(dependencies);
  assert.deepEqual(Object.keys(exports), ["exportProjectReport", "exportAnonymizedReport", "exportQualityPassport"]);
  assert.equal(Object.isFrozen(exports), true);
});

test("lazy report services share one concurrent load and preserve delegate receivers, arguments, and results", async () => {
  const { createLazyReportServices } = await moduleAt("src/reports/lazy-report-services.js");
  let resolveLoad;
  let loadCount = 0;
  const loadGate = new Promise((resolve) => {
    resolveLoad = resolve;
  });
  const calls = [];
  const dataResult = { kind: "data" };
  const exportResult = { kind: "export" };
  const installed = {
    data: {
      build(...args) {
        calls.push(["build", this, args]);
        return dataResult;
      }
    },
    exports: {
      exportProjectReport(...args) {
        calls.push(["exportProjectReport", this, args]);
        return exportResult;
      },
      exportAnonymizedReport() {},
      exportQualityPassport() {}
    }
  };
  const services = createLazyReportServices(
    { data: createDataDependencies() },
    {
      load() {
        loadCount += 1;
        return loadGate;
      }
    }
  );
  const exports = services.createExports(createExportDependencies());
  const data = services.data.build("data argument");
  const report = exports.exportProjectReport({ anonymized: false });
  await Promise.resolve();
  assert.equal(loadCount, 1);
  resolveLoad(() => installed);

  assert.equal(await data, dataResult);
  assert.equal(await report, exportResult);
  assert.deepEqual(
    calls.map(([method, receiver, args]) => [
      method,
      receiver === (method === "build" ? installed.data : installed.exports),
      args
    ]),
    [
      ["build", true, ["data argument"]],
      ["exportProjectReport", true, [{ anonymized: false }]]
    ]
  );
  assert.equal(loadCount, 1);
});

test("lazy report services propagate load failure identity and retry the next first use", async () => {
  const { createLazyReportServices } = await moduleAt("src/reports/lazy-report-services.js");
  const expectedError = new Error("report services unavailable");
  let loadCount = 0;
  const services = createLazyReportServices(
    { data: createDataDependencies() },
    {
      load() {
        loadCount += 1;
        if (loadCount === 1) throw expectedError;
        return () => ({
          data: { build: () => "ready" },
          exports: { exportProjectReport() {}, exportAnonymizedReport() {}, exportQualityPassport() {} }
        });
      }
    }
  );
  services.createExports(createExportDependencies());

  await assert.rejects(services.data.build(), (error) => error === expectedError);
  assert.equal(await services.data.build(), "ready");
  assert.equal(loadCount, 2);
});

test("lazy report services reject incomplete installation and permit a repaired retry", async () => {
  const { createLazyReportServices } = await moduleAt("src/reports/lazy-report-services.js");
  let loadCount = 0;
  const services = createLazyReportServices(
    { data: createDataDependencies() },
    {
      load() {
        loadCount += 1;
        return loadCount === 1
          ? () => ({ data: { build() {} }, exports: { exportProjectReport() {} } })
          : () => ({
              data: { build: () => "ready" },
              exports: { exportProjectReport() {}, exportAnonymizedReport() {}, exportQualityPassport() {} }
            });
      }
    }
  );
  services.createExports(createExportDependencies());

  await assert.rejects(services.data.build(), /did not install their implementations/);
  assert.equal(await services.data.build(), "ready");
  assert.equal(loadCount, 2);
});

test("lazy report services validate loader and export-registration boundaries", async () => {
  const { createLazyReportServices } = await moduleAt("src/reports/lazy-report-services.js");
  assert.throws(
    () => createLazyReportServices({ data: createDataDependencies() }, { load: false }),
    /require a load function/
  );
  const services = createLazyReportServices({ data: createDataDependencies() }, { load: () => null });
  await assert.rejects(services.data.build(), /require export dependencies before first use/);
  services.createExports(createExportDependencies());
  await assert.rejects(services.data.build(), /did not load their installer/);
});
