import { canonicalStatLabel, lessonKey, statModuleCoverId, summarizeLessons, tally } from './lessons.mjs';
import { loadCatalog } from './catalog-lib.mjs';
import fs from 'node:fs';
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

const expectedCovers = {
  M01: 'VS7Qbq07ATM',
  M02: 'iFxLhMzkpko',
  M03: 'mW92Uy97xn0',
  M04: 'D7cTzUxnWuE',
  M05: 'kxuYPToB6iw',
  M06: 'ud3n4q9ul4Y',
};
for (const [moduleId, youtubeId] of Object.entries(expectedCovers)) {
  const coverId = statModuleCoverId(catalog.videos, moduleId);
  const cover = stat.find((video) => video.youtube_id === coverId);
  if (coverId !== youtubeId) fail(`${moduleId} cover is ${coverId}, expected ${youtubeId}.`);
  if (!cover || canonicalStatLabel(cover) !== `${Number(moduleId.slice(1))}.01`) {
    fail(`${moduleId} cover is not the first official lesson.`);
  }
  if (cover?.language !== 'en+zh') fail(`${moduleId} cover is not the English narration.`);
}
if (statModuleCoverId(catalog.videos, 'M01') === 'dgh99RbB43s') {
  fail('M01 cover must not be the skewness recording.');
}

const sameCase = [
  video({
    collection_slug: 'micro-cases',
    module: null,
    topic: 'Accounting',
    id: 'ACC-01',
    language: 'mc-en',
    youtube_id: 'aaaaaaaaaaa',
  }),
  video({
    collection_slug: 'micro-cases',
    module: null,
    topic: 'Accounting',
    id: 'ACC-01',
    language: 'mc-cmn',
    youtube_id: 'bbbbbbbbbbb',
    title: 'A translated title stays in the same case',
  }),
];
if (tally(sameCase).lessons !== 1 || tally(sameCase).versions !== 2) {
  fail('Micro Case language recordings that share a catalog id must be one lesson.');
}
const separateCases = [
  ...sameCase,
  video({
    collection_slug: 'micro-cases',
    module: null,
    topic: 'Accounting',
    id: 'ACC-02',
    language: 'mc-en',
    youtube_id: 'ccccccccccc',
  }),
];
if (tally(separateCases).lessons !== 2) {
  fail('A shared Accounting topic must not merge different Micro Case ids.');
}

