import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Relative asset URLs — bootloader publishes the zip to IPFS.
// `outDir: dist` is the folder to zip (contents, not the folder itself).
export default defineConfig({
  base: './',
  plugins: [react()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
})
