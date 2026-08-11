export function createElectronPlatform(desktopBridge) {
  if (!desktopBridge?.getRuntimeStatus) throw new TypeError("ElectronPlatform requires the LoopCAT desktop bridge.");
  return Object.freeze({
    kind: "electron",
    capabilities: Object.freeze({
      desktopRuntime: true,
      fileSystemAccess: true,
      serviceWorker: false
    }),
    getRuntimeStatus() {
      return desktopBridge.getRuntimeStatus();
    },
    setHardwareAccelerationForNextLaunch(enabled) {
      return desktopBridge.setHardwareAccelerationForNextLaunch(Boolean(enabled));
    }
  });
}
