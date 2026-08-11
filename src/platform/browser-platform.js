export function createBrowserPlatform(browserWindow = window) {
  return Object.freeze({
    kind: "browser",
    capabilities: Object.freeze({
      desktopRuntime: false,
      fileSystemAccess: typeof browserWindow["showDirectoryPicker"] === "function",
      serviceWorker: "serviceWorker" in browserWindow.navigator
    }),
    getRuntimeStatus() {
      return Promise.resolve(Object.freeze({ platform: "web", sandboxed: true, hardwareAccelerationEnabled: null }));
    },
    setHardwareAccelerationForNextLaunch() {
      return Promise.resolve(Object.freeze({ supported: false, restartRequired: false }));
    }
  });
}
