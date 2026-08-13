"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const test = require("node:test");

const root = path.resolve(__dirname, "../..");
const moduleAt = (relativePath) => import(pathToFileURL(path.join(root, relativePath)).href);

test("compatibility module registry captures every legacy application API behind one immutable boundary", async () => {
  const { COMPATIBILITY_MODULE_NAMES, createCompatibilityModuleRegistry } = await moduleAt(
    "src/app/compatibility-module-registry.js"
  );
  const source = Object.fromEntries(COMPATIBILITY_MODULE_NAMES.map((name) => [name, { name }]));
  source.unrelated = { name: "unrelated" };

  const registry = createCompatibilityModuleRegistry(source);

  assert.equal(Object.isFrozen(registry), true);
  assert.deepEqual(Object.keys(registry), [...COMPATIBILITY_MODULE_NAMES]);
  assert.equal(registry.storage, source.storage);
  assert.equal("unrelated" in registry, false);
  assert.throws(() => {
    registry.storage = {};
  }, /read only|Cannot assign/);
});

test("compatibility module registry fails once with an actionable list when startup dependencies are incomplete", async () => {
  const { COMPATIBILITY_MODULE_NAMES, createCompatibilityModuleRegistry } = await moduleAt(
    "src/app/compatibility-module-registry.js"
  );
  const source = Object.fromEntries(COMPATIBILITY_MODULE_NAMES.map((name) => [name, { name }]));
  delete source.encoding;
  delete source.workspaceStorage;

  assert.throws(
    () => createCompatibilityModuleRegistry(source),
    /required modules are missing: encoding, workspaceStorage/
  );
  assert.throws(() => createCompatibilityModuleRegistry(null), /initialized application module namespace/);
});
