const { BrowserWindow, ipcMain, screen } = require("electron");
const path = require("path");

let recorderOverlayWindow = null;
let recordingState = {
  isRecording: false,
  duration: 0,
  visible: false,
};

function createRecorderOverlayWindow() {
  if (recorderOverlayWindow && !recorderOverlayWindow.isDestroyed()) {
    return recorderOverlayWindow;
  }

  const primaryDisplay = screen.getPrimaryDisplay();
  const { width, height } = primaryDisplay.workAreaSize;

  recorderOverlayWindow = new BrowserWindow({
    width: 220,
    height: 80,
    x: width - 250,
    y: height - 120,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    movable: true,
    focusable: true,
    hasShadow: false,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "recorder-preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  recorderOverlayWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  recorderOverlayWindow.setAlwaysOnTop(true, "screen-saver");

  recorderOverlayWindow.loadFile(path.join(__dirname, "recorder-overlay.html"));

  recorderOverlayWindow.on("closed", () => {
    recorderOverlayWindow = null;
  });

  return recorderOverlayWindow;
}

function updateRecorderOverlayDisplay() {
  if (!recorderOverlayWindow || recorderOverlayWindow.isDestroyed()) return;
  
  recorderOverlayWindow.webContents.send("recorder:update-state", recordingState);
  
  if (recordingState.visible) {
    recorderOverlayWindow.show();
  } else {
    recorderOverlayWindow.hide();
  }
}

function registerRecorderIpcHandlers(getMainWindow) {
  ipcMain.on("recorder:show-overlay", () => {
    recordingState.visible = true;
    createRecorderOverlayWindow();
    updateRecorderOverlayDisplay();
  });

  ipcMain.on("recorder:hide-overlay", () => {
    recordingState.visible = false;
    if (recorderOverlayWindow && !recorderOverlayWindow.isDestroyed()) {
      recorderOverlayWindow.hide();
    }
    const mainWindow = getMainWindow();
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("recorder:overlay-hidden");
    }
  });


  ipcMain.on("recorder:toggle-recording", () => {
    const mainWindow = getMainWindow();
    if (mainWindow && !mainWindow.isDestroyed()) {
      if (recordingState.isRecording) {
        mainWindow.webContents.send("recording:stop-request");
      } else {
        mainWindow.webContents.send("recording:start-request");
      }
    }
  });

  ipcMain.on("recorder:sync-state", (_event, state) => {
    const wasRecording = recordingState.isRecording;
    recordingState = { ...recordingState, ...state };
    updateRecorderOverlayDisplay();
    
    // If recording stopped, focus main window
    if (state.isRecording === false && wasRecording === true) {
       const mainWindow = getMainWindow();
       if (mainWindow && !mainWindow.isDestroyed()) {
         if (mainWindow.isMinimized()) {
            mainWindow.restore();
         }
         mainWindow.maximize();
         mainWindow.show();
         mainWindow.focus();
       }
    }
  });

  ipcMain.on("recorder:close-app", () => {
    const mainWindow = getMainWindow();
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.close();
    }
  });
}

module.exports = {
  createRecorderOverlayWindow,
  registerRecorderIpcHandlers,
};
