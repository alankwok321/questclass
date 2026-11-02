import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'node:path'

// Two apps from one build: QuestClass (index.html) and the standalone 題庫 app (bank.html, served at /bank).
export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      input: {
        main: resolve(import.meta.dirname, 'index.html'),
        bank: resolve(import.meta.dirname, 'bank.html'),
      },
    },
  },
})
