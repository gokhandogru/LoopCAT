const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const test = require("node:test");

const root = path.resolve(__dirname, "../..");

function loadFactory() {
  return import(pathToFileURL(path.join(root, "src/features/resources/project-term-refresh-controller.js")).href);
}

function createHarness(createProjectTermRefreshController, overrides = {}) {
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
      },
      replaceProjectTerms(terms) {
        calls.push(["session.replaceProjectTerms", terms]);
        if (overrides.replaceError) throw overrides.replaceError;
        return overrides.replaceResult;
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
    },
    filters: {
      invalidate() {
        calls.push(["filters.invalidate"]);
        if (overrides.invalidateError) throw overrides.invalidateError;
        return overrides.invalidateResult;
      }
    },
    presentation: {
      renderTermbaseSelect() {
        calls.push(["presentation.renderTermbaseSelect"]);
        if (overrides.selectError) throw overrides.selectError;
        return overrides.selectResult;
      },
      renderSegments(renderOptions) {
        calls.push(["presentation.renderSegments", renderOptions]);
        if (overrides.renderError) throw overrides.renderError;
        return overrides.renderResult;
      }
    }
  };

  return {
    calls,
    options,
    controller: createProjectTermRefreshController(options)
  };
}

test("ProjectTermRefreshController replaces fresh empty terms and stops when no project is selected", async () => {
  const { createProjectTermRefreshController } = await loadFactory();
  const harness = createHarness(createProjectTermRefreshController, { projects: [null] });

  assert.equal(await harness.controller.refresh(), undefined);
  assert.equal(await harness.controller.refresh({ rerender: true }), undefined);
  assert.deepEqual(
    harness.calls.map((call) => call[0]),
    ["session.getProject", "session.replaceProjectTerms", "session.getProject", "session.replaceProjectTerms"]
  );
  assert.deepEqual(harness.calls[1][1], []);
  assert.deepEqual(harness.calls[3][1], []);
  assert.notEqual(harness.calls[1][1], harness.calls[3][1]);
});

test("ProjectTermRefreshController preserves repeated live project reads and exact terminology query identity", async () => {
  const { createProjectTermRefreshController } = await loadFactory();
  const guardProject = { sourceLang: "guard", targetLang: "guard" };
  const sourceProject = { sourceLang: "en-GB", targetLang: "ignored" };
  const targetProject = { sourceLang: "ignored", targetLang: "tr-TR" };
  const termBaseNames = ["Main TB", "Reference TB"];
  const terms = [{ id: "term-1" }];
  const harness = createHarness(createProjectTermRefreshController, {
    projects: [guardProject, sourceProject, targetProject],
    termBaseNames,
    listResult: terms
  });

  assert.equal(await harness.controller.refresh(), undefined);
  assert.deepEqual(harness.calls, [
    ["session.getProject"],
    ["session.getProject"],
    ["session.getProject"],
    ["resources.termBaseNames"],
    ["repository.listTerms", { sourceLang: "en-GB", targetLang: "tr-TR", termBaseNames }],
    ["session.replaceProjectTerms", terms],
    ["filters.invalidate"],
    ["presentation.renderTermbaseSelect"]
  ]);
  assert.equal(harness.calls[4][1].termBaseNames, termBaseNames);
  assert.equal(harness.calls[5][1], terms);
});

test("ProjectTermRefreshController rerenders only when requested and preserves presentation order", async () => {
  const { createProjectTermRefreshController } = await loadFactory();
  const skipped = createHarness(createProjectTermRefreshController, { listResult: null });
  assert.equal(await skipped.controller.refresh({ rerender: 0 }), undefined);
  assert.equal(
    skipped.calls.some(([name]) => name === "presentation.renderSegments"),
    false
  );

  const rendered = createHarness(createProjectTermRefreshController, {
    listResult: "raw terms",
    replaceResult: "replace result",
    invalidateResult: "invalidate result",
    selectResult: "select result",
    renderResult: "render result"
  });
  assert.equal(await rendered.controller.refresh({ rerender: "yes" }), undefined);
  assert.deepEqual(rendered.calls.slice(-4), [
    ["session.replaceProjectTerms", "raw terms"],
    ["filters.invalidate"],
    ["presentation.renderTermbaseSelect"],
    ["presentation.renderSegments", { preserveScroll: true }]
  ]);
});

