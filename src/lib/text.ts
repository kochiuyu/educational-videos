import type { Video } from '../data/catalog';
import { href } from './urls';

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

export interface TextRun {
  text: string;
  href?: string;
}

export type DescriptionBlock =
  | { kind: 'prose'; lang: string; lines: TextRun[][] }
  | { kind: 'list'; lang: string; items: TextRun[][] }
  | { kind: 'timestamps'; lang: string; items: TextRun[][] }
  | { kind: 'rule' }
  | { kind: 'divider'; lang: string; text: string };

export interface DescriptionView {
  series: { lang: string; lines: TextRun[][] } | null;
  body: DescriptionBlock[];
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

const SERIES_LINE =
  /^(?:Series|系列|Previous|Next|Playlist|上一课|下一课|上一課|下一課|播放列表|播放清單)[:：]/;
const URL_PATTERN = /https?:\/\/[^\s<>"']+/g;
const YOUTUBE_ID = /(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([\w-]{11})(?![\w-])/;

function namedDividerLang(line: string): string | null {
  if (line === '—— English ——') return 'en';
  if (line === '—— 普通话 ——' || line === '—— 普通話 ——') return 'zh-Hans';
  if (line === '—— 粵語 ——' || line === '—— 粤语 ——') return 'zh-Hant';
  return null;
}

function linkify(text: string, catalogIds: ReadonlySet<string>): TextRun[] {
  const runs: TextRun[] = [];
  let cursor = 0;
  for (const match of text.matchAll(URL_PATTERN)) {
    const start = match.index ?? 0;
    const raw = match[0];
    const visible = raw.replace(/[).,;]+$/u, '');
    const trail = raw.slice(visible.length);
    if (start > cursor) runs.push({ text: text.slice(cursor, start) });
    runs.push({ text: visible, href: officialHref(visible, catalogIds) });
    if (trail) runs.push({ text: trail });
    cursor = start + raw.length;
  }
  if (cursor < text.length) runs.push({ text: text.slice(cursor) });
  if (runs.length === 0) runs.push({ text });
  return runs;
}

/** Catalog page for a single cataloged video. Every other official URL stays as written. */
function officialHref(url: string, catalogIds: ReadonlySet<string>): string {
  if (/playlist\?|[?&]list=/i.test(url) && !/[?&]v=/.test(url)) return url;
  const id = YOUTUBE_ID.exec(url)?.[1];
  if (id && catalogIds.has(id)) return href(`videos/${id}`);
  return url;
}

function isBullet(line: string): boolean {
  return line.startsWith('- ');
}

function isTimestamp(line: string): boolean {
  return /^\d{1,2}:\d{2}(?::\d{2})?\s+-\s+\S/u.test(line);
}

/**
 * Present a catalog description without changing its wording.
 * A leading series / previous / next / playlist block is returned separately.
 * Official URLs are linked. A cataloged single-video URL points at that catalog page.
 */
export function presentDescription(
  video: Pick<Video, 'description' | 'language'>,
  catalogIds: ReadonlySet<string>,
): DescriptionView {
  if (!video.description) return { series: null, body: [] };
  const source = video.description.split('\n');
  let start = 0;
  const seriesLines: string[] = [];
  if (SERIES_LINE.test(source[0]?.trim() ?? '')) {
    while (start < source.length && source[start].trim() !== '' && SERIES_LINE.test(source[start].trim())) {
      seriesLines.push(source[start]);
      start += 1;
    }
  }
  let lang = openingLang(video.language);
  const body: DescriptionBlock[] = [];
  const pushSeparator = (line: string) => {
    const named = namedDividerLang(line);
    if (line === '---' || line === '———') {
      body.push({ kind: 'rule' });
      if (line === '———') lang = closingLang(video.language);
      return;
    }
    if (named) {
      body.push({ kind: 'divider', lang: named, text: line });
      lang = named;
    }
  };
  const paragraphs = source.slice(start).join('\n').split(/\n{2,}/);
  for (const paragraph of paragraphs) {
    const lines = paragraph.split('\n');
    let index = 0;
    while (index < lines.length) {
      const line = lines[index];
      const trimmed = line.trim();
      if (!trimmed) {
        index += 1;
        continue;
      }
      if (trimmed === '---' || trimmed === '———' || namedDividerLang(trimmed)) {
        pushSeparator(trimmed);
        index += 1;
        continue;
      }
      if (isBullet(line)) {
        const items: TextRun[][] = [];
        while (index < lines.length && isBullet(lines[index])) {
          items.push(linkify(lines[index].slice(2), catalogIds));
          index += 1;
        }
        body.push({ kind: 'list', lang, items });
        continue;
      }
      if (isTimestamp(line)) {
        const items: TextRun[][] = [];
        while (index < lines.length && isTimestamp(lines[index])) {
          items.push(linkify(lines[index], catalogIds));
          index += 1;
        }
        body.push({ kind: 'timestamps', lang, items });
        continue;
      }
      const prose: TextRun[][] = [];
      while (index < lines.length) {
        const current = lines[index];
        const currentTrim = current.trim();
        if (
          !currentTrim ||
          currentTrim === '---' ||
          currentTrim === '———' ||
          namedDividerLang(currentTrim) ||
          isBullet(current) ||
          isTimestamp(current)
        ) {
          break;
        }
        prose.push(linkify(current, catalogIds));
        index += 1;
      }
      if (prose.length > 0) body.push({ kind: 'prose', lang, lines: prose });
    }
  }
  const series =
    seriesLines.length > 0
      ? { lang: openingLang(video.language), lines: seriesLines.map((line) => linkify(line, catalogIds)) }
      : null;
  return { series, body };
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
