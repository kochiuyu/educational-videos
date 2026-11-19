# Educational Videos

Public catalog of lesson videos by Prof. Chiu Yu KO. The site is a static GitHub Pages project at [https://kochiuyu.github.io/educational-videos/](https://kochiuyu.github.io/educational-videos/). It does not host, upload, or transcode video files. Each video page plays the recording with a standard YouTube iframe (`https://www.youtube.com/embed/VIDEO_ID`).

The public channel [https://www.youtube.com/@ChiuYuKo](https://www.youtube.com/@ChiuYuKo) is listed for attribution only. This site does not scrape or mirror the channel. A video appears here only when it is in the allowlist.

## What is listed

`catalog/allowlist.json` is the source of truth. The copy in this repository is the verified public allowlist as of **2026-11-19** (Asia/Hong_Kong): **262** videos.

| Collection | Videos |
| --- | ---: |
| STAT lessons | 252 |
| LAE 101 | 10 |

STAT lessons by module:

| Module | Topics in the allowlist | Videos |
| --- | --- | ---: |
| M01 | T01–T15 | 60 |
| M02 | T01–T15 | 60 |
| M03 | T01–T15 | 60 |
| M04 | T01–T10 | 40 |
| M05 | T01–T08 | 32 |

Each STAT topic has four language tracks: English · 简体 slides, 普通话 · English slides, 粵語 · English slides, and 普通话.

On that date the allowlist left out:

- Older DSME2021 lecture recordings
- M04 T11–T15 (not yet public as of 19 Nov 2026, 3:16pm HKT)
- M05 T09–T15 (not yet confirmed public as of 18 Nov 2026, 9:03pm HKT)
- All YouTube playlist URLs
- HeyGen-labeled videos
- Any unlisted or private video

Those limits describe the file as of that date. A later public video, including a topic that was not public yet, can be added by the steps below once its watch URL is verified. Do not invent a YouTube ID, title, description, or duration. If a field is unknown, omit it or set it to `null`.

Catalog `id` values repeat across language tracks for M03–M05. Pages are addressed by `youtube_id`, which is unique. The `source` field is editor provenance and is not shown on the site.

## Run and build

Requires Node.js 22 or newer.

```bash
npm ci
npm run dev
```

The dev server uses the same project base path as production: [http://localhost:4321/educational-videos/](http://localhost:4321/educational-videos/).

```bash
npm run check:catalog
npm run build
npm run check:dist
npm run preview
```

`npm run build` checks the allowlist before generating the site. `npm run check:dist` checks that the built pages match the allowlist: one page and one standard embed per video, descriptions and durations only where the file has them, and links under `/educational-videos/`.

## Browse, search, and filter

- Collections: `/collections/stat-lessons/` and `/collections/lae-101/`
- STAT modules: `/stat-lessons/m01/` through `/stat-lessons/m05/`
- Topics: `/stat-lessons/m03/t01/`
- Language tracks: `/tracks/en-zh/`, `/tracks/zh-en/`, `/tracks/hk-en/`, `/tracks/zh/`
- Search: `/search/`

Search filters titles, descriptions, catalog IDs, modules, topics, and language labels in the browser. Collection, module, topic, and language pages are ordinary links and work without scripts. Topic codes are catalog groupings. Titles are shown as published and are not rewritten to look like translations of each other.

## Add a video

There is no backend. Edit the catalog, open a pull request, and let the Pages workflow rebuild.

1. Confirm the video is public (not unlisted or private) and copy its watch URL. Do not add playlist URLs.
2. Edit `catalog/allowlist.json`.
3. Append one object to `videos` and set `video_count` to the new length of `videos`.
4. Required fields:
   - `id` (string; does not have to be unique across language tracks)
   - `collection` and `collection_slug` (must match a `collections` entry’s name and slug)
   - `topic`
   - `title`
   - `youtube_id` (11 characters; unique)
   - `youtube_url` exactly `https://www.youtube.com/watch?v=` plus that id
5. STAT lessons also need `module` (`M01`), `topic` (`T01`), `language` (an id in `languages`), and `language_label` (that language’s label, copied exactly).
6. Optional: `description`, `duration` (`2:14`), `module_title`, `source`. Use `null` or omit anything you do not have.
7. A new collection or language has to be added to `collections` or `languages` in the same edit. Every collection and language in those arrays must have at least one video.
8. Run `npm run check:catalog` and `npm run build`.
9. Open a pull request to `main`. The workflow builds the site on the pull request. After merge, GitHub Actions deploys it.

The checker rejects duplicate YouTube IDs, playlist URLs, a `youtube_url` that does not match the id, HeyGen-labeled entries, and DSME2021 entries.

## GitHub Pages

Workflow: [`.github/workflows/pages.yml`](.github/workflows/pages.yml).

- Pull requests install, check the catalog, build, and check `dist`.
- A push to `main` does that and deploys with `actions/upload-pages-artifact` and `actions/deploy-pages`.
- The Astro `base` is `/educational-videos`, which is the project-site path for this repository name.
- Built files are the site root. They are not nested in an extra `educational-videos` folder.

**Pages is not fully configured yet.** This repository has no Pages site (`has_pages` is false). A repository admin still has to choose the source once:

1. Merge this pull request so `.github/workflows/pages.yml` is on `main`.
2. Open [Settings → Pages](https://github.com/kochiuyu/educational-videos/settings/pages).
3. Under **Build and deployment**, set **Source** to **GitHub Actions**.

If **GitHub Actions** is not in the source list until the workflow file is on `main`, merge first, then set the source. The first Actions run may fail with a Pages site error until that source is saved. After saving it, re-run the failed **Deploy to GitHub Pages** job (Actions → the workflow run → Re-run failed jobs). Later pushes to `main` deploy without another settings change.

The site is then served at [https://kochiuyu.github.io/educational-videos/](https://kochiuyu.github.io/educational-videos/). If the `github-pages` environment asks for approval, approve that deployment in the Actions run.

## Stack

Original markup and CSS for this catalog. No theme and no starter template.

Built with [Astro](https://astro.build/) 5.18.2, used under the [MIT License](https://github.com/withastro/astro/blob/main/LICENSE). System fonts only. No video media is committed.

## Embed restrictions

The allowlist does not say whether YouTube permits embedding. If a player shows that a video cannot be embedded, the page still links to the public watch URL. Embed restrictions were not verified for all 262 videos.
