import { defineConfig } from 'astro/config';

// 本地 dev: base '/'；CI 部署 GitHub Pages 项目站: BASE_PATH=/zt-ai-doctor/
export default defineConfig({
  site: 'https://ziangtin.github.io',
  base: process.env.BASE_PATH ?? '/',
  output: 'static',
});
