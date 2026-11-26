import { lessonKey } from '../../scripts/lessons.mjs';

export const LANG_PREFS = [
  { value: 'en', label: 'English' },
  { value: 'zh-hans', label: '普通话' },
  { value: 'zh-hk', label: '粵語' },
  { value: 'all', label: 'All languages' },
] as const;

export type LangPref = (typeof LANG_PREFS)[number]['value'];

/**
 * One site-wide preference covers every collection. Rank 0 is the recording
 * to show when several versions belong to that preference.
 */
const FAMILY: Record<string, { pref: Exclude<LangPref, 'all'>; rank: number }> = {
  en: { pref: 'en', rank: 0 },
  'en+zh': { pref: 'en', rank: 0 },
  'mc-en': { pref: 'en', rank: 0 },
  'tea-en': { pref: 'en', rank: 0 },
  'en-bi-hans': { pref: 'en', rank: 1 },
  'en-bi-hant': { pref: 'en', rank: 2 },
  zh: { pref: 'zh-hans', rank: 0 },
  'zh+en': { pref: 'zh-hans', rank: 1 },
  cmn: { pref: 'zh-hans', rank: 0 },
  'mc-cmn': { pref: 'zh-hans', rank: 0 },
  'tea-cmn': { pref: 'zh-hans', rank: 0 },
  'hk+en': { pref: 'zh-hk', rank: 0 },
  yue: { pref: 'zh-hk', rank: 0 },
  'mc-yue': { pref: 'zh-hk', rank: 0 },
  'tea-yue': { pref: 'zh-hk', rank: 0 },
};

const FALLBACK_FAMILY = ['en', 'zh-hans', 'zh-hk', 'other', ''];

export function recordingPref(language: string | null): { pref: string; rank: number } {
  if (!language) return { pref: '', rank: 0 };
  return FAMILY[language] ?? { pref: 'other', rank: 0 };
}

/** Lower rank is the recording to show when the chosen language is missing. */
export function fallbackRank(language: string | null): number {
  const info = recordingPref(language);
  const family = FALLBACK_FAMILY.indexOf(info.pref);
  return (family === -1 ? FALLBACK_FAMILY.length : family) * 10 + info.rank;
}

export function lessonGroup(video: {
  id: string;
  collection_slug: string;
  module: string | null;
  topic: string;
  language: string | null;
  youtube_id: string;
}): string {
  return String(lessonKey(video)).replaceAll('\n', '|');
}

export function lessonAttrs(video: {
  id: string;
  collection_slug: string;
  module: string | null;
  topic: string;
  language: string | null;
  language_label: string | null;
  youtube_id: string;
}): Record<string, string> {
  const info = recordingPref(video.language);
  return {
    'data-lang-group': lessonGroup(video),
    'data-pref': info.pref,
    'data-rank': String(info.rank),
    'data-fallback': String(fallbackRank(video.language)),
    'data-lang-label': video.language_label ?? '',
  };
}
