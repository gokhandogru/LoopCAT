import { createApplicationRuntime } from "./bootstrap.js";
import { createCompatibilityModuleRegistry } from "./compatibility-module-registry.js";

window.CatHan = window.CatHan || {};
const compatibilityModules = createCompatibilityModuleRegistry(window.CatHan);
window.CatHan.appRuntime = createApplicationRuntime({
  browserWindow: window,
  desktopBridge: window.LoopCATDesktop,
  compatibilityModules
});
