/**
 * i.ytimg filenames this catalog may use. Shorts default to oardefault.jpg
 * (1080×1920). A Short whose oardefault.jpg is not HTTP 200 sets `thumbnail`
 * to another file in this set. Landscape lessons default to hq720.jpg.
 * Keep the default in step with thumbnailUrl in src/lib/urls.ts.
 */
export const YTIMG_FILES = new Set([
  'oardefault.jpg',
  'hq720.jpg',
  'maxresdefault.jpg',
  'sddefault.jpg',
  'hqdefault.jpg',
]);

export function isPortraitSlug(collectionSlug) {
  return collectionSlug === 'economics-shorts' || collectionSlug === 'tea-shorts';
}

export function defaultThumbnailFile(collectionSlug) {
  return isPortraitSlug(collectionSlug) ? 'oardefault.jpg' : 'hq720.jpg';
}

export function chosenThumbnailFile(video) {
  return video.thumbnail || defaultThumbnailFile(video.collection_slug);
}

export function thumbnailUrlFor(youtubeId, file) {
  return `https://i.ytimg.com/vi/${youtubeId}/${file}`;
}

async function statusOf(url) {
  const response = await fetch(url, { redirect: 'follow' });
  return response.status;
}

/**
 * Portrait covers must be a real i.ytimg image. The check uses the HTTP
 * status: YouTube's missing-thumbnail response is still an image body, so a
 * browser onerror handler cannot tell it from a cover.
 */
export async function assertChosenThumbnails(videos) {
  const problems = [];
  const portrait = videos.filter((video) => isPortraitSlug(video.collection_slug));
  const queue = [...portrait];
  async function next() {
    const video = queue.shift();
    if (!video) return;
    const file = chosenThumbnailFile(video);
    const chosenUrl = thumbnailUrlFor(video.youtube_id, file);
    try {
      const chosen = await statusOf(chosenUrl);
      if (chosen !== 200) {
        problems.push(`${video.youtube_id} ${chosenUrl} returned ${chosen}, expected 200`);
      }
    } catch (error) {
      problems.push(`${video.youtube_id} ${chosenUrl} request failed: ${error.message}`);
    }
    if (video.thumbnail && video.thumbnail !== 'oardefault.jpg') {
      const oarUrl = thumbnailUrlFor(video.youtube_id, 'oardefault.jpg');
      try {
        const oar = await statusOf(oarUrl);
        if (oar === 200) {
          problems.push(
            `${video.youtube_id} sets thumbnail ${video.thumbnail}, but oardefault.jpg returns 200`,
          );
        }
      } catch (error) {
        problems.push(`${video.youtube_id} ${oarUrl} request failed: ${error.message}`);
      }
    }
    await next();
  }
  await Promise.all(Array.from({ length: 6 }, () => next()));
  return problems;
}
