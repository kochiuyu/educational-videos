import { defineConfig } from 'astro/config';
import { fileURLToPath } from 'node:url';
import { loadCatalog, summarizeCatalog } from './scripts/catalog-lib.mjs';

const catalogFile = fileURLToPath(new URL('./catalog/allowlist.json', import.meta.url));

export default defineConfig({
  site: 'https://kochiuyu.github.io',
  base: '/educational-videos',
  trailingSlash: 'always',
  build: {
    format: 'directory',
  },
  integrations: [
    {
      name: 'validate-allowlist',
      hooks: {
        'astro:config:setup': () => {
          const catalog = loadCatalog(catalogFile);
          const summary = summarizeCatalog(catalog);
          console.log(
            `Allowlist OK: ${summary.total} videos as of ${catalog.as_of} (${catalog.timezone}).`,
          );
        },
      },
    },
  ],
});
