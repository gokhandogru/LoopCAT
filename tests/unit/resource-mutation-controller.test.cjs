const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const test = require("node:test");

const root = path.resolve(__dirname, "../..");
const moduleAt = (relativePath) => import(pathToFileURL(path.join(root, relativePath)).href);

function createHarness(createResourceMutationController, overrides = {}) {
  const calls = [];
  const warnings = [];
  const items = overrides.items || [{ id: "one" }, { id: "two" }];
  const controller = createResourceMutationController({
    session: {
      getProjectId() {
        calls.push(["getProjectId"]);
        return overrides.projectId === undefined ? "project-1" : overrides.projectId;
      }
    },
    repositories: {
      updateTmEntry(entry) {
        calls.push(["updateTmEntry", entry]);
        if (overrides.updateTmFailure) return Promise.reject(overrides.updateTmFailure);
        return Promise.resolve();
      },
      updateTerm(term) {
        calls.push(["updateTerm", term]);
        if (overrides.updateTermFailure) return Promise.reject(overrides.updateTermFailure);
        return Promise.resolve();
      }
    },
    resources: {
      markProjectsUsingDirty(type, name, sourceLang, targetLang) {
        calls.push(["markDirty", type, name, sourceLang, targetLang]);
      },
      refresh() {
        calls.push(["refreshResources"]);
        return Promise.resolve();
      },
      refreshProjectTerms(options) {
        calls.push(["refreshProjectTerms", options]);
        return Promise.resolve();
      },
      labelFromKey(key) {
        calls.push(["labelFromKey", key]);
        if (overrides.labelFailure) throw overrides.labelFailure;
        return { name: "Library", sourceLang: "en", targetLang: "tr", languagePair: "en::tr" };
      },
      items(type, key) {
        calls.push(["items", type, key]);
        return items;
      }
    },
    commands: {
      execute(command) {
        calls.push(["execute", command]);
        if (overrides.executeFailure) return Promise.reject(overrides.executeFailure);
        return Promise.resolve({ trashEntry: { id: "trash-1" } });
      },
      createDeleteEntry(options) {
        calls.push(["createDeleteEntry", options]);
        if (overrides.missingCommand) return null;
        return { kind: "delete-entry", projectId: options.projectId, options };
      },
      createDeleteResource(options) {
        calls.push(["createDeleteResource", options]);
        if (overrides.missingCommand) return null;
        return { kind: "delete-resource", projectId: options.projectId, options };
      },
      setProjectId(projectId) {
        calls.push(["setProjectId", projectId]);
      }
    },
    trash: {
      entryFromCommandResult(result) {
        calls.push(["entryFromResult", result]);
        return result.trashEntry;
      },
      synchronize(entry, options) {
        calls.push(["synchronize", entry, options]);
        if (overrides.synchronizeFailure) return Promise.reject(overrides.synchronizeFailure);
        return Promise.resolve();
      }
    },
    presentation: {
      renderUndo() {
        calls.push(["renderUndo"]);
      }
    },
    status: {
      set(message, mode) {
        calls.push(["set", message, mode]);
      }
    },
    testHooks: {
      beforeSaveTm(entry) {
        calls.push(["beforeSaveTm", entry.id]);
        if (overrides.beforeSaveTmFailure) throw overrides.beforeSaveTmFailure;
      },
      beforeSaveTerm(term) {
        calls.push(["beforeSaveTerm", term.id]);
        if (overrides.beforeSaveTermFailure) throw overrides.beforeSaveTermFailure;
      },
      beforeDeleteTm(entry) {
        calls.push(["beforeDeleteTm", entry.id]);
        if (overrides.beforeDeleteTmFailure) throw overrides.beforeDeleteTmFailure;
      },
      beforeDeleteTerm(term) {
        calls.push(["beforeDeleteTerm", term.id]);
        if (overrides.beforeDeleteTermFailure) throw overrides.beforeDeleteTermFailure;
      },
      beforeDeleteResource(type, key) {
        calls.push(["beforeDeleteResource", type, key]);
        if (overrides.beforeDeleteResourceFailure) throw overrides.beforeDeleteResourceFailure;
      }
    },
    logger: {
      warn(...args) {
        warnings.push(args);
        calls.push(["warn", ...args]);
      }
    }
  });
  return { calls, controller, items, warnings };
}

const names = (calls) => calls.map(([name]) => name);
const firstCall = (calls, name) => calls.find(([callName]) => callName === name);

test("ResourceMutationController preserves TM and term patch, dirtiness, refresh, status, and boolean results", async () => {
  const { createResourceMutationController } = await moduleAt("src/features/resources/resource-mutation-controller.js");
  const tmHarness = createHarness(createResourceMutationController);
  const tmEntry = { id: "tm-1", tmName: "TM", sourceLang: "en", targetLang: "tr", source: "old", target: "old" };
  assert.equal(await tmHarness.controller.saveTmEntry(tmEntry, { source: "new source", target: "new target" }), true);
  assert.deepEqual(firstCall(tmHarness.calls, "updateTmEntry")[1], {
    ...tmEntry,
    source: "new source",
    target: "new target"
  });
  assert.deepEqual(names(tmHarness.calls), ["beforeSaveTm", "updateTmEntry", "markDirty", "refreshResources", "set"]);
  assert.deepEqual(tmHarness.calls.at(-1), ["set", "TM entry saved", "saved"]);

  const termHarness = createHarness(createResourceMutationController);
  const term = {
    id: "term-1",
    termBaseName: "TB",
    sourceLang: "en",
    targetLang: "tr",
    sourceTerm: "old",
    targetTerm: "old",
    notes: "old",
    isForbidden: false
  };
  assert.equal(
    await termHarness.controller.saveTerm(term, {
      sourceTerm: "source",
      targetTerm: "target",
      notes: "note",
      isForbidden: true
    }),
    true
  );
  assert.deepEqual(firstCall(termHarness.calls, "updateTerm")[1], {
    ...term,
    sourceTerm: "source",
    targetTerm: "target",
    notes: "note",
    isForbidden: true
  });
  assert.deepEqual(names(termHarness.calls).slice(-3), ["refreshResources", "refreshProjectTerms", "set"]);
});

