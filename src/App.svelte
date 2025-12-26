<script lang="ts">
  import Preview from "./components/Preview.svelte";
  import {
    appView,
    isRecording,
    currentProject,
    lastRecording,
    showFloatingControls,
    recordingStartTime,
  } from "./lib/stores";

  import { onMount } from "svelte";

  import ActionBar from "./components/ActionBar.svelte";
  import ReviewView from "./components/ReviewView.svelte";
  import RecorderSidebar from "./components/RecorderSidebar.svelte";
  import ProjectsList from "./components/features/projects/ProjectsList.svelte";
  import NotesOverlay from "./components/features/notes/NotesOverlay.svelte";
  import OnboardingModal from "./components/features/licensing/OnboardingModal.svelte";
  import {
    hasSeenOnboarding,
    licenseStore,
    isPaywallEnabled,
  } from "./lib/stores/license";
  import PricingModal from "./components/features/licensing/PricingModal.svelte";
  import FeedbackModal from "./components/features/feedback/FeedbackModal.svelte";
  import UpdaterNotification from "./components/features/updates/UpdaterNotification.svelte";
  import {
    createRecordingController,
    type RecordingController,
  } from "./lib/recording/recordingController";
  import * as stores from "./lib/stores";
  import { backendAPI } from "./lib/backend/backendAPI";
  import { patchBlob } from "./lib/utils/blobHelpers";
  import { getPreferredMimeType } from "./lib/utils/getPreferredMimeType";
  import logo from "./assets/logo.svg";

  const recordingController: RecordingController = createRecordingController({
    stores: {
      appView: stores.appView,
      inputEvents: stores.inputEvents,
      lastRecording: stores.lastRecording,
      currentProject: stores.currentProject,
      recordingFPS: stores.recordingFPS,
      recordingStartTime: stores.recordingStartTime,
      displayStream: stores.displayStream,
      webcamState: stores.webcamState,
      micState: stores.micState,
      activeShare: stores.activeShare,
    },
    backendAPI,
    patchBlob,
    getPreferredMimeType,
  });

  const onRecordButtonPress = () => {
    if ($isRecording) {
      void recordingController.stopRecording();
    } else {
      void recordingController.startRecording();
    }
  };

  let showRecorderProjects = false;
  const toggleRecorderProjects = () => {
    showRecorderProjects = !showRecorderProjects;
  };
  $: $appView; // reactive dependency to trigger when appView changes
  $: if ($appView !== "recorder") {
    showRecorderProjects = false;
  }

  const closeRecorderProjects = () => {
    showRecorderProjects = false;
  };

  let showPricingModal = false;
  const togglePricing = () => (showPricingModal = !showPricingModal);

  let showFeedbackModal = false;

  onMount(() => {
    // Check license validity on startup
    void licenseStore.verify();

    // Dev utilities
    if (import.meta.env.DEV) {
      (window as any).clearOnboarding = () => hasSeenOnboarding.reset();
      (window as any).clearActivation = () => licenseStore.reset();
      console.log(
        "🛠️ Dev Mode: Use clearOnboarding() and clearActivation() in console to reset state."
      );
    }

    const unsubStart = window.electronAPI.on("recording:start-request", () => {
      if (!$isRecording) void recordingController.startRecording();
    });
    const unsubStop = window.electronAPI.on("recording:stop-request", () => {
      if ($isRecording) void recordingController.stopRecording();
    });
    const unsubHidden = window.electronAPI.on("recorder:overlay-hidden", () => {
      showFloatingControls.set(false);
    });

    return () => {
      unsubStart();
      unsubStop();
      unsubHidden();
    };
  });

  $: {
    if ($showFloatingControls) {
      window.electronAPI.showRecorderOverlay();
    } else {
      window.electronAPI.hideRecorderOverlay();
    }
  }

  $: {
    const elapsed = $recordingStartTime
      ? performance.now() - $recordingStartTime
      : 0;
    window.electronAPI.syncRecorderState({
      isRecording: $isRecording,
      startTime: $isRecording ? Date.now() - elapsed : null,
    });
  }

  // Cleanup on component destroy
</script>

<div
  class="relative h-screen w-screen bg-gradient-to-br from-slate-100 via-white to-slate-200 dark:from-slate-900 dark:via-slate-900 dark:to-slate-950"
  class:overflow-hidden={$appView === "recorder"}
  class:overflow-auto={$appView !== "recorder"}
