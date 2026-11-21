import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadCatalog } from './catalog-lib.mjs';
import { factoryPrefix, matchFactoryFile, narrationLang, parseLessonNumber } from './stat-map.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const catalog = loadCatalog(path.join(root, 'catalog', 'allowlist.json'));
const lessons = JSON.parse(fs.readFileSync(path.join(root, 'catalog', 'stat-lessons.json'), 'utf8'));
const errors = [];

function fail(message) {
  errors.push(message);
}

const files = lessons.source?.files;
if (!Array.isArray(files) || files.length === 0) fail('Derived lesson file is missing the factory filename list.');
if (lessons.source?.repo !== 'https://github.com/kochiuyu/video-factory') {
  fail('Derived lesson source is not kochiuyu/video-factory.');
}
if (lessons.source?.path !== 'lessons/STAT') fail('Derived lesson source path is not lessons/STAT.');
if (!/STAT X\.YY/.test(lessons.source?.mapping ?? '') || !/統計 X\.YY/.test(lessons.source?.mapping ?? '')) {
  fail('Derived lesson mapping note does not name the YouTube lesson number.');
}
if (!/catalog topic codes and catalog ids are not used/i.test(lessons.source?.mapping ?? '')) {
  fail('Derived lesson mapping note must say catalog topic codes are not used.');
}

const statVideos = catalog.videos.filter((video) => video.collection_slug === 'stat-lessons');
const otherIds = new Set(
  catalog.videos.filter((video) => video.collection_slug !== 'stat-lessons').map((video) => video.youtube_id),
);
const derivedIds = Object.keys(lessons.videos ?? {});
if (derivedIds.length !== statVideos.length) {
  fail(`Derived lessons cover ${derivedIds.length} recordings; the catalog has ${statVideos.length} STAT recordings.`);
}
for (const id of derivedIds) {
  if (otherIds.has(id)) fail(`${id} is not a STAT recording and must not receive a quiz.`);
}

const examples = [
  {
    id: 'dgh99RbB43s',
    lesson: 'STAT-M01-T11-SKEW',
    number: '1.11',
    title: 'STAT 1.11 · What is skewness? (Speech: English · Slides: 简体)',
    catalogAgrees: false,
  },
  {
    id: 'VS7Qbq07ATM',
    lesson: 'STAT-M01-T01-INTRO',
    number: '1.01',
    title: 'STAT 1.01 · What is descriptive statistics? (Speech: English · Slides: 简体)',
    catalogAgrees: false,
  },
  {
    id: 'IfZSkxjGnIo',
    lesson: 'STAT-M01-T11-SKEW',
    number: '1.11',
    title: '统计 1.11 · 什么是偏度？（旁白：普通话 · 画面：English）',
    catalogAgrees: false,
  },
  {
    id: 'Yb4eqJPlp5g',
    lesson: 'STAT-M01-T02-MEAN',
    number: '1.02',
    title: '统计 1.02 · 什么是平均数？（旁白：普通话 · 画面：English）',
    catalogAgrees: false,
  },
  {
    id: 't42YutwalcM',
    lesson: 'STAT-M01-T13-COV',
    number: '1.13',
    title: '統計 1.13 · 咩係協方差？（旁白：粵語 · 畫面：English）',
    catalogAgrees: false,
  },
  {
    id: 'f8_qd5CERLA',
    lesson: 'STAT-M01-T01-INTRO',
    number: '1.01',
    title: '统计 1.01 · 什么是描述性统计？ (普通话)',
    catalogAgrees: true,
  },
];

const sampleFiles = [
  'STAT-M01-T01-INTRO.yaml',
  'STAT-M01-T02-MEAN.yaml',
  'STAT-M01-T11-SKEW.yaml',
  'STAT-M01-T13-COV.yaml',
  'STAT-M03-T01-INTRO.yaml',
];

if (parseLessonNumber('What is skewness?') !== null) fail('A title without a lesson number must not map.');
if (parseLessonNumber('STAT 1.11 and 统计 1.12') !== null) {
  fail('A title with two lesson numbers must not map.');
}
const covariance = parseLessonNumber(examples[4].title);
if (!covariance || covariance.label !== '1.13') fail('The 粵語 covariance title must parse as 1.13.');
if (!examples[4].title.includes('咩')) fail('The official covariance title must use 咩.');
if (matchFactoryFile(covariance.module, covariance.topic, sampleFiles) !== 'STAT-M01-T13-COV.yaml') {
  fail('1.13 must select STAT-M01-T13-COV, not the catalog topic file.');
}
if (matchFactoryFile(1, 1, ['STAT-M01-T01-INTRO.yaml', 'STAT-M01-T01-OTHER.yaml']) !== null) {
  fail('Two factory files for one lesson number must not be guessed.');
}

