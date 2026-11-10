"""Download each scratch game's tile image (the ticket art) for the game picker.

Tile URLs come from the newest data/raw/lottery_games/*_games.json (games on sale) and,
for games no longer sold, from the saved Wayback catalog snapshots in
data/raw/wayback/catalog (newest snapshot wins). Saves a small WebP per game to
web/public/local/tiles/<identifier>.webp, about one request a second. That folder is
GITIGNORED: the art belongs to the Lottery and is kept on this computer only. The app
loads tiles from there, so the picker works offline.

    python3 scripts/fetch_game_tiles.py
"""

import json
import time
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "data/raw/lottery_games"
OUT = ROOT / "web/public/local/tiles"
UA = "ma-scratch-2026 personal research (local, non-commercial)"
SIZE = "?w=192&fm=webp&q=80"  # Contentful image API: 192 px wide WebP (2:1 tile)


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    urls = {}
    for f in sorted((ROOT / "data/raw/wayback/catalog").glob("*_games.json")):
        try:
            d = json.loads(f.read_text())
        except ValueError:
            continue
        items = d if isinstance(d, list) else next((x for x in d.values() if isinstance(x, list)), [])
        for g in items:
            if isinstance(g, dict) and g.get("identifier") and (g.get("icon") or {}).get("url"):
                urls[g["identifier"]] = g["icon"]["url"]
    for g in json.loads(sorted(RAW.glob("*_games.json"))[-1].read_text()):
        if g["gameType"] == "Scratch" and (g.get("icon") or {}).get("url"):
            urls[g["identifier"]] = g["icon"]["url"]  # today's catalog wins
    got = skipped = 0
    failed = []
    for ident, url in sorted(urls.items()):
        dest = OUT / f"{ident}.webp"
        if not url or dest.exists():
            skipped += 1
            continue
        try:
            req = urllib.request.Request("https:" + url + SIZE, headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=30) as r:
                dest.write_bytes(r.read())
            got += 1
        except Exception as e:  # noqa: BLE001 - report and continue; a missing tile shows a placeholder
            failed.append((ident, str(e)[:60]))
        time.sleep(1.0)
    print(f"{got} downloaded, {skipped} skipped, {len(failed)} failed → {OUT.relative_to(ROOT)}")
    for f in failed:
        print("FAILED", *f)


if __name__ == "__main__":
    main()
