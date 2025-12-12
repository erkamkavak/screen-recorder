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
  } from "../../lib/stores";

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
          description: fps === 30 ? "Smooth" : fps === 60 ? "Ultra smooth" : undefined,
        }))}
        value={$recordingFPS}
        on:select={handleFpsChange}
        isDisabled={$isRecording}
      />
    </div>

    <p class={clsx("rounded-lg bg-slate-100/60 px-4 py-3 text-xs text-slate-500 shadow-sm dark:bg-slate-800/50 dark:text-slate-300", $isRecording && "opacity-70")}
    >Adjust capture resolution and frame rate here. Once you start recording, these options lock in.</p>
  </div>
</SidebarSection>
