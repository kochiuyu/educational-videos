import statLessons from '../../catalog/stat-lessons.json';
import { parseLessonNumber } from '../../scripts/stat-map.mjs';
import { sameTopic, sortByLanguage, videos, type Video } from '../data/catalog';

interface LessonTitle {
  youtube_title?: string;
}

const titles = statLessons.videos as Record<string, LessonTitle>;

/**
 * Lesson number from the official YouTube title.
 * The same parser that selects STAT questions. A title that does not parse is not grouped.
 */
export function statLessonLabel(youtubeId: string): string | null {
  const parsed = parseLessonNumber(titles[youtubeId]?.youtube_title ?? '');
  return parsed ? parsed.label : null;
}

export function relatedVideos(video: Video): { heading: string; videos: Video[] } | null {
  if (video.collection_slug === 'stat-lessons') {
    const label = statLessonLabel(video.youtube_id);
    if (!label) return null;
    const same = sortByLanguage(
      videos.filter(
        (other) =>
          other.youtube_id !== video.youtube_id &&
          other.collection_slug === 'stat-lessons' &&
          statLessonLabel(other.youtube_id) === label,
      ),
    );
    if (same.length === 0) return null;
    return { heading: 'Same lesson in other languages.', videos: same };
  }
  if (video.collection_slug === 'micro-cases') {
    const same = sortByLanguage(
      videos.filter(
        (other) =>
          other.youtube_id !== video.youtube_id &&
          other.collection_slug === 'micro-cases' &&
          other.id === video.id,
      ),
    );
    if (same.length === 0) return null;
    return { heading: 'Same case in other languages.', videos: same };
  }
  if (video.collection_slug === 'lae-101') {
    const others = videos.filter(
      (other) => other.collection_slug === video.collection_slug && other.youtube_id !== video.youtube_id,
    );
    if (others.length === 0) return null;
    return { heading: `More in ${video.collection}`, videos: others };
  }
  const same = sameTopic(video);
  if (same.length === 0) return null;
  return { heading: `Other videos under ${video.topic}`, videos: same };
}
