import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadCatalog, summarizeCatalog } from './catalog-lib.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const file = path.join(root, 'catalog', 'allowlist.json');
const catalog = loadCatalog(file);
const summary = summarizeCatalog(catalog);

console.log(`Allowlist OK: ${summary.total} videos (as of ${catalog.as_of}, ${catalog.timezone}).`);
for (const [name, count] of summary.byCollection) {
  console.log(`  ${name}: ${count}`);
}
for (const [moduleId, count] of [...summary.byModule.entries()].sort()) {
  console.log(`  ${moduleId}: ${count}`);
}
