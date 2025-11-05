<script lang="ts">
  export let title: string;
</script>

<div
  class="relative overflow-visible rounded-xl border border-slate-200/70 bg-white/80 shadow-sm backdrop-blur-sm transition-colors dark:border-slate-800/80 dark:bg-slate-900/60"
>
  <div class="flex items-center gap-2 px-5 pt-4 pb-3 text-xs font-semibold uppercase tracking-[0.2em] text-slate-500 dark:text-slate-300">
    <slot name="icon" />
    <span>{title}</span>
  </div>
  <div class="relative overflow-visible px-5 pb-5">
    <slot />
  </div>
</div>
