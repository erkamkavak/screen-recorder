const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronNotesAPI", {
  onNoteUpdate: (callback) => {
    ipcRenderer.on("notes:update", (_event, data) => callback(data));
  },
});
