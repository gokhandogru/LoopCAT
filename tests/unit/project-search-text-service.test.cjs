const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const test = require("node:test");

const root = path.resolve(__dirname, "..", "..");

function loadFactory() {
  return import(pathToFileURL(path.join(root, "src/features/projects/project-search-text-service.js")).href);
}

test("ProjectSearchTextService preserves exact project and resource access and conversion order", async () => {
  const { createProjectSearchTextService } = await loadFactory();
  const calls = [];
  function loggedValue(label, value) {
    return {
      toString() {
        calls.push(`convert-${label}`);
        return value;
      }
    };
  }
  const project = {};
  Object.defineProperties(project, {
    name: {
      get() {
        calls.push("get-name");
        return loggedValue("name", "Project");
      }
    },
    domain: {
      get() {
        calls.push("get-domain");
        return loggedValue("domain", "Domain");
      }
    },
    sourceFileName: {
      get() {
        calls.push("get-source-file");
        return loggedValue("source-file", "source.txt");
      }
    }
  });
  const resources = {
    summary(receivedProject) {
      calls.push(["summary", receivedProject, this]);
      return {
        get tmNames() {
          calls.push("get-tm-names");
          return ["Main TM", "Reference TM"];
        },
        get tbNames() {
          calls.push("get-tb-names");
          return ["Terms"];
        }
      };
    }
  };
  const text = {
    stableLower(value) {
      calls.push(["stable-lower", value, this]);
      return value.toLowerCase();
    }
  };
  const service = createProjectSearchTextService({ resources, text });

  assert.equal(service.build(project), "project domain source.txt main tm reference tm terms");
  assert.deepEqual(calls, [
    "get-name",
    "convert-name",
    "get-domain",
    "convert-domain",
    "get-source-file",
    "convert-source-file",
    ["summary", project, resources],
    "get-tm-names",
    "get-tb-names",
    ["stable-lower", "Project Domain source.txt Main TM Reference TM Terms", text]
  ]);
});

test("ProjectSearchTextService preserves exact falsy field fallbacks and name coercion", async () => {
  const { createProjectSearchTextService } = await loadFactory();
  const values = [];
  const service = createProjectSearchTextService({
    resources: { summary: () => ({ tmNames: [], tbNames: [] }) },
    text: {
      stableLower(value) {
        values.push(value);
        return value;
      }
    }
  });

  assert.equal(service.build({ name: undefined, domain: 0, sourceFileName: false }), "undefined   ");
  assert.equal(service.build({ name: 0, domain: null, sourceFileName: Number.NaN }), "0   ");
  assert.deepEqual(values, ["undefined   ", "0   "]);
});

test("ProjectSearchTextService preserves TM-before-termbase ordering and source records", async () => {
  const { createProjectSearchTextService } = await loadFactory();
  const tmNames = ["Main TM", "Reference TM"];
  const tbNames = ["Terms B", "Terms A"];
  const project = { name: "Project", domain: "", sourceFileName: "" };
  const summaryCalls = [];
  const service = createProjectSearchTextService({
    resources: {
      summary(receivedProject) {
        summaryCalls.push(receivedProject);
        return { tmNames, tbNames };
      }
    },
    text: { stableLower: (value) => value }
  });

  assert.equal(service.build(project), "Project   Main TM Reference TM Terms B Terms A");
  assert.equal(service.build(project), "Project   Main TM Reference TM Terms B Terms A");
  assert.deepEqual(summaryCalls, [project, project]);
  assert.deepEqual(tmNames, ["Main TM", "Reference TM"]);
  assert.deepEqual(tbNames, ["Terms B", "Terms A"]);
});

test("ProjectSearchTextService returns the exact locale-normalization result once", async () => {
  const { createProjectSearchTextService } = await loadFactory();
  const normalized = { normalized: true };
  let summaryCalls = 0;
  let normalizeCalls = 0;
  const service = createProjectSearchTextService({
    resources: {
      summary() {
        summaryCalls += 1;
        return { tmNames: ["TM"], tbNames: ["TB"] };
      }
    },
    text: {
      stableLower(value) {
        normalizeCalls += 1;
        assert.equal(value, "Project Domain source.txt TM TB");
        return normalized;
      }
    }
  });

  assert.equal(service.build({ name: "Project", domain: "Domain", sourceFileName: "source.txt" }), normalized);
  assert.equal(summaryCalls, 1);
  assert.equal(normalizeCalls, 1);
});

test("ProjectSearchTextService preserves property, resource, iterable, and normalization failure timing", async () => {
  const { createProjectSearchTextService } = await loadFactory();
  const nameError = new Error("name conversion failed");
  let lateReads = 0;
  const nameFailure = createProjectSearchTextService({
    resources: { summary: () => assert.fail("summary must not run") },
    text: { stableLower: () => assert.fail("normalization must not run") }
  });
  const project = {
    name: {
      toString() {
        throw nameError;
      }
    },
    get domain() {
      lateReads += 1;
      return "Domain";
    }
  };
  assert.throws(() => nameFailure.build(project), nameError);
  assert.equal(lateReads, 0);

  const summaryError = new Error("summary failed");
  const accesses = [];
  const summaryFailure = createProjectSearchTextService({
    resources: {
      summary() {
        accesses.push("summary");
        throw summaryError;
      }
    },
    text: { stableLower: () => assert.fail("normalization must not run") }
  });
  assert.throws(
    () =>
      summaryFailure.build({
        get name() {
          accesses.push("name");
          return "Project";
        },
        get domain() {
          accesses.push("domain");
          return "Domain";
        },
        get sourceFileName() {
          accesses.push("source");
          return "source.txt";
        }
      }),
    summaryError
  );
  assert.deepEqual(accesses, ["name", "domain", "source", "summary"]);

  const iterableError = new Error("TM names failed");
  let tbReads = 0;
  const iterableFailure = createProjectSearchTextService({
    resources: {
      summary: () => ({
        tmNames: {
          [Symbol.iterator]() {
            throw iterableError;
          }
        },
        get tbNames() {
          tbReads += 1;
          return [];
        }
      })
    },
    text: { stableLower: () => assert.fail("normalization must not run") }
  });
  assert.throws(() => iterableFailure.build({ name: "Project" }), iterableError);
  assert.equal(tbReads, 0);

  const normalizeError = new Error("normalization failed");
  const normalizeFailure = createProjectSearchTextService({
    resources: { summary: () => ({ tmNames: [], tbNames: [] }) },
    text: {
      stableLower() {
        throw normalizeError;
      }
    }
  });
  assert.throws(() => normalizeFailure.build({ name: "Project" }), normalizeError);
});

test("ProjectSearchTextService validates boundaries and exposes an immutable API", async () => {
  const { createProjectSearchTextService } = await loadFactory();
  const options = {
    resources: { summary: () => ({ tmNames: [], tbNames: [] }) },
    text: { stableLower: (value) => value }
  };
  const service = createProjectSearchTextService(options);
  assert.equal(Object.isFrozen(service), true);
  assert.deepEqual(Object.keys(service), ["build"]);
  assert.throws(
    () => createProjectSearchTextService({ ...options, resources: { summary: null } }),
    /project-resource summary boundary/
  );
  assert.throws(
    () => createProjectSearchTextService({ ...options, text: { stableLower: null } }),
    /locale-stable text boundary/
  );
});
