const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const test = require("node:test");

const root = path.resolve(__dirname, "../..");

function loadFactory() {
  return import(pathToFileURL(path.join(root, "src/features/projects/project-name-service.js")).href);
}

function createHarness(createProjectNameService, overrides = {}) {
  const calls = [];
  const values = new Map(Object.entries(overrides.values || {}));
  const storageKey = overrides.storageKey || "loopcat.creatorName";
  const options = {
    redaction: {
      sanitize(value) {
        calls.push(["sanitize", value]);
        if (overrides.redactionError) throw overrides.redactionError;
        return String(value).replace(/sk-[A-Za-z0-9_-]+/g, "[redacted secret]");
      }
    },
    storage: {
      getItem(key) {
        calls.push(["getItem", key]);
        if (overrides.getError) throw overrides.getError;
        return values.has(key) ? values.get(key) : null;
      },
      setItem(key, value) {
        calls.push(["setItem", key, value]);
        if (overrides.setError) throw overrides.setError;
        values.set(key, value);
      },
      removeItem(key) {
        calls.push(["removeItem", key]);
        if (overrides.removeError) throw overrides.removeError;
        values.delete(key);
      }
    },
    identity: {
      available() {
        calls.push(["identityAvailable"]);
        if (overrides.availabilityError) throw overrides.availabilityError;
        return overrides.identityAvailable !== false;
      },
      read() {
        calls.push(["identityRead"]);
        if (overrides.identityError) throw overrides.identityError;
        return overrides.identity === undefined
          ? { displayName: "Desktop Translator", hostName: "workstation" }
          : overrides.identity;
      }
    },
    storageKey,
    logger: {
      warn(...args) {
        calls.push(["warn", ...args]);
        if (overrides.warningError) throw overrides.warningError;
      }
    }
  };
  return {
    calls,
    options,
    service: createProjectNameService(options),
    storageKey,
    values
  };
}

test("ProjectNameService preserves stable trimmed deduplication and non-array fallback", async () => {
  const { createProjectNameService } = await loadFactory();
  const { service } = createHarness(createProjectNameService);
  assert.deepEqual(service.unique(null), []);
  assert.deepEqual(service.unique({ 0: "name" }), []);
  assert.deepEqual(service.unique([" Alpha ", "Alpha", "", "   ", null, undefined, false, 0, "0", 12, "12", {}]), [
    "Alpha",
    "0",
    "12",
    "[object Object]"
  ]);
});

test("ProjectNameService preserves string-number cleanup and exact fallback identity", async () => {
  const { createProjectNameService } = await loadFactory();
  const { service } = createHarness(createProjectNameService);
  const fallback = { exact: true };
  assert.equal(service.clean("  Project  "), "Project");
  assert.equal(service.clean(0), "0");
  assert.equal(service.clean(Number.NaN), "NaN");
  assert.equal(service.clean(""), "");
  assert.equal(service.clean("   ", fallback), fallback);
  assert.equal(service.clean({}, fallback), fallback);
  assert.equal(service.clean(null, fallback), fallback);
});

test("ProjectNameService redacts creator names before cleanup and applies the exact 120-character cap", async () => {
  const { createProjectNameService } = await loadFactory();
  const harness = createHarness(createProjectNameService);
  assert.equal(harness.service.cleanCreator("  Ada sk-abcdefghijk  "), "Ada [redacted secret]");
  assert.equal(harness.service.cleanCreator("x".repeat(140)), "x".repeat(120));
  assert.equal(harness.service.cleanCreator("", "f".repeat(130)), "f".repeat(120));
  assert.equal(harness.service.cleanCreator(0, "fallback"), "fallback");
  assert.deepEqual(
    harness.calls.filter(([name]) => name === "sanitize").map(([, value]) => value),
    ["  Ada sk-abcdefghijk  ", "x".repeat(140), "", ""]
  );
});

test("ProjectNameService contains stored creator read and cleanup failures with the exact key", async () => {
  const { createProjectNameService } = await loadFactory();
  const success = createHarness(createProjectNameService, {
    storageKey: "creator.preference",
    values: { "creator.preference": "  Stored Translator  " }
  });
  assert.equal(success.service.storedCreator(), "Stored Translator");
  assert.deepEqual(success.calls.slice(0, 2), [
    ["getItem", "creator.preference"],
    ["sanitize", "  Stored Translator  "]
  ]);

  const readFailure = createHarness(createProjectNameService, { getError: new Error("storage unavailable") });
  assert.equal(readFailure.service.storedCreator(), "");
  assert.equal(
    readFailure.calls.some(([name]) => name === "warn"),
    false
  );

  const cleanupFailure = createHarness(createProjectNameService, { redactionError: new Error("redaction failed") });
  assert.equal(cleanupFailure.service.storedCreator(), "");
  assert.equal(
    cleanupFailure.calls.some(([name]) => name === "warn"),
    false
  );
});

