<script lang="ts">
  import clsx from "clsx";
  import SidebarSection from "./SidebarSection.svelte";
  import DropdownSelect from "../ui/DropdownSelect.svelte";
  import {
    canvasDimensions,
    canvasSizes,
    isRecording,
    recordingFPS,
    recordingFPSOptions,
    showFloatingControls,
  } from "../../lib/stores";
  import Toggle from "../ui/Toggle.svelte";

  const handleCanvasSizeChange = (
    event: CustomEvent<{ value: (typeof canvasSizes)[number] }>
  ) => {
    canvasDimensions.set(event.detail.value);
  };

  const handleFpsChange = (event: CustomEvent<{ value: number }>) => {
    recordingFPS.set(event.detail.value);
  };
</script>

<SidebarSection title="Capture Settings">
  <div class="grid gap-4">
    <div class="grid gap-3 sm:grid-cols-2">
      <DropdownSelect
        title="Canvas Size"
        name="canvasSize"
        options={canvasSizes.map((size) => ({
          title: size.title,
          value: size,
          description: `${size.width}×${size.height}`,
        }))}
        value={$canvasDimensions}
        on:select={handleCanvasSizeChange}
        isDisabled={$isRecording}
      />

      <DropdownSelect
        title="Recording FPS"
        name="recordingFPS"
        options={recordingFPSOptions.map((fps) => ({
          title: `${fps} fps`,
          value: fps,
          description:
            fps === 30 ? "Smooth" : fps === 60 ? "Ultra smooth" : undefined,
        }))}
        value={$recordingFPS}
        on:select={handleFpsChange}
        isDisabled={$isRecording}
      />
    </div>

    <div
      class="flex items-center justify-between rounded-xl border border-slate-200/60 bg-white/40 p-3.5 shadow-sm dark:border-slate-800/60 dark:bg-slate-900/40"
    >
      <div class="grid gap-0.5">
        <span class="text-xs font-semibold text-slate-700 dark:text-slate-200"
          >Floating Controls</span
        >
        <span class="text-[10px] text-slate-500 dark:text-slate-400"
          >Show a draggable mini-recorder outside the app</span
        >
      </div>
      <Toggle
        checked={$showFloatingControls}
        on:change={(e) => showFloatingControls.set(e.detail.checked)}
      />
    </div>

    <p
      class={clsx(
        "rounded-lg bg-slate-100/60 px-4 py-3 text-xs text-slate-500 shadow-sm dark:bg-slate-800/50 dark:text-slate-300",
        $isRecording && "opacity-70"
      )}
    >
      Adjust capture resolution and frame rate here. Once you start recording,
      these options lock in.
    </p>
  </div>
</SidebarSection>
