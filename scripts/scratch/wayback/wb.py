"""Throwaway helper: polite archive.org fetcher with a persistent request budget.

- >= 1.5 s between archive.org requests (enforced via a timestamp file).
- 400 requests max across all runs (counter file under data/raw/wayback/).
- Every response is saved untouched and appended to manifest.jsonl.
"""
from __future__ import annotations

import hashlib
import json
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
RAW = ROOT / "data" / "raw" / "wayback"
RAW.mkdir(parents=True, exist_ok=True)
COUNTER = RAW / "_request_count.json"
MANIFEST = RAW / "manifest.jsonl"
MAX_REQUESTS = 400
MIN_GAP = 1.6
UA = "ma-scratch-2026-research/0.1 (personal non-commercial research)"


def _state() -> dict:
    if COUNTER.exists():
        return json.loads(COUNTER.read_text())
    return {"count": 0, "last": 0.0}


def budget_left() -> int:
    return MAX_REQUESTS - _state()["count"]


def get(url: str, dest: Path, *, original_url: str = "", capture_ts: str = "", kind: str = "") -> dict:
    st = _state()
    if st["count"] >= MAX_REQUESTS:
        raise RuntimeError("archive.org request budget exhausted")
    wait = MIN_GAP - (time.time() - st["last"])
    if wait > 0:
        time.sleep(wait)
    st["count"] += 1
    st["last"] = time.time()
    COUNTER.write_text(json.dumps(st))
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    status, body, ctype = None, b"", ""
    for attempt in range(3):
        try:
            with urllib.request.urlopen(req, timeout=90) as r:
                status, body, ctype = r.status, r.read(), r.headers.get("Content-Type", "")
            break
        except urllib.error.HTTPError as e:
            status, body, ctype = e.code, e.read(), e.headers.get("Content-Type", "")
            break
        except Exception as e:  # network hiccup: one polite retry counts against budget
            status, body = f"error:{type(e).__name__}", b""
            if attempt == 2:
                break
            time.sleep(5)
            st = _state()
            if st["count"] >= MAX_REQUESTS:
                break
            st["count"] += 1
            st["last"] = time.time()
            COUNTER.write_text(json.dumps(st))
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_bytes(body)
    rec = {
        "kind": kind,
        "request_url": url,
        "original_url": original_url,
        "capture_timestamp": capture_ts,
        "fetched_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "status": status,
        "content_type": ctype,
        "bytes": len(body),
        "sha256": hashlib.sha256(body).hexdigest(),
        "file": str(dest.relative_to(ROOT)),
    }
    with MANIFEST.open("a") as f:
        f.write(json.dumps(rec) + "\n")
    return rec
