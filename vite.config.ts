import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    port: 1337,
    strictPort: true,
  },
  build: {
    manifest: true,
    target: 'es2022',
  },
});
