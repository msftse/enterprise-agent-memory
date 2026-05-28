import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { resolve } from 'node:path';

// Build the landing into ../src/viewer/ so it lands alongside savings.html etc.
// emptyOutDir: false so we don't delete savings.html / token-economy.html / scalability.html / app.js / styles.css
export default defineConfig({
  plugins: [react(), tailwindcss()],
  base: '/viewer/',
  build: {
    outDir: resolve(__dirname, '..', 'src', 'viewer'),
    emptyOutDir: false,
    assetsDir: 'assets',
    rollupOptions: {
      output: { entryFileNames: 'assets/landing-[hash].js', chunkFileNames: 'assets/landing-[hash].js', assetFileNames: 'assets/landing-[hash][extname]' },
    },
  },
});
