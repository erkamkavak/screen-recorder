<script lang="ts">
  import { fade } from "svelte/transition";
  export let isRecording: boolean = false;
  export let onExit: () => void = () => {};
</script>

<div
  class="absolute inset-x-4 top-4 z-50 flex flex-col items-center justify-between gap-4 rounded-2xl border border-white/10 bg-black/80 p-4 shadow-2xl backdrop-blur-xl sm:flex-row sm:gap-6"
  transition:fade={{ duration: 200 }}
>
  <div class="flex items-center gap-4">
    <div
      class="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-white/10 shadow-inner"
    >
      <div
        class="h-2 w-2 rounded-full bg-white shadow-[0_0_8px_rgba(255,255,255,0.8)]"
      />
    </div>
    <div class="min-w-0">
      <h3 class="text-xs font-bold uppercase tracking-widest text-white/90">
        Zoom Editor
      </h3>
      <p class="truncate text-[10px] font-medium text-slate-400">
        Keyboard shortcuts enabled
      </p>
    </div>
  </div>

  <div class="flex flex-wrap items-center justify-center gap-4">
    {#if isRecording}
      <div
        class="flex items-center gap-1.5 rounded-full bg-rose-500/10 px-3 py-1 text-[9px] font-bold uppercase tracking-widest text-rose-400 border border-rose-500/20"
      >
        <span class="h-1 w-1 rounded-full bg-rose-500 animate-pulse" />
        Recording
      </div>
    {/if}

    <div class="flex flex-wrap items-center justify-center gap-x-5 gap-y-2">
      <div class="flex items-center gap-2 text-[10px] font-bold text-slate-300">
        <kbd
          class="flex min-w-[32px] items-center justify-center rounded-md border border-white/20 bg-white/10 px-1.5 py-1 font-mono text-[9px] text-white shadow-sm"
          >SPACE</kbd
        >
        <span class="uppercase tracking-tighter opacity-50">Play</span>
      </div>
      <div class="flex items-center gap-2 text-[10px] font-bold text-slate-300">
        <kbd
          class="flex min-w-[32px] items-center justify-center rounded-md border border-white/20 bg-white/10 px-1.5 py-1 font-mono text-[9px] text-white shadow-sm"
          >← / →</kbd
        >
        <span class="uppercase tracking-tighter opacity-50">Seek</span>
      </div>
      <div class="flex items-center gap-2 text-[10px] font-bold text-slate-300">
        <kbd
          class="flex min-w-[32px] items-center justify-center rounded-md border border-white/20 bg-white/10 px-1.5 py-1 font-mono text-[9px] text-white shadow-sm"
          >Z</kbd
        >
        <span class="uppercase tracking-tighter opacity-50">Zoom</span>
      </div>
      <div class="flex items-center gap-2 text-[10px] font-bold text-slate-300">
        <kbd
          class="flex min-w-[32px] items-center justify-center rounded-md border border-white/20 bg-white/10 px-1.5 py-1 font-mono text-[9px] text-white shadow-sm"
          >ESC</kbd
        >
        <span class="uppercase tracking-tighter opacity-50">Exit</span>
      </div>
    </div>
  </div>

  <button
    class="flex h-10 w-full items-center justify-center rounded-xl bg-white px-6 text-[11px] font-black uppercase tracking-widest text-black transition-all hover:bg-slate-200 active:scale-95 sm:w-auto"
    on:click={onExit}
  >
    Done
  </button>
</div>
