const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("LoopCATDesktop", Object.freeze({
  startLmStudioServer: () => ipcRenderer.invoke("loopcat:start-lm-studio-server"),
  getCreatorIdentity: () => ipcRenderer.invoke("loopcat:get-creator-identity"),
  setSpellCheckerLanguages: (languages) => ipcRenderer.invoke("loopcat:set-spellchecker-languages", Array.isArray(languages) ? languages : []),
  getSpellCheckerInfo: () => ipcRenderer.invoke("loopcat:get-spellchecker-info"),
  getRuntimeStatus: () => ipcRenderer.invoke("loopcat:get-runtime-status"),
  setHardwareAccelerationForNextLaunch: (enabled) => ipcRenderer.invoke("loopcat:set-hardware-acceleration", enabled === true)
}));
