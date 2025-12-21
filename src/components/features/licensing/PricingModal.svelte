<script lang="ts">
  import { createEventDispatcher } from "svelte";
  import { licenseStore } from "../../../lib/stores/license";
  import { fade, scale, fly } from "svelte/transition";

  const dispatch = createEventDispatcher();

  export let show = false;
  let showInfo = false;
  let licenseKeyInput = "";
  let isActivating = false;
  let activationError = "";
  let showLicenseInput = false;

  const close = () => {
    dispatch("close");
    showInfo = false;
    activationError = "";
    showLicenseInput = false;
  };

  const CHECKOUT_URL = import.meta.env.VITE_POLAR_CHECKOUT_URL;

  const subscribe = () => {
    const api = window.electronAPI;
    if (api && typeof api.openExternal === "function") {
      api.openExternal(CHECKOUT_URL);
      showLicenseInput = true;
    } else {
      console.error("electronAPI.openExternal is not available");
    }
  };

  const handleActivate = async () => {
    if (!licenseKeyInput.trim()) return;

    isActivating = true;
    activationError = "";

    const result = await licenseStore.activateWithPolar(licenseKeyInput.trim());

    isActivating = false;
    if (result.success) {
      close();
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

{#if show}
  <div
    class="fixed inset-0 z-[400] flex items-center justify-center p-4 backdrop-blur-md transition-all"
    transition:fade={{ duration: 200 }}
  >
    <div
      class="absolute inset-0 bg-slate-900/40"
      on:click={close}
      on:keydown={(e) => e.key === "Escape" && close()}
      role="button"
      tabindex="-1"
      aria-label="Close modal"
    />

    <div
      class="relative w-full max-w-lg overflow-hidden rounded-[2.5rem] bg-white shadow-2xl dark:bg-slate-900"
      transition:scale={{ duration: 300, start: 0.95 }}
    >
      <!-- Decorative background elements -->
      <div
        class="absolute -right-20 -top-20 h-64 w-64 rounded-full bg-emerald-500/10 blur-3xl"
      />
      <div
        class="absolute -left-20 -bottom-20 h-64 w-64 rounded-full bg-orange-500/10 blur-3xl"
      />

      <div class="relative p-8 md:p-12">
        <div class="flex flex-col items-center text-center">
          <div
            class="mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-white shadow-lg ring-1 ring-slate-100 dark:bg-slate-800 dark:ring-slate-700"
          >
            <svg
              viewBox="0 0 24 24"
              width="32"
              height="32"
              fill="none"
              stroke="currentColor"
              stroke-width="1.8"
              class="text-emerald-600 dark:text-emerald-400"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                d="M13 10V3L4 14h7v7l9-11h-7z"
              />
            </svg>
          </div>

          <h2
            class="text-3xl font-black tracking-tight text-slate-900 dark:text-white"
          >
            Upgrade to Pro
          </h2>
          <p
            class="mt-4 text-base font-medium text-slate-500 dark:text-slate-400"
          >
            Unlock all features and lifetime updates for professional recording.
          </p>

          <div
            class="mt-10 w-full rounded-3xl border border-slate-100 bg-slate-50/50 p-8 dark:border-slate-800 dark:bg-slate-800/50"
          >
            <div class="flex items-baseline justify-center gap-1">
              <span class="text-4xl font-black text-slate-900 dark:text-white"
                >$15</span
              >
              <span class="text-slate-400 font-medium text-sm">one-time</span>
            </div>

            <ul class="mt-8 space-y-4 text-left">
              {#each ["Full Lifetime Access & All Features", "Unlimited 4K Exports & High-Res Projects", "Priority Lifetime Support & Updates"] as feature}
                <li
                  class="flex items-center gap-3 text-slate-600 dark:text-slate-300"
                >
                  <div
                    class="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white shadow-sm ring-1 ring-slate-100 dark:bg-slate-700 dark:ring-slate-600"
                  >
                    <svg
                      viewBox="0 0 24 24"
                      width="10"
                      height="10"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="4"
                      class="text-emerald-600 dark:text-emerald-400"
                    >
                      <path
                        d="M20 6L9 17l-5-5"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                      />
                    </svg>
                  </div>
                  <span class="text-sm font-medium">{feature}</span>
                </li>
              {/each}
            </ul>

            <button
              class="group relative mt-10 w-full overflow-hidden rounded-2xl bg-slate-900 py-4 font-bold text-white transition-all hover:scale-[1.02] hover:bg-slate-800 active:scale-[0.98] dark:bg-white dark:text-slate-900 dark:hover:bg-slate-100"
              on:click={subscribe}
            >
              <div class="relative z-10 flex items-center justify-center gap-2">
                <span>Get Pro Now</span>
                <svg
                  viewBox="0 0 24 24"
                  width="18"
                  height="18"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="3"
                  class="transition-transform group-hover:translate-x-1"
                >
                  <path
                    d="M5 12h14M12 5l7 7-7 7"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                  />
                </svg>
              </div>
            </button>

            <p
              class="mt-4 text-center text-[10px] font-bold uppercase tracking-wider text-slate-400"
            >
              Secure payment via Polar.sh
            </p>
          </div>

          <div class="mt-8 flex flex-col items-center w-full gap-4">
            {#if !showLicenseInput}
              <button
                on:click={() => (showLicenseInput = true)}
                class="text-sm font-bold text-emerald-600 hover:text-emerald-700 transition-colors"
                transition:fade
              >
                Already have a license?
              </button>
            {:else}
              <div
                class="w-full space-y-3"
                transition:fly={{ y: 10, duration: 300 }}
              >
                <div class="relative">
                  <input
                    type="text"
                    bind:value={licenseKeyInput}
                    placeholder="POLAR-1234-..."
                    class="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-medium focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                  />
                  {#if isActivating}
                    <div
                      class="absolute right-3 top-3 h-5 w-5 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent"
                    />
                  {/if}
                </div>

                {#if activationError}
                  <p class="text-xs font-bold text-rose-500">
                    {activationError}
                  </p>
                {/if}

                <div class="flex gap-2">
                  <button
                    on:click={handleActivate}
                    disabled={isActivating || !licenseKeyInput.trim()}
                    class="flex-1 rounded-xl bg-emerald-600 py-3 text-sm font-bold text-white transition-all hover:bg-emerald-700 disabled:opacity-50"
                  >
                    Activate
                  </button>
                  <button
                    on:click={() => (showLicenseInput = false)}
                    class="rounded-xl border border-slate-200 px-4 py-3 text-sm font-bold text-slate-500 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            {/if}

            <button
              on:click={close}
              class="text-sm font-semibold text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
            >
              Maybe later
            </button>

            <div class="mt-2 flex flex-col items-center gap-2">
              <button
                class="flex items-center gap-2 rounded-full px-4 py-1.5 text-xs font-bold uppercase tracking-wider text-slate-400 hover:bg-slate-100 hover:text-emerald-600 transition-all dark:hover:bg-slate-800"
                on:click={() => (showInfo = !showInfo)}
              >
                <svg
                  viewBox="0 0 24 24"
                  width="16"
                  height="16"
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

              {#if showInfo}
                <div
                  class="mt-4 rounded-2xl bg-slate-50 p-4 text-left text-xs leading-relaxed text-slate-600 dark:bg-slate-800/50 dark:text-slate-400"
                  transition:fade
                >
                  <p>
                    Clip Flow is open-source. This purchase helps support
                    development and covers mandatory licensing fees for Windows
                    and macOS distribution.
                  </p>
                  <p class="mt-2 text-[11px]">
                    Anyone can build from source for free:
                    <a
                      href="https://github.com/erkamkavak/screen-recorder"
                      class="font-bold text-emerald-600 hover:underline"
                      on:click={openGitHub}
                    >
                      GitHub Repo
                    </a>
                  </p>
                </div>
              {/if}
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
{/if}
