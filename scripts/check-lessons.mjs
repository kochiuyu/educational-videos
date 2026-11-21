import { canonicalStatLabel, lessonKey, summarizeLessons, tally } from './lessons.mjs';
import { loadCatalog } from './catalog-lib.mjs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const errors = [];
function fail(message) {
  errors.push(message);
}

function video(partial) {
  return {
    id: 'id',
    collection_slug: 'stat-lessons',
    module: 'M01',
    topic: 'T01',
    language: 'en+zh',
    title: 'Same title must not merge lessons',
    youtube_id: 'aaaaaaaaaaa',
    ...partial,
  };
}

const statSameLesson = [
  video({ topic: 'T01', language: 'en+zh', id: 'A', youtube_id: 'aaaaaaaaaaa', youtube_title: 'STAT 1.11 · skewness' }),
  video({ topic: 'T08', language: 'zh+en', id: 'B', youtube_id: 'bbbbbbbbbbb', youtube_title: '统计 1.11 · 偏度' }),
  video({ topic: 'T03', language: 'hk+en', id: 'C', youtube_id: 'ccccccccccc', youtube_title: '統計 1.11 · 偏度' }),
  video({ topic: 'T11', language: 'zh', id: 'D', youtube_id: 'ddddddddddd', youtube_title: '统计 1.11 · 偏度' }),
];
if (tally(statSameLesson).lessons !== 1 || tally(statSameLesson).versions !== 4) {
  fail('The same official STAT lesson number must be one lesson across catalog topic codes.');
}

const statSameCatalogCode = [
  video({ topic: 'T01', id: 'shared', youtube_id: 'aaaaaaaaaaa', youtube_title: 'STAT 1.01 · intro' }),
  video({ topic: 'T01', id: 'shared', youtube_id: 'bbbbbbbbbbb', youtube_title: '統計 1.13 · covariance' }),
];
if (tally(statSameCatalogCode).lessons !== 2) {
  fail('A shared catalog topic code must not merge different official lesson numbers.');
}

const shorts = [
  video({
    collection_slug: 'economics-shorts',
    module: null,
    topic: 'Experimental Economics',
    id: 'econ-1',
    language: null,
    youtube_id: 'aaaaaaaaaaa',
    title: 'Shared short title',
  }),
  video({
    collection_slug: 'economics-shorts',
    module: null,
    topic: 'Experimental Economics',
    id: 'econ-2',
    language: null,
    youtube_id: 'bbbbbbbbbbb',
    title: 'Shared short title',
  }),
];
if (tally(shorts).lessons !== 2) {
  fail('Economics Shorts that share a topic or title must stay separate lessons.');
}

const whatIs = [
  video({
    collection_slug: 'lae-what-is',
    module: null,
    topic: 'What is LAE?',
    id: 'LAE-WHAT-T01',
    language: 'en',
    youtube_id: 'aaaaaaaaaaa',
  }),
  video({
    collection_slug: 'lae-what-is',
    module: null,
    topic: 'What is LAE?',
    id: 'LAE-WHAT-T01',
    language: 'cmn',
    youtube_id: 'bbbbbbbbbbb',
    title: 'Different published title',
  }),
];
if (tally(whatIs).lessons !== 1) {
  fail('LAE What-is language versions that share a catalog id must be one lesson.');
}

const separateCollections = [
  video({ collection_slug: 'lae-101', id: 'SAME', module: null, topic: '01', youtube_id: 'aaaaaaaaaaa' }),
  video({ collection_slug: 'lae-what-is', id: 'SAME', module: null, topic: 'What is LAE?', youtube_id: 'bbbbbbbbbbb' }),
];
if (tally(separateCollections).lessons !== 2) {
  fail('The same catalog id in two collections must remain two lessons.');
}

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const catalog = loadCatalog(path.join(root, 'catalog', 'allowlist.json'));
const summary = summarizeLessons(catalog.videos);

if (summary.versions !== catalog.videos.length) {
  fail(`Version count ${summary.versions} is not the recording count ${catalog.videos.length}.`);
}
const lessonSum = Object.values(summary.byCollection).reduce((sum, row) => sum + row.lessons, 0);
const versionSum = Object.values(summary.byCollection).reduce((sum, row) => sum + row.versions, 0);
if (lessonSum !== summary.lessons) fail('Per-collection lesson counts do not add up.');
if (versionSum !== summary.versions) fail('Per-collection version counts do not add up.');

