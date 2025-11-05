<script lang="ts">
  import { createEventDispatcher, onMount } from "svelte";

  export let canvasWidth: number;
  export let canvasHeight: number;

  const dispatch = createEventDispatcher<{
    dimensions: { width: number; height: number; scale: number };
  }>();

  let wrapper: HTMLDivElement;
  let containerWidth = 0;
  let containerHeight = 0;
  let scale = 1;

  const measure = () => {
    if (!wrapper || !canvasWidth || !canvasHeight) return;

    const { width, height } = wrapper.getBoundingClientRect();
    if ((canvasHeight / canvasWidth) * width > height) {
      containerHeight = height;
      containerWidth = height / (canvasHeight / canvasWidth);
    } else {
      containerWidth = width;
      containerHeight = width * (canvasHeight / canvasWidth);
    }

    scale = containerWidth / canvasWidth;
    dispatch("dimensions", {
      width: containerWidth,
      height: containerHeight,
      scale,
    });
  };

  onMount(() => {
    measure();
  });

  $: if (wrapper && canvasWidth && canvasHeight) {
    measure();
  }
</script>

<svelte:window on:resize={measure} />

<div class="flex h-full w-full items-center justify-center" bind:this={wrapper}>
  <div
    class="relative overflow-hidden rounded-3xl"
    style="aspect-ratio: {canvasWidth}/{canvasHeight}; width: {containerWidth}px; height: {containerHeight}px"
  >
    <slot {containerWidth} {containerHeight} {scale}></slot>
  </div>
</div>
