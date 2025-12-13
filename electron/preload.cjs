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
  saveRecordingAsset: (payload) => ipcRenderer.invoke("recording:save-asset", payload),
  cleanupRecordingAssets: (paths) => ipcRenderer.invoke("recording:cleanup-assets", paths),
  readRecordingAsset: (path) => ipcRenderer.invoke("recording:read-asset", path),
  getRecordingAssetUrl: (path) => ipcRenderer.invoke("recording:get-asset-url", path),
  saveRenderedFile: (payload) => ipcRenderer.invoke("rendering:save-file", payload),
  startRenderStream: (fileName) => ipcRenderer.invoke("rendering:start", fileName),
  appendRenderChunk: (payload) => ipcRenderer.invoke("rendering:append", payload),
  patchRenderFile: (payload) => ipcRenderer.invoke("rendering:patch", payload),
  cancelRenderStream: (filePath) => ipcRenderer.invoke("rendering:cancel", filePath),
  closeRenderStream: (filePath) => ipcRenderer.invoke("rendering:close", filePath),
  
  // Native recording APIs (Rust xcap-based)
  isNativeRecordingAvailable: () => ipcRenderer.invoke("native-recording:available"),
  listNativeSources: () => ipcRenderer.invoke("native-recording:list-sources"),
  startNativeCapture: (options) => ipcRenderer.invoke("native-recording:start-capture", options),
  stopNativeCapture: () => ipcRenderer.invoke("native-recording:stop-capture"),
  pollNativeFrame: () => ipcRenderer.invoke("native-recording:poll-frame"),
  startNativeRecording: (options) => ipcRenderer.invoke("native-recording:start", options),
  stopNativeRecording: () => ipcRenderer.invoke("native-recording:stop"),
  // Native mouse position APIs (synced with screen capture in Rust)
  getRecordingMouseEvents: () => ipcRenderer.invoke("native-recording:get-mouse-events"),
  clearRecordingMouseEvents: () => ipcRenderer.invoke("native-recording:clear-mouse-events"),
  getCurrentMousePosition: () => ipcRenderer.invoke("native-recording:get-current-mouse"),

  // Native transcription APIs
  listTranscriptionProviders: () => ipcRenderer.invoke("native-transcription:list-providers"),
  submitTranscription: (request) => ipcRenderer.invoke("native-transcription:submit", request),
  getTranscriptionJob: (jobId) => ipcRenderer.invoke("native-transcription:get-job", jobId),
  getTranscriptionResult: (jobId) => ipcRenderer.invoke("native-transcription:get-result", jobId),
  cancelTranscription: (jobId) => ipcRenderer.invoke("native-transcription:cancel", jobId),
});
