/**
 * Distinct lessons versus language versions.
 *
 * A lesson is counted inside one collection. Catalog ids are not collapsed
 * across collections, and translated titles are never used as a key.
 *
 * stat-lessons: one lesson is the number in the official YouTube title
 * (STAT 1.11, 统计 1.11, or 統計 1.11). The catalog topic code is not that
 * number. A title that does not contain exactly one lesson number is not
 * merged with any other recording.
 *
 * lae-what-is: one lesson is one catalog id. That id is shared by the language
 * versions of a single topic and does not span topics.
 *
 * lae-101: one lesson is one catalog id. There is no language mix.
 *
 * economics-shorts: one lesson is one recording. Topic names are playlist
 * groups of different Shorts, so they are not collapsed. A shared title would
 * not merge them either.
 *
 * micro-cases: one lesson is one catalog id. That id is one case, shared by
 * its language recordings, and it does not span cases.
 *
 * tea-shorts: one lesson is one catalog id. That id is one topic, shared by
 * its language recordings. A later topic is a new id and a new topic name.
 *
 * Any other collection is one lesson per recording.
 */

import statLessons from '../catalog/stat-lessons.json' with { type: 'json' };
import { parseLessonNumber } from './stat-map.mjs';

const officialTitles = statLessons.videos;

/** Official lesson number, or null when the verified title cannot be mapped. */
export function canonicalStatLabel(video) {
  const stored = officialTitles[video.youtube_id]?.youtube_title;
  const title = typeof stored === 'string' && stored.trim() ? stored : video.youtube_title;
  const parsed = parseLessonNumber(typeof title === 'string' ? title : '');
  return parsed ? parsed.label : null;
}

const COVER_LANGUAGE = 'en+zh';

/**
 * YouTube id for a module cover: the first official lesson number in that
 * module, preferring the English narration track when it exists.
 * Catalog order is not used.
 */
export function statModuleCoverId(videos, moduleId) {
  const moduleNumber = Number(String(moduleId).replace(/^M/i, ''));
  const groups = new Map();
  for (const video of videos) {
    if (video.collection_slug !== 'stat-lessons' || video.module !== moduleId) continue;
    const label = canonicalStatLabel(video);
    const moduleFromLabel = label ? Number(label.split('.')[0]) : NaN;
    if (!label || moduleFromLabel !== moduleNumber) continue;
    const list = groups.get(label) ?? [];
    list.push(video);
    groups.set(label, list);
  }
  const first = [...groups.keys()].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))[0];
  if (!first) return null;
  const group = groups.get(first) ?? [];
  const english = group.find((video) => video.language === COVER_LANGUAGE);
  return (english ?? group[0])?.youtube_id ?? null;
}

export function lessonKey(video) {
  const slug = video.collection_slug;
  if (slug === 'stat-lessons') {
    const label = canonicalStatLabel(video);
    if (!label) return `stat-lessons\nunmapped\n${video.youtube_id}`;
    return `stat-lessons\n${label}`;
  }
  if (slug === 'lae-what-is' || slug === 'lae-101' || slug === 'micro-cases' || slug === 'tea-shorts') {
    return `${slug}\n${video.id}`;
  }
  return `${slug}\n${video.youtube_id}`;
}

export function tally(videos) {
  const lessons = new Set(videos.map((video) => lessonKey(video)));
  return { lessons: lessons.size, versions: videos.length };
}

export function summarizeLessons(videos) {
  const collections = {};
  for (const video of videos) {
    const slug = video.collection_slug;
    if (!collections[slug]) collections[slug] = [];
    collections[slug].push(video);
  }
  const byCollection = {};
  for (const [slug, list] of Object.entries(collections)) {
    byCollection[slug] = tally(list);
  }
  const total = tally(videos);
  return { lessons: total.lessons, versions: total.versions, byCollection };
}

/** Primary lesson count, with language versions only when a lesson has more than one. */
export function lessonCountText(lessons, versions) {
  const lessonWord = lessons === 1 ? '1 lesson' : `${lessons} lessons`;
  if (versions === lessons) return lessonWord;
  const versionWord = versions === 1 ? '1 language version' : `${versions} language versions`;
  return `${lessonWord} · ${versionWord}`;
}
