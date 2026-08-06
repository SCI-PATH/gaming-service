import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { avatarApiPlugin } from './server/viteAvatarPlugin.mjs';

export default defineConfig({
  plugins: [react(), tailwindcss(), avatarApiPlugin()],
  server: {
    proxy: {
      // Optional: also proxy to standalone server if you run `npm run server`
      // and set AVATAR_USE_PROXY=1 — middleware handles /api by default.
    },
  },
});
