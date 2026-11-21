import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadCatalog } from './catalog-lib.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const catalog = loadCatalog(path.join(root, 'catalog', 'allowlist.json'));
const provenance = JSON.parse(fs.readFileSync(path.join(root, 'catalog', 'youtube-descriptions.json'), 'utf8'));
const errors = [];

function fail(message) {
  errors.push(message);
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

if (!/^\d{4}-\d{2}-\d{2}$/.test(provenance.retrieved_on ?? '')) {
  fail('YouTube description retrieval is missing a date.');
}
if (!/youtube_id/i.test(provenance.method ?? '')) {
  fail('YouTube description retrieval must be matched by youtube_id.');
}

const records = provenance.videos ?? {};
const preserved = provenance.preserved_description_sha256 ?? {};
const byId = new Map(catalog.videos.map((video) => [video.youtube_id, video]));

for (const [id, digest] of Object.entries(preserved)) {
  const video = byId.get(id);
  if (!video?.description) {
    fail(`${id} lost a description that was already in the catalog.`);
    continue;
  }
  if (sha256(video.description) !== digest) {
    fail(`${id} changed an existing description.`);
  }
  if (records[id]) fail(`${id} is both preserved and newly retrieved.`);
}

for (const video of catalog.videos) {
  const record = records[video.youtube_id];
  const kept = Object.hasOwn(preserved, video.youtube_id);
  if (!record && !kept) fail(`${video.youtube_id} has no description provenance.`);
  if (record && kept) fail(`${video.youtube_id} was retrieved even though it already had a description.`);
}

const tallies = {};
for (const [id, record] of Object.entries(records)) {
  const video = byId.get(id);
  if (!video) {
    fail(`${id} is not a catalog recording.`);
    continue;
  }
  if (video.collection !== record.collection) {
    fail(`${id} provenance collection does not match the catalog.`);
  }
  if (typeof record.page === 'string' && !record.page.includes(id)) {
    fail(`${id} was retrieved from a page for a different video.`);
  }
  const tally = tallies[video.collection] ?? { filled: 0, empty: 0, blocked: 0 };
  tallies[video.collection] = tally;
  if (record.status === 'filled') {
    tally.filled += 1;
    if (video.description !== record.description) {
      fail(`${id} catalog description is not the retrieved YouTube description.`);
    }
  } else if (record.status === 'empty' || record.status === 'blocked') {
    tally[record.status] += 1;
    if (video.description) fail(`${id} has a description even though retrieval was ${record.status}.`);
  } else {
    fail(`${id} has an unknown retrieval status ${record.status}.`);
  }
}

for (const [collection, tally] of Object.entries(tallies)) {
  const recorded = provenance.counts?.[collection];
  if (!recorded || recorded.filled !== tally.filled || recorded.empty !== tally.empty || recorded.blocked !== tally.blocked) {
    fail(`${collection} retrieval counts do not match the records.`);
  }
}

if (errors.length) {
  console.error(`YouTube description check failed (${errors.length}):`);
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

const summary = Object.entries(tallies)
  .map(([collection, tally]) => `${collection}: ${tally.filled} filled, ${tally.empty} empty, ${tally.blocked} blocked`)
  .join('; ');
console.log(`YouTube descriptions OK (${provenance.retrieved_on}): ${summary}`);
