import fs from 'node:fs';
import { YTIMG_FILES } from './thumbnails.mjs';

const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/;
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Routing slugs for language ids. `+` is not used in paths or query keys. */
/** Keep in step with topicSlug in src/lib/urls.ts. */
export function topicSlug(topic) {
  return String(topic)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

export function trackSlug(languageId) {
  const fixed = {
    'en+zh': 'en-zh',
    'zh+en': 'zh-en',
    'hk+en': 'hk-en',
    zh: 'zh',
  };
  if (fixed[languageId]) return fixed[languageId];
  return String(languageId)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function isString(value) {
  return typeof value === 'string';
}

function optionalString(value) {
  return value == null || isString(value);
}

/**
 * Structural checks for catalog/allowlist.json.
 * Does not freeze the 2026-11-19 video count: a future public video
 * can be added by editing the file, as long as these rules hold.
 */
export function validateCatalog(data) {
  const errors = [];
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return ['Catalog root must be a JSON object.'];
  }

  for (const key of ['title', 'owner', 'channel_url', 'as_of', 'timezone']) {
    if (!isString(data[key]) || !data[key].trim()) {
      errors.push(`Missing string field "${key}".`);
    }
  }

  if (!Array.isArray(data.collections) || data.collections.length === 0) {
    errors.push('collections must be a non-empty array.');
  }
  if (!Array.isArray(data.languages) || data.languages.length === 0) {
    errors.push('languages must be a non-empty array.');
  }
  if (!Array.isArray(data.videos)) {
    errors.push('videos must be an array.');
    return errors;
  }
  if (data.video_count !== data.videos.length) {
    errors.push(
      `video_count is ${data.video_count} but videos.length is ${data.videos.length}.`,
    );
  }

  const collections = new Map();
  for (const [index, collection] of (data.collections ?? []).entries()) {
    const where = `collections[${index}]`;
    if (!collection || typeof collection !== 'object') {
      errors.push(`${where} must be an object.`);
      continue;
    }
    if (!isString(collection.slug) || !SLUG.test(collection.slug)) {
      errors.push(`${where} slug must be lowercase words separated by hyphens.`);
    }
    if (!isString(collection.name) || !collection.name.trim()) {
      errors.push(`${where} needs a name.`);
    }
    if (!isString(collection.description)) {
      errors.push(`${where} needs a description string.`);
    }
    if (collections.has(collection.slug)) {
      errors.push(`${where} duplicate slug ${collection.slug}.`);
    }
    collections.set(collection.slug, collection);
  }

  const languages = new Map();
  const slugs = new Map();
  for (const [index, language] of (data.languages ?? []).entries()) {
    const where = `languages[${index}]`;
    if (!language || typeof language !== 'object') {
      errors.push(`${where} must be an object.`);
      continue;
    }
    if (!isString(language.id) || !language.id.trim()) {
      errors.push(`${where} needs an id.`);
    }
    if (!isString(language.label) || !language.label.trim()) {
      errors.push(`${where} needs a label.`);
    }
    if (languages.has(language.id)) {
      errors.push(`${where} duplicate language id ${language.id}.`);
    }
    const slug = trackSlug(language.id);
    if (!slug || !SLUG.test(slug)) {
      errors.push(`${where} language id ${language.id} does not make a safe URL slug.`);
    }
    if (slugs.has(slug)) {
      errors.push(`${where} slug ${slug} collides with ${slugs.get(slug)}.`);
    }
    languages.set(language.id, language);
    slugs.set(slug, language.id);
  }

  const youtubeIds = new Set();
  const idLanguage = new Set();
  const usedLanguages = new Set();
  const usedCollections = new Set();

  data.videos.forEach((video, index) => {
    const where = `videos[${index}]`;
    if (!video || typeof video !== 'object') {
      errors.push(`${where} must be an object.`);
      return;
    }
    const label = video.youtube_id || video.id || `#${index}`;

    for (const key of ['id', 'collection', 'collection_slug', 'topic', 'title', 'youtube_id', 'youtube_url']) {
      if (!isString(video[key]) || !video[key].trim()) {
        errors.push(`${where} (${label}) missing ${key}.`);
      }
    }

    for (const key of ['description', 'duration', 'module', 'module_title', 'language', 'language_label', 'source']) {
      if (!optionalString(video[key])) {
        errors.push(`${where} (${label}) ${key} must be a string or null.`);
      }
    }

    if (video.thumbnail != null && !YTIMG_FILES.has(video.thumbnail)) {
      errors.push(
        `${where} (${label}) thumbnail must be an i.ytimg filename: ${[...YTIMG_FILES].join(', ')}.`,
      );
    }

    if (isString(video.youtube_id) && !YOUTUBE_ID.test(video.youtube_id)) {
      errors.push(`${where} (${label}) youtube_id must be 11 characters (A–Z, a–z, 0–9, _, -).`);
    }

    if (isString(video.youtube_id) && isString(video.youtube_url)) {
      const expected = `https://www.youtube.com/watch?v=${video.youtube_id}`;
      if (video.youtube_url !== expected) {
        errors.push(`${where} (${label}) youtube_url must be exactly ${expected}.`);
      }
      if (/playlist|[?&]list=/i.test(video.youtube_url)) {
        errors.push(`${where} (${label}) playlist URLs are excluded.`);
      }
    }

    const stamp = `${video.title ?? ''} ${video.id ?? ''} ${video.description ?? ''}`;
    if (/heygen/i.test(stamp)) {
      errors.push(`${where} (${label}) HeyGen-labeled entries are excluded.`);
    }
    if (/DSME2021/i.test(`${video.title ?? ''} ${video.id ?? ''}`)) {
      errors.push(`${where} (${label}) DSME2021 recordings are excluded.`);
    }

    const collection = collections.get(video.collection_slug);
    if (!collection) {
      errors.push(`${where} (${label}) unknown collection_slug "${video.collection_slug}".`);
    } else if (video.collection !== collection.name) {
      errors.push(
        `${where} (${label}) collection "${video.collection}" does not match collections[].name "${collection.name}".`,
      );
    } else {
      usedCollections.add(video.collection_slug);
    }

    // economics-shorts (and LAE 101) are valid without a STAT module or language track.
    if (video.collection_slug === 'stat-lessons') {
      if (!isString(video.module) || !/^M\d{2}$/.test(video.module)) {
        errors.push(`${where} (${label}) STAT lessons need module like M01.`);
      }
      if (!isString(video.topic) || !/^T\d{2}$/.test(video.topic)) {
        errors.push(`${where} (${label}) STAT lessons need topic like T01.`);
      }
      if (!isString(video.language) || !languages.has(video.language)) {
        errors.push(`${where} (${label}) STAT lessons need a language id listed in languages[].`);
      }
    }

    if (isString(video.language)) {
      const language = languages.get(video.language);
      if (!language) {
        errors.push(`${where} (${label}) language "${video.language}" is not in languages[].`);
      } else if (video.language_label !== language.label) {
        errors.push(
          `${where} (${label}) language_label must be exactly "${language.label}" for language "${video.language}".`,
        );
      } else {
        usedLanguages.add(video.language);
      }
    }

    if (isString(video.duration) && !/^\d+:\d{2}(?::\d{2})?$/.test(video.duration)) {
      errors.push(`${where} (${label}) duration must look like 2:14 when it is set.`);
    }

    if (isString(video.youtube_id)) {
      if (youtubeIds.has(video.youtube_id)) {
        errors.push(`${where} (${label}) duplicate youtube_id.`);
      }
      youtubeIds.add(video.youtube_id);
    }

    const pair = `${video.id ?? ''}\0${video.language ?? ''}`;
    if (idLanguage.has(pair)) {
      errors.push(`${where} (${label}) duplicate catalog id + language. YouTube id must differ, and so must this pair.`);
    }
    idLanguage.add(pair);
  });

  for (const slug of collections.keys()) {
    if (!usedCollections.has(slug)) {
      errors.push(`Collection "${slug}" has no videos.`);
    }
  }
  for (const id of languages.keys()) {
    if (!usedLanguages.has(id)) {
      errors.push(`Language "${id}" has no videos. Add a video or remove the language.`);
    }
  }

  return errors;
}

export function loadCatalog(file) {
  const text = fs.readFileSync(file, 'utf8');
  let data;
  try {
    data = JSON.parse(text);
  } catch (error) {
    throw new Error(`catalog/allowlist.json is not valid JSON: ${error.message}`);
  }
  const errors = validateCatalog(data);
  if (errors.length > 0) {
    throw new Error(`Allowlist catalog is invalid:\n${errors.map((item) => `- ${item}`).join('\n')}`);
  }
  return data;
}

export function summarizeCatalog(data) {
  const byCollection = new Map();
  const byModule = new Map();
  for (const video of data.videos) {
    byCollection.set(video.collection, (byCollection.get(video.collection) ?? 0) + 1);
    if (video.module) {
      byModule.set(video.module, (byModule.get(video.module) ?? 0) + 1);
    }
  }
  return { total: data.videos.length, byCollection, byModule };
}
