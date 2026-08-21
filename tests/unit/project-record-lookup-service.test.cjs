const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const test = require("node:test");

const root = path.resolve(__dirname, "../..");

function loadFactory() {
  return import(pathToFileURL(path.join(root, "src/features/projects/project-record-lookup-service.js")).href);
}

function createHarness(createProjectRecordLookupService, overrides = {}) {
  const calls = [];
  const currentValues = Array.isArray(overrides.currentValues)
    ? overrides.currentValues
    : [overrides.current === undefined ? null : overrides.current];
  let currentIndex = 0;
  const options = {
    session: {
      getProject() {
        calls.push(["getProject"]);
        if (overrides.currentError) throw overrides.currentError;
        const index = Math.min(currentIndex, currentValues.length - 1);
        currentIndex += 1;
        return currentValues[index];
      },
      getProjects() {
        calls.push(["getProjects"]);
        if (overrides.projectsError) throw overrides.projectsError;
        return overrides.projects === undefined ? [] : overrides.projects;
      },
      getProjectSummaries() {
        calls.push(["getProjectSummaries"]);
        if (overrides.summariesError) throw overrides.summariesError;
        return overrides.summaries === undefined ? [] : overrides.summaries;
      }
    }
  };
  return {
    calls,
    options,
    service: createProjectRecordLookupService(options)
  };
}

test("ProjectRecordLookupService preserves the matching current project's second live read", async () => {
  const { createProjectRecordLookupService } = await loadFactory();
  const firstCurrent = { id: "current", name: "First read" };
  const secondCurrent = { id: "changed", name: "Second read" };
  const harness = createHarness(createProjectRecordLookupService, {
    currentValues: [firstCurrent, secondCurrent],
    projectsError: new Error("project list must not be read"),
    summariesError: new Error("summaries must not be read")
  });

  assert.equal(harness.service.findById("current"), secondCurrent);
  assert.deepEqual(harness.calls, [["getProject"], ["getProject"]]);
});

test("ProjectRecordLookupService preserves strict current-ID comparison", async () => {
  const { createProjectRecordLookupService } = await loadFactory();
  const listed = { id: "7", name: "String ID" };
  const harness = createHarness(createProjectRecordLookupService, {
    current: { id: 7, name: "Numeric ID" },
    projects: [listed],
    summariesError: new Error("summaries must not be read")
  });

  assert.equal(harness.service.findById("7"), listed);
  assert.deepEqual(harness.calls, [["getProject"], ["getProjects"]]);
});

test("ProjectRecordLookupService gives the live project list stable precedence over summaries", async () => {
  const { createProjectRecordLookupService } = await loadFactory();
  const firstListed = { id: "project", version: 1 };
  const secondListed = { id: "project", version: 2 };
  const cached = { id: "project", version: "cached" };
  const harness = createHarness(createProjectRecordLookupService, {
    projects: [{ id: "other" }, firstListed, secondListed],
    summaries: [cached]
  });

  assert.equal(harness.service.findById("project"), firstListed);
  assert.deepEqual(harness.calls, [["getProject"], ["getProjects"]]);
});

test("ProjectRecordLookupService falls through to the first cached summary then null", async () => {
  const { createProjectRecordLookupService } = await loadFactory();
  const firstSummary = { id: "cached", version: 1 };
  const secondSummary = { id: "cached", version: 2 };
  const found = createHarness(createProjectRecordLookupService, {
    projects: [{ id: "other" }],
    summaries: [{ id: "also-other" }, firstSummary, secondSummary]
  });

  assert.equal(found.service.findById("cached"), firstSummary);
  assert.deepEqual(found.calls, [["getProject"], ["getProjects"], ["getProjectSummaries"]]);

  const missing = createHarness(createProjectRecordLookupService, {
    projects: [{ id: "other" }],
    summaries: [{ id: "cached" }]
  });
  assert.equal(missing.service.findById("missing"), null);
  assert.deepEqual(missing.calls, [["getProject"], ["getProjects"], ["getProjectSummaries"]]);
});

test("ProjectRecordLookupService reads every dependency live on each lookup", async () => {
  const { createProjectRecordLookupService } = await loadFactory();
  const calls = [];
  const first = { id: "first" };
  const second = { id: "second" };
  let projects = [first];
  const service = createProjectRecordLookupService({
    session: {
      getProject() {
        calls.push("current");
        return null;
      },
      getProjects() {
        calls.push("projects");
        return projects;
      },
      getProjectSummaries() {
        calls.push("summaries");
        return [];
      }
    }
  });

  assert.equal(service.findById("first"), first);
  projects = [second];
  assert.equal(service.findById("second"), second);
  assert.deepEqual(calls, ["current", "projects", "current", "projects"]);
});

test("ProjectRecordLookupService preserves dependency failure timing and short circuiting", async () => {
  const { createProjectRecordLookupService } = await loadFactory();
  for (const [overrides, expectedCalls, failure] of [
    [{ currentError: new Error("current failed") }, [["getProject"]], "currentError"],
    [{ projectsError: new Error("projects failed") }, [["getProject"], ["getProjects"]], "projectsError"],
    [
      { projects: [], summariesError: new Error("summaries failed") },
      [["getProject"], ["getProjects"], ["getProjectSummaries"]],
      "summariesError"
    ]
  ]) {
    const harness = createHarness(createProjectRecordLookupService, overrides);
    assert.throws(() => harness.service.findById("missing"), overrides[failure]);
    assert.deepEqual(harness.calls, expectedCalls);
  }

  const secondReadFailure = new Error("second current read failed");
  let currentReads = 0;
  const service = createProjectRecordLookupService({
    session: {
      getProject() {
        currentReads += 1;
        if (currentReads === 1) return { id: "current" };
        throw secondReadFailure;
      },
      getProjects() {
        throw new Error("project list must not be read");
      },
      getProjectSummaries() {
        throw new Error("summaries must not be read");
      }
    }
  });
  assert.throws(() => service.findById("current"), secondReadFailure);
  assert.equal(currentReads, 2);
});

test("ProjectRecordLookupService preserves direct list and record access failures", async () => {
  const { createProjectRecordLookupService } = await loadFactory();
  for (const overrides of [
    { projects: null },
    { projects: [null] },
    { projects: [], summaries: null },
    { projects: [], summaries: [undefined] }
  ]) {
    const harness = createHarness(createProjectRecordLookupService, overrides);
    assert.throws(() => harness.service.findById("missing"), TypeError);
  }

  const idFailure = new Error("project ID failed");
  const failingRecord = {};
  Object.defineProperty(failingRecord, "id", {
    get() {
      throw idFailure;
    }
  });
  const harness = createHarness(createProjectRecordLookupService, {
    projects: [failingRecord],
    summariesError: new Error("summaries must not be read")
  });
  assert.throws(() => harness.service.findById("missing"), idFailure);
  assert.deepEqual(harness.calls, [["getProject"], ["getProjects"]]);
});

test("ProjectRecordLookupService validates every boundary and exposes an immutable API", async () => {
  const { createProjectRecordLookupService } = await loadFactory();
  const valid = createHarness(createProjectRecordLookupService);
  assert.equal(Object.isFrozen(valid.service), true);
  assert.deepEqual(Object.keys(valid.service), ["findById"]);

  for (const options of [
    undefined,
    {},
    { session: { ...valid.options.session, getProject: null } },
    { session: { ...valid.options.session, getProjects: null } },
    { session: { ...valid.options.session, getProjectSummaries: null } }
  ]) {
    assert.throws(
      () => createProjectRecordLookupService(options),
      /current-project, project-list, and project-summary boundaries/
    );
  }
});
