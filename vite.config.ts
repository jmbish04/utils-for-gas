import { defineConfig } from 'vite';
import { vitePlugin as remix } from '@remix-run/dev';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [
    remix({
      future: {
        v3_fetcherPersist: true,
        v3_relativeSplatPath: true,
        v3_throwAbortReason: true,
      },
    }),
    react(),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './frontend/app'),
    },
  },
  build: {
    rollupOptions: {
      output: {
        // CRITICAL: Manual chunks to prevent hydration white-screens
        manualChunks: (id) => {
          // Vendor chunks for React
          if (id.includes('node_modules/react') || id.includes('node_modules/react-dom')) {
            return 'vendor-react';
          }

          // Vendor chunks for UI components
          if (
            id.includes('node_modules/@radix-ui') ||
            id.includes('node_modules/lucide-react') ||
            id.includes('node_modules/recharts')
          ) {
            return 'vendor-ui';
          }

          // Vendor chunks for utilities
          if (
            id.includes('node_modules/@tanstack') ||
            id.includes('node_modules/react-router')
          ) {
            return 'vendor-utils';
          }
        },
      },
    },
    target: 'esnext',
    outDir: 'frontend/build',
  },
  ssr: {
    target: 'webworker',
    noExternal: true,
  },
});
