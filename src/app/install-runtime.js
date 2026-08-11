import { createApplicationRuntime } from "./bootstrap.js";

window.CatHan = window.CatHan || {};
window.CatHan.appRuntime = createApplicationRuntime({
  browserWindow: window,
  desktopBridge: window.LoopCATDesktop,
  projectApi: window.CatHan.project,
  storageApi: window.CatHan.storage
});
