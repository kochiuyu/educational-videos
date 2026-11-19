import type { Video } from '../data/catalog';

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
