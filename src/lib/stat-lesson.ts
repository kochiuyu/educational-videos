import statLessons from '../../catalog/stat-lessons.json';
import { parseLessonNumber } from '../../scripts/stat-map.mjs';
import { sortByLanguage, videos, type Video } from '../data/catalog';

interface LessonTitle {
  youtube_title?: string;
}

const titles = statLessons.videos as Record<string, LessonTitle>;

export interface CanonicalLesson {
  label: string;
  module: number;
  topic: number;
}

/**
 * Lesson number in the verified YouTube title.
 * The same parser that selects STAT questions. Catalog topic codes are not used.
 */
export function canonicalLesson(video: Pick<Video, 'youtube_id'>): CanonicalLesson | null {
  const parsed = parseLessonNumber(titles[video.youtube_id]?.youtube_title ?? '');
  return parsed ? { label: parsed.label, module: parsed.module, topic: parsed.topic } : null;
}

/** Official YouTube title when one was verified. Otherwise the catalog title. */
export function officialYoutubeTitle(video: Pick<Video, 'youtube_id' | 'title'>): string {
  const title = titles[video.youtube_id]?.youtube_title;
  return typeof title === 'string' && title.trim() ? title : video.title;
}

export function lessonSlug(label: string): string {
  return `t${label.split('.')[1]}`;
}

export interface LessonGroup {
  label: string;
  slug: string;
  videos: Video[];
}

/** Official lessons in one module, in numeric order. Unmapped recordings are not placed in a lesson. */
export function lessonsInModule(moduleId: string): LessonGroup[] {
  const moduleNumber = Number(moduleId.replace(/^M/i, ''));
  const groups = new Map<string, Video[]>();
  for (const video of videos) {
    if (video.collection_slug !== 'stat-lessons' || video.module !== moduleId) continue;
    const parsed = canonicalLesson(video);
    if (!parsed || parsed.module !== moduleNumber) continue;
    const list = groups.get(parsed.label) ?? [];
    list.push(video);
    groups.set(parsed.label, list);
  }
  return [...groups.keys()]
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
    .map((label) => ({
      label,
      slug: lessonSlug(label),
      videos: sortByLanguage(groups.get(label) ?? []),
    }));
}

export function ungroupedInModule(moduleId: string): Video[] {
  const moduleNumber = Number(moduleId.replace(/^M/i, ''));
  return videos.filter((video) => {
    if (video.collection_slug !== 'stat-lessons' || video.module !== moduleId) return false;
    const parsed = canonicalLesson(video);
    return !parsed || parsed.module !== moduleNumber;
  });
}

export function lessonBySlug(moduleId: string, slug: string): LessonGroup | undefined {
  return lessonsInModule(moduleId).find((group) => group.slug === slug);
}
