import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadCatalog, topicSlug, trackSlug } from './catalog-lib.mjs';
import { lessonCountText, summarizeLessons } from './lessons.mjs';
import './check-lessons.mjs';
import './check-stat-lessons.mjs';
import './check-youtube-descriptions.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');
const catalog = loadCatalog(path.join(root, 'catalog', 'allowlist.json'));
const statLessons = JSON.parse(fs.readFileSync(path.join(root, 'catalog', 'stat-lessons.json'), 'utf8'));
const errors = [];

function fail(message) {
  errors.push(message);
}

function read(rel) {
  const file = path.join(dist, rel);
  if (!fs.existsSync(file)) {
    fail(`Missing ${rel}`);
    return '';
  }
  return fs.readFileSync(file, 'utf8');
}

function walk(dir) {
  const files = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...walk(full));
    else if (entry.name.endsWith('.html')) files.push(full);
  }
  return files;
}

function decode(value) {
  return value
    .replace(/&#(\d+);/g, (_, digits) => String.fromCodePoint(Number(digits)))
    .replace(/&#x([0-9a-f]+);/gi, (_, digits) => String.fromCodePoint(parseInt(digits, 16)))
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"');
}

function appears(html, text) {
  if (!text) return true;
  return html.includes(text) || decode(html).includes(text);
}

function iframes(html) {
  const tags = html.match(/<iframe\b[^>]*>/gi) ?? [];
  return tags.map((tag) => {
    const src = /src="([^"]*)"/.exec(tag)?.[1] ?? '';
    const title = decode(/title="([^"]*)"/.exec(tag)?.[1] ?? '');
    return { src, title };
  });
}

if (!fs.existsSync(dist)) {
  console.error('dist/ is missing. Run npm run build first.');
  process.exit(1);
}

const htmlFiles = walk(dist);
const byRel = new Map(
  htmlFiles.map((file) => [path.relative(dist, file).split(path.sep).join('/'), fs.readFileSync(file, 'utf8')]),
);

const expected = new Set(['index.html', '404.html', 'search/index.html', 'tracks/index.html']);
for (const collection of catalog.collections) {
  expected.add(`collections/${collection.slug}/index.html`);
}

const moduleIds = new Set();
const topicKeys = new Set();
for (const video of catalog.videos) {
  expected.add(`videos/${video.youtube_id}/index.html`);
  if (video.collection_slug === 'stat-lessons' && video.module) {
    moduleIds.add(video.module.toLowerCase());
    topicKeys.add(`${video.module.toLowerCase()}/${video.topic.toLowerCase()}`);
  }
}
for (const moduleId of moduleIds) expected.add(`stat-lessons/${moduleId}/index.html`);
for (const topicKey of topicKeys) expected.add(`stat-lessons/${topicKey}/index.html`);
const econTopics = new Set(
  catalog.videos.filter((video) => video.collection_slug === 'economics-shorts').map((video) => video.topic),
);
for (const topic of econTopics) expected.add(`economics-shorts/${topicSlug(topic)}/index.html`);
const laeWhatTopics = new Set(
  catalog.videos.filter((video) => video.collection_slug === 'lae-what-is').map((video) => video.topic),
);
for (const topic of laeWhatTopics) expected.add(`lae-what-is/${topicSlug(topic)}/index.html`);
const statLanguageIds = new Set(['en+zh', 'zh+en', 'hk+en', 'zh']);
for (const language of catalog.languages) {
  if (statLanguageIds.has(language.id)) expected.add(`tracks/${trackSlug(language.id)}/index.html`);
}

for (const rel of expected) {
  if (!byRel.has(rel)) fail(`Missing expected page ${rel}`);
}

const allowlisted = new Map(catalog.videos.map((video) => [video.youtube_id, video]));
const embedSrcs = [];

for (const [rel, html] of byRel) {
  if (!html.includes('<html lang="en">')) fail(`${rel} missing <html lang="en">`);
  if (!html.includes('href="#content"')) fail(`${rel} missing skip link`);
  const h1s = html.match(/<h1\b/g) ?? [];
  if (h1s.length !== 1) fail(`${rel} has ${h1s.length} h1 elements`);
  if (/>null</.test(html) || />undefined</.test(html)) fail(`${rel} renders null or undefined`);
  if (/public_progress|videos\.qmd|series-retitle|HeyGen|DSME2021/i.test(html)) {
    fail(`${rel} leaks excluded or internal source text`);
  }
  if (/playlist\?|[?&]list=/.test(html)) fail(`${rel} contains a playlist URL`);
  if (/href="\/(?!educational-videos\/)/.test(html)) {
    fail(`${rel} has a root link that skips the /educational-videos/ base path`);
  }
  if (/src="\/_astro|src="\/favicon|href="\/favicon/.test(html)) {
    fail(`${rel} has an asset URL that skips the base path`);
  }

  const frames = iframes(html);
  const isVideo = rel.startsWith('videos/') && rel.endsWith('/index.html');
  if (isVideo && frames.length !== 1) fail(`${rel} should have exactly one iframe, found ${frames.length}`);
  if (!isVideo && frames.length !== 0) fail(`${rel} should not embed a video`);
  for (const frame of frames) {
    embedSrcs.push(frame.src);
    const id = frame.src.replace('https://www.youtube.com/embed/', '');
    if (frame.src !== `https://www.youtube.com/embed/${id}`) {
      fail(`${rel} iframe src is not a standard embed: ${frame.src}`);
    }
    const video = allowlisted.get(id);
    if (!video) fail(`${rel} embeds unknown id ${id}`);
    else if (frame.title !== video.title) {
      fail(`${rel} iframe title does not match the verified title`);
    }
  }
}

