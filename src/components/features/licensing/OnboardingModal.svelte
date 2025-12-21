<script lang="ts">
  import { fade, scale, fly } from "svelte/transition";
  import { hasSeenOnboarding, licenseStore } from "../../../lib/stores/license";
  import { backOut } from "svelte/easing";
  import logo from "../../../assets/logo.svg";

  const features = [
    {
      id: "capture",
      title: "Pro Capture",
      desc: "Record up to 4K resolution at 60fps with zero lag.",
      color: "text-emerald-600 dark:text-emerald-400",
    },
    {
      id: "style",
      title: "Signature Style",
      desc: "Customize themes, backgrounds, and camera overlays.",
      color: "text-indigo-600 dark:text-indigo-400",
    },
    {
      id: "editor",
      title: "Powerful Editor",
      desc: "Precision trimming and advanced multi-track timeline.",
      color: "text-rose-600 dark:text-rose-400",
    },
    {
      id: "zoom",
      title: "Smart Auto-Zoom",
      desc: "Follow your click events with smooth, automated zooms.",
      color: "text-sky-600 dark:text-sky-400",
    },
  ];

  let showInfo = false;
  let showLicenseInput = false;
  let licenseKeyInput = "";
  let isActivating = false;
  let activationError = "";

  const start = () => {
    hasSeenOnboarding.complete();
  };

  const handleActivate = async () => {
    if (!licenseKeyInput.trim()) return;
    isActivating = true;
    activationError = "";
    const result = await licenseStore.activateWithPolar(licenseKeyInput.trim());
    isActivating = false;
    if (result.success) {
      start();
    } else {
      activationError = result.error || "Failed to activate";
    }
  };

  const openGitHub = (e: MouseEvent) => {
    e.preventDefault();
    if (window.electronAPI?.openExternal) {
      window.electronAPI.openExternal(
        "https://github.com/erkamkavak/screen-recorder"
      );
    }
  };
</script>

<div
  class="fixed inset-0 z-[300] flex items-center justify-center p-6 backdrop-blur-xl"
  transition:fade={{ duration: 300 }}
