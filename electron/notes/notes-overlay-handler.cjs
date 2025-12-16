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
  "PageDown": 0x0E51,
  "PageUp": 0x0E49,
  "F9": 0x0043,
  "F10": 0x0044,
  "F11": 0x0057,
  "F12": 0x0058,
  "F1": 0x003B,
  "F2": 0x003C,
  "F3": 0x003D,
  "F4": 0x003E,
  "F5": 0x003F,
  "F6": 0x0040,
  "F7": 0x0041,
  "F8": 0x0042,
  "ArrowRight": 0xE04D,
  "ArrowLeft": 0xE04B,
  "ArrowUp": 0xE048,
  "ArrowDown": 0xE050,
  "Home": 0x0E47,
  "End": 0x0E4F,
  "Insert": 0x0E52,
  "Delete": 0x0E53,
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
