const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const test = require("node:test");

const root = path.resolve(__dirname, "..", "..");

function loadFactory() {
  return import(pathToFileURL(path.join(root, "src/features/projects/project-tm-match-service.js")).href);
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

test("ProjectTmMatchService preserves local single ranking as a resolved promise", async () => {
  const { createProjectTmMatchService } = await loadFactory();
  const entries = [{ id: "entry-1" }];
  const matchOptions = { source: "Source" };
  const matches = [{ id: "match-1" }];
  const calls = [];
  const service = createProjectTmMatchService({
    candidates: { single: () => [] },
    scoring: {
      score(receivedEntries, receivedOptions) {
        calls.push([receivedEntries, receivedOptions]);
        return matches;
      }
    }
  });

  const resultPromise = service.rank(entries, matchOptions);
  assert.equal(resultPromise instanceof Promise, true);
  assert.deepEqual(calls, [[entries, matchOptions]]);
  assert.equal(await resultPromise, matches);
});

test("ProjectTmMatchService preserves exact single worker requests and lazy fallback", async () => {
  const { createProjectTmMatchService } = await loadFactory();
  const entries = [{ id: "entry-1" }];
  const matchOptions = { source: "Source" };
  const localMatches = [{ id: "local" }];
  const workerMatches = [{ id: "worker" }];
  const scoreCalls = [];
  let request;
  let receiver;
  const worker = {
    async findTmMatches(receivedRequest) {
      request = receivedRequest;
      receiver = this;
      assert.deepEqual(Object.keys(receivedRequest), ["entries", "options", "fallback"]);
      assert.equal(scoreCalls.length, 0);
      assert.equal(await receivedRequest.fallback(), localMatches);
      return workerMatches;
    }
  };
  const service = createProjectTmMatchService({
    candidates: { single: () => [] },
    scoring: {
      score(receivedEntries, receivedOptions) {
        scoreCalls.push([receivedEntries, receivedOptions]);
        return localMatches;
      }
    },
    worker
  });

  assert.equal(await service.rank(entries, matchOptions), workerMatches);
  assert.equal(receiver, worker);
  assert.equal(request.entries, entries);
  assert.equal(request.options, matchOptions);
  assert.deepEqual(scoreCalls, [[entries, matchOptions]]);
});

test("ProjectTmMatchService preserves candidate lookup before single ranking and rejection", async () => {
  const { createProjectTmMatchService } = await loadFactory();
  const candidateResult = deferred();
  const matchOptions = { source: "Source" };
  const entries = [{ id: "entry-1" }];
  const calls = [];
  const service = createProjectTmMatchService({
    candidates: {
      single(receivedOptions) {
        calls.push(["candidate", receivedOptions]);
        return candidateResult.promise;
      }
    },
    scoring: {
      score(receivedEntries, receivedOptions) {
        calls.push(["score", receivedEntries, receivedOptions]);
        return ["ranked"];
      }
    }
  });

  const resultPromise = service.find(matchOptions);
  assert.deepEqual(calls, [["candidate", matchOptions]]);
  candidateResult.resolve(entries);
  assert.deepEqual(await resultPromise, ["ranked"]);
  assert.deepEqual(calls[1], ["score", entries, matchOptions]);

  const candidateError = new Error("candidate failed");
  const failing = createProjectTmMatchService({
    candidates: {
      single() {
        throw candidateError;
      }
    },
    scoring: { score: () => assert.fail("scoring must not run") }
  });
  await assert.rejects(failing.find(matchOptions), candidateError);
});

test("ProjectTmMatchService preserves local batch ranking order and per-index option fallbacks", async () => {
  const { createProjectTmMatchService } = await loadFactory();
  const candidateBatches = [[{ id: "first" }], [{ id: "second" }], [{ id: "third" }]];
  const firstOptions = { source: "First" };
  const optionsList = [firstOptions, null];
  const calls = [];
  const service = createProjectTmMatchService({
    candidates: { single: () => [] },
    scoring: {
      score(entries, matchOptions) {
        calls.push([entries, matchOptions]);
        return `${entries[0].id}:${matchOptions.source || "fallback"}`;
      }
    }
  });

  const resultPromise = service.rankBatch(candidateBatches, optionsList);
  assert.equal(resultPromise instanceof Promise, true);
  assert.deepEqual(await resultPromise, ["first:First", "second:fallback", "third:fallback"]);
  assert.equal(calls[0][0], candidateBatches[0]);
  assert.equal(calls[0][1], firstOptions);
  assert.deepEqual(calls[1][1], {});
  assert.deepEqual(calls[2][1], {});
  assert.notEqual(calls[1][1], calls[2][1]);
});

test("ProjectTmMatchService preserves exact batch worker requests and lazy fallback", async () => {
  const { createProjectTmMatchService } = await loadFactory();
  const candidateBatches = [[{ id: "first" }], [{ id: "second" }]];
  const optionsList = [{ source: "First" }, { source: "Second" }];
  const localMatches = [["local-first"], ["local-second"]];
  const workerMatches = [["worker-first"], ["worker-second"]];
  const scoreCalls = [];
  let request;
  const worker = {
    async findTmMatchesBatch(receivedRequest) {
      request = receivedRequest;
      assert.equal(this, worker);
      assert.deepEqual(Object.keys(receivedRequest), ["entries", "options", "fallback"]);
      assert.deepEqual(scoreCalls, []);
      assert.deepEqual(await receivedRequest.fallback(), localMatches);
      return workerMatches;
    }
  };
  const service = createProjectTmMatchService({
    candidates: { single: () => [] },
    scoring: {
      score(entries, matchOptions) {
        scoreCalls.push([entries, matchOptions]);
        return localMatches[scoreCalls.length - 1];
      }
    },
    worker
  });

  assert.equal(await service.rankBatch(candidateBatches, optionsList), workerMatches);
  assert.equal(request.entries, candidateBatches);
  assert.equal(request.options, optionsList);
  assert.deepEqual(scoreCalls, [
    [candidateBatches[0], optionsList[0]],
    [candidateBatches[1], optionsList[1]]
  ]);
});

test("ProjectTmMatchService preserves array-only and empty batch short circuits", async () => {
  const { createProjectTmMatchService } = await loadFactory();
  let batchReads = 0;
  let singleCalls = 0;
  const candidates = {
    single() {
      singleCalls += 1;
      return [];
    }
  };
  Object.defineProperty(candidates, "batch", {
    configurable: true,
    get() {
      batchReads += 1;
      throw new Error("batch must not be read");
    }
  });
  const service = createProjectTmMatchService({
    candidates,
    scoring: { score: () => [] }
  });

  assert.deepEqual(await service.findBatch(), []);
  assert.deepEqual(await service.findBatch(null), []);
  assert.deepEqual(await service.findBatch({ source: "not an array" }), []);
  assert.deepEqual(await service.findBatch([]), []);
  assert.equal(batchReads, 0);
  assert.equal(singleCalls, 0);
});

test("ProjectTmMatchService preserves concurrent per-request fallback and result ordering", async () => {
  const { createProjectTmMatchService } = await loadFactory();
  const first = deferred();
  const second = deferred();
  const requests = [{ id: "first" }, { id: "second" }];
  const calls = [];
  const service = createProjectTmMatchService({
    candidates: {
      single(matchOptions) {
        calls.push(["candidate", matchOptions.id]);
        return matchOptions.id === "first" ? first.promise : second.promise;
      }
    },
    scoring: {
      score(entries, matchOptions) {
        calls.push(["score", matchOptions.id, entries[0].id]);
        return `${matchOptions.id}:${entries[0].id}`;
      }
    }
  });

  const resultPromise = service.findBatch(requests);
  assert.deepEqual(calls, [
    ["candidate", "first"],
    ["candidate", "second"]
  ]);
  second.resolve([{ id: "second-entry" }]);
  await Promise.resolve();
  first.resolve([{ id: "first-entry" }]);
  assert.deepEqual(await resultPromise, ["first:first-entry", "second:second-entry"]);
  assert.deepEqual(calls, [
    ["candidate", "first"],
    ["candidate", "second"],
    ["score", "second", "second-entry"],
    ["score", "first", "first-entry"]
  ]);
});

test("ProjectTmMatchService preserves batched candidate lookup before ordered ranking", async () => {
  const { createProjectTmMatchService } = await loadFactory();
  const batchResult = deferred();
  const requests = [{ id: "first" }, { id: "second" }];
  const candidateBatches = [[{ id: "first-entry" }], [{ id: "second-entry" }]];
  const calls = [];
  const service = createProjectTmMatchService({
    candidates: {
      single: () => assert.fail("single lookup must not run"),
      batch(receivedRequests) {
        calls.push(["batch", receivedRequests]);
        return batchResult.promise;
      }
    },
    scoring: {
      score(entries, matchOptions) {
        calls.push(["score", entries, matchOptions]);
        return entries[0].id;
      }
    }
  });

  const resultPromise = service.findBatch(requests);
  assert.deepEqual(calls, [["batch", requests]]);
  batchResult.resolve(candidateBatches);
  assert.deepEqual(await resultPromise, ["first-entry", "second-entry"]);
  assert.deepEqual(calls.slice(1), [
    ["score", candidateBatches[0], requests[0]],
    ["score", candidateBatches[1], requests[1]]
  ]);
});

test("ProjectTmMatchService preserves live optional worker and batch availability", async () => {
  const { createProjectTmMatchService } = await loadFactory();
  const calls = [];
  const candidates = {
    single(matchOptions) {
      calls.push(["single", matchOptions.id]);
      return [{ id: `${matchOptions.id}-entry` }];
    }
  };
  const worker = {};
  const service = createProjectTmMatchService({
    candidates,
    scoring: {
      score(entries) {
        calls.push(["score", entries[0].id]);
        return entries[0].id;
      }
    },
    worker
  });

  assert.equal(await service.rank([{ id: "local" }], {}), "local");
  worker.findTmMatches = ({ entries }) => {
    calls.push(["worker", entries[0].id]);
    return "worker-result";
  };
  assert.equal(await service.rank([{ id: "remote" }], {}), "worker-result");
  delete worker.findTmMatches;
  assert.deepEqual(await service.findBatch([{ id: "first" }]), ["first-entry"]);
  candidates.batch = (requests) => {
    calls.push(["batch", requests[0].id]);
    return [[{ id: "batched-entry" }]];
  };
  assert.deepEqual(await service.findBatch([{ id: "second" }]), ["batched-entry"]);
  assert.deepEqual(calls, [
    ["score", "local"],
    ["worker", "remote"],
    ["single", "first"],
    ["score", "first-entry"],
    ["batch", "second"],
    ["score", "batched-entry"]
  ]);
});

test("ProjectTmMatchService preserves scoring, worker, and candidate failure timing", async () => {
  const { createProjectTmMatchService } = await loadFactory();
  const scoreError = new Error("score failed");
  const scoringFailure = createProjectTmMatchService({
    candidates: { single: () => [] },
    scoring: {
      score() {
        throw scoreError;
      }
    }
  });
  let scorePromise;
  assert.doesNotThrow(() => {
    scorePromise = scoringFailure.rank([], {});
  });
  await assert.rejects(scorePromise, scoreError);

  const workerError = new Error("worker failed");
  const workerFailure = createProjectTmMatchService({
    candidates: { single: () => [] },
    scoring: { score: () => assert.fail("fallback must remain lazy") },
    worker: {
      findTmMatches() {
        throw workerError;
      }
    }
  });
  await assert.rejects(workerFailure.rank([], {}), workerError);

  const batchError = new Error("batch candidate failed");
  const batchFailure = createProjectTmMatchService({
    candidates: {
      single: () => assert.fail("single lookup must not run"),
      batch() {
        throw batchError;
      }
    },
    scoring: { score: () => assert.fail("scoring must not run") }
  });
  await assert.rejects(batchFailure.findBatch([{}]), batchError);

  const invalidMethods = createProjectTmMatchService({
    candidates: { single: () => [], batch: true },
    scoring: { score: () => [] },
    worker: { findTmMatches: true, findTmMatchesBatch: true }
  });
  await assert.rejects(invalidMethods.rank([], {}), TypeError);
  await assert.rejects(invalidMethods.rankBatch([], []), TypeError);
  await assert.rejects(invalidMethods.findBatch([{}]), TypeError);
});

test("ProjectTmMatchService validates boundaries and exposes an immutable API", async () => {
  const { createProjectTmMatchService } = await loadFactory();
  const options = {
    candidates: { single: () => [] },
    scoring: { score: () => [] }
  };
  const service = createProjectTmMatchService(options);
  assert.equal(Object.isFrozen(service), true);
  assert.deepEqual(Object.keys(service), ["rank", "find", "rankBatch", "findBatch"]);
  assert.throws(
    () => createProjectTmMatchService({ ...options, candidates: { single: null } }),
    /TM candidate boundary/
  );
  assert.throws(() => createProjectTmMatchService({ ...options, scoring: { score: null } }), /TM scoring boundary/);
  assert.doesNotThrow(() =>
    createProjectTmMatchService({
      ...options,
      candidates: { ...options.candidates, batch: null },
      worker: null
    })
  );
});
