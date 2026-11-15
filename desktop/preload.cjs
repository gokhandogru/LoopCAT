const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld(
  "LoopCATDesktop",
  Object.freeze({
    setUiLocale: (locale) => ipcRenderer.invoke("loopcat:set-ui-locale", locale),
    openResourceEditor: (request) => ipcRenderer.invoke("loopcat:open-resource-editor", request),
    openResourceLibrary: () => ipcRenderer.invoke("loopcat:open-resource-library"),
    onResourceLibraryOpen: (listener) => {
      const handler = () => listener();
      ipcRenderer.on("loopcat:resource-library-open", handler);
      return () => ipcRenderer.removeListener("loopcat:resource-library-open", handler);
    },
    onResourceEditorSelect: (listener) => {
      const handler = (_event, request) =>
        listener({
          resourceType: request.resourceType,
          resourceId: request.resourceId,
          entryId: request.entryId
        });
      ipcRenderer.on("loopcat:resource-editor-select", handler);
      return () => ipcRenderer.removeListener("loopcat:resource-editor-select", handler);
    },
    consumeRecoveryRequest: () => ipcRenderer.invoke("loopcat:consume-recovery-request"),
    beginExport: (request) => ipcRenderer.invoke("loopcat:begin-export", request),
    writeExportChunk: (request) => ipcRenderer.invoke("loopcat:write-export-chunk", request),
    finishExport: (request) => ipcRenderer.invoke("loopcat:finish-export", request),
    abortExport: (request) => ipcRenderer.invoke("loopcat:abort-export", request),
    saveCredential: (request) => ipcRenderer.invoke("loopcat:save-credential", request),
    performProviderOperation: (request) => ipcRenderer.invoke("loopcat:provider-operation", request),
    onPrepareClose: (listener) => {
      const handler = (_event, request) => {
        Promise.resolve()
          .then(() => listener({ mode: request.mode }))
          .then(
            (result) => ipcRenderer.send("loopcat:close-ready", { id: request.id, ok: true, ...result }),
            () => ipcRenderer.send("loopcat:close-ready", { id: request.id, ok: false })
          );
      };
      ipcRenderer.on("loopcat:prepare-close", handler);
      return () => ipcRenderer.removeListener("loopcat:prepare-close", handler);
    },
    startLmStudioServer: () => ipcRenderer.invoke("loopcat:start-lm-studio-server"),
    getCreatorIdentity: () => ipcRenderer.invoke("loopcat:get-creator-identity"),
    setSpellCheckerLanguages: (languages) =>
      ipcRenderer.invoke("loopcat:set-spellchecker-languages", Array.isArray(languages) ? languages : []),
    getSpellCheckerInfo: () => ipcRenderer.invoke("loopcat:get-spellchecker-info"),
    getRuntimeStatus: () => ipcRenderer.invoke("loopcat:get-runtime-status"),
    setHardwareAccelerationForNextLaunch: (enabled) =>
      ipcRenderer.invoke("loopcat:set-hardware-acceleration", enabled === true)
  })
);
