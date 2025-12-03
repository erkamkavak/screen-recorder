<script lang="ts">
  import clsx from "clsx";
  import { createEventDispatcher } from "svelte";
  import InputLabel from "./InputLabel.svelte";

  export let name: string;
  export let title: string;
  export let value: number;
  export let isDisabled = false;
  export let showPercentage = true;
  export let min = 0;
  export let max = 1;
  export let step = 0.05;

  const dispatch = createEventDispatcher<{ input: number }>();

  const clampValue = (val: number) => Math.min(Math.max(val, min), max);

  let boundedValue = value;
  let fillPercent = 0;

  $: boundedValue = clampValue(value);
  $: fillPercent =
    max <= min
      ? 100
      : Math.round(((boundedValue - min) / (max - min)) * 100);

  const handleInput = (event: Event) => {
    const target = event.target as HTMLInputElement;
    const newValue = Number(target.value);
    dispatch("input", newValue);
  };
</script>

<div>
  <InputLabel {name}>{title}</InputLabel>
  <div
    class={clsx(
      "mt-1",
      "grid items-center gap-3",
      showPercentage ? "grid-cols-[1fr_32px]" : "grid-cols-[1fr_76px]"
    )}
  >
      <div class="relative flex items-center">
        <input
          type="range"
          {name}
          id={name}
        class={clsx(
          "z-20 block w-full border-fmd-gray rounded-md bg-transparent appearance-none my-2.5 w-full border-0",
          isDisabled ? "opacity-30" : ""
        )}
        bind:value
        disabled={isDisabled}
        {min}
        {max}
        {step}
        on:input={handleInput}
      />
      <div
        class="absolute left-0 h-1 bg-fmd-red z-10"
        style={`width: ${fillPercent}%`}
      />
      <div class="absolute left-0 h-1 w-full bg-fmd-red/20 dark:bg-fmd-white/30 z-0" />
    </div>
    {#if showPercentage}
      <div class="text-xs dark:text-white text-right">
        {fillPercent}%
      </div>
    {:else}
      <input
        type="number"
        class="h-8 w-[50px] rounded-md border border-slate-200 bg-white px-2 text-right text-xs text-slate-700 shadow-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
        {min}
        {max}
        {step}
        bind:value
        on:input={handleInput}
      />
    {/if}
  </div>
</div>

<style>
  input[type="range"]::-webkit-slider-thumb {
    border: 2px solid #f04d21;
    height: 14px;
    width: 14px;
    border-radius: 100%;
    background: #ffffff;
    cursor: pointer;
    -webkit-appearance: none;
  }

  input[type="range"]::-moz-range-thumb {
    border: 2px solid #f04d21;
    height: 10px;
    width: 10px;
    border-radius: 100%;
    background: #ffffff;
    cursor: pointer;
  }
</style>
