import { installApplicationComposition } from "./src/app/application-composition.js";
import { installResourceRouteHost } from "./src/features/resources/resource-route-host.js";

const browserGlobals = globalThis;
const window = browserGlobals.window;
const appRuntime = window.CatHan.appRuntime;
const compatibilityModules = appRuntime.compatibilityModules;

if (!installResourceRouteHost({ appRuntime, compatibilityModules, window })) {
  installApplicationComposition({ appRuntime, browserGlobals, compatibilityModules, window });
}