for (const video of catalog.videos) {
  const rel = `videos/${video.youtube_id}/index.html`;
  const html = byRel.get(rel) ?? '';
  if (!html) continue;
  if (!appears(html, video.title)) fail(`${rel} is missing the verified title`);
  const expectedSrc = `https://www.youtube.com/embed/${video.youtube_id}`;
  if (!html.includes(`src="${expectedSrc}"`)) fail(`${rel} is missing ${expectedSrc}`);
  if (!html.includes(`href="${video.youtube_url}"`)) fail(`${rel} is missing the watch URL`);
  const hasDescription = Boolean(video.description);
  const showsDescription = html.includes('id="description-heading"');
  if (hasDescription !== showsDescription) {
    fail(`${rel} description heading presence is ${showsDescription}, catalog has description: ${hasDescription}`);
  }
  if (hasDescription) {
    const firstLine = video.description.split('\n').find((line) => line.trim());
    if (firstLine && !appears(html, firstLine.trim())) {
      fail(`${rel} is missing the start of the verified description`);
    }
  }
  const showsDuration = html.includes('<dt>Duration</dt>');
  if (Boolean(video.duration) !== showsDuration) {
    fail(`${rel} duration fact presence does not match the catalog`);
  }
  if (video.module_title && !appears(html, video.module_title)) {
    fail(`${rel} is missing module_title`);
  }
  if (!video.module_title && html.includes('<dt>Module title</dt>')) {
    fail(`${rel} invents a module title`);
  }
  const lesson = statLessons.videos?.[video.youtube_id];
  const quiz = video.collection_slug === 'stat-lessons' && Array.isArray(lesson?.quiz) ? lesson.quiz : [];
  const showsQuiz = html.includes('id="quiz-heading"');
  if ((quiz.length > 0) !== showsQuiz) {
    fail(`${rel} quiz heading presence is ${showsQuiz}, derived quiz items: ${quiz.length}`);
  }
  if (quiz.length > 0) {
    const decoded = decode(html);
    for (const item of quiz) {
      if (!decoded.includes(item.question)) fail(`${rel} is missing a quiz question`);
      if (!decoded.includes(`lang="${item.lang}"`)) fail(`${rel} is missing lang="${item.lang}"`);
      for (const option of item.options) {
        if (!decoded.includes(option)) fail(`${rel} is missing a quiz option`);
      }
      const questionAt = decoded.indexOf(item.question);
      const detailsAt = decoded.indexOf('<details>', questionAt);
      const detailsEnd = decoded.indexOf('</details>', detailsAt);
      const block = detailsAt >= 0 && detailsEnd > detailsAt ? decoded.slice(detailsAt, detailsEnd) : '';
      if (!block.includes(item.answer) || !block.includes(item.explanation)) {
        fail(`${rel} does not keep the answer and explanation inside the disclosure`);
      }
      if (!block.includes('Show the answer') && !decoded.includes('Show the answer')) {
        fail(`${rel} is missing the answer disclosure`);
      }
    }
  }
}

const search = byRel.get('search/index.html') ?? '';
for (const id of ['q', 'collection', 'module', 'topic', 'language']) {
  if (!search.includes(`for="${id}"`) || !search.includes(`id="${id}"`)) {
    fail(`search page is missing a labeled control #${id}`);
  }
}
if (!search.includes('aria-live="polite"')) fail('search page is missing a live result count');

const lessonSummary = summarizeLessons(catalog.videos);
const home = byRel.get('index.html') ?? '';
if (!home.includes(`${lessonSummary.lessons} lessons`)) {
  fail('home page is missing the distinct lesson count');
}
if (!home.includes(String(catalog.videos.length))) fail('home page is missing the recording count');
if (!home.includes('recordings, including language versions')) {
  fail('home page does not explain that recordings include language versions');
}
if (home.includes('public videos') || home.includes('public teaching videos')) {
  fail('home page calls the catalog public videos');
}
for (const collection of catalog.collections) {
  if (!appears(home, collection.name) || !appears(home, collection.description)) {
    fail(`home page is missing collection copy for ${collection.slug}`);
  }
  const row = lessonSummary.byCollection[collection.slug];
  const label = lessonCountText(row.lessons, row.versions);
  if (!appears(home, label)) fail(`home page is missing ${label} for ${collection.slug}`);
}
if (!home.includes('id="home-q"') || !home.includes('for="home-q"')) {
  fail('home page is missing a labeled search field');
}

const uniqueEmbeds = new Set(embedSrcs);
if (uniqueEmbeds.size !== catalog.videos.length) {
  fail(`Expected ${catalog.videos.length} embeds, found ${uniqueEmbeds.size}`);
}

if (errors.length) {
  console.error(`dist check failed (${errors.length}):`);
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

const byCollection = new Map();
const byModule = new Map();
for (const video of catalog.videos) {
  byCollection.set(video.collection, (byCollection.get(video.collection) ?? 0) + 1);
  if (video.module) byModule.set(video.module, (byModule.get(video.module) ?? 0) + 1);
}
console.log(`dist OK: ${byRel.size} HTML pages, ${uniqueEmbeds.size} YouTube embeds.`);
for (const [name, count] of byCollection) console.log(`  ${name}: ${count}`);
for (const [moduleId, count] of [...byModule.entries()].sort()) console.log(`  ${moduleId}: ${count}`);
