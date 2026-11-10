"""Step 1: list Wayback captures (since 2023-11) for the four URL patterns."""
import json
import sys
import urllib.parse

from wb import RAW, get

CDX = "https://web.archive.org/cdx/search/cdx"
FL = "timestamp,original,statuscode,mimetype,digest,length"
QUERIES = {
    "prizes_prefix": dict(url="masslottery.com/api/v1/instant-game-prizes", matchType="prefix"),
    "games_api_prefix": dict(url="masslottery.com/api/v1/games", matchType="prefix"),
    "game_pages_prefix": dict(url="masslottery.com/games/draw-and-instants/", matchType="prefix"),
    "prizes_remaining_page": dict(url="masslottery.com/tools/prizes-remaining", matchType="prefix"),
}

names = sys.argv[1:] or list(QUERIES)
for name in names:
    params = dict(QUERIES[name], output="json", fl=FL, **{"from": "20231101"}, limit="20000")
    url = CDX + "?" + urllib.parse.urlencode(params)
    rec = get(url, RAW / "cdx" / f"cdx_{name}.json", kind="cdx")
    rows = json.loads((RAW / "cdx" / f"cdx_{name}.json").read_text() or "[]")
    print(name, rec["status"], max(len(rows) - 1, 0), "rows")
