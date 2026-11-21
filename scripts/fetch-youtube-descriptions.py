#!/usr/bin/env python3
"""Fill null catalog descriptions from the public YouTube page for that video id.

Economics Shorts are read from https://www.youtube.com/shorts/VIDEO_ID.
Every other null description is read from https://www.youtube.com/watch?v=VIDEO_ID.
The text is videoDetails.shortDescription when the player response is playable
and its videoId is the requested id. The text is stored unchanged.

A description that is already present is never replaced. An objective from
video-factory is never used. A blocked or unreadable page stays null.

Provenance is written to catalog/youtube-descriptions.json. Pages do not read
that file.
"""

from __future__ import annotations

import hashlib
import json
import re
import sys
import time
import urllib.error
import urllib.request
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CATALOG_PATH = ROOT / "catalog" / "allowlist.json"
PROVENANCE_PATH = ROOT / "catalog" / "youtube-descriptions.json"
USER_AGENT = (
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
)


def fetch(url: str) -> tuple[int, str, str]:
    request = urllib.request.Request(
        url,
        headers={"User-Agent": USER_AGENT, "Accept-Language": "en"},
    )
    last_error: Exception | None = None
    for attempt in range(3):
        try:
            with urllib.request.urlopen(request, timeout=40) as response:
                body = response.read().decode("utf-8", "replace")
                return response.status, response.geturl(), body
        except urllib.error.HTTPError as error:
            last_error = error
            if error.code not in {429, 500, 502, 503, 504} or attempt == 2:
                detail = error.read().decode("utf-8", "replace")[:300]
                return error.code, url, detail
        except urllib.error.URLError as error:
            last_error = error
            if attempt == 2:
                break
        time.sleep(1.2 * (attempt + 1))
    return 0, url, f"request failed: {last_error}"


def parsed_player_responses(html: str) -> list[dict]:
    decoder = json.JSONDecoder()
    payloads = []
    for match in re.finditer(r"ytInitialPlayerResponse\s*=\s*", html):
        try:
            payload, _ = decoder.raw_decode(html[match.end() :])
        except json.JSONDecodeError:
            continue
        if isinstance(payload, dict):
            payloads.append(payload)
    return payloads


def player_response(html: str) -> dict | None:
    for payload in parsed_player_responses(html):
        if "videoDetails" in payload:
            return payload
    return None


def first_player_response(html: str) -> dict | None:
    payloads = parsed_player_responses(html)
    return payloads[0] if payloads else None


def page_for(video: dict) -> str:
    youtube_id = video["youtube_id"]
    if video["collection_slug"] == "economics-shorts":
        return f"https://www.youtube.com/shorts/{youtube_id}"
    return f"https://www.youtube.com/watch?v={youtube_id}"


def retrieve(video: dict) -> dict:
    youtube_id = video["youtube_id"]
    page = page_for(video)
    status, final_url, body = fetch(page)
    record = {
        "collection": video["collection"],
        "collection_slug": video["collection_slug"],
        "page": page,
        "final_url": final_url,
        "http_status": status,
    }
    if status != 200 or not body.lstrip().startswith("<"):
        record["status"] = "blocked"
        record["playability"] = None
        record["reason"] = f"HTTP {status}: {body[:240]}"
        return record
    payload = player_response(body)
    if payload is None:
        # The bot wall still returns a player response, without videoDetails.
        payload = first_player_response(body)
    if payload is None:
        record["status"] = "blocked"
        record["playability"] = None
        record["reason"] = "The public page has no player response."
        return record
    playability = payload.get("playabilityStatus") or {}
    play_status = playability.get("status")
    reason = playability.get("reason")
    details = payload.get("videoDetails") or {}
    description = details.get("shortDescription")
    record["playability"] = play_status
    record["reason"] = reason
    if play_status != "OK" or details.get("videoId") != youtube_id or not isinstance(description, str):
        record["status"] = "blocked"
        if record["reason"] is None:
            record["reason"] = (
                f"playability {play_status}; the response did not include this video's description."
            )
        return record
    if description.strip() == "":
        record["status"] = "empty"
        record["description"] = description
        return record
    record["status"] = "filled"
    record["description"] = description
    return record


def main() -> int:
    catalog = json.loads(CATALOG_PATH.read_text())
    preserved: dict[str, str] = {}
    targets = []
    for video in catalog["videos"]:
        if isinstance(video.get("description"), str) and video["description"] != "":
            preserved[video["youtube_id"]] = hashlib.sha256(video["description"].encode()).hexdigest()
        else:
            targets.append(video)

    results: dict[str, dict] = {}
    with ThreadPoolExecutor(max_workers=6) as pool:
        futures = {pool.submit(retrieve, video): video["youtube_id"] for video in targets}
        for future in as_completed(futures):
            youtube_id = futures[future]
            try:
                results[youtube_id] = future.result()
            except Exception as error:  # noqa: BLE001 — record the failure, do not invent text
                results[youtube_id] = {
                    "status": "blocked",
                    "reason": f"{type(error).__name__}: {error}",
                    "page": None,
                    "final_url": None,
                    "http_status": 0,
                    "playability": None,
                }

    filled = 0
    for video in catalog["videos"]:
        record = results.get(video["youtube_id"])
        if not record or record.get("status") != "filled":
            continue
        if video.get("description") not in (None, ""):
            raise RuntimeError(f"refusing to replace an existing description for {video['youtube_id']}")
        video["description"] = record["description"]
        filled += 1

    if filled:
        CATALOG_PATH.write_text(json.dumps(catalog, ensure_ascii=False, indent=2) + "\n")

    counts: dict[str, dict[str, int]] = defaultdict(lambda: {"filled": 0, "empty": 0, "blocked": 0})
    for video in targets:
        record = results[video["youtube_id"]]
        counts[video["collection"]][record["status"]] += 1

    now = datetime.now(timezone.utc).replace(microsecond=0)
    provenance = {
        "retrieved_at": now.isoformat().replace("+00:00", "Z"),
        "retrieved_on": now.date().isoformat(),
        "method": (
            "Public YouTube HTML only, matched by youtube_id. Economics Shorts use "
            "https://www.youtube.com/shorts/VIDEO_ID. Other recordings use "
            "https://www.youtube.com/watch?v=VIDEO_ID. The description is "
            "videoDetails.shortDescription when playabilityStatus is OK and videoId "
            "matches. oEmbed has no description field. The YouTube Data API was not "
            "used. Objectives are not used. Existing descriptions are not replaced. "
            "This file is not rendered."
        ),
        "counts": {name: counts[name] for name in sorted(counts)},
        "preserved_description_sha256": preserved,
        "videos": {video["youtube_id"]: results[video["youtube_id"]] for video in targets},
    }
    PROVENANCE_PATH.write_text(json.dumps(provenance, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps({"filled": filled, "by_collection": provenance["counts"]}, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