>
  {#if $appView === "recorder"}
    <div
      class="grid h-full w-full grid-rows-[minmax(0,1fr)_auto] gap-5 px-4 py-5 lg:grid-cols-[minmax(0,1fr)_26rem] lg:grid-rows-1 lg:gap-8 lg:px-8"
    >
      <div class="flex min-w-0 flex-col gap-4">
        <div class="flex items-center justify-between px-1">
          <div class="flex items-center gap-3">
            <div class="flex items-center gap-2 mr-4">
              <img src={logo} alt="Clip Flow" class="h-8 w-8" />
              <span
                class="text-lg font-black tracking-tight text-slate-900 dark:text-white"
                >Clip Flow</span
              >
            </div>
            <h2
              class="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400 dark:text-slate-500 pt-1"
            >
              Live Preview
            </h2>
            {#if $currentProject}
              <div
                class="flex items-center gap-2 rounded-lg bg-indigo-50 px-2.5 py-1.5 border border-indigo-100 dark:bg-indigo-900/20 dark:border-indigo-800/50 group transition-all hover:bg-indigo-100 dark:hover:bg-indigo-900/30"
              >
                <div class="flex items-center gap-2">
                  <div
                    class="flex h-2 w-2 rounded-full bg-indigo-500 animate-pulse"
                  />
                  <span
                    class="text-[11px] font-bold uppercase tracking-tight text-indigo-700 dark:text-indigo-300"
                  >
                    Project: <span
                      class="text-indigo-900 dark:text-indigo-100 ml-0.5"
                      >{$currentProject.name || "Untitled"}</span
                    >
                  </span>
                </div>
                <button
                  class="ml-1 flex h-4 w-4 items-center justify-center rounded-md text-indigo-400 hover:bg-indigo-200 hover:text-indigo-600 dark:hover:bg-indigo-800 dark:hover:text-indigo-200 transition-colors"
                  on:click={() => {
                    currentProject.set(null);
                    lastRecording.set(null);
                  }}
                  title="Finish & Start New Project"
                >
                  <svg
                    viewBox="0 0 24 24"
                    width="12"
                    height="12"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="3"
                  >
                    <path d="M18 6L6 18M6 6l12 12" />
                  </svg>
                </button>
              </div>
            {/if}
          </div>
          <div class="flex items-center gap-3">
            {#if isPaywallEnabled && !$licenseStore.isPro}
              <button
                type="button"
                class="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-3 py-2 text-sm font-bold text-white shadow-lg shadow-emerald-600/20 transition hover:bg-emerald-500 hover:scale-[1.02] active:scale-[0.98]"
                on:click={togglePricing}
              >
                <svg
                  viewBox="0 0 24 24"
                  width="18"
                  height="18"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2.5"
                >
                  <path d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
                <span>Upgrade</span>
              </button>
            {/if}

            <button
              type="button"
              class="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white/90 px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm backdrop-blur transition hover:bg-white"
              on:click={() => (showFeedbackModal = true)}
            >
              <svg
                viewBox="0 0 24 24"
                width="18"
                height="18"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
              >
                <path
                  d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                />
              </svg>
              <span>Feedback</span>
            </button>

            <div class="relative">
              <button
                type="button"
                class={`inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white/90 px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm backdrop-blur transition hover:bg-white ${
                  showRecorderProjects ? "ring-2 ring-sky-300" : ""
                }`}
                on:click={toggleRecorderProjects}
              >
                <svg
                  viewBox="0 0 24 24"
                  width="18"
                  height="18"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                >
                  <path
                    d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"
                  />
                </svg>
                <span>Saved recordings</span>
              </button>

              {#if showRecorderProjects}
                <div
                  class="fixed inset-0 z-[99]"
                  on:click={closeRecorderProjects}
                />
                <div
                  class="absolute right-0 top-full mt-2 z-[100] w-[420px] max-w-[calc(100vw-2rem)] shadow-2xl"
                  on:click|stopPropagation
                >
                  <ProjectsList />
                </div>
              {/if}
            </div>
          </div>
        </div>

        <div
          class="relative flex-1 overflow-hidden rounded-3xl shadow-xl backdrop-blur-sm"
        >
          <Preview />
        </div>
        <div
          class="rounded-3xl border border-slate-200/80 bg-white/80 shadow-lg backdrop-blur-md dark:border-slate-800/80 dark:bg-slate-900/70"
        >
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

  <NotesOverlay />
  <UpdaterNotification />

  {#if !$hasSeenOnboarding}
    <OnboardingModal />
  {/if}

  <PricingModal
    show={showPricingModal}
    on:close={() => (showPricingModal = false)}
  />

  <FeedbackModal
    show={showFeedbackModal}
    on:close={() => (showFeedbackModal = false)}
  />
</div>
