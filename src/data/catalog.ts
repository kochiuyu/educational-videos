import raw from '../../catalog/allowlist.json';
import { trackSlug } from '../lib/urls';

export interface Language {
  id: string;
  label: string;
}

export interface Collection {
  slug: string;
  name: string;
  description: string;
}

export interface Video {
  id: string;
  collection: string;
  collection_slug: string;
  module: string | null;
  topic: string;
  language: string | null;
  language_label: string | null;
  title: string;
  description: string | null;
  duration: string | null;
  youtube_id: string;
  youtube_url: string;
  source: string | null;
  module_title: string | null;
}

interface CatalogFile {
  title: string;
  owner: string;
  channel_url: string;
  repo: string;
  as_of: string;
  timezone: string;
  inclusions: Record<string, string>;
  exclusions: string[];
  collections: Collection[];
  languages: Language[];
  video_count: number;
  videos: Video[];
}

const catalog = raw as CatalogFile;

export const siteTitle = catalog.title;
export const owner = catalog.owner;
export const channelUrl = catalog.channel_url;
export const repoUrl = catalog.repo;
export const asOf = catalog.as_of;
export const timezone = catalog.timezone;
export const exclusions = catalog.exclusions;
export const collections = catalog.collections;
export const languages = catalog.languages;
export const videos = catalog.videos;
export const videoCount = catalog.videos.length;

export function collectionBySlug(slug: string): Collection | undefined {
  return collections.find((collection) => collection.slug === slug);
}

export function videosInCollection(slug: string): Video[] {
  return videos.filter((video) => video.collection_slug === slug);
}

export function statModuleIds(): string[] {
  const ids: string[] = [];
  for (const video of videos) {
    if (video.collection_slug === 'stat-lessons' && video.module && !ids.includes(video.module)) {
      ids.push(video.module);
    }
  }
  return ids;
}

export function videosInModule(moduleId: string): Video[] {
  return videos.filter(
    (video) => video.collection_slug === 'stat-lessons' && video.module === moduleId,
  );
}

export function moduleTitles(moduleId: string): string[] {
  const titles: string[] = [];
  for (const video of videosInModule(moduleId)) {
    if (video.module_title && !titles.includes(video.module_title)) {
      titles.push(video.module_title);
    }
  }
  return titles;
}

export function topicIds(moduleId: string): string[] {
  const ids: string[] = [];
  for (const video of videosInModule(moduleId)) {
    if (!ids.includes(video.topic)) ids.push(video.topic);
  }
  return ids;
}

const languageOrder = new Map(languages.map((language, index) => [language.id, index]));

export function sortByLanguage(list: Video[]): Video[] {
  return [...list].sort((a, b) => {
    const ai = a.language == null ? 1000 : (languageOrder.get(a.language) ?? 500);
    const bi = b.language == null ? 1000 : (languageOrder.get(b.language) ?? 500);
    return ai - bi;
  });
}

export function videosInTopic(moduleId: string, topic: string): Video[] {
  return sortByLanguage(
    videos.filter(
      (video) =>
        video.collection_slug === 'stat-lessons' &&
        video.module === moduleId &&
        video.topic === topic,
    ),
  );
}

export interface TopicGroup {
  topic: string;
  videos: Video[];
}

export function topicsInModule(moduleId: string): TopicGroup[] {
  return topicIds(moduleId).map((topic) => ({
    topic,
    videos: videosInTopic(moduleId, topic),
  }));
}

export function languageBySlug(slug: string): Language | undefined {
  return languages.find((language) => trackSlug(language.id) === slug);
}

export function videosInTrack(languageId: string): Video[] {
  return videos.filter((video) => video.language === languageId);
}

export function sameTopic(video: Video): Video[] {
  return sortByLanguage(
    videos.filter(
      (other) =>
        other.youtube_id !== video.youtube_id &&
        other.collection_slug === video.collection_slug &&
        other.module === video.module &&
        other.topic === video.topic,
    ),
  );
}

export function othersInCollection(video: Video): Video[] {
  return videos.filter(
    (other) =>
      other.collection_slug === video.collection_slug && other.youtube_id !== video.youtube_id,
  );
}

export function videoByYoutubeId(youtubeId: string): Video | undefined {
  return videos.find((video) => video.youtube_id === youtubeId);
}

export function countWhere(predicate: (video: Video) => boolean): number {
  return videos.filter(predicate).length;
}