test("ResourceMutationController contains save failures before downstream effects with exact status", async () => {
  const { createResourceMutationController } = await moduleAt("src/features/resources/resource-mutation-controller.js");
  const failure = new Error("save blocked");
  const harness = createHarness(createResourceMutationController, { beforeSaveTmFailure: failure });
  const result = await harness.controller.saveTmEntry({ id: "tm-1" }, { source: "a", target: "b" });
  assert.equal(result, false);
  assert.deepEqual(names(harness.calls), ["beforeSaveTm", "set"]);
  assert.deepEqual(harness.calls.at(-1), ["set", "save blocked", "dirty"]);
});

test("ResourceMutationController preserves reversible entry command arguments, project identity, Trash sync, Undo, and term options", async () => {
  const { createResourceMutationController } = await moduleAt("src/features/resources/resource-mutation-controller.js");
  const tmHarness = createHarness(createResourceMutationController);
  assert.equal(await tmHarness.controller.deleteTmEntry({ id: "tm-1" }), true);
  assert.deepEqual(firstCall(tmHarness.calls, "createDeleteEntry")[1], {
    resourceType: "tm",
    entityId: "tm-1",
    projectId: "project-1"
  });
  assert.deepEqual(firstCall(tmHarness.calls, "synchronize").slice(1), [
    { id: "trash-1" },
    { refreshSuggestions: false }
  ]);
  assert.deepEqual(names(tmHarness.calls).slice(-3), ["synchronize", "renderUndo", "set"]);
  assert.deepEqual(tmHarness.calls.at(-1), ["set", "TM entry moved to Trash. Undo is available.", "saved"]);

  const termHarness = createHarness(createResourceMutationController, { projectId: null });
  assert.equal(await termHarness.controller.deleteTerm({ id: "term-1" }, { refreshSuggestions: true }), true);
  assert.deepEqual(firstCall(termHarness.calls, "createDeleteEntry")[1], {
    resourceType: "tb",
    entityId: "term-1",
    projectId: null
  });
  assert.deepEqual(firstCall(termHarness.calls, "synchronize")[2], { refreshSuggestions: true });
  assert.deepEqual(termHarness.calls.at(-1), ["set", "Term moved to Trash. Undo is available.", "saved"]);
});

test("ResourceMutationController preserves secondary refresh warnings and missing-command primary failure", async () => {
  const { createResourceMutationController } = await moduleAt("src/features/resources/resource-mutation-controller.js");
  const refreshFailure = new Error("refresh failed");
  const warningHarness = createHarness(createResourceMutationController, { synchronizeFailure: refreshFailure });
  assert.equal(await warningHarness.controller.deleteTmEntry({ id: "tm-1" }), true);
  assert.equal(warningHarness.warnings.length, 1);
  assert.deepEqual(warningHarness.calls.at(-1), [
    "set",
    "TM entry moved to Trash; the resource view could not refresh. Undo is available.",
    "saved"
  ]);

  const missingHarness = createHarness(createResourceMutationController, { missingCommand: true });
  assert.equal(await missingHarness.controller.deleteTerm({ id: "term-1" }), false);
  assert.equal(names(missingHarness.calls).includes("execute"), false);
  assert.deepEqual(missingHarness.calls.at(-1), [
    "set",
    "The reversible resource deletion service is unavailable.",
    "dirty"
  ]);
});

test("ResourceMutationController preserves whole-resource descriptor, affected IDs, terminology refresh, failure boundary, and immutability", async () => {
  const { createResourceMutationController } = await moduleAt("src/features/resources/resource-mutation-controller.js");
  const harness = createHarness(createResourceMutationController);
  assert.equal(await harness.controller.deleteResource("tb", "Library::en::tr"), true);
  assert.deepEqual(firstCall(harness.calls, "createDeleteResource")[1], {
    resourceType: "tb",
    descriptor: {
      key: "Library::en::tr",
      name: "Library",
      sourceLang: "en",
      targetLang: "tr",
      languagePair: "en::tr"
    },
    affectedIds: ["one", "two"],
    projectId: "project-1"
  });
  assert.deepEqual(firstCall(harness.calls, "synchronize")[2], { refreshSuggestions: true });
  assert.deepEqual(harness.calls.at(-1), ["set", "Termbase moved to Trash. Undo is available.", "saved"]);

  const labelFailure = new Error("bad key");
  const invalid = createHarness(createResourceMutationController, { labelFailure });
  await assert.rejects(invalid.controller.deleteResource("tm", "bad"), (error) => error === labelFailure);
  assert.deepEqual(names(invalid.calls), ["labelFromKey"]);
  assert.equal(Object.isFrozen(harness.controller), true);
  assert.throws(
    () => createResourceMutationController(),
    /requires session, repository, resource, command, Trash, presentation, and status/
  );
});