test("ProjectNameService remembers or clears the cleaned creator while containing storage failures", async () => {
  const { createProjectNameService } = await loadFactory();
  const success = createHarness(createProjectNameService);
  assert.equal(success.service.rememberCreator("  Project Creator  "), "Project Creator");
  assert.equal(success.values.get(success.storageKey), "Project Creator");
  assert.equal(success.service.rememberCreator("   "), "");
  assert.equal(success.values.has(success.storageKey), false);
  assert.deepEqual(
    success.calls.filter(([name]) => ["setItem", "removeItem"].includes(name)),
    [
      ["setItem", success.storageKey, "Project Creator"],
      ["removeItem", success.storageKey]
    ]
  );

  const writeFailure = createHarness(createProjectNameService, { setError: new Error("write failed") });
  assert.equal(writeFailure.service.rememberCreator("Durable project field"), "Durable project field");
  assert.equal(
    writeFailure.calls.some(([name]) => name === "warn"),
    false
  );

  const removeFailure = createHarness(createProjectNameService, { removeError: new Error("remove failed") });
  assert.equal(removeFailure.service.rememberCreator(""), "");
  assert.equal(
    removeFailure.calls.some(([name]) => name === "warn"),
    false
  );

  const cleanupError = new Error("cleaning failed");
  const cleanupFailure = createHarness(createProjectNameService, { redactionError: cleanupError });
  assert.throws(() => cleanupFailure.service.rememberCreator("Creator"), cleanupError);
  assert.equal(
    cleanupFailure.calls.some(([name]) => ["setItem", "removeItem"].includes(name)),
    false
  );
});

test("ProjectNameService gives the stored creator precedence over desktop identity", async () => {
  const { createProjectNameService } = await loadFactory();
  const harness = createHarness(createProjectNameService, {
    values: { "loopcat.creatorName": "Stored Creator" },
    availabilityError: new Error("identity should not be checked")
  });
  assert.equal(await harness.service.suggestedCreator(), "Stored Creator");
  assert.equal(
    harness.calls.some(([name]) => name === "identityAvailable"),
    false
  );
  assert.equal(
    harness.calls.some(([name]) => name === "identityRead"),
    false
  );
});

test("ProjectNameService preserves display-name, host-name, unavailable, blank, and failed identity fallbacks", async () => {
  const { createProjectNameService } = await loadFactory();
  for (const [overrides, expected] of [
    [{ identity: { displayName: "  Display Name  ", hostName: "host" } }, "Display Name"],
    [{ identity: { displayName: "", hostName: "  host-name  " } }, "host-name"],
    [{ identity: { displayName: "   ", hostName: "host-name" } }, "This computer"],
    [{ identity: null }, "This computer"],
    [{ identityAvailable: false }, "This computer"]
  ]) {
    const harness = createHarness(createProjectNameService, overrides);
    assert.equal(await harness.service.suggestedCreator(), expected);
  }

  const identityError = new Error("identity failed");
  const failure = createHarness(createProjectNameService, { identityError });
  assert.equal(await failure.service.suggestedCreator(), "This computer");
  assert.deepEqual(
    failure.calls.find(([name]) => name === "warn"),
    ["warn", "Desktop creator identity lookup failed.", identityError]
  );

  const warningError = new Error("warning failed");
  const warningFailure = createHarness(createProjectNameService, { identityError, warningError });
  await assert.rejects(warningFailure.service.suggestedCreator(), warningError);
});

test("ProjectNameService validates every boundary and exposes an immutable API", async () => {
  const { createProjectNameService } = await loadFactory();
  const valid = createHarness(createProjectNameService);
  assert.equal(Object.isFrozen(valid.service), true);
  assert.deepEqual(Object.keys(valid.service), [
    "unique",
    "clean",
    "cleanCreator",
    "storedCreator",
    "rememberCreator",
    "suggestedCreator"
  ]);

  for (const [options, error] of [
    [{ ...valid.options, redaction: { sanitize: null } }, /sensitive-text redaction boundary/],
    [{ ...valid.options, storage: { ...valid.options.storage, getItem: null } }, /browser storage boundaries/],
    [{ ...valid.options, storage: { ...valid.options.storage, removeItem: null } }, /browser storage boundaries/],
    [{ ...valid.options, identity: { ...valid.options.identity, available: null } }, /desktop identity boundaries/],
    [{ ...valid.options, storageKey: "" }, /storage key and logger boundary/],
    [{ ...valid.options, logger: { warn: null } }, /storage key and logger boundary/]
  ]) {
    assert.throws(() => createProjectNameService(options), error);
  }
});
