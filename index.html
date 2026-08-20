import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          // Firebase and the Zego video SDK are the two heaviest dependencies —
          // splitting them into their own chunks means the browser can cache
          // them separately from your app code, and the initial page load
          // doesn't have to download the video SDK before showing the login screen.
          firebase: ['firebase/app', 'firebase/auth', 'firebase/firestore'],
          zego: ['@zegocloud/zego-uikit-prebuilt'],
        },
      },
    },
  },
})