<script lang="ts">
  import SidebarLayoutSection from "./preview_sidebar/SidebarLayoutSection.svelte";
  import SidebarWebcamSection from "./preview_sidebar/SidebarWebcamSection.svelte";
  import SidebarThemeSection from "./preview_sidebar/SidebarThemeSection.svelte";
  import { activeSidebarTab, webcamState, micState, type SidebarTab } from "../lib/stores";

  const setTab = (tab: SidebarTab) => {
    $activeSidebarTab = tab;
  };

  $: hasWebcam = Boolean($webcamState?.stream);
  $: hasMic = Boolean($micState?.stream);
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
  <div class="mb-4 grid grid-cols-3 gap-2">
    <button
      type="button"
      class={`rounded-lg border px-3 py-2 text-xs font-semibold transition ${$activeSidebarTab === 'layout' ? 'border-slate-700/80 bg-slate-900/80 text-white dark:border-slate-600/80' : 'border-slate-200/80 bg-white/60 text-slate-700 dark:border-slate-700/70 dark:bg-slate-900/60 dark:text-slate-200'}`}
      on:click={() => setTab('layout')}
    >
      Layout
    </button>
    <button
      type="button"
      class={`rounded-lg border px-3 py-2 text-xs font-semibold transition ${$activeSidebarTab === 'webcam' ? 'border-slate-700/80 bg-slate-900/80 text-white dark:border-slate-600/80' : hasWebcam ? 'border-slate-200/80 bg-white/60 text-slate-700 dark:border-slate-700/70 dark:bg-slate-900/60 dark:text-slate-200' : 'border-slate-200/60 bg-white/40 text-slate-400 dark:border-slate-800/60 dark:bg-slate-900/40 dark:text-slate-600'}`}
      disabled={!hasWebcam}
      on:click={() => hasWebcam && setTab('webcam')}
    >
      Webcam
    </button>
    <button
      type="button"
      class={`rounded-lg border px-3 py-2 text-xs font-semibold transition ${$activeSidebarTab === 'mic' ? 'border-slate-700/80 bg-slate-900/80 text-white dark:border-slate-600/80' : hasMic ? 'border-slate-200/80 bg-white/60 text-slate-700 dark:border-slate-700/70 dark:bg-slate-900/60 dark:text-slate-200' : 'border-slate-200/60 bg-white/40 text-slate-400 dark:border-slate-800/60 dark:bg-slate-900/40 dark:text-slate-600'}`}
      disabled={!hasMic}
      on:click={() => hasMic && setTab('mic')}
    >
      Microphone
    </button>
  </div>

  <div class="grid gap-5">
    {#if $activeSidebarTab === 'layout'}
      <SidebarLayoutSection />
      <SidebarThemeSection />
    {/if}
    {#if $activeSidebarTab === 'webcam'}
      <SidebarWebcamSection />
    {/if}
    {#if $activeSidebarTab === 'mic'}
      <!-- Empty for now -->
    {/if}
  </div>
  <div class="mt-auto rounded-2xl border border-slate-200/70 bg-white/70 p-5 text-xs leading-relaxed text-slate-500 shadow-sm dark:border-slate-800/70 dark:bg-slate-900/70 dark:text-slate-400">
    <p class="font-semibold uppercase tracking-[0.2em] text-slate-400 dark:text-slate-500">
      Tips
    </p>
    <p class="mt-2">
      Drag the webcam overlay to reposition it. Hover the shared screen to adjust alignment or use the sidebar to tweak padding and theme.
    </p>
  </div>
</aside>
