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
