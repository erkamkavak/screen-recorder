/// <reference types="svelte" />
/// <reference types="vite/client" />

declare namespace svelteHTML {
  interface HTMLAttributes<T> {
    "on:outclick"?: (event: CustomEvent<any>) => void;
  }
}
