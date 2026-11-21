#!/usr/bin/env python3
"""Regenerate catalog/stat-lessons.json from official video-factory lessons.

Reads the default branch of https://github.com/kochiuyu/video-factory at
generation time. It does not copy that repository into this one.

Each STAT recording is matched by the lesson number in its official YouTube
title (oEmbed). STAT 1.11, 统计 1.11, and 統計 1.13 select
lessons/STAT/STAT-M01-T11-*.yaml and STAT-M01-T13-*.yaml. Catalog topic codes
and catalog ids are not used. A title with no single lesson number, or a
number that is not exactly one factory file, stays unmapped.

A null catalog description is filled only from objective_en, objective_zh, or
objective_zh_hk on that file. Existing descriptions are not replaced. YouTube
upload blurbs are not copied. A mixed-language track may append the official
second-language objective after a ——— break. The quiz is the narration-track
text from the same file. The answer stays in the generated data so the page
can reveal it; the page keeps it inside a closed disclosure.
"""

from __future__ import annotations

import json
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parents[1]
CATALOG_PATH = ROOT / "catalog" / "allowlist.json"
OUTPUT_PATH = ROOT / "catalog" / "stat-lessons.json"
FACTORY_REPO = "https://github.com/kochiuyu/video-factory"
FACTORY_API = "https://api.github.com/repos/kochiuyu/video-factory"
USER_AGENT = "educational-videos-stat-lessons"

LESSON_NUMBER = re.compile(r"(?:STAT|统计|統計)\s+(\d{1,2})\.(\d{2})(?!\d)")
PRIMARY = {"en+zh": "en", "zh+en": "zh", "hk+en": "zh_hk", "zh": "zh"}
SECONDARY = {"en+zh": "zh", "zh+en": "en", "hk+en": "en"}
NARRATION_LANG = {"en": "en", "zh": "zh-Hans", "zh_hk": "zh-Hant"}
MAPPING = (
    "The lesson number in the official YouTube title "
    "(STAT X.YY, 统计 X.YY, or 統計 X.YY) selects "
    "lessons/STAT/STAT-M{XX}-T{YY}-*.yaml. "
    "Catalog topic codes and catalog ids are not used. "
    "A title without exactly one lesson number, or a number that does not "
    "match exactly one factory file, is left unmapped."
)


def fetch(url: str, accept: str | None = None) -> bytes:
    headers = {"User-Agent": USER_AGENT}
    if accept:
        headers["Accept"] = accept
    request = urllib.request.Request(url, headers=headers)
    last_error: Exception | None = None
    for attempt in range(4):
        try:
            with urllib.request.urlopen(request, timeout=40) as response:
                return response.read()
        except urllib.error.HTTPError as error:
            last_error = error
            if error.code not in {429, 500, 502, 503, 504} or attempt == 3:
                raise
        except urllib.error.URLError as error:
            last_error = error
            if attempt == 3:
                raise
        time.sleep(1.5 * (attempt + 1))
    raise RuntimeError(f"failed to fetch {url}: {last_error}")


def official_text(value: object) -> str | None:
    if not isinstance(value, str):
        return None
    text = value.replace("\r\n", "\n").rstrip("\n")
    if text.strip() == "":
        return None
    return text


def parse_lesson_number(title: str) -> tuple[int, int, str] | None:
    matches = list(LESSON_NUMBER.finditer(title))
    if len(matches) != 1:
        return None
    module = int(matches[0].group(1))
    topic = int(matches[0].group(2))
    if module < 1 or topic < 1:
        return None
    return module, topic, f"{module}.{matches[0].group(2)}"


def match_factory_file(module: int, topic: int, filenames: list[str]) -> str | None:
    prefix = f"STAT-M{module:02d}-T{topic:02d}-"
    hits = [name for name in filenames if name.startswith(prefix) and name.endswith(".yaml")]
    if len(hits) != 1:
        return None
    return hits[0]


