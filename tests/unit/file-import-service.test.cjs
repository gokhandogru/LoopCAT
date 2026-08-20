const assert = require("node:assert/strict");
const path = require("node:path");
const test = require("node:test");
const { pathToFileURL } = require("node:url");

const rootPath = path.resolve(__dirname, "../..");

function loadFactory() {
  return import(pathToFileURL(path.join(rootPath, "src/features/import-export/file-import-service.js")).href);
}

function createHarness(createFileImportService, overrides = {}) {
  const calls = [];
  let activeTask = overrides.activeTask || "";
  const api = overrides.withoutEncodingApi
    ? null
    : {
        decodeTextFile(file, decodingOptions) {
          calls.push(["decode", file, decodingOptions]);
          if (overrides.decodeError) return Promise.reject(overrides.decodeError);
          return Promise.resolve({ text: overrides.decodedText ?? '{"decoded":true}' });
        }
      };
  const options = {
    encoding: {
      api,
      decodingOptions() {
        calls.push(["decodingOptions"]);
        if (overrides.decodingOptionsError) throw overrides.decodingOptionsError;
        return { encoding: "windows-1254" };
      }
    },
    limits: { portableJsonBytes: 100 },
    task: {
      get() {
        calls.push(["getTask"]);
        return activeTask;
      },
      set(value) {
        calls.push(["setTask", value]);
        if (overrides.taskSetErrorValue === value) throw overrides.taskSetError;
        activeTask = value;
      }
    },
    text: {
      lower(value) {
        calls.push(["lower", value]);
        if (overrides.lowerError) throw overrides.lowerError;
        return value.toLocaleLowerCase("en-US");
      }
    },
    presentation: {
      renderBusy() {
        calls.push(["renderBusy"]);
        if (overrides.busyErrorAt === calls.filter(([name]) => name === "renderBusy").length) {
          throw overrides.busyError;
        }
      },
      renderValidation(report) {
        calls.push(["renderValidation", report]);
        if (overrides.validationRenderError) throw overrides.validationRenderError;
      }
    },
    status: {
      set(message, mode) {
        calls.push(["status", message, mode]);
        if (overrides.statusErrorMessage === message) throw overrides.statusError;
      }
    },
    durability: {
      refresh(refreshOptions) {
        calls.push(["refreshDurability", refreshOptions]);
        if (overrides.durabilityError) return Promise.reject(overrides.durabilityError);
        return Promise.resolve(overrides.durabilityResult);
      }
    }
  };
  return {
    calls,
    options,
    service: createFileImportService(options),
    readTask: () => activeTask
  };
}

test("FileImportService returns fresh exact portable validation reports", async () => {
  const { createFileImportService } = await loadFactory();
  const { service } = createHarness(createFileImportService);
  const first = service.errorReport("broken");
  const second = service.errorReport("broken");
  assert.deepEqual(first, {
    ok: false,
    errors: ["broken"],
    warnings: [],
    preserved: [],
    simplified: [],
    skipped: [],
    risky: []
  });
  assert.notStrictEqual(first, second);
  for (const key of ["errors", "warnings", "preserved", "simplified", "skipped", "risky"]) {
    assert.notStrictEqual(first[key], second[key]);
  }
});

test("FileImportService preserves optional-file and strict size boundaries with rounded MB copy", async () => {
  const { createFileImportService } = await loadFactory();
  const { service } = createHarness(createFileImportService);
  assert.equal(service.assertSize(null, "Resource", 1024), undefined);
  assert.equal(service.assertSize({ size: 1024 }, "Resource", 1024), undefined);
  const roundedTwoMb = 1.6 * 1024 * 1024;
  assert.throws(
    () => service.assertSize({ size: roundedTwoMb + 1 }, "Resource", roundedTwoMb),
    /Resource is too large\. Choose a file under 2 MB\./
  );
});

test("FileImportService parses encoded JSON and rejects oversize before decoding", async () => {
  const { createFileImportService } = await loadFactory();
  const file = { size: 25 };
  const harness = createHarness(createFileImportService, { decodedText: '{"answer":42}' });
  assert.deepEqual(await harness.service.parseJson(file, "Project package"), { answer: 42 });
  assert.deepEqual(harness.calls, [["decodingOptions"], ["decode", file, { encoding: "windows-1254" }]]);

  const oversize = createHarness(createFileImportService);
  await assert.rejects(
    oversize.service.parseJson({ size: 101 }, "Backup file"),
    /Backup file is too large\. Choose a LoopCAT JSON file under 50 MB\./
  );
  assert.deepEqual(oversize.calls, []);
});

test("FileImportService preserves fallback JSON reads and masks read, decode, and parse failures", async () => {
  const { createFileImportService } = await loadFactory();
  const fileCalls = [];
  const fallback = createHarness(createFileImportService, { withoutEncodingApi: true });
  const file = {
    size: 10,
    text() {
      fileCalls.push("text");
      return Promise.resolve('{"fallback":true}');
    }
  };
  assert.deepEqual(await fallback.service.parseJson(file, "Backup file"), { fallback: true });
  assert.deepEqual(fileCalls, ["text"]);
  assert.deepEqual(fallback.calls, []);

  for (const failing of [
    createHarness(createFileImportService, { decodedText: "not json" }),
    createHarness(createFileImportService, { decodeError: new Error("secret decoder failure") }),
    createHarness(createFileImportService, { withoutEncodingApi: true })
  ]) {
    const failingFile = failing.options.encoding.api
      ? { size: 1 }
      : { size: 1, text: () => Promise.reject(new Error("secret read failure")) };
    await assert.rejects(failing.service.parseJson(failingFile, "Project package"), {
      message: "Project package is not valid JSON."
    });
  }
});

