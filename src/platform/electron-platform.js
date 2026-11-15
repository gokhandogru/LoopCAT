import { formatResourceEditorRoute } from "../features/resources/resource-editor-route.js";

export function createElectronPlatform(desktopBridge) {
  if (!desktopBridge?.getRuntimeStatus) throw new TypeError("ElectronPlatform requires the LoopCAT desktop bridge.");
  return Object.freeze({
    kind: "electron",
    capabilities: Object.freeze({
      desktopRuntime: true,
      fileSystemAccess: true,
      serviceWorker: false,
      resourceEditor: typeof desktopBridge.openResourceEditor === "function"
    }),
    openResourceLibrary() {
      if (typeof desktopBridge.openResourceLibrary !== "function") {
        return Promise.reject(new Error("This desktop version cannot open the resource library. Update LoopCAT."));
      }
      return desktopBridge.openResourceLibrary();
    },
    /** @param {import("../features/resources/resource-editor-route.js").ResourceEditorRoute} route */
    openResourceEditor(route) {
      formatResourceEditorRoute(route);
      if (typeof desktopBridge.openResourceEditor !== "function") {
        return Promise.reject(new Error("This desktop version cannot open resource editors. Update LoopCAT."));
      }
      return desktopBridge.openResourceEditor({
        type: route.type,
        resourceId: route.resourceId,
        ...(route.entryId === undefined ? {} : { entryId: route.entryId })
      });
    },
    getRuntimeStatus() {
      return desktopBridge.getRuntimeStatus();
    },
    setHardwareAccelerationForNextLaunch(enabled) {
      return desktopBridge.setHardwareAccelerationForNextLaunch(Boolean(enabled));
    }
  });
}
