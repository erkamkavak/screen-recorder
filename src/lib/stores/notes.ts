import { writable, derived } from "svelte/store";

export type RecordingNote = {
  id: string;
  text: string;
};

export type NotesShortcut = {
  ctrl: boolean;
  alt: boolean;
  shift: boolean;
  key: string; // key name like "ArrowRight", "n", "PageDown"
};

export type NotesSettings = {
  autoHide: boolean;
  autoHideDelay: number; // ms
  shortcuts: {
    next: NotesShortcut;
    prev: NotesShortcut;
    toggle: NotesShortcut;
  };
};

const createNotesStore = () => {
  const notes = writable<RecordingNote[]>([]);
  const currentNoteIndex = writable(0);
  const isOverlayVisible = writable(false);
  
  const defaultShortcuts = {
    next: { ctrl: false, alt: false, shift: false, key: "PageDown" },
    prev: { ctrl: false, alt: false, shift: false, key: "PageUp" },
    toggle: { ctrl: false, alt: false, shift: false, key: "F9" },
  };

  // Load settings from localStorage
  const loadSettings = (): NotesSettings => {
    try {
      const saved = localStorage.getItem("notesSettings");
      if (saved) {
        const parsed = JSON.parse(saved);
        return {
          autoHide: parsed.autoHide ?? true,
          autoHideDelay: parsed.autoHideDelay ?? 5000,
          shortcuts: parsed.shortcuts ?? defaultShortcuts,
        };
      }
    } catch {}
    return { autoHide: true, autoHideDelay: 5000, shortcuts: defaultShortcuts };
  };
  
  const settings = writable<NotesSettings>(loadSettings());
  
  // Persist settings
  settings.subscribe((s) => {
    try {
      localStorage.setItem("notesSettings", JSON.stringify(s));
    } catch {}
  });

  const loadNotes = (): RecordingNote[] => {
    try {
      const saved = localStorage.getItem("recordingNotes");
      if (!saved) return [];
      const parsed = JSON.parse(saved);
      if (!Array.isArray(parsed)) return [];
      return parsed
        .filter((n) => n && typeof n.id === "string" && typeof n.text === "string")
        .map((n) => ({ id: n.id, text: n.text }));
    } catch {
      return [];
    }
  };

  notes.set(loadNotes());

  notes.subscribe((n) => {
    try {
      localStorage.setItem("recordingNotes", JSON.stringify(n));
    } catch {}
  });

  let hideTimeout: ReturnType<typeof setTimeout> | null = null;

  const addNote = (text: string) => {
    if (!text.trim()) return;
    notes.update((n) => [
      ...n,
      { id: crypto.randomUUID(), text: text.trim() },
    ]);
  };

  const removeNote = (id: string) => {
    notes.update((n) => n.filter((note) => note.id !== id));
  };

  const updateNote = (id: string, text: string) => {
    notes.update((n) =>
      n.map((note) => (note.id === id ? { ...note, text } : note))
    );
  };

  const clearNotes = () => {
    notes.set([]);
    currentNoteIndex.set(0);
    try {
      localStorage.removeItem("recordingNotes");
    } catch {}
  };

  const nextNote = () => {
    notes.subscribe((n) => {
      if (n.length === 0) return;
      currentNoteIndex.update((i) => (i + 1) % n.length);
    })();
  };

  const prevNote = () => {
    notes.subscribe((n) => {
      if (n.length === 0) return;
      currentNoteIndex.update((i) => (i - 1 + n.length) % n.length);
    })();
  };

  const showOverlay = (autoHideMs = 5000) => {
    if (hideTimeout) clearTimeout(hideTimeout);
    isOverlayVisible.set(true);
    if (autoHideMs > 0) {
      hideTimeout = setTimeout(() => {
        isOverlayVisible.set(false);
      }, autoHideMs);
    }
  };

  const hideOverlay = () => {
    if (hideTimeout) clearTimeout(hideTimeout);
    isOverlayVisible.set(false);
  };

  const toggleOverlay = () => {
    isOverlayVisible.update((v) => {
      if (!v) {
        showOverlay();
        return true;
      }
      hideOverlay();
      return false;
    });
  };

  const resetForRecording = () => {
    currentNoteIndex.set(0);
    isOverlayVisible.set(false);
  };

  const currentNote = derived(
    [notes, currentNoteIndex],
    ([$notes, $index]) => $notes[$index] ?? null
  );

  const noteCount = derived(notes, ($notes) => $notes.length);

  return {
    notes,
    currentNoteIndex,
    currentNote,
    noteCount,
    isOverlayVisible,
    settings,
    addNote,
    removeNote,
    updateNote,
    clearNotes,
    nextNote,
    prevNote,
    showOverlay,
    hideOverlay,
    toggleOverlay,
    resetForRecording,
  };
};

export const notesStore = createNotesStore();