>
  <div class="absolute inset-0 bg-slate-900/60" />

  <div
    class="relative w-full max-w-2xl overflow-hidden rounded-[3rem] bg-white shadow-2xl dark:bg-slate-900"
    transition:scale={{ duration: 500, start: 0.9, easing: backOut }}
  >
    <!-- Background Decor -->
    <div
      class="absolute -right-20 -top-20 h-80 w-80 rounded-full bg-emerald-500/10 blur-[80px]"
    />
    <div
      class="absolute -left-20 -bottom-20 h-80 w-80 rounded-full bg-orange-500/10 blur-[80px]"
    />

    <div
      class="relative flex flex-col items-center p-10 text-center md:px-14 md:py-12"
    >
      <div
        class="mb-4 flex h-24 w-24 items-center justify-center"
        transition:fly={{ y: 20, duration: 800, delay: 200 }}
      >
        <img src={logo} alt="Clip Flow Logo" class="h-20 w-20" />
      </div>

      <h1
        class="text-2xl font-black tracking-tight text-slate-900 dark:text-white md:text-3xl"
      >
        Welcome to <span
          class="bg-gradient-to-r from-emerald-600 to-teal-600 bg-clip-text text-transparent"
          >Clip Flow</span
        >
      </h1>
      <p
        class="mt-2 text-base font-medium text-slate-500 dark:text-slate-400 text-pretty"
      >
        Professional screen recording, simplified for everyone.
      </p>

      <div class="mt-8 grid w-full gap-5 text-left sm:grid-cols-2">
        {#each features as feature, i}
          <div
            class="group flex gap-4 rounded-3xl border border-slate-100 bg-slate-50/50 p-5 transition-all hover:border-slate-200 hover:bg-white dark:border-slate-800 dark:bg-slate-800/50 dark:hover:border-slate-700 dark:hover:bg-slate-800"
            transition:fly={{ y: 20, duration: 600, delay: 400 + i * 100 }}
          >
            <div
              class="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white shadow-sm ring-1 ring-slate-100 transition-all group-hover:scale-110 dark:bg-slate-800 dark:ring-slate-700"
            >
              {#if feature.id === "capture"}
                <svg
                  viewBox="0 0 24 24"
                  width="22"
                  height="22"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="1.8"
                  class={feature.color}
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"
                  />
                </svg>
              {:else if feature.id === "style"}
                <svg
                  viewBox="0 0 24 24"
                  width="22"
                  height="22"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="1.8"
                  class={feature.color}
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01"
                  />
                </svg>
              {:else if feature.id === "editor"}
                <svg
                  viewBox="0 0 256 256"
                  width="22"
                  height="22"
                  fill="currentColor"
                  class={feature.color}
                >
                  <path
                    d="M157.73193,113.13086a8.00047,8.00047,0,0,1,2.085-11.12012l67.66553-46.29785A8.00013,8.00013,0,0,1,236.51758,68.918l-67.66553,46.29785a7.99794,7.99794,0,0,1-11.12012-2.085Zm80.87061,85.07129a7.99794,7.99794,0,0,1-11.12012,2.085l-91.4826-62.59351L93.49408,166.77686a36.034,36.034,0,1,1-9.05035-13.19458l37.38867-25.582-37.3891-25.582a35.84637,35.84637,0,1,1,9.0506-13.19458L236.51758,187.082A8.00047,8.00047,0,0,1,238.60254,198.20215ZM80,180a20,20,0,1,0-5.85791,14.1416A19.86692,19.86692,0,0,0,80,180ZM74.14209,90.1416a20,20,0,1,0-28.28418,0A19.86692,19.86692,0,0,0,74.14209,90.1416Z"
                  />
                </svg>
              {:else if feature.id === "zoom"}
                <svg
                  viewBox="0 0 24 24"
                  width="22"
                  height="22"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="1.8"
                  class={feature.color}
                >
                  <circle
                    cx="11"
                    cy="11"
                    r="8"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                  />
                  <path
                    d="M21 21l-4.35-4.35"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                  />
                  <path
                    d="M11 8v6M8 11h6"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                  />
                </svg>
              {/if}
            </div>
            <div>
              <h3 class="font-bold text-slate-900 dark:text-white">
                {feature.title}
              </h3>
              <p
                class="text-xs font-medium leading-relaxed text-slate-500 dark:text-slate-400"
              >
                {feature.desc}
              </p>
            </div>
          </div>
        {/each}
      </div>

      <button
        on:click={start}
        class="group relative mt-12 w-full overflow-hidden rounded-2xl bg-slate-900 py-4 font-black text-white transition-all hover:scale-[1.02] hover:bg-slate-800 active:scale-[0.98] dark:bg-white dark:text-slate-900 dark:hover:bg-slate-100"
        transition:fly={{ y: 20, duration: 600, delay: 1000 }}
      >
        <div class="relative z-10 flex items-center justify-center gap-3">
          <span>Get Started</span>
          <svg
            viewBox="0 0 24 24"
            width="20"
            height="20"
            fill="none"
            stroke="currentColor"
            stroke-width="3"
            class="transition-transform group-hover:translate-x-1"
          >
            <path d="M5 12h14M12 5l7 7-7 7" />
          </svg>
        </div>
      </button>

      <div class="mt-8 flex flex-col items-center gap-2 w-full">
        <p class="text-xs font-bold uppercase tracking-[0.2em] text-slate-400">
          No subscription. One-time payment. Lifetime updates.
        </p>
        <p
          class="text-[10px] font-black uppercase tracking-[0.1em] text-emerald-600 dark:text-emerald-500"
        >
          Your first video export is free
        </p>

        <div class="flex flex-col items-center gap-3 mt-4 w-full">
          {#if !showLicenseInput}
            <button
              on:click={() => (showLicenseInput = true)}
              class="text-xs font-bold text-emerald-600 hover:text-emerald-700 uppercase tracking-wider"
            >
              Have a license? Activate here
            </button>
          {:else}
            <div
              class="w-full max-w-sm space-y-3"
              transition:scale={{ duration: 200, start: 0.98 }}
            >
              <div class="relative">
                <input
                  type="text"
                  bind:value={licenseKeyInput}
                  placeholder="Enter License Key"
                  class="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-xs font-medium focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                />
                {#if isActivating}
                  <div
                    class="absolute right-3 top-2.5 h-4 w-4 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent"
                  />
                {/if}
              </div>

              {#if activationError}
                <p class="text-[10px] font-bold text-rose-500">
                  {activationError}
                </p>
              {/if}

              <div class="flex gap-2">
                <button
                  on:click={handleActivate}
                  disabled={isActivating || !licenseKeyInput.trim()}
                  class="flex-1 rounded-xl bg-emerald-600 py-2 text-xs font-bold text-white transition-all hover:bg-emerald-700 disabled:opacity-50"
                >
                  Activate
                </button>
                <button
                  on:click={() => (showLicenseInput = false)}
                  class="rounded-xl border border-slate-200 px-4 py-2 text-xs font-bold text-slate-500 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800"
                >
                  Cancel
                </button>
              </div>
            </div>
          {/if}

          <button
            class="flex items-center gap-2 rounded-full px-4 py-2 text-xs font-bold uppercase tracking-wider text-slate-400 hover:bg-slate-100 hover:text-emerald-600 transition-all dark:hover:bg-slate-800"
            on:click={() => (showInfo = !showInfo)}
          >
            <svg
              viewBox="0 0 24 24"
              width="18"
              height="18"
              fill="none"
              stroke="currentColor"
              stroke-width="2.5"
            >
              <circle cx="12" cy="12" r="10" />
              <path d="M12 17v-4" stroke-linecap="round" />
              <path d="M12 8v1" stroke-linecap="round" />
            </svg>
            Why not free?
          </button>
        </div>

        {#if showInfo}
          <div
            class="mt-4 max-w-md rounded-2xl bg-slate-50 p-5 text-left text-xs leading-relaxed text-slate-600 dark:bg-slate-800/50 dark:text-slate-400"
            transition:fade
          >
            <p>
              Clip Flow is an open-source project. While the source code is
              free, this one-time purchase helps support development and covers
              mandatory licensing fees for distribution on Windows and macOS.
            </p>
            <p class="mt-3">
              Anyone can install and use the open-source version for free:
              <a
                href="https://github.com/erkamkavak/screen-recorder"
                class="font-bold text-emerald-600 hover:underline"
                on:click={openGitHub}
              >
                github.com/erkamkavak/screen-recorder
              </a>
            </p>
          </div>
        {/if}
      </div>
    </div>
  </div>
</div>
