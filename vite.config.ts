import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { viteSingleFile } from 'vite-plugin-singlefile'

const isSingleFile = process.env.SINGLE_FILE === '1'

export default defineConfig({
  // Use relative paths so dist/ works both in Electron (file://) and on a web server
  base: './',
  plugins: [
    react(),
    tailwindcss(),
    ...(isSingleFile ? [viteSingleFile()] : []),
  ],
  build: {
    outDir: isSingleFile ? 'dist-single' : 'dist',
    assetsInlineLimit: isSingleFile ? 100_000_000 : 4096,
    cssCodeSplit: !isSingleFile,
  },
})
