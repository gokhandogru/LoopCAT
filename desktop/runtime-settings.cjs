const fs = require("node:fs");
const path = require("node:path");

const RUNTIME_SETTINGS_VERSION = 1;
const RUNTIME_SETTINGS_FILENAME = "runtime-settings.json";

function defaultRuntimeSettings() {
  return {
    version: RUNTIME_SETTINGS_VERSION,
    hardwareAccelerationEnabled: true
  };
}

function runtimeSettingsPath(app) {
  const userData = typeof app?.getPath === "function" ? app.getPath("userData") : "";
  return userData ? path.join(userData, RUNTIME_SETTINGS_FILENAME) : "";
}

function normalizeRuntimeSettings(value) {
  const defaults = defaultRuntimeSettings();
  if (!value || typeof value !== "object" || value.version !== RUNTIME_SETTINGS_VERSION) return defaults;
  return {
    version: RUNTIME_SETTINGS_VERSION,
    hardwareAccelerationEnabled: value.hardwareAccelerationEnabled !== false
  };
}

function loadRuntimeSettings(app, env = process.env) {
  const filePath = runtimeSettingsPath(app);
  let settings = defaultRuntimeSettings();
  let source = "default";
  if (filePath) {
    try {
      settings = normalizeRuntimeSettings(JSON.parse(fs.readFileSync(filePath, "utf8")));
      source = "user-settings";
    } catch (error) {
      if (error?.code !== "ENOENT") source = "invalid-user-settings";
    }
  }
  if (env?.LOOPCAT_DISABLE_HARDWARE_ACCELERATION === "1") {
    settings.hardwareAccelerationEnabled = false;
    source = "environment-fallback";
  }
  return Object.freeze({ ...settings, source, filePath });
}

function saveRuntimeSettings(app, nextSettings) {
  const filePath = runtimeSettingsPath(app);
  if (!filePath) throw new Error("LoopCAT could not resolve its local runtime-settings folder.");
  const settings = normalizeRuntimeSettings({
    version: RUNTIME_SETTINGS_VERSION,
    ...nextSettings
  });
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.${process.pid}.tmp`;
  fs.writeFileSync(temporaryPath, `${JSON.stringify(settings, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  try {
    fs.renameSync(temporaryPath, filePath);
  } catch (error) {
    try {
      fs.rmSync(filePath, { force: true });
      fs.renameSync(temporaryPath, filePath);
    } catch {
      fs.rmSync(temporaryPath, { force: true });
      throw error;
    }
  }
  return Object.freeze({ ...settings, source: "user-settings", filePath });
}

module.exports = {
  RUNTIME_SETTINGS_VERSION,
  RUNTIME_SETTINGS_FILENAME,
  defaultRuntimeSettings,
  runtimeSettingsPath,
  normalizeRuntimeSettings,
  loadRuntimeSettings,
  saveRuntimeSettings
};