test("FileImportService preserves default decoding-option timing and text branches", async () => {
  const { createFileImportService } = await loadFactory();
  const file = { text: () => Promise.resolve("plain") };
  const encoded = createHarness(createFileImportService, { decodedText: "encoded" });
  assert.equal(await encoded.service.readText(file), "encoded");
  assert.deepEqual(encoded.calls, [["decodingOptions"], ["decode", file, { encoding: "windows-1254" }]]);

  encoded.calls.length = 0;
  const explicit = { encoding: "utf-16le" };
  assert.equal(await encoded.service.readText(file, explicit), "encoded");
  assert.deepEqual(encoded.calls, [["decode", file, explicit]]);

  const fallback = createHarness(createFileImportService, { withoutEncodingApi: true });
  assert.equal(await fallback.service.readText(file), "plain");
  assert.deepEqual(fallback.calls, [["decodingOptions"]]);
});

test("FileImportService preserves progress numeric edges and failure-message fallback", async () => {
  const { createFileImportService } = await loadFactory();
  const { service } = createHarness(createFileImportService);
  assert.equal(service.progressDetail(1, 4, "records"), "25% - 1/4 records");
  assert.equal(service.progressDetail(9, 4, "records"), "100% - 9/4 records");
  assert.equal(service.progressDetail(-2, -5, "records"), "100% - 0 records");
  assert.equal(service.progressDetail("2.9", "3.1", "items"), "93% - 2.9/3.1 items");
  assert.equal(service.progressDetail(undefined, undefined, "items"), "100% - 0 items");
  assert.equal(service.progressDetail("invalid", 2, "items"), "NaN% - NaN/2 items");
  assert.equal(service.failureMessage(new Error("broken"), "TMX import"), "TMX import failed: broken");
  assert.equal(
    service.failureMessage(null, "TMX import"),
    "TMX import failed: The selected file could not be imported."
  );
});

test("FileImportService blocks overlap with two state reads and no lifecycle mutation", async () => {
  const { createFileImportService } = await loadFactory();
  const harness = createHarness(createFileImportService, { activeTask: "Project file import" });
  let actionCalled = false;
  assert.equal(
    await harness.service.runTask("TMX Import", () => {
      actionCalled = true;
    }),
    false
  );
  assert.equal(actionCalled, false);
  assert.deepEqual(harness.calls, [
    ["getTask"],
    ["getTask"],
    ["lower", "TMX Import"],
    ["status", "Project file import is still running. Wait for it to finish before starting tmx import.", "dirty"]
  ]);
  assert.equal(harness.readTask(), "Project file import");
});

test("FileImportService preserves fulfilled result normalization and exact lifecycle order", async () => {
  const { createFileImportService } = await loadFactory();
  for (const [result, expected] of [
    [undefined, true],
    [true, true],
    [0, true],
    ["", true],
    [false, false],
    [null, false]
  ]) {
    const harness = createHarness(createFileImportService);
    assert.equal(await harness.service.runTask("Project file import", () => Promise.resolve(result)), expected);
    assert.deepEqual(
      harness.calls.map(([name]) => name),
      ["getTask", "setTask", "renderBusy", "status", "setTask", "renderBusy", "refreshDurability"]
    );
    assert.deepEqual(harness.calls[1], ["setTask", "Project file import"]);
    assert.deepEqual(harness.calls[3], ["status", "Project file import started...", undefined]);
    assert.deepEqual(harness.calls.at(-1), ["refreshDurability", { request: false }]);
    assert.equal(harness.readTask(), "");
  }
});

test("FileImportService contains action failures and preserves cleanup override behavior", async () => {
  const { createFileImportService } = await loadFactory();
  const actionError = new Error("broken package");
  const harness = createHarness(createFileImportService);
  assert.equal(await harness.service.runTask("Project package import", () => Promise.reject(actionError)), false);
  const message = "Project package import failed: broken package";
  assert.deepEqual(
    harness.calls.find(([name]) => name === "renderValidation"),
    [
      "renderValidation",
      {
        ok: false,
        errors: [message],
        warnings: [],
        preserved: [],
        simplified: [],
        skipped: [],
        risky: []
      }
    ]
  );
  assert.deepEqual(
    harness.calls.find(([name, value]) => name === "status" && value === message),
    ["status", message, "dirty"]
  );
  assert.equal(harness.readTask(), "");

  const durabilityError = new Error("durability unavailable");
  const cleanupFailure = createHarness(createFileImportService, { durabilityError });
  await assert.rejects(
    cleanupFailure.service.runTask("Backup restore", () => Promise.resolve(true)),
    durabilityError
  );
  assert.equal(cleanupFailure.readTask(), "");
});

test("FileImportService validates boundaries and exposes an immutable API", async () => {
  const { createFileImportService } = await loadFactory();
  assert.throws(() => createFileImportService(), /requires encoding, limit, task/);
  const harness = createHarness(createFileImportService);
  assert.throws(
    () => createFileImportService({ ...harness.options, presentation: null }),
    /requires encoding, limit, task/
  );
  assert.throws(
    () =>
      createFileImportService({
        ...harness.options,
        encoding: { ...harness.options.encoding, api: {} }
      }),
    /requires encoding, limit, task/
  );
  assert.deepEqual(Object.keys(harness.service), [
    "assertSize",
    "errorReport",
    "failureMessage",
    "parseJson",
    "progressDetail",
    "readText",
    "runTask"
  ]);
  assert.equal(Object.isFrozen(harness.service), true);
  assert.throws(() => {
    "use strict";
    harness.service.runTask = null;
  }, TypeError);
});
