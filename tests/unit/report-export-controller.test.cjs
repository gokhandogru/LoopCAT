const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const test = require("node:test");

const root = path.resolve(__dirname, "../..");
const moduleAt = (relativePath) => import(pathToFileURL(path.join(root, relativePath)).href);

function createHarness(createReportExportController, overrides = {}) {
  const calls = [];
  const project = {
    id: "project-1",
    name: overrides.projectName === undefined ? "Project Name" : overrides.projectName
  };
  const validation = { warnings: overrides.validationNotes ? ["note"] : [] };
  const reportData = {
    analysis: { totals: { segments: 3, words: 21 } },
    validation,
    qaChecks: overrides.qaChecks || [],
    qualityPassport: {
      confidenceScore: 88,
      riskQueue: { highRiskCount: overrides.highRiskCount || 0, items: ["risk"] }
    }
  };
  let currentProject = overrides.hasProject === false ? null : project;
  const activityLogged = overrides.activityLogged === undefined ? true : overrides.activityLogged;
  const controller = createReportExportController({
    session: {
      getProject() {
        calls.push(["getProject"]);
        return currentProject;
      },
      replaceQaChecks(checks) {
        calls.push(["replaceQaChecks", checks]);
      },
      replaceQualityRiskQueue(queue) {
        calls.push(["replaceQualityRiskQueue", queue]);
      }
    },
    application: {
      clearQaFilter() {
        calls.push(["clearQaFilter"]);
      }
    },
    data: {
      build() {
        calls.push(["build"]);
        return overrides.buildFailure ? Promise.reject(overrides.buildFailure) : Promise.resolve(reportData);
      }
    },
    documents: {
      projectReportHtml(data, options) {
        calls.push(["projectReportHtml", data, options]);
        return `<project anonymized="${options.anonymized}"></project>`;
      },
      qualityPassportHtml(data) {
        calls.push(["qualityPassportHtml", data]);
        return "<passport></passport>";
      }
    },
    finalizeDocument(html) {
      calls.push(["finalizeDocument", html]);
      return `final:${html}`;
    },
    fileSafeName(value) {
      calls.push(["fileSafeName", value]);
      return String(value).replaceAll(" ", "-").toLowerCase();
    },
    download(...args) {
      calls.push(["download", ...args]);
      if (overrides.downloadFailure) throw overrides.downloadFailure;
    },
    presentation: {
      renderQaResults() {
        calls.push(["renderQaResults"]);
      },
      renderQualityWorkbench() {
        calls.push(["renderQualityWorkbench"]);
      },
      renderValidationReport(value) {
        calls.push(["renderValidationReport", value]);
      }
    },
    validation: {
      reportCount(value) {
        calls.push(["reportCount", value]);
        return value?.warnings?.length || 0;
      }
    },
    activity: {
      logOptionalProject(...args) {
        calls.push(["logOptionalProject", ...args]);
        return Promise.resolve(activityLogged);
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
    project,
    reportData,
    setProject(value) {
      currentProject = value;
    }
  };
}

function namedCalls(calls) {
  return calls.map(([name]) => name);
}

test("ReportExportController preserves normal and anonymized report filenames, documents, activity, and status", async () => {
  const { createReportExportController } = await moduleAt("src/reports/report-export-controller.js");
  const normal = createHarness(createReportExportController);
  await normal.controller.exportProjectReport();
  assert.deepEqual(normal.calls.find(([name]) => name === "projectReportHtml").slice(1), [
    normal.reportData,
    { anonymized: false }
  ]);
  assert.deepEqual(normal.calls.find(([name]) => name === "download").slice(1), [
    "project-name_project-report.html",
    'final:<project anonymized="false"></project>',
    "text/html"
  ]);
  assert.deepEqual(normal.calls.find(([name]) => name === "logOptionalProject").slice(1), [
    "export",
    "Project report exported",
    { segmentCount: 3, wordCount: 21, qaIssueCount: 0, validationNoteCount: 0, anonymized: false },
    "Project report export"
  ]);
  assert.deepEqual(normal.calls.at(-1), ["set", "Project report exported", "saved"]);
  assert(namedCalls(normal.calls).indexOf("download") < namedCalls(normal.calls).indexOf("logOptionalProject"));

  const anonymized = createHarness(createReportExportController, { qaChecks: [{ id: "qa-1" }] });
  await anonymized.controller.exportAnonymizedReport();
  assert.deepEqual(anonymized.calls.find(([name]) => name === "projectReportHtml").at(-1), {
    anonymized: true
  });
  assert.equal(
    anonymized.calls.find(([name]) => name === "download")[1],
    "project-name_anonymized-project-report.html"
  );
  assert.deepEqual(anonymized.calls.find(([name]) => name === "logOptionalProject").slice(1), [
    "export",
    "Anonymized project report exported",
    { segmentCount: 3, wordCount: 21, qaIssueCount: 1, validationNoteCount: 0, anonymized: true },
    "Anonymized report export"
  ]);
  assert.deepEqual(anonymized.calls.at(-1), ["set", "Anonymized report exported with notes", "dirty"]);
});

test("ReportExportController preserves Quality Passport session, presentation, download, activity, and note policy", async () => {
  const { createReportExportController } = await moduleAt("src/reports/report-export-controller.js");
  const harness = createHarness(createReportExportController, { highRiskCount: 2, projectName: "" });
  await harness.controller.exportQualityPassport();
  assert.deepEqual(namedCalls(harness.calls).slice(0, 11), [
    "getProject",
    "build",
    "replaceQaChecks",
    "clearQaFilter",
    "replaceQualityRiskQueue",
    "renderQaResults",
    "renderQualityWorkbench",
    "renderValidationReport",
    "getProject",
    "fileSafeName",
    "qualityPassportHtml"
  ]);
  assert.deepEqual(harness.calls.find(([name]) => name === "download").slice(1), [
    "project_quality-passport.html",
    "final:<passport></passport>",
    "text/html"
  ]);
  assert.deepEqual(harness.calls.find(([name]) => name === "logOptionalProject").slice(1), [
    "export",
    "Quality Passport exported",
    {
      segmentCount: 3,
      wordCount: 21,
      qaIssueCount: 0,
      qualityScore: 88,
      highRiskCount: 2,
      validationNoteCount: 0
    },
    "Quality Passport export"
  ]);
  assert.deepEqual(harness.calls.at(-1), ["set", "Quality Passport exported with notes", "dirty"]);
});

test("ReportExportController returns before report effects when no project is selected", async () => {
  const { createReportExportController } = await moduleAt("src/reports/report-export-controller.js");
  const harness = createHarness(createReportExportController, { hasProject: false });
  await harness.controller.exportProjectReport();
  await harness.controller.exportAnonymizedReport();
  await harness.controller.exportQualityPassport();
  assert.deepEqual(namedCalls(harness.calls), ["getProject", "getProject", "getProject"]);
});

test("ReportExportController preserves activity-warning status without treating a completed download as failure", async () => {
  const { createReportExportController } = await moduleAt("src/reports/report-export-controller.js");
  const report = createHarness(createReportExportController, { activityLogged: false });
  await report.controller.exportProjectReport();
  assert.equal(namedCalls(report.calls).filter((name) => name === "download").length, 1);
  assert.deepEqual(report.calls.at(-1), ["set", "Project report exported; activity log failed", "dirty"]);

  const passport = createHarness(createReportExportController, { activityLogged: false });
  await passport.controller.exportQualityPassport();
  assert.equal(namedCalls(passport.calls).filter((name) => name === "download").length, 1);
  assert.deepEqual(passport.calls.at(-1), ["set", "Quality Passport exported; activity log failed", "dirty"]);
});

test("ReportExportController contains primary failures with exact report-specific status", async () => {
  const { createReportExportController } = await moduleAt("src/reports/report-export-controller.js");
  const buildFailure = new Error("data failed");
  const report = createHarness(createReportExportController, { buildFailure });
  await report.controller.exportProjectReport();
  assert.deepEqual(report.calls.at(-1), ["set", "data failed", "dirty"]);
  assert.equal(namedCalls(report.calls).includes("download"), false);

  const passportFailure = new Error("");
  const passport = createHarness(createReportExportController, { downloadFailure: passportFailure });
  await passport.controller.exportQualityPassport();
  assert.deepEqual(passport.calls.at(-1), ["set", "Quality Passport export failed", "dirty"]);
  assert.equal(namedCalls(passport.calls).includes("logOptionalProject"), false);
  assert.throws(() => createReportExportController(), /requires session, application, data, document, download/);
  assert.equal(Object.isFrozen(report.controller), true);
});
