import type { Video } from '../data/catalog';

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

/** Plain date line for the public pages. Does not change the catalog value. */
export function catalogDateLine(asOf: string, timezone: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(asOf);
  let date = asOf;
  if (match) {
    const month = MONTHS[Number(match[2]) - 1];
    if (month) date = `${Number(match[3])} ${month} ${match[1]}`;
  }
  const zone = timezone === 'Asia/Hong_Kong' ? 'Hong Kong time' : timezone.replaceAll('_', ' ');
  return `${date}, ${zone}`;
}

export interface PublishedTitleParts {
  headline: string;
  tags: string[];
}

/**
 * Split a published title at its hashtags for display.
 * The headline is the text before the first #, and each tag is the text
 * between # marks, trimmed. Nothing is rewritten or dropped except the
 * separators and surrounding whitespace.
 */
export function splitPublishedTitle(title: string): PublishedTitleParts {
  const hash = title.indexOf('#');
  if (hash === -1) return { headline: title.trim(), tags: [] };
  const headline = title.slice(0, hash).trim();
  const tags = title
    .slice(hash + 1)
    .split('#')
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
  if (!headline) return { headline: title.trim(), tags: [] };
  return { headline, tags };
}

/** Language of a title, based on its first character and the catalog language id. */
export function titleLang(video: Pick<Video, 'title' | 'language'>): string {
  const startsHan = /^\s*\p{Script=Han}/u.test(video.title);
  if (!startsHan) return 'en';
  if (video.language === 'hk+en') return 'zh-Hant';
  return 'zh-Hans';
}

export function moduleTitleLang(title: string): string | undefined {
  if (/[\u4e00-\u9fff]/.test(title)) return 'zh-Hans';
  return undefined;
}

export interface DescriptionBlock {
  kind: 'text' | 'break';
  lang: string;
  lines: string[];
}

function openingLang(language: string | null): string {
  if (language === 'hk+en') return 'zh-Hant';
  if (language === 'zh' || language === 'zh+en') return 'zh-Hans';
  return 'en';
}

function closingLang(language: string | null): string {
  if (language === 'en+zh') return 'zh-Hans';
  if (language === 'zh+en' || language === 'hk+en') return 'en';
  return openingLang(language);
}

/**
 * Split a verified description into paragraphs.
 * A paragraph whose text is exactly "———" is the catalog's section break
 * between the two languages of a bilingual description.
 */
export function descriptionBlocks(video: Pick<Video, 'description' | 'language'>): DescriptionBlock[] {
  if (!video.description) return [];
  const paragraphs = video.description.split(/\n{2,}/);
  let afterBreak = false;
  const blocks: DescriptionBlock[] = [];
  for (const paragraph of paragraphs) {
    if (paragraph.trim() === '———') {
      afterBreak = true;
      blocks.push({ kind: 'break', lang: 'en', lines: [] });
      continue;
    }
    const lines = paragraph.split('\n');
    if (!lines.some((line) => line.trim().length > 0)) continue;
    blocks.push({
      kind: 'text',
      lang: afterBreak ? closingLang(video.language) : openingLang(video.language),
      lines,
    });
  }
  return blocks;
}

export function haystack(video: Video): string {
  return [
    video.title,
    video.description,
    video.id,
    video.collection,
    video.module,
    video.module_title,
    video.topic,
    video.language,
    video.language_label,
    video.youtube_id,
  ]
    .filter((value): value is string => Boolean(value))
    .join(' ')
    .replace(/\s+/g, ' ')
    .toLowerCase();
}
