const REQUIRED_MODULES = Object.freeze([
  "ai",
  "analysis",
  "docx",
  "encoding",
  "focusController",
  "i18n",
  "localization",
  "project",
  "qa",
  "quality",
  "storage",
  "tbx",
  "termbase",
  "tm",
  "tmx",
  "validation",
  "workerClient",
  "workspaceStorage",
  "xliff"
]);

export function createCompatibilityModuleRegistry(source) {
  if (!source || typeof source !== "object") {
    throw new TypeError("LoopCAT compatibility modules require the initialized application module namespace.");
  }
  const missing = REQUIRED_MODULES.filter((name) => !source[name] || typeof source[name] !== "object");
  if (missing.length) {
    throw new Error(`LoopCAT could not start because required modules are missing: ${missing.join(", ")}.`);
  }
  return Object.freeze(Object.fromEntries(REQUIRED_MODULES.map((name) => [name, source[name]])));
}

export const COMPATIBILITY_MODULE_NAMES = REQUIRED_MODULES;
