const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("LoopCATDesktop", Object.freeze({
  consumeRecoveryRequest: () => ipcRenderer.invoke("loopcat:consume-recovery-request"),
  beginExport: (request) => ipcRenderer.invoke("loopcat:begin-export", request),
  writeExportChunk: (request) => ipcRenderer.invoke("loopcat:write-export-chunk", request),
  finishExport: (request) => ipcRenderer.invoke("loopcat:finish-export", request),
  abortExport: (request) => ipcRenderer.invoke("loopcat:abort-export", request),
  saveCredential: (request) => ipcRenderer.invoke("loopcat:save-credential", request),
  performProviderOperation: (request) => ipcRenderer.invoke("loopcat:provider-operation", request),
  onPrepareClose: (listener) => {
    const handler = (_event, request) => {
      Promise.resolve().then(() => listener({ mode: request.mode })).then(
        (result) => ipcRenderer.send("loopcat:close-ready", { id: request.id, ok: true, ...result }),
        () => ipcRenderer.send("loopcat:close-ready", { id: request.id, ok: false })
      );
    };
    ipcRenderer.on("loopcat:prepare-close", handler);
    return () => ipcRenderer.removeListener("loopcat:prepare-close", handler);
  },
  startLmStudioServer: () => ipcRenderer.invoke("loopcat:start-lm-studio-server"),
  getCreatorIdentity: () => ipcRenderer.invoke("loopcat:get-creator-identity"),
  setSpellCheckerLanguages: (languages) => ipcRenderer.invoke("loopcat:set-spellchecker-languages", Array.isArray(languages) ? languages : []),
  getSpellCheckerInfo: () => ipcRenderer.invoke("loopcat:get-spellchecker-info"),
  getRuntimeStatus: () => ipcRenderer.invoke("loopcat:get-runtime-status"),
  setHardwareAccelerationForNextLaunch: (enabled) => ipcRenderer.invoke("loopcat:set-hardware-acceleration", enabled === true)
}));
