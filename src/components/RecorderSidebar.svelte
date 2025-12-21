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
  import { licenseStore, isPaywallEnabled } from "../lib/stores/license";
  import PricingModal from "./features/licensing/PricingModal.svelte";

  const { notes } = notesStore;

  let showPricingModal = false;
  const togglePricing = () => (showPricingModal = !showPricingModal);

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

  {#if isPaywallEnabled}
    {#if !$licenseStore.isPro}
      <button
        on:click={togglePricing}
        class="group relative overflow-hidden rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 p-6 text-white shadow-xl transition-all hover:scale-[1.02] hover:shadow-indigo-200 active:scale-[0.98] dark:shadow-none"
      >
        <div
          class="absolute -right-4 -top-4 h-24 w-24 rounded-full bg-white/10 blur-2xl group-hover:bg-white/20"
        />
        <div class="relative z-10 flex flex-col gap-3">
          <div class="flex items-center gap-2">
            <div
              class="flex h-8 w-8 items-center justify-center rounded-lg bg-white/20 backdrop-blur-sm"
            >
              <svg
                viewBox="0 0 24 24"
                width="20"
                height="20"
                fill="none"
                stroke="white"
                stroke-width="2.5"
              >
                <path
                  d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"
                />
              </svg>
            </div>
            <span class="text-sm font-bold uppercase tracking-widest"
              >Upgrade to Pro</span
            >
          </div>
          <p class="text-sm font-medium leading-relaxed text-indigo-50/90">
            Get unlimited 4K exports, custom branding, and more features.
          </p>
          <div
            class="mt-1 flex items-center gap-2 text-xs font-bold text-white"
          >
            <span>Get Started</span>
            <svg
              viewBox="0 0 24 24"
              width="14"
              height="14"
              fill="none"
              stroke="currentColor"
              stroke-width="3"
              class="transition-transform group-hover:translate-x-1"
            >
              <path d="M5 12h14M12 5l7 7-7 7" />
            </svg>
          </div>
        </div>
      </button>
    {:else}
      <div
        class="flex items-center gap-3 rounded-2xl border border-emerald-100 bg-emerald-50/50 p-4 dark:border-emerald-900/30 dark:bg-emerald-900/10"
      >
        <div
          class="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-500"
        >
          <svg
            viewBox="0 0 24 24"
            width="16"
            height="16"
            fill="none"
            stroke="white"
            stroke-width="3"
          >
            <path d="M20 6L9 17l-5-5" />
          </svg>
        </div>
        <div>
          <p
            class="text-xs font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-400"
          >
            Pro Active
          </p>
          <p
            class="text-[11px] font-medium text-emerald-600/80 dark:text-emerald-500/80"
          >
            Lifetime License
          </p>
        </div>
      </div>
    {/if}
  {/if}
</aside>

<PricingModal
  show={showPricingModal}
  on:close={() => (showPricingModal = false)}
/>