const accExpected = [
  {
    language: 'mc-en',
    label: 'English',
    youtube_id: 'F1WY_3jXYQw',
    title: 'ACC-01 · The last tray of egg tarts (English)',
    casePage: 'https://kochiuyu.github.io/micro-cases/tarts.html',
  },
  {
    language: 'mc-cmn',
    label: '普通话',
    youtube_id: 'uetO9tibCEA',
    title: 'ACC-01 · 最后一盘蛋挞（普通话）',
    casePage: 'https://kochiuyu.github.io/micro-cases/zh-cn/tarts.html',
  },
  {
    language: 'mc-yue',
    label: '廣東話',
    youtube_id: 'EFakphvV2qE',
    title: 'ACC-01 · 最後一盤蛋撻（廣東話）',
    casePage: 'https://kochiuyu.github.io/micro-cases/zh-hk/tarts.html',
  },
];
const acc = catalog.videos.filter((item) => item.id === 'ACC-01');
if (acc.length !== 3) fail('ACC-01 must stay one lesson with three recordings.');
if (summary.byCollection['micro-cases']?.lessons !== 3 || summary.byCollection['micro-cases']?.versions !== 9) {
  fail('Micro Cases must be three lessons and nine recordings.');
}
if (summary.lessons !== 121 || summary.versions !== 381) {
  fail(`Catalog is ${summary.lessons} lessons and ${summary.versions} recordings; expected 121 and 381.`);
}
if (summary.byCollection['stat-lessons'].lessons !== 78 || summary.byCollection['stat-lessons'].versions !== 312) {
  fail('STAT must be 78 lessons and 312 recordings.');
}
const statLanguageIds = new Set(['en+zh', 'zh+en', 'hk+en', 'zh']);
for (const expected of accExpected) {
  const item = acc.find((video) => video.youtube_id === expected.youtube_id);
  if (!item) {
    fail(`ACC-01 is missing ${expected.youtube_id}.`);
    continue;
  }
  if (item.collection_slug !== 'micro-cases' || item.topic !== 'Accounting' || item.module != null) {
    fail(`${expected.youtube_id} is not grouped as an Accounting micro-case.`);
  }
  if (item.language !== expected.language || item.language_label !== expected.label) {
    fail(`${expected.youtube_id} language label does not match its recording.`);
  }
  if (statLanguageIds.has(item.language)) fail(`${expected.youtube_id} uses a STAT language track.`);
  if (item.title !== expected.title) fail(`${expected.youtube_id} title is not the approved title.`);
  if (item.duration != null) fail(`${expected.youtube_id} duration must stay null until a YouTube duration is verified.`);
  if (item.youtube_url !== `https://www.youtube.com/watch?v=${expected.youtube_id}`) {
    fail(`${expected.youtube_id} watch URL is not the canonical watch URL.`);
  }
  if (!item.description?.includes(expected.casePage) || !item.description.includes('https://kochiuyu.github.io/micro-cases/')) {
    fail(`${expected.youtube_id} description is missing its localized case page.`);
  }
  if (lessonKey(item) !== 'micro-cases\nACC-01') fail(`${expected.youtube_id} is not grouped as case ACC-01.`);
}
const acc02Expected = [
  {
    language: 'mc-en',
    label: 'English',
    youtube_id: '1Qik16ZYE14',
    title: 'ACC-02 · Close the loss-making branch? (English)',
    casePage: 'https://kochiuyu.github.io/micro-cases/branch-loss.html',
  },
  {
    language: 'mc-cmn',
    label: '普通话',
    youtube_id: 'WjCDkMI3uZc',
    title: 'ACC-02 · 亏损的门店，要不要关？（普通话）',
    casePage: 'https://kochiuyu.github.io/micro-cases/zh-cn/branch-loss.html',
  },
  {
    language: 'mc-yue',
    label: '廣東話',
    youtube_id: 'LADYnu4OCug',
    title: 'ACC-02 · 虧損的分店，應該結業嗎？（廣東話）',
    casePage: 'https://kochiuyu.github.io/micro-cases/zh-hk/branch-loss.html',
  },
];
const acc02 = catalog.videos.filter((item) => item.id === 'ACC-02');
if (acc02.length !== 3) fail('ACC-02 must be one lesson with three recordings.');
for (const expected of acc02Expected) {
  const item = acc02.find((video) => video.youtube_id === expected.youtube_id);
  if (!item) {
    fail(`ACC-02 is missing ${expected.youtube_id}.`);
    continue;
  }
  if (item.collection_slug !== 'micro-cases' || item.topic !== 'Accounting' || item.module != null) {
    fail(`${expected.youtube_id} is not grouped as an Accounting micro-case.`);
  }
  if (item.language !== expected.language || item.language_label !== expected.label) {
    fail(`${expected.youtube_id} language label does not match its recording.`);
  }
  if (statLanguageIds.has(item.language)) fail(`${expected.youtube_id} uses a STAT language track.`);
  if (item.title !== expected.title) fail(`${expected.youtube_id} title is not the approved title.`);
  if (item.duration != null) fail(`${expected.youtube_id} duration must stay null until a YouTube duration is verified.`);
  if (item.youtube_url !== `https://www.youtube.com/watch?v=${expected.youtube_id}`) {
    fail(`${expected.youtube_id} watch URL is not the canonical watch URL.`);
  }
  if (!item.description?.includes(expected.casePage) || !item.description.includes('pause, vote, and reveal') && !item.description.includes('先暂停、再投票、再讲评') && !item.description.includes('先暫停、再投票、再講評')) {
    fail(`${expected.youtube_id} description dropped the approved case page or classroom wording.`);
  }
  if (lessonKey(item) !== 'micro-cases\nACC-02') fail(`${expected.youtube_id} is not grouped as case ACC-02.`);
}
const acc03Expected = [
  {
    language: 'mc-en',
    label: 'English',
    youtube_id: 'kc97t9pCO-I',
    title: 'ACC-03 · Target reached. Returns still coming? (English)',
    casePage: 'https://kochiuyu.github.io/micro-cases/returns-target.html',
  },
  {
    language: 'mc-cmn',
    label: '普通话',
    youtube_id: 'heYTMobTncY',
    title: 'ACC-03 · 销售达标了？退货期还没结束（普通话）',
    casePage: 'https://kochiuyu.github.io/micro-cases/zh-cn/returns-target.html',
  },
  {
    language: 'mc-yue',
    label: '廣東話',
    youtube_id: 'l5ug7pz-ZrM',
    title: 'ACC-03 · 銷售達標了？退貨期還未完（廣東話）',
    casePage: 'https://kochiuyu.github.io/micro-cases/zh-hk/returns-target.html',
  },
];
const microIds = catalog.videos.filter((item) => item.collection_slug === 'micro-cases').map((item) => item.youtube_id);
if (microIds.join(',') !== [...accExpected, ...acc02Expected, ...acc03Expected].map((item) => item.youtube_id).join(',')) {
  fail('Micro Cases recordings changed order or identity.');
}
const acc03 = catalog.videos.filter((item) => item.id === 'ACC-03');
if (acc03.length !== 3) fail('ACC-03 must be one lesson with three recordings.');
for (const expected of acc03Expected) {
  const item = acc03.find((video) => video.youtube_id === expected.youtube_id);
  if (!item) {
    fail(`ACC-03 is missing ${expected.youtube_id}.`);
    continue;
  }
  if (item.collection_slug !== 'micro-cases' || item.topic !== 'Accounting' || item.module != null) {
    fail(`${expected.youtube_id} is not grouped as an Accounting micro-case.`);
  }
  if (item.language !== expected.language || item.language_label !== expected.label) {
    fail(`${expected.youtube_id} language label does not match its recording.`);
  }
  if (statLanguageIds.has(item.language)) fail(`${expected.youtube_id} uses a STAT language track.`);
  if (item.title !== expected.title) fail(`${expected.youtube_id} title is not the approved title.`);
  if (item.duration != null) fail(`${expected.youtube_id} duration must stay null until a hosted YouTube duration is verified.`);
  if (item.youtube_url !== `https://www.youtube.com/watch?v=${expected.youtube_id}`) {
    fail(`${expected.youtube_id} watch URL is not the canonical watch URL.`);
  }
  if (!item.description?.includes(expected.casePage) || !item.description.includes('Prof. Chiu Yu KO')) {
    fail(`${expected.youtube_id} description dropped the case page or attribution.`);
  }
  if (lessonKey(item) !== 'micro-cases\nACC-03') fail(`${expected.youtube_id} is not grouped as case ACC-03.`);
}
const excludedDrafts = ['w-ZNJWfxFts', 'BkosxidgHCk', 'z11xephERog'];
if (catalog.videos.some((item) => excludedDrafts.includes(item.youtube_id))) {
  fail('An excluded draft recording was cataloged.');
}
const catalogText = fs.readFileSync(path.join(root, 'catalog', 'allowlist.json'), 'utf8');
if (
  catalogText.includes('/workspace/') ||
  catalogText.includes('acc-01-youtube') ||
  catalogText.includes('acc-02-youtube') ||
  catalogText.includes('acc-03-youtube') ||
  catalogText.includes('_studio.png') ||
  excludedDrafts.some((id) => catalogText.includes(id))
) {
  fail('The allowlist includes a private path or an excluded draft.');
}

if (errors.length) {
  console.error(`Lesson count check failed (${errors.length}):`);
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log(`Lessons OK: ${summary.lessons} lessons, ${summary.versions} recordings.`);
for (const [slug, row] of Object.entries(summary.byCollection)) {
  console.log(`  ${slug}: ${row.lessons} lessons, ${row.versions} recordings`);
}
