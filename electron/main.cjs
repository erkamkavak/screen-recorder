const {
  app,
  BrowserWindow,
  ipcMain,
  desktopCapturer,
  screen,
  Menu,
  protocol,
  dialog,
  shell,
} = require("electron");
const { autoUpdater } = require("electron-updater");
const fs = require("fs");
const os = require("os");
const path = require("path");
app.name = "ClipFlow";
const { Blob } = require("buffer");
const fixWebmDuration = require("fix-webm-duration");
const { uIOhook } = require("uiohook-napi");
const notesHandler = require("./notes/notes-overlay-handler.cjs");
const { getProjectsDir, setProjectsDir } = require("./config/projects.cjs");
const { registerProjectsIpcHandlers } = require("./projects-ipc.cjs");
const recorderHandler = require("./recorder/recorder-overlay-handler.cjs");


// Native Rust addon for screen recording (xcap-based)
let nativeAddon = null;
try {
  nativeAddon = require("../native");
} catch (error) {
  console.warn("Native addon not available, falling back to MediaRecorder:", error.message);
}

if (process.platform === "linux") {
  app.commandLine.appendSwitch("enable-features", "WebRTCPipeWireCapturer");
}

const VITE_DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL;
const isDev = Boolean(VITE_DEV_SERVER_URL);

/**
 * Create the main browser window for the renderer.
 */
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    backgroundColor: "#111827",
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
    icon: isDev 
      ? path.join(__dirname, "..", "resources", "icon.svg")
      : path.join(process.resourcesPath, "icon.svg"),
    title: "ClipFlow",
  });
  mainWindow.setTitle("ClipFlow");


  if (isDev && VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(VITE_DEV_SERVER_URL);
    mainWindow.webContents.once("did-frame-finish-load", () => {
      mainWindow.webContents.openDevTools({ mode: "detach" });
      mainWindow.show();
    });
  } else {
    mainWindow.loadFile(path.join(__dirname, "..", "dist", "index.html"));
    mainWindow.once("ready-to-show", () => mainWindow.show());
  }
}

/**
 * Set up the auto-updater to check for releases on GitHub.
 */
function setupAutoUpdater() {
  if (isDev) return;

  autoUpdater.on("update-available", (info) => {
    if (mainWindow) {
      mainWindow.webContents.send("update:available", info);
    }
  });

  autoUpdater.on("download-progress", (progress) => {
    if (mainWindow) {
      mainWindow.webContents.send("update:progress", progress);
    }
  });

  autoUpdater.on("update-downloaded", (info) => {
    if (mainWindow) {
      mainWindow.webContents.send("update:downloaded", info);
    }
  });

  autoUpdater.on("error", (err) => {
    console.error("Auto-updater error:", err);
  });

  autoUpdater.checkForUpdatesAndNotify();
}

let isCapturingInput = false;
let mainWindow = null;
let inputListenersInitialized = false;
const renderFileDescriptors = new Map();

const normalizeCoordinates = (x, y) => {
  const display = screen.getDisplayNearestPoint({ x, y }) || screen.getPrimaryDisplay();
  const { x: originX, y: originY, width, height } = display.bounds;

  return {
    x: Math.max(0, Math.min(1, (x - originX) / width)),
    y: Math.max(0, Math.min(1, (y - originY) / height)),
  };
};

const emitInputEvent = (payload) => {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.send("input-capture:event", payload);
};

const initializeInputListeners = () => {
  if (inputListenersInitialized) return;
  inputListenersInitialized = true;

  uIOhook.on("mousedown", (event) => {
    const { x, y } = normalizeCoordinates(event.x, event.y);
    emitInputEvent({ kind: "pointerdown", x, y, button: event.button });
  });

  uIOhook.on("mouseup", (event) => {
    const { x, y } = normalizeCoordinates(event.x, event.y);
    emitInputEvent({ kind: "pointerup", x, y, button: event.button });
  });

  uIOhook.on("click", (event) => {
    const { x, y } = normalizeCoordinates(event.x, event.y);
    emitInputEvent({ kind: "click", x, y, button: event.button });
  });

  uIOhook.on("mousemove", (event) => {
    const { x, y } = normalizeCoordinates(event.x, event.y);
    emitInputEvent({ kind: "pointermove", x, y });
  });

  const mapKeyEvent = (event) => ({
    key: event.keychar ? String.fromCharCode(event.keychar) : undefined,
    code: event.keycode?.toString(),
    ctrl: Boolean(event.ctrlKey),
    alt: Boolean(event.altKey),
    shift: Boolean(event.shiftKey),
    meta: Boolean(event.metaKey),
  });

  uIOhook.on("keydown", (event) => {
    emitInputEvent({ kind: "keydown", ...mapKeyEvent(event) });
    
    // Handle notes shortcuts when recording
    notesHandler.handleNotesKeyEvent(event);
  });

  uIOhook.on("keyup", (event) => {
    emitInputEvent({ kind: "keyup", ...mapKeyEvent(event) });
  });
};

