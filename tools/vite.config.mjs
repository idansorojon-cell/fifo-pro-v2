import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
export default defineConfig({
  root:fileURLToPath(new URL('../review-dist',import.meta.url)),
  server:{host:'0.0.0.0',allowedHosts:['terminal.local']}
});
