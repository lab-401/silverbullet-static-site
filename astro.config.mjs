import { defineConfig } from 'astro/config';

// BASE_PATH: '/' when bound to the final domain root, '/silverbullet-static-site/'
// for GitHub Pages project-site staging. scripts/apply-base.mjs rewrites
// root-absolute URLs in the built HTML when BASE_PATH != '/'.
const base = process.env.BASE_PATH || '/';
const site = process.env.SITE_URL || 'https://silverbullet.tools';

export default defineConfig({
  site,
  base,
  trailingSlash: 'ignore',
  build: {
    format: 'directory',
    assets: '_astro',
  },
});
