import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  // Relative asset paths, so the build works from a sub-path such as
  // https://storage.googleapis.com/<bucket>/index.html (absolute /assets/ would 404 there).
  base: './',
  plugins: [react()],
})
