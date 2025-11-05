const { app, BrowserWindow, ipcMain, desktopCapturer, screen, Menu } = require("electron");
const path = require("path");
const { uIOhook } = require("uiohook-napi");

const VITE_DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL;
const isDev = Boolean(VITE_DEV_SERVER_URL);

if (process.platform === "linux") {
  app.commandLine.appendSwitch("enable-features", "WebRTCPipeWireCapturer");
}

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
  });

  if (isDev && VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(VITE_DEV_SERVER_URL);
    mainWindow.webContents.once("did-frame-finish-load", () => {
      mainWindow.show();
      mainWindow.webContents.openDevTools({ mode: "detach" });
    });
  } else {
    mainWindow.loadFile(path.join(__dirname, "..", "dist", "index.html"));
    mainWindow.once("ready-to-show", () => mainWindow.show());
  }
}

let isCapturingInput = false;
let mainWindow = null;
let inputListenersInitialized = false;

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

  ipcMain.on("input-capture:start", () => {
    startInputCapture();
  });

  ipcMain.on("input-capture:stop", () => {
    stopInputCapture();
  });

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
    }));
  });

  ipcMain.handle("desktop-capture:get-default-source", async (_event, options = {}) => {
    const sources = await desktopCapturer.getSources({
      types: ["screen", "window"],
      thumbnailSize: { width: 0, height: 0 },
      ...options,
    });

    const preferredId = options?.preferredId;
    if (preferredId) {
      const preferred = sources.find((source) => source.id === preferredId);
      if (preferred) return preferred.id;
    }

    const screenSource = sources.find((source) => source.id.startsWith("screen:"));
    const windowSource = sources.find((source) => source.id.startsWith("window:"));
    const pickedSource = screenSource || windowSource || sources[0];
    return pickedSource ? pickedSource.id : null;
  });

  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
