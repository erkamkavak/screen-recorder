<script lang="ts">
  import { ColorPicker } from "@apsc/color";
  import "@apsc/color/color-picker.css";
  import ActionButton from "./ActionButton.svelte";
  import PopupContainer from "./PopupContainer.svelte";

  export let title: string;
  export let value: string;
  export let rightAlignPopup: boolean = false;

  let isPopupOpen = false;

  // Local color state for the picker; seed when opening
  let pickerColor: any = value;

  // Propagate picker changes one-way to value
  $: if (pickerColor && typeof pickerColor === "object" && pickerColor.hex && pickerColor.hex !== value) {
    value = pickerColor.hex;
  } else if (typeof pickerColor === "string" && pickerColor !== value) {
    value = pickerColor;
  }


  const handleColorInputButtonClick = () => {
    pickerColor = value; // sync picker to latest external value when opening
    isPopupOpen = true;
  };
</script>

<ActionButton
  isActive={false}
  isSquareVariant={false}
  showPopupUnder={true}
  isTextVariant={true}
  {rightAlignPopup}
  {isPopupOpen}
  on:popupDismiss={() => (isPopupOpen = false)}
  on:click={handleColorInputButtonClick}
>
  <PopupContainer slot="popupContent" title="">
    <div class="transparent-input">
      <ColorPicker class="h-64 p-2" bind:color={pickerColor} />
    </div>
  </PopupContainer>

  <div class="flex items-center gap-2">
    <div class="h-6 w-6 rounded border border-slate-300/70 shadow-inner dark:border-slate-700" style="background-color: {value};" />
    {title}
  </div>
</ActionButton>

<style>
  .transparent-input :global(input) {
    background-color: transparent;
  }
</style>
