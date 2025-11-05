<script lang="ts">
  import Preview from "./components/Preview.svelte";
  import {
    appView,
    canvasStream,
    inputEvents,
    isRecording,
    lastRecording,
    micState,
    recordingStartTime,
  } from "./stores";
  import ActionBar from "./components/ActionBar.svelte";
  import ReviewView from "./components/ReviewView.svelte";
  import RecorderSidebar from "./components/RecorderSidebar.svelte";
  import { patchBlob } from "./utils/blobHelpers";
  import { getPreferredMimeType } from "./utils/getPreferredMimeType";

  let recorder: MediaRecorder;
  const chunks: Blob[] = [];
  let ext: string = "";
  const onDataAvailable = (e: BlobEvent) => {
    chunks.push(e.data);
  };

  const onRecorderStop = async () => {
    const duration = performance.now() - $recordingStartTime;
    $recordingStartTime = null;

    const completeBlob = new Blob(chunks, { type: chunks[0].type });
    const newBlob = await patchBlob(completeBlob, duration);
    const videoUrl = URL.createObjectURL(newBlob);
    const fileName = `video.${ext}`;

    if ($lastRecording?.videoUrl) {
      try {
        URL.revokeObjectURL($lastRecording.videoUrl);
      } catch (err) {
        console.warn("Failed to revoke previous recording URL", err);
      }
    }

    $lastRecording = {
      videoUrl,
      events: $inputEvents,
      fileName,
    };

    $appView = "review";
  };

  const startRecording = () => {
    $recordingStartTime = performance.now();
    chunks.length = 0;

    $inputEvents = [];
    $appView = "recorder";

    const combinedStream = new MediaStream([
      ...($canvasStream?.getTracks() || []),
      ...($micState.stream?.getTracks() || []),
    ]);
    // TODO: dynamic bits per second based on resolution...
    const mime = getPreferredMimeType();
    ext = mime.ext;
    recorder = new MediaRecorder(combinedStream, {
      audioBitsPerSecond: 128000, // 128 kbps
      videoBitsPerSecond: 10 * 1000 * 1000, // N mbps
      mimeType: mime.mimeType,
    });
    recorder.ondataavailable = onDataAvailable;
    recorder.onstop = onRecorderStop;

    recorder.start();
  };
  const stopRecording = () => {
    recorder.stop();
  };
  const onRecordButtonPress = () => {
    if ($isRecording) stopRecording();
    else startRecording();
  };
</script>

<div
  class="relative h-screen w-screen overflow-hidden bg-gradient-to-br from-slate-100 via-white to-slate-200 dark:from-slate-900 dark:via-slate-900 dark:to-slate-950"
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
    <div class="w-full h-full mr-0 ml-0 sm:ml-0 sm:mr-0">
      <ReviewView />
    </div>
  {/if}
</div>
