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
    class="modal-backdrop"
    transition:fade={{ duration: 200 }}
    on:click={close}
    on:keydown={(e) => e.key === "Escape" && close()}
    role="button"
    tabindex="-1"
    aria-label="Close modal"
  >
    <div
      class="back-modal-wrapper"
      transition:scale={{ duration: 200, start: 0.98 }}
      on:click|stopPropagation
      on:keydown|stopPropagation={() => {}}
    >
      <div class="back-modal-content">

      <div class="relative">
        {#if submitStatus === "success"}
          <div class="success-view" transition:fade>
            <div class="success-icon-bg">
              <svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="currentColor" stroke-width="3" class="text-emerald-500">
                <path d="M20 6L9 17l-5-5" stroke-linecap="round" stroke-linejoin="round" />
              </svg>
            </div>
            <h3>Thank you!</h3>
            <p>Your feedback helps us make Clip Flow better.</p>
          </div>
        {:else}
          <div class="modal-header">
            <h2 class="modal-title-premium">SEND FEEDBACK</h2>
            <button on:click={close} class="close-btn-premium">
              <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.5">
                <path d="M18 6L6 18M6 6l12 12" stroke-linecap="round" stroke-linejoin="round" />
              </svg>
            </button>
          </div>

          <div class="form-container">
            <div class="field-item">
              <span class="field-label-premium">Feedback Type</span>
              <div class="type-grid">
                {#each feedbackTypes as type}
                  <button
                    type="button"
                    class="type-btn"
                    class:selected={feedbackType === type.value}
                    on:click={() => (feedbackType = type.value)}
                  >
                    <span class="type-icon">{type.icon}</span>
                    <span class="type-label">{type.label}</span>
                  </button>
                {/each}
              </div>
            </div>

            <div class="field-item">
              <label for="feedback-message" class="field-label-premium">
                Your Message <span class="required">*</span>
              </label>
              <textarea
                id="feedback-message"
                bind:value={message}
                placeholder="Tell us what's on your mind..."
                rows="4"
                class="premium-textarea"
              ></textarea>
            </div>

            <div class="field-item">
              <label for="feedback-email" class="field-label-premium">
                Email Address <span class="optional">(optional)</span>
              </label>
              <input
                id="feedback-email"
                type="email"
                bind:value={email}
                placeholder="your@email.com"
                class="premium-input"
              />
              <p class="field-hint">Only if you'd like us to follow up</p>
            </div>

            {#if submitStatus === "error"}
              <div class="error-badge">
                {errorMessage}
              </div>
            {/if}

            <button
              on:click={handleSubmit}
              disabled={isSubmitting || !message.trim()}
              class="primary-action-btn"
            >
              {#if isSubmitting}
                <div class="loading-ring-btn"></div>
                <span>Sending Feedback...</span>
              {:else}
                <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.5">
                  <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" stroke-linecap="round" stroke-linejoin="round" />
                </svg>
                <span>SEND FEEDBACK</span>
              {/if}
            </button>
          </div>
        {/if}
      </div>
      </div>
    </div>
  </div>
{/if}
<style>
  .modal-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(15, 23, 42, 0.4);
    backdrop-filter: blur(8px);
    z-index: 1000;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 1.5rem;
  }

  .back-modal-wrapper {
    width: 100%;
    max-width: 480px;
    z-index: 1001;
  }

  .back-modal-content {
    background: #ffffff;
    border-radius: 28px;
    padding: 2.5rem;
    box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25), 0 0 0 1px rgba(0, 0, 0, 0.05);
    position: relative;
    overflow: hidden;
  }

  .modal-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: 2rem;
  }

  .modal-title-premium {
    font-size: 0.8125rem;
    font-weight: 800;
    color: #475569;
    letter-spacing: 0.1em;
    margin: 0;
  }

  .close-btn-premium {
    padding: 0.5rem;
    background: #f1f5f9;
    border: none;
    border-radius: 10px;
    color: #94a3b8;
    cursor: pointer;
    transition: all 0.2s;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .close-btn-premium:hover {
    background: #e2e8f0;
    color: #475569;
  }

  .form-container {
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
  }

  .field-item {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .field-label-premium {
    font-size: 0.75rem;
    font-weight: 700;
    color: #64748b;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .required {
    color: #ef4444;
  }

  .optional {
    color: #94a3b8;
    font-weight: 400;
    text-transform: lowercase;
  }

  .type-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 0.75rem;
  }

  .type-btn {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.25rem;
    padding: 0.75rem 0.5rem;
    background: #f8fafc;
    border: 2px solid #f1f5f9;
    border-radius: 16px;
    cursor: pointer;
    transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  }

  .type-btn:hover {
    border-color: #e2e8f0;
    background: #f1f5f9;
  }

  .type-btn.selected {
    background: #f0f7ff;
    border-color: #3b82f6;
    box-shadow: 0 4px 12px rgba(59, 130, 246, 0.1);
  }

  .type-icon {
    font-size: 1.25rem;
  }

  .type-label {
    font-size: 0.75rem;
    font-weight: 700;
    color: #64748b;
  }

  .type-btn.selected .type-label {
    color: #1d4ed8;
  }

  .premium-textarea, .premium-input {
    width: 100%;
    padding: 1rem 1.25rem;
    background: #f8fafc;
    border: 1.5px solid #e2e8f0;
    border-radius: 16px;
    font-size: 0.9375rem;
    color: #1e293b;
    transition: all 0.2s;
    outline: none;
  }

  .premium-textarea {
    resize: none;
    min-height: 120px;
  }

  .premium-textarea:focus, .premium-input:focus {
    background: #ffffff;
    border-color: #3b82f6;
    box-shadow: 0 0 0 4px rgba(59, 130, 246, 0.06);
  }

  .field-hint {
    font-size: 0.75rem;
    color: #94a3b8;
    margin: 0;
  }

  .error-badge {
    padding: 0.875rem 1rem;
    background: #fef2f2;
    border: 1px solid #fee2e2;
    border-radius: 12px;
    color: #ef4444;
    font-size: 0.8125rem;
    font-weight: 600;
  }

  .primary-action-btn {
    width: 100%;
    height: 3.5rem;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.75rem;
    padding: 0 1.5rem;
    background: #0f172a;
    color: #ffffff;
    border: none;
    border-radius: 16px;
    font-size: 0.9375rem;
    font-weight: 700;
    cursor: pointer;
    transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
    box-shadow: 0 4px 12px rgba(15, 23, 42, 0.15);
    margin-top: 0.5rem;
  }

  .primary-action-btn:hover:not(:disabled) {
    background: #1e293b;
    transform: translateY(-1px);
    box-shadow: 0 8px 16px -4px rgba(0, 0, 0, 0.2);
  }

  .primary-action-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
    background: #94a3b8;
    box-shadow: none;
  }

  .success-view {
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
    padding: 2rem 0;
  }

  .success-icon-bg {
    width: 80px;
    height: 80px;
    background: #f0fdf4;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    margin-bottom: 1.5rem;
  }

  .success-view h3 {
    font-size: 1.5rem;
    font-weight: 800;
    color: #0f172a;
    margin: 0 0 0.5rem 0;
  }

  .success-view p {
    font-size: 0.9375rem;
    color: #64748b;
    margin: 0;
  }

  .loading-ring-btn {
    width: 20px;
    height: 20px;
    border: 2.5px solid rgba(255, 255, 255, 0.2);
    border-top-color: #ffffff;
    border-radius: 50%;
    animation: ring-spin 0.8s linear infinite;
  }

  @keyframes ring-spin {
    to { transform: rotate(360deg); }
  }
</style>
