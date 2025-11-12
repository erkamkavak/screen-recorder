<script lang="ts">
  import SidebarSection from "./SidebarSection.svelte";
  import { slide } from "svelte/transition";
  import { activeTheme, customTheme, themes } from "../../stores";
  import type { Theme } from "../../stores";
  import DropdownSelect from "../ui/DropdownSelect.svelte";
  import {
    activeBackground,
    backgrounds,
    customBackgroundImage,
    generalLayoutState,
  } from "../../stores.js";
  import RangeInput from "../ui/RangeInput.svelte";
  import ColorInput from "../ui/ColorInput.svelte";
  import PaletteIcon from "../icons/palette.icon.svelte";
  import GradientArrowIcon from "../icons/gradientArrow.icon.svelte";

  $: themeOptions = [
    ...themes.map((theme) => ({
      title: theme.title,
      value: theme,
      description: `${theme.primary} → ${theme.secondary}`,
    })),
    {
      title: "Custom Theme",
      value: $customTheme,
      description: "Create your own palette",
    },
  ];

  const handleThemeChange = (event: CustomEvent<{ value: Theme }>) => {
    const selected = event.detail.value;
    if (selected === $customTheme) {
      $activeTheme = $customTheme;
    } else {
      $activeTheme = selected;
    }
  };

  $: isCustomActive = $activeTheme === $customTheme;

  const handleBackgroundChange = (event: CustomEvent<{ value: typeof backgrounds[number] }>) => {
    $activeBackground = event.detail.value;
  };

  const backgroundOptions = ["Audio", "Gradient", "Solid", "Image"];
  const imageBackground = backgrounds.find((bg) => bg.category === "Image");
  const fallbackBackground =
    backgrounds.find((bg) => bg.category !== "Image") ?? backgrounds[0];

  let imageInput: HTMLInputElement | null = null;

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
    <PaletteIcon />
  </svelte:fragment>
  <div class="grid gap-5">
    <DropdownSelect
      title="Color Theme"
      name="colorTheme"
      options={themeOptions}
      bind:value={$activeTheme}
      on:select={handleThemeChange}
    />

    <div class="flex items-center justify-between rounded-xl border border-slate-200/80 bg-white/70 px-4 py-3 shadow-sm dark:border-slate-700/70 dark:bg-slate-900/60">
      <div>
        <p class="text-sm font-semibold text-slate-700 dark:text-slate-200">
          {$activeTheme.title}
        </p>
        <p class="text-xs text-slate-500 dark:text-slate-400">
          Primary {$activeTheme.primary} • Secondary {$activeTheme.secondary}
        </p>
      </div>
      <div class="flex items-center gap-2">
        <div
          class="h-10 w-10 rounded-lg shadow-inner"
          style={`background: linear-gradient(135deg, ${$activeTheme.primary}, ${$activeTheme.secondary});`}
        />
        <div
          class="h-10 w-10 rounded-lg border border-slate-200/80 shadow-inner dark:border-slate-700/70"
          style={`background: ${$activeTheme.accent};`}
        />
      </div>
    </div>

    {#if isCustomActive}
      <div class="grid gap-4" transition:slide={{ duration: 150 }}>
        <div class="grid grid-cols-[1fr_1fr_auto] gap-3">
          <ColorInput
            title="Primary Color"
            bind:value={$customTheme.primary}
          />
          <ColorInput
            title="Secondary Color"
            bind:value={$customTheme.secondary}
            rightAlignPopup={true}
          />
          <ColorInput
            title="Accent"
            bind:value={$customTheme.accent}
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
    <GradientArrowIcon />
  </svelte:fragment>
  <div class="flex flex-col gap-6">
    {#each backgroundOptions as option}
      <DropdownSelect
        title={option}
        name={`background-${option}`}
        options={backgrounds
          .filter((bg) => bg.category === option)
          .map((bg) => ({
            title: bg.title,
            value: bg,
            description: bg.ariaLabel,
          }))}
        value={$activeBackground}
        on:select={handleBackgroundChange}
      />
    {/each}
  </div>
</SidebarSection>

<SidebarSection title="Background image">
  <div class="grid gap-3">
    <label class="text-sm font-semibold text-slate-700 dark:text-slate-200">
      Upload image
    </label>
    <input
      type="file"
      accept="image/*"
      bind:this={imageInput}
      class="text-sm text-slate-600 dark:text-slate-300"
      on:change={handleBackgroundImageUpload}
    />
    {#if $customBackgroundImage}
      <div class="rounded-xl border border-slate-200/80 bg-white/80 p-2 shadow-sm dark:border-slate-700/70 dark:bg-slate-900/60">
        <img
          src={$customBackgroundImage.src}
          alt={$customBackgroundImage.name ?? "Custom background preview"}
          class="h-28 w-full rounded-lg object-cover"
          loading="lazy"
        />
        <p class="mt-2 text-xs text-slate-500 dark:text-slate-400">
          {$customBackgroundImage.name || "Custom background"}
        </p>
        <button class="link-button mt-2" type="button" on:click={clearCustomBackgroundImage}>
          Remove image
        </button>
      </div>
    {:else}
      <p class="text-xs text-slate-500 dark:text-slate-400">No custom image selected.</p>
    {/if}
  </div>
</SidebarSection>
