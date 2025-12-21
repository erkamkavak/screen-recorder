<script lang="ts">
  import { createEventDispatcher, getContext, onDestroy } from "svelte";
  import { fade } from "svelte/transition";
  import { clickOutside } from "../../lib/utils/clickOutside";
  import {
    sidebarSectionDropdownKey,
    type SidebarSectionDropdownContext,
  } from "../../lib/utils/sidebarSectionDropdownContext";

  export let name: string;
  export let title: string;
  export let options: Array<{
    title: string;
    value: unknown;
    description?: string;
    primaryColor?: string;
    secondaryColor?: string;
    accentColor?: string;
  }> = [];
  export let value: unknown;
  export let placeholder = "Select";
  export let isDisabled = false;

  const dispatch = createEventDispatcher<{
    select: { value: unknown };
  }>();
  const dropdownSectionContext = getContext<
    SidebarSectionDropdownContext | undefined
  >(sidebarSectionDropdownKey);
  let hasReportedOpenToSection = false;

  $: if (dropdownSectionContext) {
    if (isOpen && !hasReportedOpenToSection) {
      dropdownSectionContext.register();
      hasReportedOpenToSection = true;
    } else if (!isOpen && hasReportedOpenToSection) {
      dropdownSectionContext.unregister();
      hasReportedOpenToSection = false;
    }
  }

  onDestroy(() => {
    if (dropdownSectionContext && hasReportedOpenToSection) {
      dropdownSectionContext.unregister();
    }
  });

  let isOpen = false;
  let dropdownButton: HTMLButtonElement;
  const buttonId = `${(name || "dropdown")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")}-trigger`;

  $: selectedOption = options.find((option) => option.value === value);

  const toggle = () => {
    if (isDisabled) return;
    isOpen = !isOpen;
  };

  const close = () => {
    isOpen = false;
  };

  const selectOption = (option: {
    title: string;
    value: unknown;
    description?: string;
    primaryColor?: string;
    secondaryColor?: string;
    accentColor?: string;
  }) => {
    value = option.value;
    dispatch("select", { value });
    close();
  };

  const handleKeydown = (event: KeyboardEvent) => {
    if (event.key === "Escape") {
      close();
      dropdownButton?.focus();
    }
  };
</script>

<div class="flex flex-col gap-2">
  <label
    class="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400 dark:text-slate-500"
    for={buttonId}
  >
    {title}
  </label>
  <div class="relative" use:clickOutside on:outclick={close}>
    <button
      bind:this={dropdownButton}
      type="button"
      id={buttonId}
      class="flex w-full items-center justify-between rounded-lg border border-slate-200/80 bg-white/70 px-3 py-2 text-left text-sm font-medium text-slate-600 shadow-sm transition hover:border-slate-300 hover:bg-white hover:text-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-2 focus-visible:ring-offset-white disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700/70 dark:bg-slate-900/60 dark:text-slate-200 dark:hover:border-slate-600 dark:hover:bg-slate-900/40"
      on:click={toggle}
      disabled={isDisabled}
      aria-haspopup="listbox"
      aria-expanded={isOpen}
    >
      <span class="flex items-center gap-2">
        {#if selectedOption && (selectedOption.primaryColor || selectedOption.secondaryColor || selectedOption.accentColor)}
          <span
            class="h-4 w-4 rounded-md border border-slate-200/80 shadow-sm dark:border-slate-700/70"
            style={`background: ${
              selectedOption.primaryColor && selectedOption.secondaryColor
                ? `linear-gradient(135deg, ${selectedOption.primaryColor}, ${selectedOption.secondaryColor})`
                : selectedOption.primaryColor ||
                  selectedOption.secondaryColor ||
                  selectedOption.accentColor ||
                  "transparent"
            };`}
          />
        {/if}
        <span>{selectedOption ? selectedOption.title : placeholder}</span>
      </span>
      <svg
        class="h-4 w-4 text-slate-400"
        viewBox="0 0 20 20"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path
          d="M5 7.5 10 12.5 15 7.5"
          stroke="currentColor"
          stroke-width="1.5"
          stroke-linecap="round"
          stroke-linejoin="round"
        />
      </svg>
    </button>

    {#if isOpen}
      <div
        class="absolute z-[9999] mt-2 w-full overflow-hidden rounded-xl border border-slate-200/80 bg-white/95 shadow-2xl backdrop-blur-md dark:border-slate-700/70 dark:bg-slate-900/95"
        role="listbox"
        tabindex="-1"
        transition:fade={{ duration: 120 }}
        on:keydown={handleKeydown}
      >
        <ul
          class="max-h-56 overflow-y-auto py-2 text-sm text-slate-600 dark:text-slate-200"
        >
          {#each options as option (option.title)}
            <li>
              <button
                type="button"
                class="flex w-full items-center gap-2 px-3 py-2 text-left transition hover:bg-slate-100/80 hover:text-slate-900 dark:hover:bg-slate-800/70 dark:hover:text-slate-50"
                class:selected={option.value === value}
                on:click={() => selectOption(option)}
              >
                {#if option.primaryColor || option.secondaryColor || option.accentColor}
                  <span
                    class="h-5 w-5 flex-shrink-0 rounded-md border border-slate-200/80 shadow-sm dark:border-slate-700/70"
                    style={`background: ${
                      option.primaryColor && option.secondaryColor
                        ? `linear-gradient(135deg, ${option.primaryColor}, ${option.secondaryColor})`
                        : option.primaryColor ||
                          option.secondaryColor ||
                          option.accentColor ||
                          "transparent"
                    };`}
                  />
                {/if}
                <span class="flex min-w-0 flex-col gap-0.5">
                  <span class="truncate font-medium">{option.title}</span>
                  {#if option.description}
                    <span
                      class="truncate text-xs text-slate-400 dark:text-slate-500"
                      >{option.description}</span
                    >
                  {/if}
                </span>
              </button>
            </li>
          {/each}
        </ul>
      </div>
    {/if}
  </div>
</div>

<style>
  button.selected {
    background-color: rgba(244, 63, 94, 0.1);
    color: #dc2626;
  }
</style>