const startInputCapture = () => {
  if (isCapturingInput) return;
  initializeInputListeners();
  isCapturingInput = true;
  try {
    uIOhook.start();
  } catch (error) {
    console.error("Failed to start uIOhook", error);
  }
};

const stopInputCapture = () => {
  if (!isCapturingInput) return;
  isCapturingInput = false;
  try {
    uIOhook.stop();
  } catch (error) {
    console.error("Failed to stop uIOhook", error);
  }
};

app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
  
  ipcMain.handle("os:get-hostname", () => os.hostname());
  ipcMain.on("shell:open-external", (_event, url) => shell.openExternal(url));

  const ensureRecordingDir = () => {
    const storageDir = path.join(app.getPath("temp"), "clips-recordings");
    try {
      fs.mkdirSync(storageDir, { recursive: true });
    } catch {}
    return storageDir;
  };

  const recordingDir = ensureRecordingDir();
  protocol.registerFileProtocol("recording", (request, callback) => {
    try {
      const url = new URL(request.url);
      const requestedPath = path.normalize(decodeURIComponent(url.pathname));
      if (!requestedPath.startsWith(recordingDir)) {
        callback({ error: -6 });
        return;
      }
      callback({ path: requestedPath });
    } catch (error) {
      console.error("Failed to resolve recording protocol path", error);
      callback({ error: -2 });
    }
  });

  ipcMain.handle("recording:save-asset", async (_event, { fileName, buffer }) => {
    const dir = ensureRecordingDir();
    const safeName = `${Date.now()}-${fileName}`;
    const filePath = path.join(dir, safeName);
    try {
      await fs.promises.writeFile(filePath, Buffer.from(buffer));
      return filePath;
    } catch (error) {
      console.error("Failed to save recording asset", error);
      throw error;
    }
  });

  ipcMain.handle("rendering:start", async (_event, fileName = "rendered.mp4") => {
    const dir = ensureRecordingDir();
    const safeName = `${Date.now()}-${fileName}`;
    const filePath = path.join(dir, safeName);
    
    const fd = await fs.promises.open(filePath, 'w');
    renderFileDescriptors.set(filePath, fd);
    
    return filePath;
  });

  ipcMain.handle("rendering:append", async (_event, { filePath, buffer }) => {
    if (!filePath) return;
    
    const fd = renderFileDescriptors.get(filePath);
    if (fd) {
      try {
        await fd.write(Buffer.from(buffer));
      } catch (error) {
        console.error('Failed to write render chunk:', error);
        throw error;
      }
    } else {
      await fs.promises.appendFile(filePath, Buffer.from(buffer));
    }
  });

  const closeRenderDescriptor = async (filePath) => {
    const fd = renderFileDescriptors.get(filePath);
    if (fd) {
      try {
        await fd.close();
      } catch (error) {
        console.warn("Failed to close render descriptor", error);
      }
      renderFileDescriptors.delete(filePath);
    }
  };

  const patchWebmDuration = async (filePath, durationMs) => {
    
    const stats = await fs.promises.stat(filePath);
    const fileSize = stats.size;
    
    if (fileSize > 100 * 1024 * 1024) {
      console.warn(`Skipping duration patch for large file (${(fileSize / 1024 / 1024).toFixed(1)}MB)`);
      return;
    }
    
    try {
      const data = await fs.promises.readFile(filePath);
      const blob = new Blob([data], { type: "video/webm" });
      
      await new Promise((resolve, reject) => {
        fixWebmDuration(
          blob,
          durationMs,
          async (patchedBlob) => {
            try {
              const arrayBuffer = await patchedBlob.arrayBuffer();
              await fs.promises.writeFile(filePath, Buffer.from(arrayBuffer));
              resolve();
            } catch (writeError) {
              reject(writeError);
            }
          },
          { logger: false }
        );
      });
      
      if (global.gc) {
        global.gc();
      }
    } catch (error) {
      console.error('Failed to patch WebM duration:', error);
    }
  };

  ipcMain.handle(
    "rendering:patch",
    async (_event, { filePath, durationMs, skipPatch = false }) => {
      if (!filePath) return false;
      if (skipPatch) {
        return true;
      }
      try {
        await patchWebmDuration(filePath, durationMs);
        return true;
      } catch (error) {
        console.error("Duration patching failed:", error);
        return false;
      }
    }
  );

  ipcMain.handle("rendering:close", async (_event, filePath) => {
    if (!filePath) return false;
    await closeRenderDescriptor(filePath);
    return true;
  });

  ipcMain.handle("rendering:cancel", async (_event, filePath) => {
    if (!filePath) return false;
    
    const fd = renderFileDescriptors.get(filePath);
    if (fd) {
      try {
        await fd.close();
      } catch (error) {
        console.warn('Failed to close file descriptor during cancel:', error);
      }
      renderFileDescriptors.delete(filePath);
    }
    
    try {
      await fs.promises.unlink(filePath);
    } catch (error) {
      console.warn('Failed to delete cancelled render file:', error);
    }
    
    return true;
  });

  ipcMain.handle("rendering:save-file", async (_event, { filePath, fileName }) => {
    if (!filePath) return null;
    const downloadsPath = path.join(app.getPath("downloads"));
    const { canceled, filePath: savePath } = await dialog.showSaveDialog({
      title: "Save rendered video",
      defaultPath: path.join(downloadsPath, fileName),
    });
    if (canceled || !savePath) {
      return null;
    }
    await fs.promises.copyFile(filePath, savePath);
    return savePath;
  });

  ipcMain.handle("recording:read-asset", async (_event, filePath) => {
    try {
      const data = await fs.promises.readFile(filePath);
      return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
    } catch (error) {
      console.error("Failed to read recording asset", error);
      throw error;
    }
  });

  ipcMain.handle("recording:cleanup-assets", async (_event, paths = []) => {
    const dir = ensureRecordingDir();
    
    for (const path of paths || []) {
      const fd = renderFileDescriptors.get(path);
      if (fd) {
        try {
          await fd.close();
        } catch (error) {
          console.warn('Failed to close file descriptor:', error);
        }
        renderFileDescriptors.delete(path);
      }
    }
    
    await Promise.all(
      (paths || []).map((entry) =>
        fs.promises
          .unlink(entry)
          .catch(() => {})
      )
    );
    return true;
  });

  ipcMain.handle("recording:get-asset-url", async (_event, filePath) => {
    try {
      await fs.promises.access(filePath);
      return new URL(filePath, "recording://").toString();
    } catch (error) {
      console.error("Unable to resolve asset URL", error);
      throw error;
    }
  });

  registerProjectsIpcHandlers({
    ipcMain,
    dialog,
    getMainWindow: () => mainWindow,
    getProjectsDir,
    setProjectsDir,
  });

  ipcMain.on("input-capture:start", () => {
    startInputCapture();
  });

  ipcMain.on("input-capture:stop", () => {
    stopInputCapture();
  });

  // Register notes overlay IPC handlers
  notesHandler.registerNotesIpcHandlers();

  // Register recorder overlay IPC handlers
  recorderHandler.registerRecorderIpcHandlers(() => mainWindow);


  ipcMain.handle("desktop-capture:list-sources", async (_event, options = {}) => {
    const sources = await desktopCapturer.getSources({
      types: ["screen", "window"],
      thumbnailSize: { width: 480, height: 270 },
      fetchWindowIcons: true,
      ...options,
    });

    return sources.map((source) => ({
      id: source.id,
      name: source.name,
      thumbnail: source.thumbnail ? source.thumbnail.toDataURL() : null,
      type: source.id?.startsWith("screen:") ? "screen" : "window",
    }));
  });

  // Native recording handlers (using Rust xcap addon)
  ipcMain.handle("native-recording:list-sources", async () => {
    if (!nativeAddon) {
      throw new Error("Native addon not available");
    }
    try {
      const sources = nativeAddon.listSources();
      return sources.map(source => ({
        id: source.id,
        name: source.name,
        thumbnail: source.thumbnail,
        type: source.sourceType === "screen" ? "screen" : "window",
      }));
    } catch (error) {
      console.error("Failed to list native sources:", error);
      throw error;
    }
  });

  ipcMain.handle("native-recording:start-capture", async (_event, options) => {
    if (!nativeAddon) {
      throw new Error("Native addon not available");
    }
    try {
      nativeAddon.startCapture({
        targetId: options.targetId || "monitor:0",
        captureType: options.captureType || "monitor",
        includeCursor: Boolean(options.includeCursor),
        frameRate: options.frameRate || 30,
      });
      return true;
    } catch (error) {
      console.error("Failed to start native capture:", error);
      throw error;
    }
  });

  ipcMain.handle("native-recording:stop-capture", async () => {
    if (!nativeAddon) {
      throw new Error("Native addon not available");
    }
    try {
      nativeAddon.stopCapture();
      return true;
    } catch (error) {
      console.error("Failed to stop native capture:", error);
      throw error;
    }
  });

  ipcMain.handle("native-recording:poll-frame", async () => {
    if (!nativeAddon) {
      throw new Error("Native addon not available");
    }
    try {
      const frame = await nativeAddon.pollFrame();
      if (!frame) return null;
      return {
        width: frame.width,
        height: frame.height,
        timestampMs: frame.timestampMs,
        buffer: frame.buffer,
      };
    } catch (error) {
      console.error("Failed to poll frame:", error);
      throw error;
    }
  });

  ipcMain.handle("native-recording:start", async (_event, options) => {
    if (!nativeAddon) {
      throw new Error("Native addon not available");
    }
    try {
      const filePath = nativeAddon.startRecording({
        targetId: options.targetId || "monitor:0",
        captureType: options.captureType || "monitor",
        includeCursor: Boolean(options.includeCursor),
        frameRate: options.frameRate || 30,
        fileName: options.fileName,
      });
      return filePath;
    } catch (error) {
      console.error("Failed to start native recording:", error);
      throw error;
    }
  });

  ipcMain.handle("native-recording:stop", async () => {
    if (!nativeAddon) {
      throw new Error("Native addon not available");
    }
    try {
      const filePath = nativeAddon.stopRecording();
      return filePath;
    } catch (error) {
      console.error("Failed to stop native recording:", error);
      throw error;
    }
  });

  ipcMain.handle("native-recording:available", async () => {
    return nativeAddon !== null;
  });

  // Native mouse position APIs (from Rust, synced with screen capture)
  ipcMain.handle("native-recording:get-mouse-events", async () => {
    if (!nativeAddon) {
      throw new Error("Native addon not available");
    }
    try {
      return nativeAddon.getRecordingMouseEvents();
    } catch (error) {
      console.error("Failed to get mouse events:", error);
      throw error;
    }
  });

  ipcMain.handle("native-recording:clear-mouse-events", async () => {
    if (!nativeAddon) {
      throw new Error("Native addon not available");
    }
    try {
      nativeAddon.clearRecordingMouseEvents();
      return true;
    } catch (error) {
      console.error("Failed to clear mouse events:", error);
      throw error;
    }
  });

  ipcMain.handle("native-recording:get-current-mouse", async () => {
    if (!nativeAddon) {
      throw new Error("Native addon not available");
    }
    try {
      return nativeAddon.getCurrentMousePosition();
    } catch (error) {
      console.error("Failed to get current mouse position:", error);
      throw error;
    }
  });

  // Native transcription APIs (provider-based, implemented in Rust)
  ipcMain.handle("native-transcription:list-providers", async () => {
    if (!nativeAddon) {
      throw new Error("Native addon not available");
    }
    try {
      return nativeAddon.transcriptionListProviders();
    } catch (error) {
      console.error("Failed to list transcription providers:", error);
      throw error;
    }
  });

  ipcMain.handle("native-transcription:submit", async (_event, request) => {
    if (!nativeAddon) {
      throw new Error("Native addon not available");
    }
    try {
      return nativeAddon.transcriptionSubmit(request);
    } catch (error) {
      console.error("Failed to submit transcription:", error);
      throw error;
    }
  });

  ipcMain.handle("native-transcription:get-job", async (_event, jobId) => {
    if (!nativeAddon) {
      throw new Error("Native addon not available");
    }
    try {
      return nativeAddon.transcriptionGetJob(jobId);
    } catch (error) {
      console.error("Failed to get transcription job:", error);
      throw error;
    }
  });

  ipcMain.handle("native-transcription:get-result", async (_event, jobId) => {
    if (!nativeAddon) {
      throw new Error("Native addon not available");
    }
    try {
      return nativeAddon.transcriptionGetResult(jobId);
    } catch (error) {
      console.error("Failed to get transcription result:", error);
      throw error;
    }
  });

  ipcMain.handle("native-transcription:cancel", async (_event, jobId) => {
    if (!nativeAddon) {
      throw new Error("Native addon not available");
    }
    try {
      return nativeAddon.transcriptionCancel(jobId);
    } catch (error) {
      console.error("Failed to cancel transcription job:", error);
      throw error;
    }
  });

  // Transcription model management APIs
  ipcMain.handle("native-transcription:list-models", async () => {
    if (!nativeAddon) {
      throw new Error("Native addon not available");
    }
    try {
      return nativeAddon.modelListAvailable();
    } catch (error) {
      console.error("Failed to list transcription models:", error);
      throw error;
    }
  });

  ipcMain.handle("native-transcription:get-model-info", async (_event, modelId) => {
    if (!nativeAddon) {
      throw new Error("Native addon not available");
    }
    try {
      return nativeAddon.modelGetInfo(modelId);
    } catch (error) {
      console.error("Failed to get transcription model info:", error);
      throw error;
    }
  });

  ipcMain.handle("native-transcription:get-model-path", async (_event, modelId) => {
    if (!nativeAddon) {
      throw new Error("Native addon not available");
    }
    try {
      return nativeAddon.modelGetPath(modelId);
    } catch (error) {
      console.error("Failed to get transcription model path:", error);
      throw error;
    }
  });

  ipcMain.handle("native-transcription:download-model", async (_event, modelId) => {
    if (!nativeAddon) {
      throw new Error("Native addon not available");
    }
    try {
      return nativeAddon.modelDownload(modelId);
    } catch (error) {
      console.error("Failed to download transcription model:", error);
      throw error;
    }
  });

  ipcMain.handle("native-transcription:cancel-model-download", async (_event, modelId) => {
    if (!nativeAddon) {
      throw new Error("Native addon not available");
    }
    try {
      return nativeAddon.modelCancelDownload(modelId);
    } catch (error) {
      console.error("Failed to cancel transcription model download:", error);
      throw error;
    }
  });

  ipcMain.handle("native-transcription:delete-model", async (_event, modelId) => {
    if (!nativeAddon) {
      throw new Error("Native addon not available");
    }
    try {
      return nativeAddon.modelDelete(modelId);
    } catch (error) {
      console.error("Failed to delete transcription model:", error);
      throw error;
    }
  });

  ipcMain.handle("native-transcription:refresh-model-status", async () => {
    if (!nativeAddon) {
      throw new Error("Native addon not available");
    }
    try {
      nativeAddon.modelRefreshStatus();
      return true;
    } catch (error) {
      console.error("Failed to refresh transcription model status:", error);
      throw error;
    }
  });

  ipcMain.on("update:install", () => {
    autoUpdater.quitAndInstall();
  });

  setupAutoUpdater();

  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

const cleanupFileDescriptors = async () => {
  for (const [filePath, fd] of renderFileDescriptors.entries()) {
    try {
      await fd.close();
    } catch (error) {
      console.warn('Failed to close file descriptor on cleanup:', error);
    }
  }
  renderFileDescriptors.clear();
};

app.on("window-all-closed", async () => {
  await cleanupFileDescriptors();
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("before-quit", async () => {
  await cleanupFileDescriptors();
});
