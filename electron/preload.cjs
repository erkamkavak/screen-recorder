const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  on: (channel, listener) => {
    const subscription = (_event, ...args) => listener(...args);
    ipcRenderer.on(channel, subscription);
    return () => {
      ipcRenderer.removeListener(channel, subscription);
    };
  },
  once: (channel, listener) => {
    ipcRenderer.once(channel, (_event, ...args) => listener(...args));
  },
  send: (channel, ...args) => {
    ipcRenderer.send(channel, ...args);
  },
  listDesktopSources: async (options) => {
    try {
      return await ipcRenderer.invoke("desktop-capture:list-sources", options);
    } catch (error) {
      console.error("Failed to list desktop capture sources", error);
      return [];
    }
  },
  getDesktopSourceId: async (options) => {
    try {
      return await ipcRenderer.invoke("desktop-capture:get-default-source", options);
    } catch (error) {
      console.error("Failed to retrieve desktop capture sources", error);
      return null;
    }
  },
  startGlobalInputCapture: async () => {
    return ipcRenderer.send("input-capture:start");
  },
  stopGlobalInputCapture: async () => {
    return ipcRenderer.send("input-capture:stop");
  },
  onGlobalInputEvent: (listener) => {
    const channel = "input-capture:event";
    const subscription = (_event, event) => listener(event);
    ipcRenderer.on(channel, subscription);
    return () => ipcRenderer.removeListener(channel, subscription);
  },
});
