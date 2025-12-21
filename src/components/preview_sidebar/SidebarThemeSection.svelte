<script lang="ts">
  import SidebarSection from "./SidebarSection.svelte";
  import { slide, fade } from "svelte/transition";
  import { activeTheme, customTheme, themes } from "../../lib/stores";
  import type { Theme } from "../../lib/stores";
  import {
    activeBackground,
    backgrounds,
    customBackgroundImage,
    generalLayoutState,
  } from "../../lib/stores";
  import RangeInput from "../ui/RangeInput.svelte";
  import ColorInput from "../ui/ColorInput.svelte";
  import PaletteIcon from "../icons/palette.icon.svelte";
  import GradientArrowIcon from "../icons/gradientArrow.icon.svelte";
  import ImageIcon from "../icons/image.icon.svelte";

  $: themeOptions = [
    ...themes.map((theme) => ({
      title: theme.title,
      value: theme,
      primaryColor: theme.primary,
      secondaryColor: theme.secondary,
      accentColor: theme.accent,
    })),
    {
      title: "Custom",
      value: $customTheme,
      primaryColor: $customTheme.primary,
      secondaryColor: $customTheme.secondary,
      accentColor: $customTheme.accent,
      isCustom: true,
    },
  ];

  const handleThemeChange = (selected: Theme) => {
    if (selected.title === "customTheme" || selected === $customTheme) {
      $activeTheme = $customTheme;
    } else {
      $activeTheme = selected;
    }
  };

  $: isCustomActive =
    $activeTheme === $customTheme || $activeTheme.title === "customTheme";

  const handleBackgroundChange = (bg: (typeof backgrounds)[number]) => {
    $activeBackground = bg;
  };

  // Categorize backgrounds
  $: audioBackgrounds = backgrounds.filter((bg) => bg.category === "Audio");
  $: gradientBackgrounds = backgrounds.filter(
    (bg) => bg.category === "Gradient"
  );
  $: solidBackgrounds = backgrounds.filter((bg) => bg.category === "Solid");

  const imageBackground = backgrounds.find((bg) => bg.category === "Image");
  const fallbackBackground =
    backgrounds.find((bg) => bg.category !== "Image") ?? backgrounds[0];

  let imageInput: HTMLInputElement | null = null;
  $: backgroundImageLabel = $customBackgroundImage?.name ?? "No file selected";

  const handleBackgroundImageUpload = (event: Event) => {
    const target = event.currentTarget as HTMLInputElement;
    const file = target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        customBackgroundImage.set({
          src: reader.result,
          name: file.name,
        });
      }
    };
    reader.readAsDataURL(file);
    target.value = "";
  };

  const clearCustomBackgroundImage = () => {
    customBackgroundImage.set(null);
    if (imageInput) {
      imageInput.value = "";
    }
  };

  $: if (
    $customBackgroundImage &&
    imageBackground &&
    $activeBackground !== imageBackground
  ) {
    $activeBackground = imageBackground;
  }

  $: if (
    !$customBackgroundImage &&
    imageBackground &&
    $activeBackground === imageBackground &&
    fallbackBackground
  ) {
    $activeBackground = fallbackBackground;
  }
</script>

