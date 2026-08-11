const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  RUNTIME_SETTINGS_FILENAME,
  defaultRuntimeSettings,
  loadRuntimeSettings,
  normalizeRuntimeSettings,
  saveRuntimeSettings
} = require("../../desktop/runtime-settings.cjs");

function isolatedApp(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "loopcat-runtime-settings-"));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  return { directory, app: { getPath: () => directory } };
}

test("runtime settings enable hardware acceleration by default", (t) => {
  const { app } = isolatedApp(t);
  const settings = loadRuntimeSettings(app, {});
  assert.equal(settings.hardwareAccelerationEnabled, true);
  assert.equal(settings.source, "default");
});

test("runtime settings ignore unknown schema versions safely", () => {
  assert.deepEqual(
    normalizeRuntimeSettings({ version: 99, hardwareAccelerationEnabled: false }),
    defaultRuntimeSettings()
  );
});

test("explicit environment fallback disables hardware acceleration", (t) => {
  const { app } = isolatedApp(t);
  const settings = loadRuntimeSettings(app, { LOOPCAT_DISABLE_HARDWARE_ACCELERATION: "1" });
  assert.equal(settings.hardwareAccelerationEnabled, false);
  assert.equal(settings.source, "environment-fallback");
});

test("next-launch preference is written locally and read back", (t) => {
  const { app, directory } = isolatedApp(t);
  const saved = saveRuntimeSettings(app, { hardwareAccelerationEnabled: false });
  assert.equal(saved.hardwareAccelerationEnabled, false);
  assert.equal(fs.existsSync(path.join(directory, RUNTIME_SETTINGS_FILENAME)), true);
  assert.equal(loadRuntimeSettings(app, {}).hardwareAccelerationEnabled, false);
});
