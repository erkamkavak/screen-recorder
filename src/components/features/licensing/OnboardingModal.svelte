<script lang="ts">
  import { fade, scale, fly } from "svelte/transition";
  import { hasSeenOnboarding } from "../../../lib/stores/license";
  import { backOut } from "svelte/easing";
  import logo from "../../../assets/logo.svg";

  const features = [
    {
      id: "capture",
      title: "Pro Capture",
      desc: "Record up to 4K resolution at 60fps with zero lag.",
      bg: "bg-emerald-50 dark:bg-emerald-500/10",
      color: "text-emerald-600 dark:text-emerald-400",
    },
    {
      id: "style",
      title: "Signature Style",
      desc: "Customize themes, backgrounds, and camera overlays.",
      bg: "bg-indigo-50 dark:bg-indigo-500/10",
      color: "text-indigo-600 dark:text-indigo-400",
    },
    {
      id: "editor",
      title: "Powerful Editor",
      desc: "Precision trimming and advanced multi-track timeline.",
      bg: "bg-rose-50 dark:bg-rose-500/10",
      color: "text-rose-600 dark:text-rose-400",
    },
    {
      id: "zoom",
      title: "Smart Auto-Zoom",
      desc: "Follow your click events with smooth, automated zooms.",
      bg: "bg-sky-50 dark:bg-sky-500/10",
      color: "text-sky-600 dark:text-sky-400",
    },
  ];

  let showInfo = false;

  const start = () => {
    hasSeenOnboarding.complete();
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
              class={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl shadow-sm transition-all group-hover:scale-110 ${feature.bg}`}
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
                    d="M11 4a2 2 0 114 0v1a1 1 0 001 1h3a1 1 0 011 1v2a1 1 0 01-1 1h-1a2 2 0 100 4h1a1 1 0 011 1v2a1 1 0 01-1 1h-3a1 1 0 00-1 1v1a2 2 0 11-4 0v-1a1 1 0 00-1-1H7a1 1 0 01-1-1v-2a1 1 0 011-1h1a2 2 0 100-4H7a1 1 0 01-1-1V7a1 1 0 011-1h3a1 1 0 001-1V4z"
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

      <div class="mt-8 flex flex-col items-center gap-2">
        <p class="text-xs font-bold uppercase tracking-[0.2em] text-slate-400">
          No subscription. One-time payment. Lifetime updates.
        </p>
        <p
          class="text-[10px] font-black uppercase tracking-[0.1em] text-emerald-600 dark:text-emerald-500"
        >
          Your first video export is free
        </p>

        <button
          class="mt-2 flex items-center gap-2 rounded-full px-4 py-2 text-xs font-bold uppercase tracking-wider text-slate-400 hover:bg-slate-100 hover:text-emerald-600 transition-all dark:hover:bg-slate-800"
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
            <path d="M12 16v-4" stroke-linecap="round" />
            <path d="M12 8h.01" stroke-linecap="round" />
          </svg>
          Why not free?
        </button>

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
