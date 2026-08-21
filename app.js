import { installApplicationComposition } from "./src/app/application-composition.js";

const browserGlobals = globalThis;
const window = browserGlobals.window;
const appRuntime = window.CatHan.appRuntime;
const compatibilityModules = appRuntime.compatibilityModules;

installApplicationComposition({
  appRuntime,
  browserGlobals,
  compatibilityModules,
  window
});