<SidebarSection title="Appearance">
  <svelte:fragment slot="icon">
    <div class="h-4 w-4">
      <PaletteIcon />
    </div>
  </svelte:fragment>
  <div class="grid gap-6">
    <div class="flex flex-col gap-3">
      <span
        class="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500"
      >
        Color Theme
      </span>
      <div class="grid grid-cols-5 gap-2">
        {#each themeOptions as option}
          {@const isActive =
            $activeTheme.title === option.value.title ||
            (option.title === "Custom" && isCustomActive)}
          <button
            type="button"
            class="group relative aspect-square rounded-lg border p-1 transition-all hover:scale-105 active:scale-95 {isActive
              ? 'border-blue-500 bg-blue-50/50 shadow-sm dark:border-blue-400 dark:bg-blue-900/20'
              : 'border-slate-200 bg-white hover:border-slate-300 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-slate-700'}"
            on:click={() => handleThemeChange(option.value)}
            title={option.title}
          >
            <div
              class="h-full w-full rounded-md shadow-inner"
              style={`background: linear-gradient(135deg, ${option.primaryColor}, ${option.secondaryColor});`}
            >
              <div
                class="absolute bottom-[4px] right-[4px] h-2 w-2 rounded-full border border-white shadow-sm dark:border-slate-900"
                style={`background: ${option.accentColor};`}
              />
            </div>

            {#if option.title === "Custom"}
              <div
                class="absolute -top-1.5 -right-1 flex items-center justify-center rounded-full bg-blue-500 px-1 py-0.5 text-[7px] font-bold text-white shadow-sm transition-transform group-hover:scale-110"
              >
                CUSTOM
              </div>
            {/if}
          </button>
        {/each}
      </div>
    </div>

    {#if isCustomActive}
      <div
        class="rounded-xl border border-slate-200/60 bg-slate-50/50 p-3 dark:border-slate-700/50 dark:bg-slate-800/30"
        transition:slide={{ duration: 200 }}
      >
        <p
          class="mb-2.5 text-[9px] font-bold uppercase tracking-wider text-slate-400"
        >
          Edit Palette
        </p>
        <div class="grid grid-cols-3 gap-2">
          <div class="flex flex-col gap-1">
            <span
              class="text-[8px] font-bold text-slate-500 dark:text-slate-400"
              >PRIMARY</span
            >
            <ColorInput title="" bind:value={$customTheme.primary} />
          </div>
          <div class="flex flex-col gap-1">
            <span
              class="text-[8px] font-bold text-slate-500 dark:text-slate-400"
              >SECONDARY</span
            >
            <ColorInput
              title=""
              bind:value={$customTheme.secondary}
              rightAlignPopup={true}
            />
          </div>
          <div class="flex flex-col gap-1">
            <span
              class="text-[8px] font-bold text-slate-500 dark:text-slate-400"
              >ACCENT</span
            >
            <ColorInput
              title=""
              bind:value={$customTheme.accent}
              rightAlignPopup={true}
            />
          </div>
        </div>
      </div>
    {:else}
      <div
        class="flex items-center justify-between rounded-xl border border-slate-200/80 bg-white/70 px-4 py-2.5 shadow-sm dark:border-slate-700/70 dark:bg-slate-900/60"
      >
        <div class="min-w-0">
          <p
            class="truncate text-xs font-semibold text-slate-700 dark:text-slate-200"
          >
            {$activeTheme.title}
          </p>
          <p class="truncate text-[9px] text-slate-500 dark:text-slate-400">
            {$activeTheme.primary} • {$activeTheme.secondary}
          </p>
        </div>
        <div class="flex items-center gap-1.5">
          <div
            class="h-7 w-7 rounded-md shadow-inner"
            style={`background: linear-gradient(135deg, ${$activeTheme.primary}, ${$activeTheme.secondary});`}
          />
          <div
            class="h-7 w-7 rounded-md border border-slate-200/80 shadow-inner dark:border-slate-700/70"
            style={`background: ${$activeTheme.accent};`}
          />
        </div>
      </div>
    {/if}

    <RangeInput
      name="padding"
      title="Padding"
      value={$generalLayoutState.padding}
      min={0}
      max={0.4}
      step={0.004}
      on:input={(event) =>
        generalLayoutState.update((state) => ({
          ...state,
          padding: event.detail,
        }))}
    />
  </div>
</SidebarSection>

<SidebarSection title="Background Style">
  <svelte:fragment slot="icon">
    <div class="h-4 w-4 text-slate-400">
      <GradientArrowIcon />
    </div>
  </svelte:fragment>

  <div class="flex flex-col gap-5">
    <!-- Audio Options -->
    <div class="flex flex-col gap-2">
      <div class="flex items-center justify-between">
        <span
          class="text-[9px] font-bold uppercase tracking-wider text-slate-400"
          >Audio Visualizer</span
        >
      </div>
      <div class="grid grid-cols-5 gap-1.5">
        {#each audioBackgrounds as bg}
          <button
            type="button"
            class="flex h-8 items-center justify-center rounded-lg border text-[10px] font-medium transition-all {$activeBackground.title ===
            bg.title
              ? 'border-blue-500 bg-blue-50 text-blue-600 dark:border-blue-400 dark:bg-blue-900/30 dark:text-blue-400'
              : 'border-slate-200 bg-white text-slate-500 hover:border-slate-300 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400 dark:hover:border-slate-700'}"
            on:click={() => handleBackgroundChange(bg)}
            title={bg.ariaLabel}
          >
            {bg.title}
          </button>
        {/each}
      </div>
    </div>

    <!-- Gradient Options -->
    <div class="flex flex-col gap-2">
      <span class="text-[9px] font-bold uppercase tracking-wider text-slate-400"
        >Gradients</span
      >
      <div class="grid grid-cols-5 gap-1.5">
        {#each gradientBackgrounds as bg}
          <button
            type="button"
            class="flex h-8 items-center justify-center rounded-lg border text-base transition-all {$activeBackground.title ===
            bg.title
              ? 'border-blue-500 bg-blue-50 text-blue-600 dark:border-blue-400 dark:bg-blue-900/30 dark:text-blue-400'
              : 'border-slate-200 bg-white text-slate-500 hover:border-slate-300 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400 dark:hover:border-slate-700'}"
            on:click={() => handleBackgroundChange(bg)}
            title={bg.ariaLabel}
          >
            {bg.title}
          </button>
        {/each}
      </div>
    </div>

    <!-- Solid Options -->
    <div class="flex flex-col gap-2">
      <span class="text-[9px] font-bold uppercase tracking-wider text-slate-400"
        >Solid Colors</span
      >
      <div class="grid grid-cols-2 gap-1.5">
        {#each solidBackgrounds as bg}
          <button
            type="button"
            class="flex h-8 items-center justify-center rounded-lg border px-3 text-[10px] font-medium transition-all {$activeBackground.title ===
            bg.title
              ? 'border-blue-500 bg-blue-50 text-blue-600 dark:border-blue-400 dark:bg-blue-900/30 dark:text-blue-400'
              : 'border-slate-200 bg-white text-slate-500 hover:border-slate-300 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400 dark:hover:border-slate-700'}"
            on:click={() => handleBackgroundChange(bg)}
            title={bg.ariaLabel}
          >
            {bg.title}
          </button>
        {/each}
      </div>
    </div>
  </div>
</SidebarSection>

<SidebarSection title="Background image">
  <svelte:fragment slot="icon">
    <div class="h-4 w-4 text-slate-400">
      <ImageIcon />
    </div>
  </svelte:fragment>
  <div class="grid gap-4">
    <div class="flex flex-col gap-3">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <label
          class="group inline-flex cursor-pointer items-center gap-2 rounded-xl border border-slate-200/80 bg-white/80 px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-white dark:border-slate-700/70 dark:bg-slate-900/60 dark:text-slate-200"
        >
          <span>Choose image...</span>
          <input
            type="file"
            accept="image/*"
            bind:this={imageInput}
            class="sr-only"
            on:change={handleBackgroundImageUpload}
          />
        </label>

        {#if $customBackgroundImage}
          <button
            class="text-xs font-medium text-rose-500 hover:text-rose-600 dark:text-rose-400"
            type="button"
            on:click={clearCustomBackgroundImage}
          >
            Remove
          </button>
        {/if}
      </div>

      <p class="text-[10px] text-slate-400 dark:text-slate-500">
        PNG or JPG files will be used as the canvas background.
      </p>
    </div>

    {#if $customBackgroundImage}
      <div
        class="group relative overflow-hidden rounded-xl border border-slate-200/80 bg-white/80 p-1 shadow-sm dark:border-slate-700/70 dark:bg-slate-900/60"
        transition:fade
      >
        <img
          src={$customBackgroundImage.src}
          alt={$customBackgroundImage.name ?? "Custom background preview"}
          class="h-28 w-full rounded-lg object-cover"
          loading="lazy"
        />
        <div
          class="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent p-2 opacity-0 transition-opacity group-hover:opacity-100"
        >
          <p class="truncate text-[10px] font-medium text-white">
            {$customBackgroundImage.name || "Custom background"}
          </p>
        </div>
      </div>
    {:else}
      <div
        class="flex h-28 flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-200 bg-slate-50/50 dark:border-slate-800 dark:bg-slate-900/30"
      >
        <div class="mb-1.5 h-6 w-6 text-slate-300">
          <ImageIcon />
        </div>
        <p class="text-[10px] text-slate-400">No custom image</p>
      </div>
    {/if}
  </div>
</SidebarSection>
