/** Site path with the GitHub Pages project base and a trailing slash. */
export function href(path = ''): string {
  const base = import.meta.env.BASE_URL;
  if (!path || path === '/') return base;
  const trimmed = path.replace(/^\/+/, '').replace(/\/+$/, '');
  return `${base}${trimmed}/`;
}

/** URL slug for a catalog topic phrase. Derived from the topic text; not stored metadata. */
export function topicSlug(topic: string): string {
  return topic
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

/**
 * Public YouTube thumbnail. Shorts use oardefault (1080×1920), which was
 * present for every economics short. Other videos use hq720 (1280×720),
 * present for every STAT and LAE video. hqdefault is the fallback.
 */
/** Portrait 9:16 Shorts. A new Tea Shorts topic stays in this set without a layout change. */
export function isPortraitCollection(collectionSlug: string): boolean {
  return collectionSlug === 'economics-shorts' || collectionSlug === 'tea-shorts';
}

export function thumbnailUrl(youtubeId: string, collectionSlug: string): string {
  const file = isPortraitCollection(collectionSlug) ? 'oardefault.jpg' : 'hq720.jpg';
  return `https://i.ytimg.com/vi/${youtubeId}/${file}`;
}

export function thumbnailFallbackUrl(youtubeId: string): string {
  return `https://i.ytimg.com/vi/${youtubeId}/hqdefault.jpg`;
}

export function trackSlug(languageId: string): string {
  const fixed: Record<string, string> = {
    'en+zh': 'en-zh',
    'zh+en': 'zh-en',
    'hk+en': 'hk-en',
    zh: 'zh',
  };
  if (fixed[languageId]) return fixed[languageId];
  return languageId
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}
