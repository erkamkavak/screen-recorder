<script lang="ts">
  import { createEventDispatcher } from "svelte";

  export let checked = false;
  export let disabled = false;

  const dispatch = createEventDispatcher();

  function toggle() {
    if (disabled) return;
    checked = !checked;
    dispatch("change", { checked });
  }
</script>

<button
  type="button"
  role="switch"
  aria-checked={checked}
  {disabled}
  on:click={toggle}
  class={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-indigo-600 focus:ring-offset-2 ${
    checked ? "bg-indigo-600" : "bg-slate-200 dark:bg-slate-700"
  } ${disabled ? "opacity-50 cursor-not-allowed" : ""}`}
>
  <span
    aria-hidden="true"
    class={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
      checked ? "translate-x-5" : "translate-x-0"
    }`}
  />
</button>