def oembed_title(youtube_id: str) -> str | None:
    watch = f"https://www.youtube.com/watch?v={youtube_id}"
    url = "https://www.youtube.com/oembed?format=json&url=" + urllib.parse.quote(watch, safe="")
    try:
        payload = json.loads(fetch(url).decode())
    except (urllib.error.URLError, json.JSONDecodeError, UnicodeError):
        return None
    title = payload.get("title")
    if not isinstance(title, str) or title.strip() == "":
        return None
    return title


def load_lesson(commit: str, filename: str) -> dict | None:
    url = f"https://raw.githubusercontent.com/kochiuyu/video-factory/{commit}/lessons/STAT/{filename}"
    try:
        text = fetch(url).decode()
    except urllib.error.URLError:
        return None
    document = yaml.safe_load(text)
    if not isinstance(document, dict):
        return None
    return document


def quiz_for(document: dict, language: str) -> list[dict] | None:
    suffix = PRIMARY.get(language)
    if suffix is None:
        return None
    entries = document.get("quiz")
    if not isinstance(entries, list) or not entries:
        return None
    items: list[dict] = []
    for entry in entries:
        if not isinstance(entry, dict):
            return None
        question = official_text(entry.get(f"question_{suffix}"))
        answer = official_text(entry.get("answer"))
        explanation = official_text(entry.get(f"explanation_{suffix}"))
        options = entry.get(f"options_{suffix}")
        if not question or not answer or not explanation or not isinstance(options, list) or not options:
            return None
        cleaned: list[str] = []
        for option in options:
            option_text = official_text(option)
            if not option_text:
                return None
            cleaned.append(option_text)
        items.append(
            {
                "question": question,
                "options": cleaned,
                "answer": answer,
                "explanation": explanation,
                "lang": NARRATION_LANG[suffix],
            }
        )
    return items


def objective_for(document: dict, suffix: str) -> str | None:
    return official_text(document.get(f"objective_{suffix}"))


def official_description(document: dict, language: str) -> str | None:
    suffix = PRIMARY.get(language)
    if suffix is None:
        return None
    primary = objective_for(document, suffix)
    if not primary:
        return None
    secondary_suffix = SECONDARY.get(language)
    if not secondary_suffix:
        return primary
    secondary = objective_for(document, secondary_suffix)
    if not secondary:
        return primary
    return f"{primary}\n\n———\n\n{secondary}"


def factory_commit() -> str:
    payload = json.loads(fetch(f"{FACTORY_API}/commits/main", "application/vnd.github+json").decode())
    sha = payload.get("sha")
    if not isinstance(sha, str) or len(sha) < 7:
        raise RuntimeError("video-factory default branch SHA was not available")
    return sha


def factory_filenames(commit: str) -> list[str]:
    payload = json.loads(
        fetch(f"{FACTORY_API}/contents/lessons/STAT?ref={commit}", "application/vnd.github+json").decode()
    )
    if not isinstance(payload, list):
        raise RuntimeError("lessons/STAT did not return a file list")
    names = [item["name"] for item in payload if isinstance(item, dict) and isinstance(item.get("name"), str)]
    return sorted(names)


