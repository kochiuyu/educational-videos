import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadCatalog, topicSlug, trackSlug } from './catalog-lib.mjs';
import { canonicalStatLabel, lessonCountText, statModuleCoverId, summarizeLessons } from './lessons.mjs';
import { collectionCardCopy, readerIntro } from './reader-copy.mjs';
import { parseLessonNumber } from './stat-map.mjs';
import './check-lessons.mjs';
import { assertPreviewMarkup } from './check-preview.mjs';
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

function shownTitle(video) {
  if (video.collection_slug !== 'stat-lessons') return video.title;
  const official = statLessons.videos?.[video.youtube_id]?.youtube_title;
  return typeof official === 'string' && official.trim() ? official : video.title;
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
    const label = canonicalStatLabel(video);
    if (label) topicKeys.add(`${video.module.toLowerCase()}/t${label.split('.')[1]}`);
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
  // A description may link the playlist URL it already quotes. Playback links may not.
  const playlistAttrs = html.match(/(?:href|src)="[^"]*(?:playlist\?|[?&]list=)[^"]*"/g) ?? [];
  for (const attr of playlistAttrs) {
    const value = decode(attr.slice(attr.indexOf('"') + 1, -1));
    const ownerId = rel.startsWith('videos/') ? rel.split('/')[1] : '';
    const owner = allowlisted.get(ownerId);
    if (value.startsWith('https://www.youtube.com/embed/') || value === owner?.youtube_url) {
      fail(`${rel} uses a playlist URL for playback`);
    } else if (!owner?.description?.includes(value)) {
      fail(`${rel} links to a playlist URL that is not in that video's description`);
    }
  }
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
    else if (frame.title !== shownTitle(video)) {
      fail(`${rel} iframe title does not match the official title`);
    }
  }
}

