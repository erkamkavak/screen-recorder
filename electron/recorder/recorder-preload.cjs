const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronRecorderAPI", {
  onUpdateState: (callback) => ipcRenderer.on("recorder:update-state", (_event, value) => callback(value)),
  toggleRecording: () => ipcRenderer.send("recorder:toggle-recording"),
  closeApp: () => ipcRenderer.send("recorder:close-app"),
  hideOverlay: () => ipcRenderer.send("recorder:hide-overlay"),
});