const stat = catalog.videos.filter((video) => video.collection_slug === 'stat-lessons');
const statByLesson = new Map();
for (const video of stat) {
  const label = canonicalStatLabel(video);
  if (!label) {
    fail(`${video.youtube_id} has no single official lesson number.`);
    continue;
  }
  if (lessonKey(video) !== `stat-lessons\n${label}`) {
    fail(`${video.youtube_id} was grouped by its catalog topic instead of ${label}.`);
  }
  const group = statByLesson.get(label) ?? [];
  group.push(video);
  statByLesson.set(label, group);
}
if (summary.byCollection['stat-lessons'].lessons !== statByLesson.size) {
  fail('STAT lesson count must equal official YouTube lesson numbers, not catalog topic codes.');
}
const expectedLanguages = ['en+zh', 'zh+en', 'hk+en', 'zh'];
for (const [label, group] of statByLesson) {
  const labels = new Set(group.map((video) => canonicalStatLabel(video)));
  const languages = new Set(group.map((video) => video.language));
  if (labels.size !== 1) fail(`STAT ${label} mixes official lesson numbers.`);
  if (group.length !== 4 || languages.size !== 4 || expectedLanguages.some((id) => !languages.has(id))) {
    fail(`STAT ${label} is not one recording for each language track.`);
  }
}
const mixedCatalogCode = stat.filter((video) => video.module === 'M01' && video.topic === 'T01');
const mixedLabels = new Set(mixedCatalogCode.map((video) => canonicalStatLabel(video)));
if (mixedLabels.size < 2) {
  fail('M01 catalog T01 must not be treated as one lesson; its recordings have different official numbers.');
}
const known = {
  dgh99RbB43s: '1.11',
  VS7Qbq07ATM: '1.01',
  IfZSkxjGnIo: '1.11',
  Yb4eqJPlp5g: '1.02',
  t42YutwalcM: '1.13',
  f8_qd5CERLA: '1.01',
};
for (const [id, label] of Object.entries(known)) {
  const video = stat.find((item) => item.youtube_id === id);
  if (!video || canonicalStatLabel(video) !== label) fail(`${id} must be official lesson ${label}.`);
}
const shortsLive = catalog.videos.filter((video) => video.collection_slug === 'economics-shorts');
const shortTopics = new Set(shortsLive.map((video) => video.topic));
if (summary.byCollection['economics-shorts'].lessons !== shortsLive.length) {
  fail('Each Economics Short must be its own lesson.');
}
if (shortTopics.size >= shortsLive.length) {
  fail('Economics topic groups must not be treated as the only lessons.');
}

const what = catalog.videos.filter((video) => video.collection_slug === 'lae-what-is');
const whatIds = new Map();
for (const video of what) {
  const group = whatIds.get(video.id) ?? [];
  group.push(video);
  whatIds.set(video.id, group);
}
if (summary.byCollection['lae-what-is'].lessons !== whatIds.size) {
  fail('Each LAE What-is catalog id must be one lesson.');
}
for (const [id, group] of whatIds) {
  const topics = new Set(group.map((video) => video.topic));
  const languages = new Set(group.map((video) => video.language));
  if (topics.size !== 1) fail(`LAE What-is id ${id} spans more than one topic.`);
  if (languages.size !== group.length) fail(`LAE What-is id ${id} repeats a language.`);
}

const lae = catalog.videos.filter((video) => video.collection_slug === 'lae-101');
if (summary.byCollection['lae-101'].lessons !== lae.length) {
  fail('Each LAE 101 recording must be its own lesson.');
}
if (lae.some((video) => video.language != null)) {
  fail('LAE 101 lessons are not language tracks.');
}

const globalIds = new Map();
for (const video of catalog.videos) {
  const collections = globalIds.get(video.id) ?? new Set();
  collections.add(video.collection_slug);
  globalIds.set(video.id, collections);
}
for (const [id, collections] of globalIds) {
  if (collections.size > 1) fail(`Catalog id ${id} appears in more than one collection.`);
}

const keys = catalog.videos.map((video) => lessonKey(video));
if (new Set(keys).size !== summary.lessons) fail('Lesson keys and the summary disagree.');

if (errors.length) {
  console.error(`Lesson count check failed (${errors.length}):`);
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log(`Lessons OK: ${summary.lessons} lessons, ${summary.versions} recordings.`);
for (const [slug, row] of Object.entries(summary.byCollection)) {
  console.log(`  ${slug}: ${row.lessons} lessons, ${row.versions} recordings`);
}