test("ProjectTermRefreshController awaits terminology before replacement and propagates repository rejection", async () => {
  const { createProjectTermRefreshController } = await loadFactory();
  let resolveTerms;
  const terms = [{ id: "late-term" }];
  const pending = new Promise((resolve) => {
    resolveTerms = resolve;
  });
  const harness = createHarness(createProjectTermRefreshController, { listResult: pending });
  const refreshPromise = harness.controller.refresh({ rerender: true });
  assert.equal(harness.calls.at(-1)[0], "repository.listTerms");

  resolveTerms(terms);
  assert.equal(await refreshPromise, undefined);
  assert.equal(harness.calls.find(([name]) => name === "session.replaceProjectTerms")[1], terms);

  const rejection = new Error("terminology read rejected");
  const failed = createHarness(createProjectTermRefreshController, { listResult: Promise.reject(rejection) });
  await assert.rejects(failed.controller.refresh(), rejection);
  assert.equal(failed.calls.at(-1)[0], "repository.listTerms");
});

test("ProjectTermRefreshController preserves live-read and resource failure short circuiting", async () => {
  const { createProjectTermRefreshController } = await loadFactory();
  const sourceFailure = createHarness(createProjectTermRefreshController, { projects: [{}, null] });
  await assert.rejects(sourceFailure.controller.refresh(), TypeError);
  assert.deepEqual(sourceFailure.calls, [["session.getProject"], ["session.getProject"]]);

  const targetFailure = createHarness(createProjectTermRefreshController, { projects: [{}, {}, null] });
  await assert.rejects(targetFailure.controller.refresh(), TypeError);
  assert.deepEqual(targetFailure.calls, [["session.getProject"], ["session.getProject"], ["session.getProject"]]);

  const resourceError = new Error("termbase selection failed");
  const resourceFailure = createHarness(createProjectTermRefreshController, { resourceError });
  await assert.rejects(resourceFailure.controller.refresh(), resourceError);
  assert.equal(resourceFailure.calls.at(-1)[0], "resources.termBaseNames");
});

test("ProjectTermRefreshController preserves every post-query failure boundary", async () => {
  const { createProjectTermRefreshController } = await loadFactory();
  for (const [override, expectedLast] of [
    [{ replaceError: new Error("replace failed") }, "session.replaceProjectTerms"],
    [{ invalidateError: new Error("invalidate failed") }, "filters.invalidate"],
    [{ selectError: new Error("selector failed") }, "presentation.renderTermbaseSelect"],
    [{ renderError: new Error("segments failed") }, "presentation.renderSegments"]
  ]) {
    const harness = createHarness(createProjectTermRefreshController, override);
    await assert.rejects(harness.controller.refresh({ rerender: true }), Object.values(override)[0]);
    assert.equal(harness.calls.at(-1)[0], expectedLast);
  }
});

test("ProjectTermRefreshController preserves option destructuring and synchronous dependency failures", async () => {
  const { createProjectTermRefreshController } = await loadFactory();
  const harness = createHarness(createProjectTermRefreshController);
  await assert.rejects(harness.controller.refresh(null), TypeError);
  assert.deepEqual(harness.calls, []);

  const projectError = new Error("project read failed");
  const projectFailure = createHarness(createProjectTermRefreshController, { projectError });
  await assert.rejects(projectFailure.controller.refresh(), projectError);
  assert.deepEqual(projectFailure.calls, [["session.getProject"]]);

  const listError = new Error("terminology read failed");
  const listFailure = createHarness(createProjectTermRefreshController, { listError });
  await assert.rejects(listFailure.controller.refresh(), listError);
  assert.equal(listFailure.calls.at(-1)[0], "repository.listTerms");
});

test("ProjectTermRefreshController validates every boundary and exposes an immutable API", async () => {
  const { createProjectTermRefreshController } = await loadFactory();
  const valid = createHarness(createProjectTermRefreshController);
  assert.equal(Object.isFrozen(valid.controller), true);
  assert.deepEqual(Object.keys(valid.controller), ["refresh"]);

  for (const options of [
    undefined,
    {},
    { ...valid.options, session: { ...valid.options.session, getProject: null } },
    { ...valid.options, session: { ...valid.options.session, replaceProjectTerms: null } },
    { ...valid.options, repository: { listTerms: null } },
    { ...valid.options, resources: { termBaseNames: null } },
    { ...valid.options, filters: { invalidate: null } },
    { ...valid.options, presentation: { ...valid.options.presentation, renderTermbaseSelect: null } },
    { ...valid.options, presentation: { ...valid.options.presentation, renderSegments: null } }
  ]) {
    assert.throws(() => createProjectTermRefreshController(options), /ProjectTermRefreshController requires/);
  }
});
