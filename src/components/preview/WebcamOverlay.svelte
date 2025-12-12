<script lang="ts">
  import type { Writable } from "svelte/store";
  import { WebcamShape, activeSidebarTab, isRecording, type WebcamLayoutState, type WebcamState } from "../../lib/stores";
  import { calculateWebcamMetrics } from "../../lib/canvas/webcamMetrics";

  export let webcamLayoutState: Writable<WebcamLayoutState>;
  export let webcamState: WebcamState;
  export let containerWidth: number;
  export let containerHeight: number;

  let dragContext:
    | {
        pointerId: number;
        startX: number;
        startY: number;
        padding: number;
        availableWidth: number;
        availableHeight: number;
        offsetX: number;
        offsetY: number;
      }
    | null = null;

  const updateOffsets = (x: number, y: number) => {
    webcamLayoutState.update((layout) => ({
      ...layout,
      offsetX: Math.min(Math.max(x, 0), 1),
      offsetY: Math.min(Math.max(y, 0), 1),
      position: "custom",
    }));
  };

  $: showPaddingIndicator = $activeSidebarTab === "webcam" && !$isRecording;

  const handlePointerDown = (event: PointerEvent) => {
    event.preventDefault();
    $activeSidebarTab = "webcam";
    const metrics = currentMetrics;
    dragContext = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      padding: metrics.padding,
      availableWidth: metrics.availableWidth,
      availableHeight: metrics.availableHeight,
      offsetX: layout.offsetX ?? 0.5,
      offsetY: layout.offsetY ?? 0.5,
    };
    const target = event.currentTarget as Element | null;
    target?.setPointerCapture?.(event.pointerId);
  };

  const handlePointerMove = (event: PointerEvent) => {
    if (!dragContext) return;
    const deltaX = event.clientX - dragContext.startX;
    const deltaY = event.clientY - dragContext.startY;

    const availableWidthPx = dragContext.availableWidth;
    const availableHeightPx = dragContext.availableHeight;

    const newLeft = dragContext.padding + dragContext.offsetX * availableWidthPx + deltaX;
    const newTop = dragContext.padding + dragContext.offsetY * availableHeightPx + deltaY;

    const clampedLeft = Math.min(
      Math.max(newLeft, dragContext.padding),
      dragContext.padding + availableWidthPx
    );
    const clampedTop = Math.min(
      Math.max(newTop, dragContext.padding),
      dragContext.padding + availableHeightPx
    );

    const newOffsetX =
      availableWidthPx > 0
        ? (clampedLeft - dragContext.padding) / availableWidthPx
        : 0;
    const newOffsetY =
      availableHeightPx > 0
        ? (clampedTop - dragContext.padding) / availableHeightPx
        : 0;

    updateOffsets(newOffsetX, newOffsetY);
  };

  const handlePointerUp = (event: PointerEvent) => {
    if (!dragContext) return;
    if (event.pointerId === dragContext.pointerId) {
      const target = event.currentTarget as Element | null;
      target?.releasePointerCapture?.(event.pointerId);
      dragContext = null;
    }
  };

  $: rawLayout = $webcamLayoutState;
  let videoEl: HTMLVideoElement;

  const ensureDefaults = (layout?: Partial<WebcamLayoutState>): WebcamLayoutState => ({
    shape: WebcamShape.circle,
    size: 0.28,
    borderRadius: 0.05,
    padding: 0.06,
    borderWidth: 0,
    borderColor: "#FFFFFF",
    shadowBlur: 18,
    shadowOpacity: 0.25,
    position: "bottom-right",
    offsetX: 1,
    offsetY: 1,
    ...layout,
  });

  $: layout = ensureDefaults(rawLayout);

  $: currentMetrics = calculateWebcamMetrics({
    layout,
    containerWidth,
    containerHeight,
    videoWidth: webcamState.width,
    videoHeight: webcamState.height,
  });

  $: borderWidth = layout?.borderWidth ?? 0;
  $: borderColor = layout?.borderColor ?? "#ffffff";
  $: shadowBlur = layout?.shadowBlur ?? 0;
  $: shadowOpacity = layout?.shadowOpacity ?? 0;

  $: boxShadow = shadowBlur > 0 && shadowOpacity > 0
    ? `0 ${Math.round(shadowBlur / 2)}px ${shadowBlur}px rgba(0,0,0,${shadowOpacity})`
    : "none";

  $: borderRadiusStyle = layout.shape === "circle"
    ? "50%"
    : `${currentMetrics.outerRadius}px`;

  $: {
    if (videoEl) {
      const mediaStream = webcamState.stream as MediaStream | null | undefined;
      if (mediaStream && videoEl.srcObject !== mediaStream) {
        videoEl.srcObject = mediaStream;
      } else if (!mediaStream && videoEl.srcObject) {
        videoEl.srcObject = null;
      }
    }
  }
</script>

{#if webcamState.stream && containerWidth && containerHeight}
  <div
    class="absolute"
    style={`top: ${currentMetrics.top}px; left: ${currentMetrics.left}px; width: ${currentMetrics.width}px; height: ${currentMetrics.height}px;`}
  >
    <div
      class="relative h-full w-full cursor-grab active:cursor-grabbing"
      style={`border-radius: ${borderRadiusStyle}; border: ${borderWidth}px solid ${borderColor}; box-shadow: ${boxShadow}; overflow: hidden;`}
      on:pointerdown={handlePointerDown}
      on:pointermove={handlePointerMove}
      on:pointerup={handlePointerUp}
      on:pointercancel={handlePointerUp}
    >
      <video
        class="pointer-events-none h-full w-full object-cover"
        autoplay
        muted
        playsinline
        bind:this={videoEl}
      />
      <div class="pointer-events-none absolute inset-0 rounded-inherit border border-white/10" />
    </div>
    {#if showPaddingIndicator}
      <div
        class={`pointer-events-none absolute z-20 mix-blend-difference ${layout.shape === 'circle' ? 'rounded-full' : 'rounded-inherit'} border-2 border-dashed border-white/70`}
        style={`
          top: -${currentMetrics.padding}px;
          left: -${currentMetrics.padding}px;
          width: ${currentMetrics.width + currentMetrics.padding * 2}px;
          height: ${currentMetrics.height + currentMetrics.padding * 2}px;
        `}
      />
    {/if}
  </div>
{/if}

<style>
  .rounded-inherit {
    border-radius: inherit;
  }
</style>
