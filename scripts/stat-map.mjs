/**
 * Map a STAT recording to a video-factory lesson by the lesson number in the
 * official YouTube title. Catalog topic codes and catalog ids are not inputs.
 */

const LESSON_NUMBER = /(?:STAT|统计|統計)\s+(\d{1,2})\.(\d{2})(?!\d)/g;

export function parseLessonNumber(title) {
  if (typeof title !== 'string' || title.length === 0) return null;
  const matches = [...title.matchAll(LESSON_NUMBER)];
  if (matches.length !== 1) return null;
  const module = Number(matches[0][1]);
  const topic = Number(matches[0][2]);
  if (!Number.isInteger(module) || !Number.isInteger(topic) || module < 1 || topic < 1) return null;
  return {
    module,
    topic,
    label: `${module}.${matches[0][2]}`,
  };
}

export function factoryPrefix(module, topic) {
  const moduleId = String(module).padStart(2, '0');
  const topicId = String(topic).padStart(2, '0');
  return `STAT-M${moduleId}-T${topicId}-`;
}

/** Return the one factory filename for this lesson number, or null. */
export function matchFactoryFile(module, topic, filenames) {
  const prefix = factoryPrefix(module, topic);
  const hits = filenames.filter((name) => name.startsWith(prefix) && name.endsWith('.yaml'));
  if (hits.length !== 1) return null;
  return hits[0];
}

const NARRATION = {
  'en+zh': 'en',
  'zh+en': 'zh',
  'hk+en': 'zh_hk',
  zh: 'zh',
};

const NARRATION_LANG = {
  en: 'en',
  zh: 'zh-Hans',
  zh_hk: 'zh-Hant',
};

export function narrationKey(language) {
  return NARRATION[language] ?? null;
}

export function narrationLang(language) {
  const key = narrationKey(language);
  return key ? NARRATION_LANG[key] : null;
}

/**
 * Keep a description that is already in the catalog.
 * A new description is used only when the catalog value is null.
 */
export function chooseDescription(existing, official) {
  if (typeof existing === 'string' && existing.length > 0) return existing;
  if (typeof official === 'string' && official.length > 0) return official;
  return null;
}
