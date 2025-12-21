<script lang="ts">
  import { createEventDispatcher } from "svelte";
  import { licenseStore } from "../../../lib/stores/license";
  import { fade, scale } from "svelte/transition";

  const dispatch = createEventDispatcher();

  export let show = false;
  let showInfo = false;

  const close = () => {
    dispatch("close");
    showInfo = false;
  };

  const subscribe = () => {
    // In a real app, this would redirect to Stripe/Lemon Squeezy/Polar
    licenseStore.activatePro("DEMO-KEY-123");
    close();
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
    class="fixed inset-0 z-[200] flex items-center justify-center p-4 backdrop-blur-md transition-all"
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
            class="mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-50 shadow-lg shadow-emerald-500/10 dark:bg-emerald-500/10"
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
            You've used your free export. Upgrade for unlimited usage.
          </p>

          <div
            class="mt-10 w-full rounded-3xl border border-slate-100 bg-slate-50/50 p-8 dark:border-slate-800 dark:bg-slate-800/50"
          >
            <div class="flex items-baseline justify-center gap-1">
              <span class="text-4xl font-black text-slate-900 dark:text-white"
                >$29</span
              >
              <span class="text-slate-400 font-medium text-sm">one-time</span>
            </div>

            <ul class="mt-8 space-y-4 text-left">
              {#each ["Unlimited 4K Recordings", "Custom Brand Watermarks", "Advanced Timeline Editing", "Export to All Formats", "Priority Support"] as feature}
                <li
                  class="flex items-center gap-3 text-slate-600 dark:text-slate-300"
                >
                  <div
                    class="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-500/20"
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
                <span>Unlock Everything</span>
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

          <div class="mt-8 flex flex-col items-center gap-4">
            <button
              on:click={() => {
                const key = prompt("Enter your license key:");
                if (key) licenseStore.activatePro(key);
              }}
              class="text-sm font-bold text-emerald-600 hover:text-emerald-700"
            >
              Already have a license?
            </button>

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
                  <path d="M12 16v-4" stroke-linecap="round" />
                  <path d="M12 8h.01" stroke-linecap="round" />
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
