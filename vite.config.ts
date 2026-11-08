import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Relative Pfade, damit die gebaute Seite unter jeder Adresse läuft
  // (z. B. https://peter-u1.github.io/peters-bsv-diary/).
  base: './',
})