for (const video of catalog.videos) {
  const rel = `videos/${video.youtube_id}/index.html`;
  const html = byRel.get(rel) ?? '';
  if (!html) continue;
  if (!appears(html, shownTitle(video))) fail(`${rel} is missing the official title`);
  const expectedSrc = `https://www.youtube.com/embed/${video.youtube_id}`;
  if (!html.includes(`src="${expectedSrc}"`)) fail(`${rel} is missing ${expectedSrc}`);
  if (!html.includes(`href="${video.youtube_url}"`)) fail(`${rel} is missing the watch URL`);
  const h1At = html.indexOf('<h1');
  const iframeAt = html.indexOf('<iframe');
  const asideAt = html.indexOf('<aside');
  const watchAt = html.indexOf('Watch this video on YouTube');
  if (h1At < 0 || iframeAt < 0 || h1At > iframeAt) fail(`${rel} does not place the title above the player`);
  if (asideAt < 0 || watchAt < asideAt) fail(`${rel} does not keep the watch link in the sidebar`);
  if (html.includes('Same catalog topic code')) fail(`${rel} still groups STAT videos by catalog topic code`);
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

function relatedIds(html) {
  const at = html.indexOf('id="related-heading"');
  if (at < 0) return [];
  const end = html.indexOf('</section>', at);
  const slice = html.slice(at, end === -1 ? html.length : end);
  return [...new Set([...slice.matchAll(/\/videos\/([\w-]{11})\//g)].map((match) => match[1]))];
}

function sameIds(actual, expected) {
  const left = [...actual].sort();
  const right = [...expected].sort();
  return left.length === right.length && left.every((id, index) => id === right[index]);
}

for (const video of catalog.videos) {
  const rel = `videos/${video.youtube_id}/index.html`;
  const html = byRel.get(rel) ?? '';
  if (!html) continue;
  const ids = relatedIds(html);
  if (video.collection_slug === 'stat-lessons') {
    const parsed = parseLessonNumber(statLessons.videos?.[video.youtube_id]?.youtube_title ?? '');
    if (!parsed) {
      if (html.includes('Same lesson in other languages.') || ids.length > 0) {
        fail(`${rel} groups related videos without a parsed lesson number`);
      }
      continue;
    }
    const expected = catalog.videos
      .filter((other) => {
        if (other.collection_slug !== 'stat-lessons' || other.youtube_id === video.youtube_id) return false;
        const otherNumber = parseLessonNumber(statLessons.videos?.[other.youtube_id]?.youtube_title ?? '');
        return otherNumber?.label === parsed.label;
      })
      .map((other) => other.youtube_id);
    if (!html.includes('Same lesson in other languages.')) {
      fail(`${rel} is missing the same-lesson heading`);
    }
    if (!sameIds(ids, expected)) {
      fail(`${rel} related videos are not the other ${parsed.label} language versions`);
    }
  } else if (video.collection_slug === 'lae-what-is' || video.collection_slug === 'economics-shorts') {
    const expected = catalog.videos
      .filter(
        (other) =>
          other.youtube_id !== video.youtube_id &&
          other.collection_slug === video.collection_slug &&
          other.topic === video.topic,
      )
      .map((other) => other.youtube_id);
    if (html.includes('Same lesson in other languages.')) {
      fail(`${rel} uses a STAT lesson group`);
    }
    if (!sameIds(ids, expected)) fail(`${rel} related videos are not the other recordings of this topic`);
  }
}

const skew = byRel.get('videos/dgh99RbB43s/index.html') ?? '';
const skewRelated = relatedIds(skew);
for (const id of ['IfZSkxjGnIo', 'ktDsOsvrqgA', 'd6uiWh4pnyc']) {
  if (!skewRelated.includes(id)) fail(`skewness page is missing the other 1.11 recording ${id}`);
}
for (const id of ['t42YutwalcM', 'f8_qd5CERLA']) {
  if (skewRelated.includes(id)) fail(`skewness page still lists ${id}, which is not STAT 1.11`);
}

function lessonSections(html) {
  return html.split('data-lesson="').slice(1).map((part) => {
    const label = part.slice(0, part.indexOf('"'));
    const end = part.search(/data-lesson="|<\/main>/);
    const slice = end === -1 ? part : part.slice(0, end);
    const ids = [...new Set([...slice.matchAll(/\/videos\/([\w-]{11})\//g)].map((match) => match[1]))];
    return { label, ids };
  });
}

const byLesson = new Map();
for (const video of catalog.videos) {
  if (video.collection_slug !== 'stat-lessons') continue;
  const label = canonicalStatLabel(video);
  if (!label) {
    fail(`${video.youtube_id} has no canonical lesson for the module pages`);
    continue;
  }
  const group = byLesson.get(label) ?? [];
  group.push(video.youtube_id);
  byLesson.set(label, group);
}

for (const moduleId of ['m01', 'm02', 'm03', 'm04', 'm05']) {
  const html = byRel.get(`stat-lessons/${moduleId}/index.html`) ?? '';
  const sections = lessonSections(html);
  const labels = sections.map((section) => section.label);
  const expectedLabels = [...byLesson.keys()]
    .filter((label) => label.startsWith(String(Number(moduleId.slice(1))) + '.'))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  if (labels.join(',') !== expectedLabels.join(',')) {
    fail(`${moduleId} lesson order is ${labels.join(', ')}`);
  }
  for (const section of sections) {
    const expected = new Set(byLesson.get(section.label) ?? []);
    if (!sameIds(section.ids, [...expected])) {
      fail(`${moduleId} section ${section.label} does not list only that lesson`);
    }
  }
  if (html.includes('>Topic T')) fail(`${moduleId} still heads a group with a catalog topic code`);
}

for (const [label, ids] of byLesson) {
  const [moduleNumber, topic] = label.split('.');
  const rel = `stat-lessons/m${moduleNumber.padStart(2, '0')}/t${topic}/index.html`;
  const html = byRel.get(rel) ?? '';
  const sections = lessonSections(html);
  if (sections.length !== 1 || sections[0].label !== label || !sameIds(sections[0].ids, ids)) {
    fail(`${rel} does not contain only lesson ${label}`);
  }
  if (!html.includes(`<h1>STAT ${label}</h1>`)) fail(`${rel} does not title the official lesson`);
}

const lessonPages = {
  'stat-lessons/m01/t01/index.html': {
    present: ['VS7Qbq07ATM', 'f8_qd5CERLA'],
    absent: ['dgh99RbB43s', 'IfZSkxjGnIo', 't42YutwalcM', 'Yb4eqJPlp5g'],
  },
  'stat-lessons/m01/t02/index.html': {
    present: ['Yb4eqJPlp5g'],
    absent: ['VS7Qbq07ATM', 'dgh99RbB43s', 't42YutwalcM'],
  },
  'stat-lessons/m01/t11/index.html': {
    present: ['dgh99RbB43s', 'IfZSkxjGnIo'],
    absent: ['VS7Qbq07ATM', 'f8_qd5CERLA', 't42YutwalcM', 'Yb4eqJPlp5g'],
  },
  'stat-lessons/m01/t13/index.html': {
    present: ['t42YutwalcM'],
    absent: ['dgh99RbB43s', 'VS7Qbq07ATM', 'f8_qd5CERLA', 'Yb4eqJPlp5g'],
  },
};
for (const [rel, rule] of Object.entries(lessonPages)) {
  const ids = lessonSections(byRel.get(rel) ?? '').flatMap((section) => section.ids);
  for (const id of rule.present) if (!ids.includes(id)) fail(`${rel} is missing ${id}`);
  for (const id of rule.absent) if (ids.includes(id)) fail(`${rel} still includes ${id}`);
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
const homeHeading = /<h1>([^<]*)<\/h1>/.exec(home)?.[1] ?? '';
if (homeHeading !== 'Lesson catalog') fail(`home heading is "${homeHeading}"`);
if (!home.includes(`${lessonSummary.lessons} distinct lessons`)) {
  fail('home page is missing the distinct lesson count');
}
if (!home.includes(`${catalog.videos.length} recordings, including language versions`)) {
  fail('home page does not explain that recordings include language versions');
}
if (home.includes('public videos') || home.includes('public teaching videos')) {
  fail('home page calls the catalog public videos');
}
if (home.includes('video-factory') || home.includes('VF-Revise')) {
  fail('home page still shows production jargon');
}
if (home.includes('kochiuyu.github.io/lae-companion')) {
  fail('home page still shows the raw companion URL');
}
if (home.includes('dgh99RbB43s')) {
  fail('home page still uses the skewness recording as a cover');
}
if (!home.includes('Teaching Development and Language Enhancement Grant')) {
  fail('home page is missing the TDLEG credit');
}
const coverModules = [...new Set(catalog.videos.filter((video) => video.module).map((video) => video.module))].sort();
for (const moduleId of coverModules) {
  const coverId = statModuleCoverId(catalog.videos, moduleId);
  if (!coverId || !home.includes(`/vi/${coverId}/`)) {
    fail(`home page is missing the first-lesson cover for ${moduleId}`);
  }
  const cover = catalog.videos.find((video) => video.youtube_id === coverId);
  const label = cover ? canonicalStatLabel(cover) : null;
  if (!label || !label.endsWith('.01')) fail(`${moduleId} cover ${coverId} is not lesson .01`);
  if (cover?.language !== 'en+zh') fail(`${moduleId} cover is not the English narration`);
}
for (const title of ['STAT M04 · 咖啡连锁的抽样与区间估计', 'STAT M05 · 咖啡连锁的假设检验']) {
  if (!appears(home, title)) fail(`home page is missing the verified module title ${title}`);
}
for (const collection of catalog.collections) {
  const card = collectionCardCopy(collection);
  if (!appears(home, collection.name) || !appears(home, card)) {
    fail(`home page is missing collection copy for ${collection.slug}`);
  }
  if (collection.slug === 'lae-what-is') {
    for (const phrase of ['DOTE5891', 'Business Analysis of Low-Altitude Economy']) {
      if (!collection.description.includes(phrase) || !card.includes(phrase)) {
        fail(`LAE What-is card dropped the verified phrase ${phrase}`);
      }
    }
  }
  if (collection.slug === 'economics-shorts') {
    for (const phrase of ['Experimental Economics', 'Game Theory in daily life']) {
      if (!collection.description.includes(phrase) || !card.includes(phrase)) {
        fail(`Economics Shorts card dropped the verified phrase ${phrase}`);
      }
    }
  }
  const row = lessonSummary.byCollection[collection.slug];
  const label = lessonCountText(row.lessons, row.versions);
  if (!appears(home, label)) fail(`home page is missing ${label} for ${collection.slug}`);
}
if (!home.includes('id="home-q"') || !home.includes('for="home-q"')) {
  fail('home page is missing a labeled search field');
}
if (!home.includes('STAT language tracks') || !home.includes('not listed here')) {
  fail('home page no longer limits language tracks to STAT');
}
const searchPage = byRel.get('search/index.html') ?? '';
if (!searchPage.includes('STAT language track')) {
  fail('search page does not label the language filter as STAT only');
}
for (const collection of catalog.collections) {
  const page = byRel.get(`collections/${collection.slug}/index.html`) ?? '';
  const intro = readerIntro(collection.description);
  if (!appears(page, intro)) fail(`${collection.slug} page is missing its reader intro`);
  if (page.includes('video-factory') || page.includes('VF-Revise')) {
    fail(`${collection.slug} page still shows production jargon`);
  }
  if (page.includes('Companion site: https://')) {
    fail(`${collection.slug} page still prints the raw companion URL`);
  }
}
const laePage = byRel.get('collections/lae-what-is/index.html') ?? '';
if (!laePage.includes('>Companion site<')) fail('LAE collection page dropped the companion link');

for (const problem of assertPreviewMarkup(byRel, catalog)) fail(problem);

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
