<script lang="ts">
  import { createEventDispatcher } from "svelte";
  import { fade, scale } from "svelte/transition";

  const dispatch = createEventDispatcher();

  export let show = false;

  let feedbackType: "bug" | "feature" | "general" = "general";
  let message = "";
  let email = "";
  let isSubmitting = false;
  let submitStatus: "idle" | "success" | "error" = "idle";
  let errorMessage = "";

  const FORMSPREE_ENDPOINT = import.meta.env.VITE_FORMSPREE_ENDPOINT || "";

  const close = () => {
    dispatch("close");
    // Reset after animation
    setTimeout(() => {
      message = "";
      email = "";
      feedbackType = "general";
      submitStatus = "idle";
      errorMessage = "";
    }, 200);
  };

  const handleSubmit = async () => {
    if (!message.trim()) return;

    if (!FORMSPREE_ENDPOINT) {
      errorMessage = "Feedback not configured. Please contact support.";
      submitStatus = "error";
      return;
    }

    isSubmitting = true;
    submitStatus = "idle";
    errorMessage = "";

    try {
      const formData = new FormData();
      formData.append("type", feedbackType);
      formData.append("message", message.trim());
      formData.append("email", email.trim() || "");
      formData.append("_subject", `[Clip Flow] ${feedbackType.charAt(0).toUpperCase() + feedbackType.slice(1)} Feedback`);

      const response = await fetch(FORMSPREE_ENDPOINT, {
        method: "POST",
        headers: {
          "Accept": "application/json",
        },
        body: formData,
      });

      if (response.ok) {
        submitStatus = "success";
        setTimeout(close, 2000);
      } else {
        const data = await response.json().catch(() => ({}));
        errorMessage = data.error || "Failed to submit feedback. Please try again.";
        submitStatus = "error";
      }
    } catch (err) {
      errorMessage = "Network error. Please check your connection.";
      submitStatus = "error";
    } finally {
      isSubmitting = false;
    }
  };

  const feedbackTypes = [
    { value: "bug", label: "Bug Report", icon: "🐛" },
    { value: "feature", label: "Feature Request", icon: "✨" },
    { value: "general", label: "General", icon: "💬" },
  ] as const;
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
      class="relative w-full max-w-md overflow-hidden rounded-3xl bg-white shadow-2xl dark:bg-slate-900"
      transition:scale={{ duration: 300, start: 0.95 }}
    >
      <div class="absolute -right-16 -top-16 h-48 w-48 rounded-full bg-indigo-500/10 blur-3xl" />
      <div class="absolute -left-16 -bottom-16 h-48 w-48 rounded-full bg-purple-500/10 blur-3xl" />

      <div class="relative p-6 md:p-8">
        {#if submitStatus === "success"}
          <div class="flex flex-col items-center py-8 text-center" transition:fade>
            <div class="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-900/30">
              <svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="currentColor" stroke-width="2.5" class="text-emerald-600 dark:text-emerald-400">
                <path d="M20 6L9 17l-5-5" stroke-linecap="round" stroke-linejoin="round" />
              </svg>
            </div>
            <h3 class="text-xl font-bold text-slate-900 dark:text-white">Thank you!</h3>
            <p class="mt-2 text-sm text-slate-500 dark:text-slate-400">Your feedback has been submitted.</p>
          </div>
        {:else}
          <div class="flex items-center justify-between mb-6">
            <h2 class="text-xl font-bold text-slate-900 dark:text-white">Send Feedback</h2>
            <button
              on:click={close}
              class="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-200"
            >
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.5">
                <path d="M18 6L6 18M6 6l12 12" stroke-linecap="round" stroke-linejoin="round" />
              </svg>
            </button>
          </div>

          <div class="space-y-5">
            <div>
              <span class="mb-2 block text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Type
              </span>
              <div class="grid grid-cols-3 gap-2">
                {#each feedbackTypes as type}
                  <button
                    type="button"
                    class={`flex flex-col items-center gap-1 rounded-xl border-2 px-3 py-3 text-sm font-medium transition-all ${
                      feedbackType === type.value
                        ? "border-indigo-500 bg-indigo-50 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300"
                        : "border-slate-200 text-slate-600 hover:border-slate-300 dark:border-slate-700 dark:text-slate-400 dark:hover:border-slate-600"
                    }`}
                    on:click={() => (feedbackType = type.value)}
                  >
                    <span class="text-lg">{type.icon}</span>
                    <span class="text-xs">{type.label}</span>
                  </button>
                {/each}
              </div>
            </div>

            <div>
              <label for="feedback-message" class="mb-2 block text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Message <span class="text-rose-500">*</span>
              </label>
              <textarea
                id="feedback-message"
                bind:value={message}
                placeholder="Tell us what's on your mind..."
                rows="4"
                class="w-full resize-none rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:placeholder-slate-500"
              />
            </div>

            <div>
              <label for="feedback-email" class="mb-2 block text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Email <span class="text-slate-400 font-normal">(optional)</span>
              </label>
              <input
                id="feedback-email"
                type="email"
                bind:value={email}
                placeholder="your@email.com"
                class="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:placeholder-slate-500"
              />
              <p class="mt-1.5 text-xs text-slate-400">Only if you'd like us to follow up</p>
            </div>

            {#if submitStatus === "error"}
              <div class="rounded-xl bg-rose-50 px-4 py-3 text-sm font-medium text-rose-600 dark:bg-rose-900/20 dark:text-rose-400">
                {errorMessage}
              </div>
            {/if}

            <button
              on:click={handleSubmit}
              disabled={isSubmitting || !message.trim()}
              class="w-full rounded-xl bg-indigo-600 py-3.5 font-bold text-white transition-all hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {#if isSubmitting}
                <div class="h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                <span>Sending...</span>
              {:else}
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.5">
                  <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" stroke-linecap="round" stroke-linejoin="round" />
                </svg>
                <span>Send Feedback</span>
              {/if}
            </button>
          </div>
        {/if}
      </div>
    </div>
  </div>
{/if}
