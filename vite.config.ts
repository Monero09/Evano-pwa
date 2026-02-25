import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],

  server: {
    // When running `npm run dev` (plain Vite), proxy /api/* to a local
    // function runner or any backend port so fetch('/api/...') works.
    // When running `vercel dev`, Vercel itself handles routing so this
    // proxy is bypassed automatically.
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },

  // Prevent Vite from trying to bundle Node.js-only AWS SDK packages
  // into the browser build. These are only used in api/ (Vercel serverless).
  optimizeDeps: {
    exclude: [
      '@aws-sdk/client-s3',
      '@aws-sdk/s3-request-presigner',
      '@aws-sdk/lib-storage',
    ],
  },

  build: {
    rollupOptions: {
      external: [
        '@aws-sdk/client-s3',
        '@aws-sdk/s3-request-presigner',
        '@aws-sdk/lib-storage',
      ],
    },
  },
})
