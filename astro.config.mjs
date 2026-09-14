// @ts-check
import { defineConfig } from 'astro/config';

// https://astro.build/config
export default defineConfig({
  // The canonical origin. Astro uses it for absolute URLs, and anything added
  // later that needs them — sitemap, RSS, social card tags — reads it from
  // here. Served at the apex, so no `base` is needed.
  site: 'https://gabrielcameron.com',
});
