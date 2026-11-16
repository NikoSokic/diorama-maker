import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    // The 3D libraries are by far the biggest part and change far less often than our own code: in a chunk
    // of their own they stay in the browser cache across deploys. They load only with the (lazy) player.
    chunkSizeWarningLimit: 1200,
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            {
              name: 'three',
              test: /node_modules[\\/](three|three-stdlib|@react-three|postprocessing|camera-controls|maath|n8ao|three-mesh-bvh|meshline|troika-[^\\/]+|@monogrid|detect-gpu|stats-gl)[\\/]/,
            },
          ],
        },
      },
    },
  },
  server: {
    proxy: {
      '/api': process.env.API_PROXY ?? 'http://localhost:8080',
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.{ts,tsx}'],
    passWithNoTests: true,
  },
})
