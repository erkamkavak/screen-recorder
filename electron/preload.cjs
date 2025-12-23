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

  // Transcription model management APIs
  listTranscriptionModels: () => ipcRenderer.invoke("native-transcription:list-models"),
  getTranscriptionModelInfo: (modelId) => ipcRenderer.invoke("native-transcription:get-model-info", modelId),
  getTranscriptionModelPath: (modelId) => ipcRenderer.invoke("native-transcription:get-model-path", modelId),
  downloadTranscriptionModel: (modelId) => ipcRenderer.invoke("native-transcription:download-model", modelId),
  cancelTranscriptionModelDownload: (modelId) => ipcRenderer.invoke("native-transcription:cancel-model-download", modelId),
  deleteTranscriptionModel: (modelId) => ipcRenderer.invoke("native-transcription:delete-model", modelId),
  refreshTranscriptionModelStatus: () => ipcRenderer.invoke("native-transcription:refresh-model-status"),

  // Notes overlay APIs
  showNotesOverlay: () => ipcRenderer.send("notes:show-overlay"),
  hideNotesOverlay: () => ipcRenderer.send("notes:hide-overlay"),
  updateNotesOverlay: (data) => ipcRenderer.send("notes:update", data),
  destroyNotesOverlay: () => ipcRenderer.send("notes:destroy-overlay"),
  startNotesShortcuts: () => ipcRenderer.send("notes:start-shortcuts"),
  stopNotesShortcuts: () => ipcRenderer.send("notes:stop-shortcuts"),

  // Project save/load APIs
  saveProject: (payload) => ipcRenderer.invoke("project:save", payload),
  listProjects: () => ipcRenderer.invoke("project:list"),
  loadProject: (projectId) => ipcRenderer.invoke("project:load", projectId),
  deleteProject: (projectId) => ipcRenderer.invoke("project:delete", projectId),
  getProjectsDir: () => ipcRenderer.invoke("project:get-projects-dir"),
  changeProjectsDir: () => ipcRenderer.invoke("project:change-dir"),

  // Recorder overlay APIs
  showRecorderOverlay: () => ipcRenderer.send("recorder:show-overlay"),
  hideRecorderOverlay: () => ipcRenderer.send("recorder:hide-overlay"),
  syncRecorderState: (state) => ipcRenderer.send("recorder:sync-state", state),
  openExternal: (url) => ipcRenderer.send("shell:open-external", url),
  getMachineName: () => ipcRenderer.invoke("os:get-hostname"),
});
