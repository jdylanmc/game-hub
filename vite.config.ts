import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    port: 1337,
    strictPort: true,
  },
  build: {
    target: 'es2022',
  },
});
