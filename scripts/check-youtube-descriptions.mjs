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
  if (typeof video.description !== 'string' || video.description.trim() === '') {
    fail(`${video.youtube_id} has an empty description.`);
  }
}

const serialized = JSON.stringify(provenance);
if (serialized.includes('/workspace/') || serialized.includes('acc-01-youtube') || serialized.includes('_studio.png')) {
  fail('Description provenance includes a private local path.');
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
  const tally = tallies[video.collection] ?? { filled: 0, empty: 0, blocked: 0, source: 0 };
  tallies[video.collection] = tally;
  if (record.status === 'filled') {
    tally.filled += 1;
    if (video.description !== record.description) {
      fail(`${id} catalog description is not the retrieved YouTube description.`);
    }
  } else if (record.status === 'empty' || record.status === 'blocked') {
    tally[record.status] += 1;
    if (video.description) fail(`${id} has a description even though retrieval was ${record.status}.`);
  } else if (record.status === 'source') {
    tally.source += 1;
    if (video.description !== record.description) {
      fail(`${id} catalog description is not the approved source description.`);
    }
    if (record.page) fail(`${id} source description records a fetch page.`);
    const blob = JSON.stringify(record);
    if (blob.includes('/workspace/') || blob.includes('acc-01-youtube') || blob.includes('_studio.png')) {
      fail(`${id} source record includes a private path.`);
    }
  } else {
    fail(`${id} has an unknown retrieval status ${record.status}.`);
  }
}

for (const [collection, tally] of Object.entries(tallies)) {
  const recorded = provenance.counts?.[collection];
  if (
    !recorded ||
    recorded.filled !== tally.filled ||
    recorded.empty !== tally.empty ||
    recorded.blocked !== tally.blocked ||
    (recorded.source ?? 0) !== tally.source
  ) {
    fail(`${collection} retrieval counts do not match the records.`);
  }
}

if (errors.length) {
  console.error(`YouTube description check failed (${errors.length}):`);
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

const summary = Object.entries(tallies)
  .map(([collection, tally]) => {
    const parts = [`${tally.filled} filled`, `${tally.empty} empty`, `${tally.blocked} blocked`];
    if (tally.source) parts.push(`${tally.source} source`);
    return `${collection}: ${parts.join(', ')}`;
  })
  .join('; ');
console.log(`YouTube descriptions OK (${provenance.retrieved_on}): ${summary}`);
