import { formatResourceEditorRoute } from "../features/resources/resource-editor-route.js";

export function createBrowserPlatform(browserWindow = window) {
  const resourceWindows = new Map();
  return Object.freeze({
    kind: "browser",
    capabilities: Object.freeze({
      desktopRuntime: false,
      fileSystemAccess: typeof browserWindow["showDirectoryPicker"] === "function",
      serviceWorker: "serviceWorker" in browserWindow.navigator,
      resourceEditor: true
    }),
    openResourceLibrary() {
      try {
        const opener = browserWindow.opener;
        const origin = new URL(browserWindow.location.href).origin;
        if (origin !== "null" && opener && !opener.closed && opener.location.origin === origin) {
          opener.postMessage({ type: "loopcat-resource-library-open" }, origin);
          opener.focus();
          return Promise.resolve({ opened: true, mode: "opener" });
        }
      } catch {
        // A closed or unrelated opener cannot receive workspace navigation.
      }
      browserWindow.location.hash = "resources";
      return Promise.resolve({ opened: true, mode: "same-tab" });
    },
    /** @param {import("../features/resources/resource-editor-route.js").ResourceEditorRoute} route */
    openResourceEditor(route) {
      const hash = formatResourceEditorRoute(route);
      const key = `${route.type}:${route.resourceId}`;
      const current = resourceWindows.get(key);
      try {
        if (current && !current.closed) {
          try {
            current.focus();
            if (route.entryId !== undefined) {
              current.postMessage(
                {
                  type: "loopcat-resource-select",
                  resourceType: route.type,
                  resourceId: route.resourceId,
                  entryId: route.entryId
                },
                new URL(browserWindow.location.href).origin
              );
            }
          } catch {
            // A refused focus/message must never reload an editor with a draft.
          }
          return Promise.resolve({ opened: true, mode: "tab" });
        }
      } catch {
        resourceWindows.delete(key);
      }
      // Local-file origins cannot reliably share browser storage across windows.
      // Open synchronously inside the click handler so popup blockers can allow it.
      if (["https:", "http:"].includes(browserWindow.location.protocol)) {
        try {
          const url = new URL(browserWindow.location.href);
          url.hash = hash;
          const opened = browserWindow.open(url.href, `loopcat-resource-${encodeURIComponent(key)}`);
          if (opened) {
            resourceWindows.set(key, opened);
            try {
              opened.focus();
            } catch {
              // The browser may refuse focus even after opening the requested tab.
            }
            return Promise.resolve({ opened: true, mode: "tab" });
          }
        } catch {
          // The same editor route is usable when another browsing context is refused.
        }
      }
      browserWindow.location.hash = hash;
      return Promise.resolve({ opened: true, mode: "same-tab" });
    },
    getRuntimeStatus() {
      return Promise.resolve(Object.freeze({ platform: "web", sandboxed: true, hardwareAccelerationEnabled: null }));
    },
    setHardwareAccelerationForNextLaunch() {
      return Promise.resolve(Object.freeze({ supported: false, restartRequired: false }));
    }
  });
}