def main() -> int:
    catalog = json.loads(CATALOG_PATH.read_text())
    commit = factory_commit()
    filenames = factory_filenames(commit)
    stat_videos = [video for video in catalog["videos"] if video["collection_slug"] == "stat-lessons"]

    titles: dict[str, str | None] = {}
    with ThreadPoolExecutor(max_workers=8) as pool:
        futures = {pool.submit(oembed_title, video["youtube_id"]): video["youtube_id"] for video in stat_videos}
        for future in as_completed(futures):
            titles[futures[future]] = future.result()

    needed: set[str] = set()
    parsed: dict[str, tuple[int, int, str] | None] = {}
    chosen: dict[str, str | None] = {}
    for video in stat_videos:
        title = titles.get(video["youtube_id"])
        number = parse_lesson_number(title) if title else None
        parsed[video["youtube_id"]] = number
        filename = match_factory_file(number[0], number[1], filenames) if number else None
        chosen[video["youtube_id"]] = filename
        if filename:
            needed.add(filename)

    documents: dict[str, dict | None] = {}
    with ThreadPoolExecutor(max_workers=8) as pool:
        futures = {pool.submit(load_lesson, commit, name): name for name in sorted(needed)}
        for future in as_completed(futures):
            documents[futures[future]] = future.result()

    records: dict[str, dict] = {}
    filled = 0
    for video in stat_videos:
        youtube_id = video["youtube_id"]
        title = titles.get(youtube_id)
        filename = chosen.get(youtube_id)
        if title is None:
            records[youtube_id] = {
                "lesson": None,
                "lesson_number": None,
                "youtube_title": None,
                "description_status": "unmapped",
                "unmapped_reason": "oembed_failed",
                "quiz": None,
            }
            continue
        number = parsed[youtube_id]
        if number is None or filename is None:
            reason = "title_unparsed" if number is None else "no_factory_file"
            prefix = f"STAT-M{number[0]:02d}-T{number[1]:02d}-" if number else ""
            if number and sum(name.startswith(prefix) for name in filenames) > 1:
                reason = "ambiguous_factory_file"
            records[youtube_id] = {
                "lesson": None,
                "lesson_number": None,
                "youtube_title": title,
                "description_status": "unmapped",
                "unmapped_reason": reason,
                "quiz": None,
            }
            continue

        document = documents.get(filename)
        if not isinstance(document, dict):
            records[youtube_id] = {
                "lesson": None,
                "lesson_number": None,
                "youtube_title": title,
                "description_status": "unmapped",
                "unmapped_reason": "lesson_unreadable",
                "quiz": None,
            }
            continue

        lesson = filename[: -len(".yaml")]
        official = official_description(document, video["language"])
        existing = video["description"]
        if isinstance(existing, str) and existing != "":
            status = "kept"
        elif official:
            video["description"] = official
            status = "filled"
            filled += 1
        else:
            status = "missing_objective"
        records[youtube_id] = {
            "lesson": lesson,
            "lesson_number": number[2],
            "youtube_title": title,
            "description_status": status,
            "quiz": quiz_for(document, video["language"]),
        }

    if filled:
        CATALOG_PATH.write_text(json.dumps(catalog, ensure_ascii=False, indent=2) + "\n")

    counts = {
        "stat": len(stat_videos),
        "mapped": sum(1 for record in records.values() if record["lesson"]),
        "quizzes": sum(1 for record in records.values() if record["quiz"]),
        "descriptions_filled": filled,
        "missing_objective": sum(1 for record in records.values() if record["description_status"] == "missing_objective"),
        "unmapped": sum(1 for record in records.values() if record["description_status"] == "unmapped"),
    }
    output = {
        "source": {
            "repo": FACTORY_REPO,
            "commit": commit,
            "path": "lessons/STAT",
            "titles": "YouTube oEmbed title for each catalog watch URL",
            "mapping": MAPPING,
            "descriptions": (
                "A null catalog description is filled from objective_en, objective_zh, "
                "or objective_zh_hk for the narration track. Mixed tracks also include "
                "the official second-language objective after ———. Existing descriptions "
                "stay as written. youtube.description_* is not copied."
            ),
            "files": filenames,
        },
        "counts": counts,
        "videos": records,
    }
    OUTPUT_PATH.write_text(json.dumps(output, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps(counts, ensure_ascii=False, indent=2))
    reasons: dict[str, int] = {}
    for record in records.values():
        reason = record.get("unmapped_reason")
        if reason:
            reasons[reason] = reasons.get(reason, 0) + 1
    if reasons:
        print("unmapped reasons:", json.dumps(reasons, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    sys.exit(main())
