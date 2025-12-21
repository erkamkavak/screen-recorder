<script lang="ts">
  import SidebarLayoutSection from "./preview_sidebar/SidebarLayoutSection.svelte";
  import SidebarWebcamSection from "./preview_sidebar/SidebarWebcamSection.svelte";
  import SidebarThemeSection from "./preview_sidebar/SidebarThemeSection.svelte";
  import NotesSetup from "./features/notes/NotesSetup.svelte";
  import {
    activeSidebarTab,
    webcamState,
    micState,
    type SidebarTab,
  } from "../lib/stores";
  import { notesStore } from "../lib/stores/notes";

  const { notes } = notesStore;

  const setTab = (tab: SidebarTab) => {
    $activeSidebarTab = tab;
  };

  $: hasWebcam = Boolean($webcamState?.stream);
  $: hasMic = Boolean($micState?.stream);
  $: noteCount = $notes.length;
  $: if ($activeSidebarTab === "webcam" && !hasWebcam) {
    $activeSidebarTab = "layout";
  }
  $: if ($activeSidebarTab === "mic" && !hasMic) {
    $activeSidebarTab = "layout";
  }
</script>

<aside
  class="relative flex h-auto w-full shrink-0 flex-col gap-5 overflow-y-auto border-t border-slate-200/60 bg-white/60 px-4 py-6 backdrop-blur-md dark:border-slate-800/80 dark:bg-slate-900/60 lg:h-full lg:max-h-full lg:w-[26rem] lg:border-t-0 lg:border-l lg:px-7"
>
  <div
    class="mb-4 flex flex-wrap gap-1.5 rounded-xl bg-slate-100/80 p-1.5 dark:bg-slate-800/60"
  >
    <button
      type="button"
      class={`flex-1 min-w-[4rem] rounded-lg px-3 py-2 text-xs font-medium transition-all ${
        $activeSidebarTab === "layout"
          ? "bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-white"
          : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
      }`}
      on:click={() => setTab("layout")}
    >
      Layout
    </button>
    <button
      type="button"
      class={`flex-1 min-w-[4rem] rounded-lg px-3 py-2 text-xs font-medium transition-all ${
        $activeSidebarTab === "webcam"
          ? "bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-white"
          : hasWebcam
          ? "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
          : "text-slate-400 cursor-not-allowed dark:text-slate-600"
      }`}
      disabled={!hasWebcam}
      on:click={() => hasWebcam && setTab("webcam")}
    >
      Webcam
    </button>
    <button
      type="button"
      class={`flex-1 min-w-[4rem] rounded-lg px-3 py-2 text-xs font-medium transition-all ${
        $activeSidebarTab === "mic"
          ? "bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-white"
          : hasMic
          ? "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
          : "text-slate-400 cursor-not-allowed dark:text-slate-600"
      }`}
      disabled={!hasMic}
      on:click={() => hasMic && setTab("mic")}
    >
      Mic
    </button>
    <button
      type="button"
      class={`relative flex-1 min-w-[4rem] rounded-lg px-3 py-2 text-xs font-medium transition-all ${
        $activeSidebarTab === "notes"
          ? "bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-white"
          : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
      }`}
      on:click={() => setTab("notes")}
    >
      Notes
      {#if noteCount > 0}
        <span
          class="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-indigo-500 text-[10px] font-bold text-white"
        >
          {noteCount}
        </span>
      {/if}
    </button>
  </div>

  <div class="grid gap-5">
    {#if $activeSidebarTab === "layout"}
      <SidebarLayoutSection />
      <SidebarThemeSection />
    {/if}
    {#if $activeSidebarTab === "webcam"}
      <SidebarWebcamSection />
    {/if}
    {#if $activeSidebarTab === "mic"}
      <!-- Empty for now -->
    {/if}
    {#if $activeSidebarTab === "notes"}
      <NotesSetup />
    {/if}
  </div>
  <div
    class="mt-auto rounded-2xl border border-slate-200/70 bg-white/70 p-5 text-xs leading-relaxed text-slate-500 shadow-sm dark:border-slate-800/70 dark:bg-slate-900/70 dark:text-slate-400"
  >
    <p
      class="font-semibold uppercase tracking-[0.2em] text-slate-400 dark:text-slate-500"
    >
      Tips
    </p>
    <p class="mt-2">
      Drag the webcam overlay to reposition it. Hover the shared screen to
      adjust alignment or use the sidebar to tweak padding and theme.
    </p>
  </div>
</aside>
