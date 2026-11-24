import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import {fileURLToPath,URL} from 'node:url';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const root=fileURLToPath(new URL('.',import.meta.url));
const buildInfo={version:require('./package.json').version,...require('./electron/app-info.cjs').sourceBuild(root),builtAt:new Date().toISOString()};

export default defineConfig({
  base: './',
  define: {__AMBLE_BUILD__:JSON.stringify(buildInfo)},
  resolve: {alias: {'@':fileURLToPath(new URL('./src',import.meta.url))}},
  plugins: [react(),tailwindcss(),{name:'ambleloft-build-info',generateBundle(){this.emitFile({type:'asset',fileName:'build-info.json',source:JSON.stringify(buildInfo)});}}],
  // These packages ship standalone ESM. Lazy-opening the terminal should not
  // require a versioned copy of them from Vite's development prebundle cache.
  optimizeDeps: { entries: ['index.html'], exclude: ['@xterm/xterm', '@xterm/addon-fit', '@xterm/addon-search'] },
  server: { host: '127.0.0.1', port: 5173, strictPort: true },
});
