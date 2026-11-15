const assert = require("node:assert/strict");
const { test } = require("node:test");
const { requestedPlatforms } = require("../../scripts/desktop-build-platforms.cjs");
const packageJson = require("../../package.json");

test("the real universal preview command selects only macOS despite signing config overrides", () => {
  const args = packageJson.scripts["dist:mac:preview"].split(/\s+/).slice(2);
  assert.deepEqual([...requestedPlatforms(args)], ["darwin"]);
});

test("config overrides and other options cannot accidentally request another build platform", () => {
  assert.deepEqual(
    [
      ...requestedPlatforms([
        "-c.mac.identity=-",
        "-c.mac.entitlements=config/entitlements.mac-preview.plist",
        "-p",
        "never",
        "--universal"
      ])
    ],
    []
  );
});

test("long platform options and aliases remain recognized", () => {
  for (const [option, expected] of [
    ["--mac", "darwin"],
    ["--macos", "darwin"],
    ["--linux", "linux"],
    ["--win", "win32"],
    ["--windows", "win32"]
  ])
    assert.deepEqual([...requestedPlatforms([option])], [expected]);
});

test("single and grouped short platform options remain recognized for the host guard", () => {
  assert.deepEqual([...requestedPlatforms(["-m"])], ["darwin"]);
  assert.deepEqual([...requestedPlatforms(["-l"])], ["linux"]);
  assert.deepEqual([...requestedPlatforms(["-w"])], ["win32"]);
  assert.deepEqual([...requestedPlatforms(["-mlw"])], ["darwin", "linux", "win32"]);
});
