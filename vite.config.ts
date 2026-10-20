import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Relative paths so the same build works on the web, in GitHub Pages
  // sub-folders and inside the Capacitor Android/iOS WebView.
  base: './',
  build: { outDir: 'dist', target: 'es2020' },
  test: { include: ['src/**/*.test.ts'] },
});
