import { defineConfig } from 'astro/config';

export default defineConfig({
  site: 'https://allthethings.ninja',
  output: 'static',
  build: { format: 'directory' },
});
