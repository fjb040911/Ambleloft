import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import {fileURLToPath,URL} from 'node:url';

export default defineConfig({
  base: './',
  resolve: {alias: {'@':fileURLToPath(new URL('./src',import.meta.url))}},
  plugins: [react(),tailwindcss()],
  server: { host: '127.0.0.1', port: 5173, strictPort: true },
});
