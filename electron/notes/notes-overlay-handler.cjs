const { BrowserWindow, ipcMain, screen } = require("electron");
const path = require("path");

let notesOverlayWindow = null;
let hideTimeout = null;

const notesState = {
  notes: [],
  currentIndex: 0,
  visible: false,
  recording: false,
  autoHide: true,
  autoHideDelay: 5000, // ms
  shortcuts: {
    next: { ctrl: false, alt: false, shift: false, key: "PageDown" },
    prev: { ctrl: false, alt: false, shift: false, key: "PageUp" },
    toggle: { ctrl: false, alt: false, shift: false, key: "F9" },
  },
};

// Map key names to uIOhook keycodes
const keyNameToKeycode = {
  "PageDown": 57425,
  "PageUp": 57417,
  "F9": 67,
  "F10": 68,
  "F11": 87,
  "F12": 88,
  "F1": 59,
  "F2": 60,
  "F3": 61,
  "F4": 62,
  "F5": 63,
  "F6": 64,
  "F7": 65,
  "F8": 66,
  "ArrowRight": 57421,
  "ArrowLeft": 57419,
  "ArrowUp": 57416,
  "ArrowDown": 57424,
  "Home": 57415,
  "End": 57423,
  "Insert": 57426,
  "Delete": 57427,
};

function createNotesOverlayWindow() {
  if (notesOverlayWindow && !notesOverlayWindow.isDestroyed()) {
    return notesOverlayWindow;
  }

  const primaryDisplay = screen.getPrimaryDisplay();
  const { width } = primaryDisplay.workAreaSize;

  notesOverlayWindow = new BrowserWindow({
    width: 1000,
    height: 120,
    x: Math.round((width - 1000) / 2),
    y: 20,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    movable: false,
    focusable: false,
    hasShadow: false,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "notes-preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  notesOverlayWindow.setIgnoreMouseEvents(true);
  notesOverlayWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  notesOverlayWindow.setAlwaysOnTop(true, "screen-saver");

  notesOverlayWindow.loadFile(path.join(__dirname, "notes-overlay.html"));

  notesOverlayWindow.on("closed", () => {
    notesOverlayWindow = null;
  });

  return notesOverlayWindow;
}

function clearHideTimeout() {
  if (hideTimeout) {
    clearTimeout(hideTimeout);
    hideTimeout = null;
  }
}

function scheduleAutoHide() {
  clearHideTimeout();
  if (notesState.autoHide && notesState.visible) {
    hideTimeout = setTimeout(() => {
      notesState.visible = false;
      updateNotesOverlayDisplay();
    }, notesState.autoHideDelay);
  }
}

function updateNotesOverlayDisplay() {
  if (!notesOverlayWindow || notesOverlayWindow.isDestroyed()) return;
  
  const note = notesState.notes[notesState.currentIndex];
  const data = {
    visible: notesState.visible && note != null,
    text: note?.text ?? "",
    currentIndex: notesState.currentIndex,
    totalCount: notesState.notes.length,
  };
  
  notesOverlayWindow.webContents.send("notes:update", data);
  if (data.visible) {
    notesOverlayWindow.showInactive();
    scheduleAutoHide();
  } else {
    notesOverlayWindow.hide();
    clearHideTimeout();
  }
}

function matchesShortcut(event, shortcut) {
  const isCtrl = Boolean(event.ctrlKey);
  const isAlt = Boolean(event.altKey);
  const isShift = Boolean(event.shiftKey);
  
  if (shortcut.ctrl !== isCtrl) return false;
  if (shortcut.alt !== isAlt) return false;
  if (shortcut.shift !== isShift) return false;
  
  const expectedKeycode = keyNameToKeycode[shortcut.key];
  if (expectedKeycode !== undefined) {
    return event.keycode === expectedKeycode;
  }
  
  // Fallback: match by character
  const char = event.keychar ? String.fromCharCode(event.keychar).toLowerCase() : "";
  return char === shortcut.key.toLowerCase();
}

function handleNotesKeyEvent(event) {
  if (!notesState.recording || notesState.notes.length === 0) return false;
  
  const { shortcuts } = notesState;
  
  // Next note
  if (matchesShortcut(event, shortcuts.next)) {
    notesState.currentIndex = (notesState.currentIndex + 1) % notesState.notes.length;
    notesState.visible = true;
    createNotesOverlayWindow();
    updateNotesOverlayDisplay();
    return true;
  }
  
  // Previous note
  if (matchesShortcut(event, shortcuts.prev)) {
    notesState.currentIndex = (notesState.currentIndex - 1 + notesState.notes.length) % notesState.notes.length;
    notesState.visible = true;
    createNotesOverlayWindow();
    updateNotesOverlayDisplay();
    return true;
  }
  
  // Toggle visibility
  if (matchesShortcut(event, shortcuts.toggle)) {
    notesState.visible = !notesState.visible;
    if (notesState.visible) {
      createNotesOverlayWindow();
    }
    updateNotesOverlayDisplay();
    return true;
  }
  
  return false;
}

function registerNotesIpcHandlers() {
  ipcMain.on("notes:show-overlay", () => {
    const overlay = createNotesOverlayWindow();
    if (overlay && !overlay.isDestroyed()) {
      notesState.visible = true;
      overlay.showInactive();
      updateNotesOverlayDisplay();
    }
  });

  ipcMain.on("notes:hide-overlay", () => {
    notesState.visible = false;
    notesState.recording = false;
    clearHideTimeout();
    if (notesOverlayWindow && !notesOverlayWindow.isDestroyed()) {
      notesOverlayWindow.hide();
    }
  });

  ipcMain.on("notes:update", (_event, data) => {
    if (data.notes !== undefined) {
      notesState.notes = data.notes;
    }
    if (data.currentIndex !== undefined) {
      notesState.currentIndex = data.currentIndex;
    }
    if (data.visible !== undefined) {
      notesState.visible = data.visible;
    }
    if (data.recording !== undefined) {
      notesState.recording = data.recording;
    }
    if (data.autoHide !== undefined) {
      notesState.autoHide = data.autoHide;
    }
    if (data.autoHideDelay !== undefined) {
      notesState.autoHideDelay = data.autoHideDelay;
    }
    if (data.shortcuts !== undefined) {
      notesState.shortcuts = data.shortcuts;
    }
    
    if (notesOverlayWindow && !notesOverlayWindow.isDestroyed()) {
      updateNotesOverlayDisplay();
    }
  });

  ipcMain.on("notes:destroy-overlay", () => {
    notesState.visible = false;
    notesState.recording = false;
    clearHideTimeout();
    if (notesOverlayWindow && !notesOverlayWindow.isDestroyed()) {
      notesOverlayWindow.close();
      notesOverlayWindow = null;
    }
  });

  ipcMain.on("notes:start-shortcuts", () => {
    notesState.recording = true;
  });

  ipcMain.on("notes:stop-shortcuts", () => {
    notesState.recording = false;
    clearHideTimeout();
  });
}

module.exports = {
  notesState,
  createNotesOverlayWindow,
  updateNotesOverlayDisplay,
  handleNotesKeyEvent,
  registerNotesIpcHandlers,
};
