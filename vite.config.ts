import { defineConfig } from 'vite';

export default defineConfig({
  // Göreli yollar: kökte de, GitHub Pages alt yolunda (/dustwar/) da çalışır.
  base: './',
  server: { port: 5173, open: false },
  build: { target: 'es2022', chunkSizeWarningLimit: 800 },
});
