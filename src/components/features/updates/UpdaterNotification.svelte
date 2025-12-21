<script lang="ts">
  import { onMount } from "svelte";

  let updateInfo: any = null;
  let status: "idle" | "available" | "downloading" | "downloaded" = "idle";
  let progress: {
    percent: number;
    bytesPerSecond: number;
    total: number;
    transferred: number;
  } | null = null;

  onMount(() => {
    const unsubAvailable = window.electronAPI.on("update:available", (info) => {
      updateInfo = info;
      status = "available";
    });

    const unsubProgress = window.electronAPI.on("update:progress", (p) => {
      progress = p;
      status = "downloading";
    });

    const unsubDownloaded = window.electronAPI.on(
      "update:downloaded",
      (info) => {
        updateInfo = info;
        status = "downloaded";
      }
    );

    return () => {
      unsubAvailable();
      unsubProgress();
      unsubDownloaded();
    };
  });

  const installUpdate = () => {
    window.electronAPI.send("update:install");
  };

  const close = () => {
    status = "idle";
  };
</script>

{#if status !== "idle"}
  <div
    class="fixed bottom-6 right-6 z-[200] flex w-80 flex-col overflow-hidden rounded-2xl border border-indigo-100 bg-white shadow-2xl transition-all duration-300 dark:border-indigo-900 dark:bg-slate-800"
  >
    <div
      class="flex items-center justify-between border-b border-indigo-50 bg-indigo-50/50 px-4 py-3 dark:border-indigo-950 dark:bg-indigo-950/20"
    >
      <div class="flex items-center gap-2">
        <div class="flex h-2 w-2 rounded-full bg-indigo-500 animate-pulse" />
        <span
          class="text-xs font-bold uppercase tracking-wider text-indigo-700 dark:text-indigo-300"
        >
          App Update
        </span>
      </div>
      <button
        on:click={close}
        class="text-indigo-400 hover:text-indigo-600 dark:hover:text-indigo-200"
      >
        <svg
          viewBox="0 0 24 24"
          width="16"
          height="16"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
        >
          <path d="M18 6L6 18M6 6l12 12" />
        </svg>
      </button>
    </div>

    <div class="p-4">
      {#if status === "available"}
        <p class="text-sm font-medium text-slate-700 dark:text-slate-200">
          A new version ({updateInfo?.version}) is available.
        </p>
      {:else if status === "downloading"}
        <div class="space-y-3">
          <div class="flex items-center justify-between">
            <p class="text-sm font-medium text-slate-700 dark:text-slate-200">
              Downloading...
            </p>
            <span
              class="text-xs font-bold text-indigo-600 dark:text-indigo-400"
            >
              {Math.round(progress?.percent || 0)}%
            </span>
          </div>
          <div
            class="h-2 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-700"
          >
            <div
              class="h-full bg-indigo-600 transition-all duration-300 ease-out"
              style="width: {progress?.percent || 0}%"
            />
          </div>
          <p class="text-[10px] text-slate-500 dark:text-slate-400">
            {((progress?.bytesPerSecond || 0) / 1024 / 1024).toFixed(2)} MB/s
          </p>
        </div>
      {:else if status === "downloaded"}
        <p class="text-sm font-medium text-slate-700 dark:text-slate-200">
          Update ({updateInfo?.version}) is ready!
        </p>
        <button
          on:click={installUpdate}
          class="mt-4 w-full rounded-xl bg-indigo-600 px-4 py-2 text-sm font-bold text-white shadow-lg shadow-indigo-200 hover:bg-indigo-700 active:scale-95 transition-all dark:shadow-none"
        >
          Restart & Update Now
        </button>
      {/if}
    </div>
  </div>
{/if}
