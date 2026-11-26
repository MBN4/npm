import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

export default defineConfig({
  plugins: [react()],
  // Three pages: the Naveed Medical Complex home at "/" (index.html), the public
  // pharmacy website at "/pharmacy/" (pharmacy/index.html) and the admin
  // management app at "/admin/" (admin/index.html).
  build: {
    rollupOptions: {
      input: {
        website: resolve(__dirname, 'index.html'),
        pharmacy: resolve(__dirname, 'pharmacy/index.html'),
        admin: resolve(__dirname, 'admin/index.html')
      }
    }
  },
  server: {
    port: 5173,
    host: '0.0.0.0',
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:5000',
        changeOrigin: true,
        secure: false
      }
    }
  }
});
