/**
 * Distinct lessons versus language versions.
 *
 * A lesson is counted inside one collection. Catalog ids are not collapsed
 * across collections, and titles are never used as a key.
 *
 * stat-lessons: one lesson is one module plus topic code (the existing topic
 * page). Each of those has the four STAT language tracks. The catalog id is
 * not the lesson: some topics reuse one id across languages and others give
 * each language its own id.
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
 * Any other collection is one lesson per recording.
 */

export function lessonKey(video) {
  const slug = video.collection_slug;
  if (slug === 'stat-lessons') {
    return `stat-lessons\n${video.module}\n${video.topic}`;
  }
  if (slug === 'lae-what-is' || slug === 'lae-101') {
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
