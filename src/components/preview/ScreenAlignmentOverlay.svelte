<script lang="ts">
  import type { Writable } from "svelte/store";
  import Select from "../ui/Select.svelte";
  import {
    horizScreenAlignOptionsWithLabels,
    vertScreenAlignOptionsWithLabels,
  } from "./constants";
  import type { Share, WebcamLayoutState } from "../../stores";

  export let activeShare: Share | undefined;
  export let screenLayoutState: Writable<WebcamLayoutState>;
  export let canvasWidth: number;
  export let canvasHeight: number;
  export let screenFocused = false;
  export let onFocus: (event: FocusEvent) => void;
  export let onMouseOver: (event: MouseEvent) => void;
  export let onMouseLeave: () => void;
  export let attachOverlay: (node: HTMLDivElement | null) => void;
  export let onPointerEvent: (event: MouseEvent | PointerEvent) => void;

  let overlay: HTMLDivElement | null = null;

  const getAlignmentCssValue = (alignment: string) => {
    switch (alignment) {
      case "left":
      case "top":
        return "flex-start";
      case "center":
        return "center";
      default:
        return "flex-end";
    }
  };

  let lastOverlay: HTMLDivElement | null = null;

  $: if (overlay !== lastOverlay) {
    lastOverlay = overlay;
    attachOverlay(overlay);
  }

  $: displayAspectRatio = activeShare?.width
    ? activeShare.height / activeShare.width
    : 1;

  $: isScreenLandscape =
    displayAspectRatio * canvasWidth <= canvasHeight;

  $: screenStyles = `
    width: ${
      isScreenLandscape
        ? 100
        : (canvasHeight / (displayAspectRatio * canvasWidth)) * 100
    }%;
    height: ${
      isScreenLandscape
        ? ((displayAspectRatio * canvasWidth) / canvasHeight) * 100
        : 100
    }%;
    ${
      isScreenLandscape
        ? `align-self: ${getAlignmentCssValue($screenLayoutState.vertAlign)};`
        : `justify-self: ${getAlignmentCssValue($screenLayoutState.horizAlign)};`
    }
  `;
</script>

{#if activeShare?.width}
  <div class="absolute top-0 left-0 w-full h-full grid">
    <div
      bind:this={overlay}
      class="flex items-center justify-center transition transition-bg border-2 border-transparent {screenFocused
        ? 'bg-fmd-black/50 border-fmd-red'
        : ''}"
      style={screenStyles}
      tabindex="0"
      role="button"
      on:focus={onFocus}
      on:mouseover={onMouseOver}
      on:mouseleave={onMouseLeave}
      on:pointerdown|capture={onPointerEvent}
      on:pointerup|capture={onPointerEvent}
      on:pointermove|capture={onPointerEvent}
    >
      {#if screenFocused}
        <div class={isScreenLandscape ? "w-11" : "w-24"}>
          {#if isScreenLandscape}
            <Select
              title=""
              name="screenAlign"
              isVertical
              options={vertScreenAlignOptionsWithLabels}
              bind:value={$screenLayoutState.vertAlign}
            />
          {:else}
            <Select
              title=""
              name="screenAlign"
              options={horizScreenAlignOptionsWithLabels}
              bind:value={$screenLayoutState.horizAlign}
            />
          {/if}
        </div>
      {/if}
    </div>
  </div>
{/if}