for (const example of examples) {
  const video = catalog.videos.find((item) => item.youtube_id === example.id);
  const record = lessons.videos?.[example.id];
  if (!video || !record) {
    fail(`${example.id} is missing from the catalog or the derived lessons.`);
    continue;
  }
  if (record.youtube_title !== example.title) fail(`${example.id} YouTube title does not match the official title.`);
  if (record.lesson !== example.lesson || record.lesson_number !== example.number) {
    fail(`${example.id} mapped to ${record.lesson} ${record.lesson_number}, expected ${example.lesson} ${example.number}.`);
  }
  const parsed = parseLessonNumber(example.title);
  const filename = parsed ? matchFactoryFile(parsed.module, parsed.topic, files) : null;
  if (filename !== `${example.lesson}.yaml`) {
    fail(`${example.id} title function returned ${filename}.`);
  }
  const catalogFile = matchFactoryFile(Number(video.module.slice(1)), Number(video.topic.slice(1)), files);
  const catalogAgrees = catalogFile === `${example.lesson}.yaml`;
  if (catalogAgrees !== example.catalogAgrees) {
    fail(`${example.id} catalog topic agreement was ${catalogAgrees}, expected ${example.catalogAgrees}.`);
  }
  if (!example.catalogAgrees && record.lesson.startsWith(`STAT-${video.module}-${video.topic}-`)) {
    fail(`${example.id} was mapped from the catalog topic code.`);
  }
}

const moduleThreeTopicOne = statVideos.filter((video) => video.module === 'M03' && video.topic === 'T01');
if (moduleThreeTopicOne.length !== 4) fail('M03 T01 should have four language tracks.');
const moduleThreeLessons = new Set(
  moduleThreeTopicOne.map((video) => lessons.videos?.[video.youtube_id]?.lesson_number),
);
if (moduleThreeLessons.size !== 1 || !moduleThreeLessons.has('3.01')) {
  fail('M03 T01 tracks must share YouTube lesson 3.01.');
}

for (const video of statVideos) {
  const record = lessons.videos?.[video.youtube_id];
  if (!record) {
    fail(`${video.youtube_id} has no derived lesson record.`);
    continue;
  }
  if (record.description_status === 'unmapped') {
    if (record.quiz) fail(`${video.youtube_id} is unmapped and must not have a quiz.`);
    const parsed = record.youtube_title ? parseLessonNumber(record.youtube_title) : null;
    const filename = parsed ? matchFactoryFile(parsed.module, parsed.topic, files) : null;
    if (filename) fail(`${video.youtube_id} parses to ${filename} but is unmapped.`);
    continue;
  }
  const parsed = parseLessonNumber(record.youtube_title);
  const filename = parsed ? matchFactoryFile(parsed.module, parsed.topic, files) : null;
  if (!parsed || filename !== `${record.lesson}.yaml` || record.lesson_number !== parsed.label) {
    fail(`${video.youtube_id} does not match its YouTube lesson number ${record.youtube_title}.`);
  }
  if (!record.lesson.startsWith(factoryPrefix(parsed.module, parsed.topic))) {
    fail(`${video.youtube_id} lesson file does not start with the parsed lesson number.`);
  }
  if (!Array.isArray(record.quiz) || record.quiz.length !== 2) {
    fail(`${video.youtube_id} quiz does not have the two official items.`);
  } else {
    const lang = narrationLang(video.language);
    for (const item of record.quiz) {
      if (!item.question || !item.answer || !item.explanation) {
        fail(`${video.youtube_id} quiz item is missing official text.`);
      }
      if (!Array.isArray(item.options) || item.options.length < 2) {
        fail(`${video.youtube_id} quiz item is missing options.`);
      }
      if (item.lang !== lang) fail(`${video.youtube_id} quiz language is ${item.lang}, expected ${lang}.`);
    }
  }
  if (record.description_status === 'kept') {
    if (!video.description) fail(`${video.youtube_id} is marked kept but has no catalog description.`);
  } else if (record.description_status !== 'missing_objective') {
    fail(`${video.youtube_id} has an unknown description status ${record.description_status}.`);
  }
}

if (errors.length) {
  console.error(`STAT lesson check failed (${errors.length}):`);
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

const counts = lessons.counts ?? {};
console.log(
  `STAT lessons OK: ${counts.mapped ?? 0} mapped, ${counts.quizzes ?? 0} quizzes, ${counts.descriptions_filled ?? 0} descriptions filled, ${counts.missing_objective ?? 0} missing objectives, ${counts.unmapped ?? 0} unmapped.`,
);
