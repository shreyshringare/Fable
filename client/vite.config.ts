import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

const apiTarget = process.env.FABLE_API_TARGET || 'http://localhost:3000';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg'],
      manifest: {
        name: 'Fable — Trip Planner',
        short_name: 'Fable',
        description: 'Collaborative travel planning with maps, budgets and lore',
        theme_color: '#4f46e5',
        background_color: '#f9fafb',
        display: 'standalone',
        icons: [
          { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
        ],
      },
      workbox: {
        navigateFallbackDenylist: [/^\/api/, /^\/uploads/, /^\/ws/],
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
      },
    }),
  ],
  server: {
    port: 5173,
    proxy: {
      '/api': apiTarget,
      '/uploads': apiTarget,
      '/ws': { target: apiTarget.replace('http', 'ws'), ws: true },
    },
  },
});
