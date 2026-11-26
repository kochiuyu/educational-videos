import { canonicalStatLabel, lessonKey, statModuleCoverId, summarizeLessons, tally } from './lessons.mjs';
import { loadCatalog } from './catalog-lib.mjs';
import crypto from 'node:crypto';
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
if (summary.byCollection['micro-cases']?.lessons !== 14 || summary.byCollection['micro-cases']?.versions !== 42) {
  fail('Micro Cases must be fourteen lessons and forty-two recordings.');
}
const accountingLessonIds = new Set(
  catalog.videos.filter((item) => item.collection_slug === 'micro-cases' && item.topic === 'Accounting').map((item) => item.id),
);
const financeLessonIds = new Set(
  catalog.videos.filter((item) => item.collection_slug === 'micro-cases' && item.topic === 'Finance').map((item) => item.id),
);
if (accountingLessonIds.size !== 4 || financeLessonIds.size !== 10) {
  fail('Micro Cases must stay at four Accounting lessons and ten Finance lessons.');
}
if (summary.lessons !== 134 || summary.versions !== 420) {
  fail(`Catalog is ${summary.lessons} lessons and ${summary.versions} recordings; expected 134 and 420.`);
}
if (summary.byCollection['stat-lessons'].lessons !== 78 || summary.byCollection['stat-lessons'].versions !== 312) {
  fail('STAT must be 78 lessons and 312 recordings.');
}
for (const [slug, lessons, versions] of [
  ['lae-101', 10, 10],
  ['economics-shorts', 25, 25],
  ['lae-what-is', 5, 25],
  ['micro-cases', 14, 42],
]) {
  const row = summary.byCollection[slug];
  if (row?.lessons !== lessons || row?.versions !== versions) {
    fail(`${slug} must stay ${lessons} lessons and ${versions} recordings.`);
  }
}
if (summary.byCollection['tea-shorts']?.lessons !== 2 || summary.byCollection['tea-shorts']?.versions !== 6) {
  fail('Tea Shorts must be two lessons and six recordings.');
}
const statLanguageIds = new Set(['en+zh', 'zh+en', 'hk+en', 'zh']);
const teaExpected = [
  {
    language: 'tea-en',
    label: 'English',
    youtube_id: 'PXyUCfLHOf8',
    title: 'One plant, six families of tea',
    source: 'https://kochiuyu.github.io/tea-companion/tea-labels.html#type-map',
    sha256: 'b70ad0e6f1e67b6ef7352a26361b5ad030c2330fa7ece7e8a8cf925c975fba3e',
  },
  {
    language: 'tea-cmn',
    label: '普通话',
    youtube_id: 'EZk3qvma1aU',
    title: '同一种茶树，六类茶',
    source: 'https://kochiuyu.github.io/tea-companion/zh-hans/tea-labels.html#type-map',
    sha256: 'a1171c434c06c07bbaef1f8fa9e7b180cf467372b664b3cff67d391efd2c608f',
  },
  {
    language: 'tea-yue',
    label: '粵語',
    youtube_id: 'DaQ19k9U6To',
    title: '同一種茶樹，六類茶',
    source: 'https://kochiuyu.github.io/tea-companion/zh-hant-hk/tea-labels.html#type-map',
    sha256: '8fb44d06cf30b49be6485cdcba907bd7258734acbfd30079131a1e81cfd2cded',
  },
];
const tea02Expected = [
  {
    language: 'tea-en',
    label: 'English',
    youtube_id: '0IUvlR4wEeY',
    title: 'Is chamomile tea?',
    source: 'https://kochiuyu.github.io/tea-companion/tea-basics.html',
    sha256: '48cc1f5034bdd5e94279fec4c6982c4f10b21b1eeb33972776c40711d8e2679b',
  },
  {
    language: 'tea-cmn',
    label: '普通话',
    youtube_id: '7wqlXKwPN5c',
    title: '洋甘菊是茶吗？',
    source: 'https://kochiuyu.github.io/tea-companion/zh-hans/tea-basics.html',
    sha256: '9b1c5ee80c8524df67ae14419643d47e507e0df2b827596ee105867a1013668e',
  },
  {
    language: 'tea-yue',
    label: '粵語',
    youtube_id: 'XqEDrAEpoKM',
    title: '洋甘菊是茶嗎？',
    source: 'https://kochiuyu.github.io/tea-companion/zh-hant-hk/tea-basics.html',
    sha256: '05db180217051a6b63e98afb9e81279aed0d42e2c08f396ede101a4f7eb9e1af',
  },
];
const tea = catalog.videos.filter((item) => item.collection_slug === 'tea-shorts');
const teaIds = new Set(tea.map((item) => item.id));
if (tea.length !== 6 || teaIds.size !== 2 || !teaIds.has('TEA-T01') || !teaIds.has('TEA-T02')) {
  fail('Tea Shorts must be T01 and T02, each with three recordings.');
}
for (const topic of ['T03', 'T04', 'T05', 'T06', 'T07']) {
  if (tea.some((item) => item.topic === topic)) fail(`${topic} is not part of this catalog.`);
}
for (const id of ['EvkN-c9pn2g', 'QztZN6gktzg']) {
  if (catalog.videos.some((item) => item.youtube_id === id)) fail(`${id} is not part of this catalog.`);
}
for (const expected of teaExpected) {
  const item = tea.find((video) => video.youtube_id === expected.youtube_id);
  if (!item) {
    fail(`Tea Shorts is missing ${expected.youtube_id}.`);
    continue;
  }
  if (item.id !== 'TEA-T01' || item.topic !== 'T01' || item.module != null) {
    fail(`${expected.youtube_id} is not T01.`);
  }
  if (item.language !== expected.language || item.language_label !== expected.label) {
    fail(`${expected.youtube_id} language does not match its recording.`);
  }
  if (statLanguageIds.has(item.language)) fail(`${expected.youtube_id} uses a STAT language track.`);
  if (item.title !== expected.title) fail(`${expected.youtube_id} title is not the public title.`);
  if (item.duration != null) fail(`${expected.youtube_id} duration must stay null.`);
  if (item.youtube_url !== `https://www.youtube.com/watch?v=${expected.youtube_id}`) {
    fail(`${expected.youtube_id} watch URL is not the canonical watch URL.`);
  }
  if (!item.description?.includes(expected.source)) fail(`${expected.youtube_id} description dropped its source page.`);
  if (crypto.createHash('sha256').update(item.description ?? '').digest('hex') !== expected.sha256) {
    fail(`${expected.youtube_id} description is not the public shortDescription.`);
  }
  if (item.description?.endsWith('\n')) fail(`${expected.youtube_id} description must not have a trailing newline.`);
  if (lessonKey(item) !== 'tea-shorts\nTEA-T01') fail(`${expected.youtube_id} is not grouped as one Tea Shorts lesson.`);
  if (item.thumbnail != null) fail(`${expected.youtube_id} must keep the oardefault.jpg Shorts cover.`);
}
for (const expected of tea02Expected) {
  const item = tea.find((video) => video.youtube_id === expected.youtube_id);
  if (!item) {
    fail(`Tea Shorts is missing ${expected.youtube_id}.`);
    continue;
  }
  if (item.id !== 'TEA-T02' || item.topic !== 'T02' || item.module != null) {
    fail(`${expected.youtube_id} is not T02.`);
  }
  if (item.language !== expected.language || item.language_label !== expected.label) {
    fail(`${expected.youtube_id} language does not match its recording.`);
  }
  if (statLanguageIds.has(item.language)) fail(`${expected.youtube_id} uses a STAT language track.`);
  if (item.title !== expected.title) fail(`${expected.youtube_id} title is not the public title.`);
  if (item.duration != null) fail(`${expected.youtube_id} duration must stay null.`);
  if (item.youtube_url !== `https://www.youtube.com/watch?v=${expected.youtube_id}`) {
    fail(`${expected.youtube_id} watch URL is not the canonical watch URL.`);
  }
  if (!item.description?.includes(expected.source)) fail(`${expected.youtube_id} description dropped its source page.`);
  if (item.description?.endsWith('\n')) fail(`${expected.youtube_id} description must not have a trailing newline.`);
  if (crypto.createHash('sha256').update(item.description ?? '').digest('hex') !== expected.sha256) {
    fail(`${expected.youtube_id} description is not the public player text.`);
  }
  if (lessonKey(item) !== 'tea-shorts\nTEA-T02') fail(`${expected.youtube_id} is not grouped as Tea Shorts T02.`);
  if (item.thumbnail !== 'hq720.jpg') {
    fail(`${expected.youtube_id} must use hq720.jpg because oardefault.jpg is not on i.ytimg.`);
  }
}
const thumbnailOverrides = catalog.videos.filter((item) => item.thumbnail != null);
const t02Ids = new Set(tea02Expected.map((item) => item.youtube_id));
if (thumbnailOverrides.length !== 3 || thumbnailOverrides.some((item) => !t02Ids.has(item.youtube_id))) {
  fail('Only the three T02 recordings may set a thumbnail override.');
}
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
const acc04Expected = [
  {
    language: 'mc-en',
    label: 'English',
    youtube_id: 'j1Mqyo9azI0',
    title: 'ACC-04 · The stock is all there. Is it worth the same? (English)',
    casePage: 'https://kochiuyu.github.io/micro-cases/count-and-value.html',
    sha256: '60cfad1869550a75c02c212ac7eae555f9865d03a95586de6825eb82c277fd72',
  },
  {
    language: 'mc-cmn',
    label: '普通话',
    youtube_id: 'clafASuRNBg',
    title: 'ACC-04 · 货一件不少，价值就没变吗？（普通话）',
    casePage: 'https://kochiuyu.github.io/micro-cases/zh-cn/count-and-value.html',
    sha256: 'eb4e43b4840d9fdfb91668a340fd952034a85c559ae9b5ec4b9bf0b6ba68591c',
  },
  {
    language: 'mc-yue',
    label: '廣東話',
    youtube_id: 'p98piMHwA8Y',
    title: 'ACC-04 · 貨全在，還值原本的金額嗎？（廣東話）',
    casePage: 'https://kochiuyu.github.io/micro-cases/zh-hk/count-and-value.html',
    sha256: '9c57b1c41fc03f811b202c44eebbc9b311abc2df18303f42f21f9e07d07d0b20',
  },
];
const fin01Expected = [
  {
    language: 'mc-en',
    label: 'English',
    youtube_id: 'GA8-62W4ptQ',
    title: 'FIN-01 · When the star sits out (English)',
    casePage: 'https://kochiuyu.github.io/micro-cases/match.html',
    sha256: '002d1517f94d463e32c9bece4713dada3d175e3bd71aac0e4d2406357682339a',
  },
  {
    language: 'mc-cmn',
    label: '普通话',
    youtube_id: 'r8poa-aQMtc',
    title: 'FIN-01 · 球星没有上场，由谁承担？（普通话）',
    casePage: 'https://kochiuyu.github.io/micro-cases/zh-cn/match.html',
    sha256: '776add6345bd385572143e8a43dbd745dffabec3d553fa61d23f21a6cad0fa93',
  },
  {
    language: 'mc-yue',
    label: '廣東話',
    youtube_id: 'xqgkTiDSTv4',
    title: 'FIN-01 · 球星沒有上場，由誰承擔？（廣東話）',
    casePage: 'https://kochiuyu.github.io/micro-cases/zh-hk/match.html',
    sha256: '1a11fe010dd7f4f9ea19bb5a135f6a458fea10a7f25fac54f6a4364d32cf02ed',
  },
];
const fin02Expected = [
  {
    language: 'mc-en',
    label: 'English',
    youtube_id: 'VGywQb1zanU',
    title: 'FIN-02 · The red minibus bid (English)',
    casePage: 'https://kochiuyu.github.io/micro-cases/minibus.html',
    sha256: 'ee5d378e8bc289532d8f56eab229796d967ee48fe387e07378bd51d19709f6f0',
  },
  {
    language: 'mc-cmn',
    label: '普通话',
    youtube_id: 'EtDwBboVmtI',
    title: 'FIN-02 · 这辆红色小巴，你出多少？（普通话）',
    casePage: 'https://kochiuyu.github.io/micro-cases/zh-cn/minibus.html',
    sha256: 'afe7c2ffc7004b354d86733b611319b04b5253e70db4b93c98d4dedd5bb9a996',
  },
  {
    language: 'mc-yue',
    label: '廣東話',
    youtube_id: 'PHgat2vIRbc',
    title: 'FIN-02 · 這輛紅色小巴，你出多少？（廣東話）',
    casePage: 'https://kochiuyu.github.io/micro-cases/zh-hk/minibus.html',
    sha256: '23676967185d4dfb31834ec010f09fb0fe2cadd05a4fdedc294ed0f9f16ac73f',
  },
];
const fin03Expected = [
  {
    language: "mc-en",
    label: "English",
    youtube_id: "OeiP-qAIIDc",
    title: "FIN-03 · The biggest order, the smallest cash balance (English)",
    casePage: "https://kochiuyu.github.io/micro-cases/cash-flow.html",
    sha256: "2048fe63114ce13cbac2bbb571b79e1656139cc19a6202efa14e517ee98ed73c",
  },
  {
    language: "mc-cmn",
    label: "普通话",
    youtube_id: "qOKn14OPQgI",
    title: "FIN-03 · 最大的订单，最紧的现金（普通话）",
    casePage: "https://kochiuyu.github.io/micro-cases/zh-cn/cash-flow.html",
    sha256: "d22d0d6e8e6ab8aabb3f4957a9bbc3bd34d077bfca91d383048127b5a4683ada",
  },
  {
    language: "mc-yue",
    label: "廣東話",
    youtube_id: "CNkL1dHjnZo",
    title: "FIN-03 · 最大的訂單，最緊的現金（廣東話）",
    casePage: "https://kochiuyu.github.io/micro-cases/zh-hk/cash-flow.html",
    sha256: "1d1196654b3829213c0cfb916c111943106e2c0657473c1535addacf76182ccb",
  },
];
const fin04Expected = [
  {
    language: "mc-en",
    label: "English",
    youtube_id: "EAcNlzMLh7I",
    title: "FIN-04 · The invoice is not the exposure (English)",
    casePage: "https://kochiuyu.github.io/micro-cases/invoice-exposure.html",
    sha256: "0041817b6d4166f843995f3a30f11c990555345bce38466bea28407468558765",
  },
  {
    language: "mc-cmn",
    label: "普通话",
    youtube_id: "v4YfvgdcDAE",
    title: "FIN-04 · 发票金额，不是风险敞口（普通话）",
    casePage: "https://kochiuyu.github.io/micro-cases/zh-cn/invoice-exposure.html",
    sha256: "d19659cf22bd6ae9fed2947e17795dde6a02adb03aa24509b9a35db60affbb77",
  },
  {
    language: "mc-yue",
    label: "廣東話",
    youtube_id: "nUgtZfLaoGU",
    title: "FIN-04 · 發票金額，並非外匯風險（廣東話）",
    casePage: "https://kochiuyu.github.io/micro-cases/zh-hk/invoice-exposure.html",
    sha256: "5d09e0da5dd167be9995d59c5b380096ce66bd38fe931275e09e87866bc14554",
  },
];
const fin05Expected = [
  {
    language: "mc-en",
    label: "English",
    youtube_id: "Qau-HM-85-E",
    title: "FIN-05 · A larger limit. The same gap? (English)",
    casePage: "https://kochiuyu.github.io/micro-cases/same-gap.html",
    sha256: "f9fb3f9ed2da69d0981945387b39694bccc67bccb6b09fa488f4c612c1758ad5",
  },
  {
    language: "mc-cmn",
    label: "普通话",
    youtube_id: "tbI7P8_zoAM",
    title: "FIN-05 · 上限提高了，缺口还在吗？（普通话）",
    casePage: "https://kochiuyu.github.io/micro-cases/zh-cn/same-gap.html",
    sha256: "4974510252fee32aca17373199f68f4fa2d03ef0984b2297d42007077471ec91",
  },
  {
    language: "mc-yue",
    label: "廣東話",
    youtube_id: "440x4VRAgz0",
    title: "FIN-05 · 上限提高了，缺口是否依舊？（廣東話）",
    casePage: "https://kochiuyu.github.io/micro-cases/zh-hk/same-gap.html",
    sha256: "662b531db5525ba821e1d3f5b5a9e776947924afd62ca1ed634dd7f6b3c0364d",
  },
];
const fin06Expected = [
  {
    language: "mc-en",
    label: "English",
    youtube_id: "kzGc6WQohFg",
    title: "FIN-06 · Smaller payments. Cheaper loan? (English)",
    casePage: "https://kochiuyu.github.io/micro-cases/smaller-payments.html",
    sha256: "7a79123e9561f6ca597ecc5d83716958b2c92fb06b9b7df056ad34dbf7f4c7d8",
  },
  {
    language: "mc-cmn",
    label: "普通话",
    youtube_id: "3EOWmBLrDVQ",
    title: "FIN-06 · 月供更少，贷款就更便宜吗？（普通话）",
    casePage: "https://kochiuyu.github.io/micro-cases/zh-cn/smaller-payments.html",
    sha256: "37fcfb7bb83b6fe179a8443e35afe317a4ea16597c3faccdf3cdc94ed7f3ebbf",
  },
  {
    language: "mc-yue",
    label: "廣東話",
    youtube_id: "2OG1VTp9KSI",
    title: "FIN-06 · 供款少了，這筆貸款就更平嗎？（廣東話）",
    casePage: "https://kochiuyu.github.io/micro-cases/zh-hk/smaller-payments.html",
    sha256: "69343cc50039f379eff37b8b48ccb84214aa89d4b38c6f2a655959e92813285d",
  },
];
const fin07Expected = [
  {
    language: "mc-en",
    label: "English",
    youtube_id: "V4QeDVOF-2M",
    title: "FIN-07 · A discount for paying sooner. Sooner than what? (English)",
    casePage: "https://kochiuyu.github.io/micro-cases/sooner-than-what.html",
    sha256: "39043c92492a58a7d6d5b52c90ec8722d68b1a69249efbcbbae1f4090c2957a8",
  },
  {
    language: "mc-cmn",
    label: "普通话",
    youtube_id: "8OyobFAT6v0",
    title: "FIN-07 · 提早付款有折扣。比什么更早？（普通话）",
    casePage: "https://kochiuyu.github.io/micro-cases/zh-cn/sooner-than-what.html",
    sha256: "fa10352af5570d63453cc45ba961b8516c5591f51c8b253ac73a020e35891035",
  },
  {
    language: "mc-yue",
    label: "廣東話",
    youtube_id: "aflFEPkATd0",
    title: "FIN-07 · 提早付款有折扣。早過甚麼？（廣東話）",
    casePage: "https://kochiuyu.github.io/micro-cases/zh-hk/sooner-than-what.html",
    sha256: "0146ef5624ce047a23af90050e8c7af9811ac19f276dbda2effe16996b3804cd",
  },
];
const fin08Expected = [
  {
    language: "mc-en",
    label: "English",
    youtube_id: "QNdl2tdO-lw",
    title: "FIN-08 · Back sooner. Worth more? (English)",
    casePage: "https://kochiuyu.github.io/micro-cases/back-sooner.html",
    sha256: "2ad3f9e7226ffeae241257d35d31cfc8fe18b0dcb515b3934e584747bcad3c10",
  },
  {
    language: "mc-cmn",
    label: "普通话",
    youtube_id: "7eWqEtRlSSs",
    title: "FIN-08 · 回来得更早，就更值钱吗？（普通话）",
    casePage: "https://kochiuyu.github.io/micro-cases/zh-cn/back-sooner.html",
    sha256: "cd06bb3a07084f38632b63d94d1e09363413faebddd1b6c6d16a9c1a2b66d12d",
  },
  {
    language: "mc-yue",
    label: "廣東話",
    youtube_id: "C_zTgU6kyys",
    title: "FIN-08 · 回來得早，是否更有價值？（廣東話）",
    casePage: "https://kochiuyu.github.io/micro-cases/zh-hk/back-sooner.html",
    sha256: "55959974bce3f278068e85d7fe7014de584baf67fd1d854cb9aa36b54bd24c32",
  },
];
const fin09Expected = [
  {
    language: "mc-en",
    label: "English",
    youtube_id: "oE09NSa8aoA",
    title: "FIN-09 · One bank. Two kinds of safety. (English)",
    casePage: "https://kochiuyu.github.io/micro-cases/protected-and-available.html",
    sha256: "40ed29a9b8b8a9e8a0b606623503551770398933c0e85781a4f50b635f57b0cc",
  },
  {
    language: "mc-cmn",
    label: "普通话",
    youtube_id: "cVfpsOE_0I8",
    title: "FIN-09 · 同一家银行，两种安全（普通话）",
    casePage: "https://kochiuyu.github.io/micro-cases/zh-cn/protected-and-available.html",
    sha256: "5da29f7e79612e77e1f3712ca5dbd1400ed14808af962e02fabdfde683f1b07e",
  },
  {
    language: "mc-yue",
    label: "廣東話",
    youtube_id: "CYp8xEb9GSE",
    title: "FIN-09 · 同一間銀行，兩種安全（廣東話）",
    casePage: "https://kochiuyu.github.io/micro-cases/zh-hk/protected-and-available.html",
    sha256: "b5269b407e5ba077629c153e179b8d206a6d92965668f15b5dfbf1b438e92874",
  },
];
const fin10Expected = [
  {
    language: "mc-en",
    label: "English",
    youtube_id: "_lcD6lRqFn8",
    title: "FIN-10 · Twenty per cent. Only once? (English)",
    casePage: "https://kochiuyu.github.io/micro-cases/only-once.html",
    sha256: "3520212382c9ab01100fb5d74cfd45384a8975c337b4fe6c206edab177d47385",
  },
  {
    language: "mc-cmn",
    label: "普通话",
    youtube_id: "Z37KkN1cFEE",
    title: "FIN-10 · 百分之二十，只发生一次吗？（普通话）",
    casePage: "https://kochiuyu.github.io/micro-cases/zh-cn/only-once.html",
    sha256: "db54518c81c7831ee48a3162283c198f14633c6a1cd093eccd1b752f80b92579",
  },
  {
    language: "mc-yue",
    label: "廣東話",
    youtube_id: "-GfgYAgPkn4",
    title: "FIN-10 · 百分之二十，只發生一次嗎？（廣東話）",
    casePage: "https://kochiuyu.github.io/micro-cases/zh-hk/only-once.html",
    sha256: "faa4a9fe262a57337f1dc0cf50d7089be4571242396838891675604a75cc537b",
  },
];
const acc04 = catalog.videos.filter((item) => item.id === 'ACC-04');
if (acc04.length !== 3) fail('ACC-04 must be one lesson with three recordings.');
if (
  microIds.join(',') !==
  [...accExpected, ...acc02Expected, ...acc03Expected, ...acc04Expected, ...fin01Expected, ...fin02Expected, ...fin03Expected, ...fin04Expected, ...fin05Expected, ...fin06Expected, ...fin07Expected, ...fin08Expected, ...fin09Expected, ...fin10Expected]
    .map((item) => item.youtube_id)
    .join(',')
) {
  fail('Micro Cases recordings changed order or identity.');
}
for (const expected of acc04Expected) {
  const item = acc04.find((video) => video.youtube_id === expected.youtube_id);
  if (!item) {
    fail(`ACC-04 is missing ${expected.youtube_id}.`);
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
  if (!item.description?.includes(expected.casePage) || !item.description.endsWith('\n')) {
    fail(`${expected.youtube_id} description dropped the case page or its trailing newline.`);
  }
  if (crypto.createHash('sha256').update(item.description ?? '').digest('hex') !== expected.sha256) {
    fail(`${expected.youtube_id} description is not the official source text.`);
  }
  if (lessonKey(item) !== 'micro-cases\nACC-04') fail(`${expected.youtube_id} is not grouped as case ACC-04.`);
}
for (const [caseId, expectedRows] of [
  ['FIN-01', fin01Expected],
  ['FIN-02', fin02Expected],
  ['FIN-03', fin03Expected],
  ['FIN-04', fin04Expected],
  ['FIN-05', fin05Expected],
  ['FIN-06', fin06Expected],
  ['FIN-07', fin07Expected],
  ['FIN-08', fin08Expected],
  ['FIN-09', fin09Expected],
  ['FIN-10', fin10Expected],
]) {
  const rows = catalog.videos.filter((item) => item.id === caseId);
  if (rows.length !== 3) fail(`${caseId} must be one lesson with three recordings.`);
  for (const expected of expectedRows) {
    const item = rows.find((video) => video.youtube_id === expected.youtube_id);
    if (!item) {
      fail(`${caseId} is missing ${expected.youtube_id}.`);
      continue;
    }
    if (item.collection_slug !== 'micro-cases' || item.topic !== 'Finance' || item.module != null) {
      fail(`${expected.youtube_id} is not grouped as a Finance micro-case.`);
    }
    if (item.language !== expected.language || item.language_label !== expected.label) {
      fail(`${expected.youtube_id} language label does not match its recording.`);
    }
    if (statLanguageIds.has(item.language)) fail(`${expected.youtube_id} uses a STAT language track.`);
    if (item.title !== expected.title) fail(`${expected.youtube_id} title is not the oEmbed title.`);
    if (item.duration != null) fail(`${expected.youtube_id} duration must stay null.`);
    if (item.youtube_url !== `https://www.youtube.com/watch?v=${expected.youtube_id}`) {
      fail(`${expected.youtube_id} watch URL is not the canonical watch URL.`);
    }
    if (!item.description?.includes(expected.casePage) || !item.description.endsWith('\n')) {
      fail(`${expected.youtube_id} description dropped the case page or its trailing newline.`);
    }
    if (crypto.createHash('sha256').update(item.description ?? '').digest('hex') !== expected.sha256) {
      fail(`${expected.youtube_id} description is not the official source text.`);
    }
    if (lessonKey(item) !== `micro-cases\n${caseId}`) fail(`${expected.youtube_id} is not grouped as case ${caseId}.`);
  }
}
for (const id of ['ACC-05', 'ACC-06', 'ACC-07', 'ACC-08', 'ACC-09', 'ACC-10']) {
  if (catalog.videos.some((item) => item.id === id)) fail(`${id} is not part of this catalog.`);
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
