<script lang="ts">
  import clsx from "clsx";
  import { clickOutside } from "../../lib/utils/clickOutside";
  import { createEventDispatcher } from "svelte";

  export let isPopupOpen: boolean = false;
  export let extraClasses = "";
  export let isSquareVariant: boolean = true;
  export let isTextVariant: boolean = false;
  export let showPopupUnder: boolean = false;
  export let rightAlignPopup: boolean = false;
  export let isActive: boolean = false;
  export let disabled: boolean = false;

  const dispatch = createEventDispatcher();
</script>

<div class="relative action_button h-full group">
  {#if isPopupOpen}
    <div
      class="action_button_popup absolute z-30 w-64 rounded-xl border border-slate-200/70 bg-white/95 shadow-xl backdrop-blur dark:border-slate-800/80 dark:bg-slate-900/95 {showPopupUnder
        ? 'top-10'
        : 'bottom-20'} {rightAlignPopup
        ? '-right-2'
        : '-left-2'}"
      use:clickOutside
      on:outclick={() => dispatch("popupDismiss")}
    >
      <slot name="popupContent" />
    </div>
  {/if}

  <button
    class={clsx(
      "relative inline-flex w-full items-center justify-center rounded-xl border border-slate-200/80 bg-white/80 px-3 py-2 text-sm font-medium text-slate-600 shadow-sm transition hover:border-slate-300 hover:bg-white hover:text-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:border-slate-700/70 dark:bg-slate-900/70 dark:text-slate-200 dark:hover:border-slate-600 dark:hover:bg-slate-900/60 dark:focus-visible:ring-slate-700",
      extraClasses,
      isSquareVariant ? "aspect-square h-full p-0" : "",
      isTextVariant
        ? "border-0 bg-transparent text-sm text-slate-600 shadow-none hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
        : ""
    )}
    aria-pressed={isActive}
    data-active={isActive ? "true" : undefined}
    on:click
    {disabled}
  >
    <slot />
  </button>

</div>
