<script lang="ts">
  import SidebarSection from "./SidebarSection.svelte";
  import DropdownSelect from "../ui/DropdownSelect.svelte";
  import RangeInput from "../ui/RangeInput.svelte";
  import ColorInput from "../ui/ColorInput.svelte";
  import {
    webcamLayoutState,
    webcamState,
    type WebcamLayoutState,
  } from "../../stores";
  import {
    sizeOptions,
    webcamShapeOptionsWithLabels,
  } from "../preview/constants";

  type Option<T> = { title: string; value: T };

  const shapeOptions: Option<WebcamLayoutState["shape"]>[] = webcamShapeOptionsWithLabels.map((option) => ({
    title: option.ariaLabel ?? option.title,
    value: option.value,
  }));

  const sizeSelectOptions: Option<number>[] = sizeOptions.map((option) => ({
    title: option.title,
    value: option.value,
  }));

  const positionGrid: WebcamLayoutState["position"][][] = [
    ["top-left", "top-center", "top-right"],
    ["left-center", "center", "right-center"].map((p) => (p as any)) && ["top-left", "center", "top-right"], // placeholder to preserve context, replaced below
  ];

  const updateLayout = (update: Partial<WebcamLayoutState>) => {
    webcamLayoutState.update((layout) => ({ ...layout, ...update }));
  };

  const handleShapeSelect = (
    event: CustomEvent<{ value: WebcamLayoutState["shape"] }>
  ) => {
    updateLayout({ shape: event.detail.value });
  };

  const handleSizeSelect = (event: CustomEvent<{ value: number }>) => {
    updateLayout({ size: Number(event.detail.value) });
  };

  const setPosition = (value: WebcamLayoutState["position"]) => {
    webcamLayoutState.update((layout) => {
      const next: WebcamLayoutState = { ...layout, position: value };
      switch (value) {
        case "top-left":
          next.offsetX = 0;
          next.offsetY = 0;
          break;
        case "top-center":
          next.offsetX = 0.5;
          next.offsetY = 0;
          break;
        case "top-right":
          next.offsetX = 1;
          next.offsetY = 0;
          break;
        case "center":
          next.offsetX = 0.5;
          next.offsetY = 0.5;
          break;
        case "bottom-left":
          next.offsetX = 0;
          next.offsetY = 1;
          break;
        case "bottom-center":
          next.offsetX = 0.5;
          next.offsetY = 1;
          break;
        case "bottom-right":
          next.offsetX = 1;
          next.offsetY = 1;
          break;
        case "left-center":
          next.offsetX = 0;
          next.offsetY = 0.5;
          break;
        case "right-center":
          next.offsetX = 1;
          next.offsetY = 0.5;
          break;
        default:
          break;
      }
      return next;
    });
  };

  $: layout = $webcamLayoutState;
  $: webcam = $webcamState;

  let borderColorValue = $webcamLayoutState.borderColor || "#FFFFFF";
  $: if (layout.borderColor !== borderColorValue) {
    updateLayout({ borderColor: borderColorValue });
  }
</script>

