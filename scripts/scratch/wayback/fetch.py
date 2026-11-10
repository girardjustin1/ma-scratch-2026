"""Step 2: fetch every distinct-digest capture of the JSON endpoints (raw id_ form)."""
import json
import re

from wb import MANIFEST, RAW, budget_left, get


def load(n):
    d = json.loads((RAW / "cdx" / f"cdx_{n}.json").read_text())
    return [dict(zip(d[0], r)) for r in d[1:]]


done = set()
if MANIFEST.exists():
    for line in MANIFEST.read_text().splitlines():
        r = json.loads(line)
        if r["status"] == 200:
            done.add(r["request_url"])

jobs = []
seen_digest = set()
for r in load("prizes_prefix"):
    if r["statuscode"] != "200":
        continue
    u = r["original"]
    m = re.search(r"gameID=(\d+)", u)
    if m:
        jobs.append(("game_prizes", r, f"game_prizes/{r['timestamp']}_gameID-{m.group(1)}.json"))
    elif u.rstrip("/").endswith("/special"):
        jobs.append(("special", r, f"special/{r['timestamp']}_special.json"))
for r in load("games_api_prefix"):
    if not r["original"].split("?")[0].rstrip("/").endswith("/api/v1/games"):
        continue
    if r["statuscode"] != "200" or r["digest"] in seen_digest:
        continue  # warc/revisit rows repeat an earlier digest; dates recorded from CDX later
    seen_digest.add(r["digest"])
    jobs.append(("catalog", r, f"catalog/{r['timestamp']}_games.json"))

print("jobs", len(jobs), "budget left", budget_left())
for kind, r, rel in jobs:
    url = f"https://web.archive.org/web/{r['timestamp']}id_/{r['original']}"
    if url in done:
        continue
    if budget_left() <= 5:
        print("stopping: budget reserve reached")
        break
    rec = get(url, RAW / rel, original_url=r["original"], capture_ts=r["timestamp"], kind=kind)
    print(kind, r["timestamp"], rec["status"], rec["bytes"], flush=True)
