<script lang="ts">
  import { notesStore, type NotesShortcut } from "../../../lib/stores/notes";
  import { isRecording } from "../../../lib/stores";

  const { notes, addNote, removeNote, clearNotes, settings } = notesStore;

  let newNoteText = "";
  let editingShortcut: "next" | "prev" | "toggle" | null = null;

  const handleAddNote = () => {
    if (newNoteText.trim()) {
      addNote(newNoteText);
      newNoteText = "";
    }
  };

  const handleKeydown = (e: KeyboardEvent) => {
    if (e.key === "Enter" && e.ctrlKey) {
      e.preventDefault();
      handleAddNote();
    }
  };

  const delayOptions = [
    { value: 3000, label: "3s" },
    { value: 5000, label: "5s" },
    { value: 8000, label: "8s" },
    { value: 10000, label: "10s" },
  ];

  const shortcutActionOptions = [
    { action: "next", label: "Next note" },
    { action: "prev", label: "Previous" },
    { action: "toggle", label: "Toggle" },
  ] as const;

  const keyOptions = [
    { value: "PageDown", label: "Page Down" },
    { value: "PageUp", label: "Page Up" },
    { value: "F9", label: "F9" },
    { value: "F10", label: "F10" },
    { value: "F11", label: "F11" },
    { value: "F12", label: "F12" },
    { value: "Home", label: "Home" },
    { value: "End", label: "End" },
  ];

  const formatShortcut = (shortcut: NotesShortcut): string => {
    const parts: string[] = [];
    if (shortcut.ctrl) parts.push("Ctrl");
    if (shortcut.alt) parts.push("Alt");
    if (shortcut.shift) parts.push("Shift");
    parts.push(shortcut.key);
    return parts.join("+");
  };

  const updateShortcut = (action: "next" | "prev" | "toggle", key: string) => {
    $settings.shortcuts[action] = { ...$settings.shortcuts[action], key };
    $settings = $settings; // trigger reactivity
    editingShortcut = null;
  };
</script>

{#if !$isRecording}
  <div class="flex flex-col gap-4" data-testid="notes-panel">
    <div class="relative">
      <textarea
        bind:value={newNoteText}
        on:keydown={handleKeydown}
        placeholder="Type a note... (Ctrl+Enter to add)"
        rows="3"
        class="w-full rounded-xl border-0 bg-slate-100/80 px-4 py-3 text-sm text-slate-700 placeholder-slate-400 resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500/30 dark:bg-slate-800/80 dark:text-slate-200 dark:placeholder-slate-500"
        data-testid="note-input"
      ></textarea>
      <button
        type="button"
        on:click={handleAddNote}
        disabled={!newNoteText.trim()}
        class="absolute right-2 bottom-2 rounded-lg bg-indigo-500 px-3 py-1.5 text-xs font-medium text-white transition-all hover:bg-indigo-600 disabled:opacity-40 disabled:hover:bg-indigo-500"
        data-testid="add-note-btn"
      >
        Add
      </button>
    </div>

    {#if $notes.length > 0}
      <div class="flex items-center justify-between">
        <span class="text-xs font-medium text-slate-500 dark:text-slate-400">
          {$notes.length} note{$notes.length !== 1 ? 's' : ''}
        </span>
        <button
          type="button"
          class="text-xs text-slate-400 hover:text-red-500 dark:text-slate-500 dark:hover:text-red-400 transition-colors"
          on:click={() => clearNotes()}
        >
          Clear all
        </button>
      </div>

      <ul class="flex flex-col gap-1.5 max-h-64 overflow-y-auto">
        {#each $notes as note, index (note.id)}
          <li
            class="group flex items-center gap-3 rounded-lg bg-slate-50/80 px-3 py-2.5 transition-colors hover:bg-slate-100/80 dark:bg-slate-800/50 dark:hover:bg-slate-800/80"
            data-testid={`note-${index + 1}`}
          >
            <span class="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-indigo-500/10 text-[11px] font-semibold text-indigo-600 dark:bg-indigo-500/20 dark:text-indigo-400">
              {index + 1}
            </span>
            <span class="flex-1 text-sm text-slate-600 dark:text-slate-300 truncate">
              {note.text}
            </span>
            <button
              type="button"
              on:click={() => removeNote(note.id)}
              class="shrink-0 opacity-0 group-hover:opacity-100 p-1 rounded text-slate-400 hover:text-red-500 hover:bg-red-50 dark:text-slate-500 dark:hover:text-red-400 dark:hover:bg-red-500/10 transition-all"
              aria-label="Remove note"
            >
              <svg class="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </li>
        {/each}
      </ul>
    {:else}
      <div class="flex flex-col items-center justify-center py-8 text-center">
        <div class="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 dark:bg-slate-800">
          <svg class="h-6 w-6 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
        </div>
        <p class="text-sm text-slate-500 dark:text-slate-400">No notes yet</p>
        <p class="mt-1 text-xs text-slate-400 dark:text-slate-500">Add notes to display during recording</p>
      </div>
    {/if}

    <div class="rounded-lg bg-slate-50/80 px-3 py-3 dark:bg-slate-800/40">
      <div class="flex items-center justify-between gap-4">
        <label class="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            bind:checked={$settings.autoHide}
            class="h-4 w-4 rounded border-slate-300 text-indigo-500 focus:ring-indigo-500/30 dark:border-slate-600 dark:bg-slate-700"
          />
          <span class="text-xs text-slate-600 dark:text-slate-300">Auto-hide</span>
        </label>
        {#if $settings.autoHide}
          <div class="flex items-center gap-1.5">
            {#each delayOptions as opt}
              <button
                type="button"
                on:click={() => $settings.autoHideDelay = opt.value}
                class={`px-2 py-1 rounded text-[10px] font-medium transition-colors ${$settings.autoHideDelay === opt.value ? 'bg-indigo-500 text-white' : 'bg-slate-200/80 text-slate-600 hover:bg-slate-300/80 dark:bg-slate-700 dark:text-slate-300 dark:hover:bg-slate-600'}`}
              >
                {opt.label}
              </button>
            {/each}
          </div>
        {/if}
      </div>
    </div>

    <div class="rounded-lg bg-slate-50/80 px-3 py-3 dark:bg-slate-800/40">
      <p class="text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-2">Shortcuts</p>
      <div class="flex flex-col gap-2">
        {#each shortcutActionOptions as { action, label }}
          <div class="flex items-center justify-between">
            <span class="text-xs text-slate-600 dark:text-slate-300">{label}</span>
            {#if editingShortcut === action}
              <select
                class="rounded bg-slate-200/80 px-2 py-1 text-[10px] font-medium dark:bg-slate-700 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                on:change={(e) => updateShortcut(action, e.currentTarget.value)}
                on:blur={() => editingShortcut = null}
              >
                {#each keyOptions as opt}
                  <option value={opt.value} selected={$settings.shortcuts[action].key === opt.value}>
                    {opt.label}
                  </option>
                {/each}
              </select>
            {:else}
              <button
                type="button"
                on:click={() => { editingShortcut = action }}
                class="rounded bg-slate-200/80 px-2 py-1 text-[10px] font-mono font-medium text-slate-600 hover:bg-slate-300/80 dark:bg-slate-700 dark:text-slate-300 dark:hover:bg-slate-600 transition-colors"
              >
                {formatShortcut($settings.shortcuts[action])}
              </button>
            {/if}
          </div>
        {/each}
      </div>
    </div>
  </div>
{/if}
