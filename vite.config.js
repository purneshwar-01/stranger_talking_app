import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],

  build: {
    // Raise warning threshold — Zego SDK is inherently ~5.2 MB (third-party, cannot split)
    chunkSizeWarningLimit: 5500,

    rollupOptions: {
      output: {
        // Manual chunk splitting: keep vendor libs separate from app code
        // so users only re-download what actually changed on deploy.
        manualChunks: {
          // React runtime — rarely changes
          'vendor-react': ['react', 'react-dom', 'react-router-dom'],
          // Firebase SDK — large but stable
          'vendor-firebase': [
            'firebase/app',
            'firebase/auth',
            'firebase/firestore',
          ],
          // Zego video SDK — large, isolated
          'vendor-zego': ['@zegocloud/zego-uikit-prebuilt'],
          // Icon library
          'vendor-lucide': ['lucide-react'],
        },
      },
    },

    // Minify with esbuild (default, fastest)
    minify: 'esbuild',

    // Source maps only in development; keep prod bundle clean
    sourcemap: false,
  },

  // Dev server settings
  server: {
    port: 5173,
    strictPort: true,
  },
});
