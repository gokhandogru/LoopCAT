import { installResourceEditorComposition } from "./resource-editor-composition.js";
import { parseResourceEditorRoute } from "./resource-editor-route.js";

/** Select the focused composition before installing project editor lifecycles. */
export function installResourceRouteHost({ appRuntime, compatibilityModules, window }) {
  const resourceRoute = parseResourceEditorRoute(window.location.hash);
  if (resourceRoute) {
    installResourceEditorComposition({ appRuntime, compatibilityModules, window, route: resourceRoute }).catch(
      (error) => {
        const message = window.document.createElement("p");
        message.setAttribute("role", "alert");
        message.textContent =
          compatibilityModules.i18n.source("Resource editor could not start.") + ` ${error.message}`;
        window.document.body.append(message);
      }
    );
  }
  window.addEventListener("hashchange", () => {
    const next = parseResourceEditorRoute(window.location.hash);
    if (resourceRoute || next) window.location.reload();
  });
  return Boolean(resourceRoute);
}
