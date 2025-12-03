<script lang="ts">
  import { setContext } from "svelte";
  import {
    sidebarSectionDropdownKey,
    type SidebarSectionDropdownContext,
  } from "../../utils/sidebarSectionDropdownContext";

  export let title: string;

  let openDropdowns = 0;
  let hasDropdownOpen = false;

  const registerDropdown = () => {
    openDropdowns += 1;
  };

  const unregisterDropdown = () => {
    openDropdowns = Math.max(0, openDropdowns - 1);
  };

  setContext<SidebarSectionDropdownContext>(sidebarSectionDropdownKey, {
    register: registerDropdown,
    unregister: unregisterDropdown,
  });

  $: hasDropdownOpen = openDropdowns > 0;
</script>

<div
  class={`relative overflow-visible rounded-xl border border-slate-200/70 bg-white/80 shadow-sm backdrop-blur-sm transition-colors dark:border-slate-800/80 dark:bg-slate-900/60 ${hasDropdownOpen ? "z-[60]" : "z-0"}`}
>
  <div class="flex items-center gap-2 px-5 pt-4 pb-3 text-xs font-semibold uppercase tracking-[0.2em] text-slate-500 dark:text-slate-300">
    <slot name="icon" />
    <span>{title}</span>
  </div>
  <div class="relative overflow-visible px-5 pb-5">
    <slot />
  </div>
</div>
