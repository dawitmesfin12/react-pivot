import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const base = process.env.DEPLOY_BASE ?? '/react-pivot/'

// Config for building the demo site for GitHub Pages
export default defineConfig({
  base,
  plugins: [react()],
  build: {
    outDir: 'demo-dist',
    emptyOutDir: true,
  }
})
