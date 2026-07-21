import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  build: {
    target: 'es2020',
    assetsInlineLimit: 0,
    rollupOptions: {
      input: {
        main: new URL('./index.html', import.meta.url).pathname,
        classic: new URL('./classic.html', import.meta.url).pathname,
      },
    },
  },
});
