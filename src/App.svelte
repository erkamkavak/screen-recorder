<script lang="ts">
  import Preview from "./components/Preview.svelte";
  import { appView, isRecording } from "./stores";
  import ActionBar from "./components/ActionBar.svelte";
  import ReviewView from "./components/ReviewView.svelte";
  import RecorderSidebar from "./components/RecorderSidebar.svelte";
  import { startRecording, stopRecording } from "./recording/recordingController";

  const onRecordButtonPress = () => {
    if ($isRecording) {
      void stopRecording();
    } else {
      void startRecording();
    }
  };

  // Cleanup on component destroy
</script>

<div
  class="relative h-screen w-screen bg-gradient-to-br from-slate-100 via-white to-slate-200 dark:from-slate-900 dark:via-slate-900 dark:to-slate-950"
  class:overflow-hidden={$appView === 'recorder'}
  class:overflow-auto={$appView !== 'recorder'}
>
  {#if $appView === "recorder"}
    <div class="grid h-full w-full grid-rows-[minmax(0,1fr)_auto] gap-5 px-4 py-5 lg:grid-cols-[minmax(0,1fr)_26rem] lg:grid-rows-1 lg:gap-8 lg:px-8">
      <div class="flex min-w-0 flex-col gap-4">
        <div class="relative flex-1 overflow-hidden rounded-3xl shadow-xl backdrop-blur-sm">
          <Preview />
        </div>
        <div class="rounded-3xl border border-slate-200/80 bg-white/80 shadow-lg backdrop-blur-md dark:border-slate-800/80 dark:bg-slate-900/70">
          <ActionBar on:record={onRecordButtonPress} />
        </div>
      </div>
      <RecorderSidebar />
    </div>
  {:else}
    <div class="w-full min-h-screen mr-0 ml-0 sm:ml-0 sm:mr-0">
      <ReviewView />
    </div>
  {/if}
</div>