{#if webcam.stream}
  <SidebarSection title="Webcam">
    <div class="grid gap-6">
      <DropdownSelect
        title="Shape"
        name="webcam-shape"
        options={shapeOptions}
        value={layout.shape}
        on:select={handleShapeSelect}
      />

      <DropdownSelect
        title="Size"
        name="webcam-size"
        options={sizeSelectOptions}
        value={layout.size}
        on:select={handleSizeSelect}
      />

      {#if layout.shape === "rectangle"}
        <RangeInput
          name="webcamBorderRadius"
          title="Corner Radius"
          value={layout.borderRadius}
          min={0}
          max={5}
          step={0.1}
          on:input={(event) => updateLayout({ borderRadius: event.detail })}
          showPercentage={false}
        />
      {/if}

      <RangeInput
        name="webcamPadding"
        title="Edge Padding"
        value={layout.padding}
        min={0}
        max={0.25}
        step={0.01}
        on:input={(event) => updateLayout({ padding: event.detail })}
        showPercentage={false}
      />

      <div class="grid gap-3 sm:grid-cols-2">
        <RangeInput
          name="webcamBorderWidth"
          title="Border Width"
          value={layout.borderWidth}
          min={0}
          max={16}
          step={1}
          on:input={(event) => updateLayout({ borderWidth: event.detail })}
          showPercentage={false}
        />
        <ColorInput title="Border Color" bind:value={borderColorValue} />
      </div>

      <div class="grid gap-3 sm:grid-cols-2">
        <RangeInput
          name="webcamShadowBlur"
          title="Shadow Blur"
          value={layout.shadowBlur}
          min={0}
          max={60}
          step={1}
          on:input={(event) => updateLayout({ shadowBlur: event.detail })}
          showPercentage={false}
        />
        <RangeInput
          name="webcamShadowOpacity"
          title="Shadow Intensity"
          value={layout.shadowOpacity}
          min={0}
          max={1}
          step={0.05}
          on:input={(event) => updateLayout({ shadowOpacity: event.detail })}
          showPercentage={false}
        />
      </div>

      <div class="grid gap-3">
        <p class="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400 dark:text-slate-500">
          Position
        </p>
        <div class="grid grid-cols-3 gap-1.5">
          <!-- Top row -->
          <button type="button" class={`h-9 w-9 rounded-md border transition ${layout.position === 'top-left' ? 'border-slate-700/80 bg-slate-900/80' : 'border-slate-200/80 bg-gray-100 dark:border-slate-700/70 dark:bg-slate-900/60'}`} on:click={() => setPosition('top-left')} />
          <button type="button" class={`h-9 w-9 rounded-md border transition ${layout.position === 'top-center' ? 'border-slate-700/80 bg-slate-900/80' : 'border-slate-200/80 bg-gray-100 dark:border-slate-700/70 dark:bg-slate-900/60'}`} on:click={() => setPosition('top-center')} />
          <button type="button" class={`h-9 w-9 rounded-md border transition ${layout.position === 'top-right' ? 'border-slate-700/80 bg-slate-900/80' : 'border-slate-200/80 bg-gray-100 dark:border-slate-700/70 dark:bg-slate-900/60'}`} on:click={() => setPosition('top-right')} />
          <!-- Middle row -->
          <button type="button" class={`h-9 w-9 rounded-md border transition ${layout.position === 'left-center' ? 'border-slate-700/80 bg-slate-900/80' : 'border-slate-200/80 bg-gray-100 dark:border-slate-700/70 dark:bg-slate-900/60'}`} on:click={() => setPosition('left-center')} />
          <button type="button" class={`h-9 w-9 rounded-md border transition ${layout.position === 'center' ? 'border-slate-700/80 bg-slate-900/80' : 'border-slate-200/80 bg-gray-100 dark:border-slate-700/70 dark:bg-slate-900/60'}`} on:click={() => setPosition('center')} />
          <button type="button" class={`h-9 w-9 rounded-md border transition ${layout.position === 'right-center' ? 'border-slate-700/80 bg-slate-900/80' : 'border-slate-200/80 bg-gray-100 dark:border-slate-700/70 dark:bg-slate-900/60'}`} on:click={() => setPosition('right-center')} />
          <!-- Bottom row -->
          <button type="button" class={`h-9 w-9 rounded-md border transition ${layout.position === 'bottom-left' ? 'border-slate-700/80 bg-slate-900/80' : 'border-slate-200/80 bg-gray-100 dark:border-slate-700/70 dark:bg-slate-900/60'}`} on:click={() => setPosition('bottom-left')} />
          <button type="button" class={`h-9 w-9 rounded-md border transition ${layout.position === 'bottom-center' ? 'border-slate-700/80 bg-slate-900/80' : 'border-slate-200/80 bg-gray-100 dark:border-slate-700/70 dark:bg-slate-900/60'}`} on:click={() => setPosition('bottom-center')} />
          <button type="button" class={`h-9 w-9 rounded-md border transition ${layout.position === 'bottom-right' ? 'border-slate-700/80 bg-slate-900/80' : 'border-slate-200/80 bg-gray-100 dark:border-slate-700/70 dark:bg-slate-900/60'}`} on:click={() => setPosition('bottom-right')} />
        </div>
      </div>
    </div>
  </SidebarSection>
{/if}
