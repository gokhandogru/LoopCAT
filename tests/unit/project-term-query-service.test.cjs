const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const test = require("node:test");

const root = path.resolve(__dirname, "../..");

function loadFactory() {
  return import(pathToFileURL(path.join(root, "src/features/resources/project-term-query-service.js")).href);
}

function createHarness(createProjectTermQueryService, overrides = {}) {
  const calls = [];
  const defaultProject = { sourceLang: "en", targetLang: "tr" };
  const projects = overrides.projects || [defaultProject];
  let projectRead = 0;
  const options = {
    session: {
      getProject() {
        calls.push(["session.getProject"]);
        if (overrides.projectError) throw overrides.projectError;
        const index = Math.min(projectRead, projects.length - 1);
        projectRead += 1;
        return projects[index];
      }
    },
    repository: {
      listTerms(query) {
        calls.push(["repository.listTerms", query]);
        if (overrides.listError) throw overrides.listError;
        return Object.prototype.hasOwnProperty.call(overrides, "listResult") ? overrides.listResult : [];
      }
    },
    resources: {
      termBaseNames() {
        calls.push(["resources.termBaseNames"]);
        if (overrides.resourceError) throw overrides.resourceError;
        return Object.prototype.hasOwnProperty.call(overrides, "termBaseNames") ? overrides.termBaseNames : ["Main TB"];
      }
    }
  };
  return { calls, options, service: createProjectTermQueryService(options) };
}

test("ProjectTermQueryService returns fresh empty validation terms when no project is selected", async () => {
  const { createProjectTermQueryService } = await loadFactory();
  const harness = createHarness(createProjectTermQueryService, { projects: [null] });

  const first = await harness.service.listForValidation();
  const second = await harness.service.listForValidation();
  assert.deepEqual(first, []);
  assert.deepEqual(second, []);
  assert.notEqual(first, second);
  assert.deepEqual(harness.calls, [["session.getProject"], ["session.getProject"]]);
});

test("ProjectTermQueryService preserves live project reads and exact query identity", async () => {
  const { createProjectTermQueryService } = await loadFactory();
  const termBaseNames = ["Main TB", "Reference TB"];
  const terms = [{ id: "term-1" }];
  const harness = createHarness(createProjectTermQueryService, {
    projects: [
      { sourceLang: "guard", targetLang: "guard" },
      { sourceLang: "en-GB", targetLang: "ignored" },
      { sourceLang: "ignored", targetLang: "tr-TR" }
    ],
    termBaseNames,
    listResult: terms
  });

  assert.equal(await harness.service.listForValidation(), terms);
  assert.deepEqual(harness.calls, [
    ["session.getProject"],
    ["session.getProject"],
    ["session.getProject"],
    ["resources.termBaseNames"],
    ["repository.listTerms", { sourceLang: "en-GB", targetLang: "tr-TR", termBaseNames }]
  ]);
  assert.equal(harness.calls.at(-1)[1].termBaseNames, termBaseNames);
});

test("ProjectTermQueryService assimilates repository fulfillment and rejection", async () => {
  const { createProjectTermQueryService } = await loadFactory();
  const terms = [{ id: "async-term" }];
  const fulfilled = createHarness(createProjectTermQueryService, { listResult: Promise.resolve(terms) });
  assert.equal(await fulfilled.service.listForValidation(), terms);

  const rejection = new Error("term query rejected");
  const rejected = createHarness(createProjectTermQueryService, { listResult: Promise.reject(rejection) });
  await assert.rejects(rejected.service.listForValidation(), rejection);
  assert.equal(rejected.calls.at(-1)[0], "repository.listTerms");
});

test("ProjectTermQueryService preserves live-read and resource failure short circuiting", async () => {
  const { createProjectTermQueryService } = await loadFactory();
  const sourceFailure = createHarness(createProjectTermQueryService, { projects: [{}, null] });
  await assert.rejects(sourceFailure.service.listForValidation(), TypeError);
  assert.deepEqual(sourceFailure.calls, [["session.getProject"], ["session.getProject"]]);

  const targetFailure = createHarness(createProjectTermQueryService, { projects: [{}, {}, null] });
  await assert.rejects(targetFailure.service.listForValidation(), TypeError);
  assert.deepEqual(targetFailure.calls, [["session.getProject"], ["session.getProject"], ["session.getProject"]]);

  const resourceError = new Error("termbase names failed");
  const resourceFailure = createHarness(createProjectTermQueryService, { resourceError });
  await assert.rejects(resourceFailure.service.listForValidation(), resourceError);
  assert.equal(resourceFailure.calls.at(-1)[0], "resources.termBaseNames");
});

test("ProjectTermQueryService preserves synchronous session and repository failures", async () => {
  const { createProjectTermQueryService } = await loadFactory();
  const projectError = new Error("project read failed");
  const projectFailure = createHarness(createProjectTermQueryService, { projectError });
  await assert.rejects(projectFailure.service.listForValidation(), projectError);
  assert.deepEqual(projectFailure.calls, [["session.getProject"]]);

  const listError = new Error("term query failed");
  const listFailure = createHarness(createProjectTermQueryService, { listError });
  await assert.rejects(listFailure.service.listForValidation(), listError);
  assert.equal(listFailure.calls.at(-1)[0], "repository.listTerms");
});

test("ProjectTermQueryService validates every boundary and exposes an immutable API", async () => {
  const { createProjectTermQueryService } = await loadFactory();
  const valid = createHarness(createProjectTermQueryService);
  assert.equal(Object.isFrozen(valid.service), true);
  assert.deepEqual(Object.keys(valid.service), ["listForValidation"]);

  for (const options of [
    undefined,
    {},
    { ...valid.options, session: { getProject: null } },
    { ...valid.options, repository: { listTerms: null } },
    { ...valid.options, resources: { termBaseNames: null } }
  ]) {
    assert.throws(() => createProjectTermQueryService(options), /ProjectTermQueryService requires/);
  }
});
