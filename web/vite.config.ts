import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    proxy: { '/api': 'http://localhost:3000', '/media': 'http://localhost:3000', '/sitemap.xml': 'http://localhost:3000', '/robots.txt': 'http://localhost:3000' },
  },
  build: { outDir: 'dist', sourcemap: false, chunkSizeWarningLimit: 600 },
});
