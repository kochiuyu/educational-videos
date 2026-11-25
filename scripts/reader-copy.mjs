/**
 * Reader-facing collection text. The allowlist description stays the source.
 * These strings only drop production jargon and a raw companion URL.
 */

export const COMPANION_URL = 'https://kochiuyu.github.io/lae-companion/';
export const MICRO_CASES_URL = 'https://kochiuyu.github.io/micro-cases/';
export const TEA_COMPANION_URL = 'https://kochiuyu.github.io/tea-companion/';

export function readerIntro(description) {
  if (typeof description !== 'string') return '';
  const cleaned = description
    .replace(/\s+from video-factory\s*\/\s*VF-Revise,/gi, ',')
    .replace(
      /\s+from the @ChiuYuKo channel, grouped by the channel's public playlists\s+/gi,
      ', grouped as ',
    )
    .replace(/^Public\s+/, '')
    .replace(/\s*Companion site:\s*https:\/\/kochiuyu\.github\.io\/(?:lae-companion|tea-companion)\/\.?\s*/g, '')
    .replace(/\s*Case collection:\s*https:\/\/kochiuyu\.github\.io\/micro-cases\/\.?\s*/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
  if (!cleaned) return '';
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}

/** Shorter card line. Course names and playlist names stay as written in the catalog. */
export function collectionCardCopy(collection) {
  if (collection.slug === 'lae-what-is') {
    return 'Short explanations for CUHK DOTE5891, Business Analysis of Low-Altitude Economy.';
  }
  if (collection.slug === 'economics-shorts') {
    return 'Cartoon-style economics Shorts, grouped as Experimental Economics and Game Theory in daily life.';
  }
  return readerIntro(collection.description);
}
