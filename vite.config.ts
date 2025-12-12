import { defineConfig } from 'vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    svelte(),
  ],
  base: './',
  build: {
    assetsDir: 'assets',
    // Target modern browsers that support BigInt (required by mediabunny)
    target: 'esnext',
  },
  // Also set esbuild target for dev mode
  esbuild: {
    target: 'esnext',
  },
  optimizeDeps: {
    // Exclude mediabunny from pre-bundling to avoid BigInt issues
    esbuildOptions: {
      target: 'esnext',
    },
  },
})
