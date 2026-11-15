"""Polite HTTP for the Mass Lottery's public API, shared by the fetch scripts.

- Only https://www.masslottery.com is allowed; anything else raises.
- At least GAP_S seconds between requests, across every caller in the process.
- Retries with exponential backoff on network errors, 429 and 5xx.
- Raw saves are atomic (write to .part, then rename) and never overwrite a file.

All of data/ is gitignored: Lottery terms allow personal download only, no redistribution.
"""

from __future__ import annotations

import os
import time
import urllib.error
import urllib.request
from pathlib import Path

UA = "ma-scratch-2026-research/0.1 (personal non-commercial research)"
ALLOWED_PREFIX = "https://www.masslottery.com/"
GAP_S = 1.3  # minimum seconds between requests
RETRIES = 4  # attempts per request
BACKOFF_S = 5.0  # first retry wait; doubles each attempt
TIMEOUT_S = 60

_last = [0.0]


class FetchError(RuntimeError):
    pass


def get(url: str) -> tuple[int, bytes, dict[str, str]]:
    """GET url politely. Returns (status, body, headers) for a 2xx/4xx answer, raises
    FetchError once retries are spent on network errors, 429 or 5xx."""
    if not url.startswith(ALLOWED_PREFIX):
        raise FetchError(f"refusing non-Lottery URL: {url}")
    err = None
    for attempt in range(1, RETRIES + 1):
        wait = GAP_S - (time.time() - _last[0])
        if wait > 0:
            time.sleep(wait)
        req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "application/json"})
        try:
            with urllib.request.urlopen(req, timeout=TIMEOUT_S) as r:
                return r.status, r.read(), dict(r.headers.items())
        except urllib.error.HTTPError as e:
            if e.code != 429 and e.code < 500:
                return e.code, e.read(), dict(e.headers.items())
            err = f"HTTP {e.code}"
        except Exception as e:  # noqa: BLE001 - network errors are retried, then reported
            err = repr(e)[:160]
        finally:
            _last[0] = time.time()
        if attempt < RETRIES:
            time.sleep(BACKOFF_S * 2 ** (attempt - 1))
    raise FetchError(f"{url}: {err} after {RETRIES} attempts")


def save_new(path: Path, body: bytes) -> None:
    """Write a raw file atomically. Never overwrites an existing file."""
    if path.exists():
        raise FileExistsError(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_name(path.name + ".part")
    tmp.write_bytes(body)
    os.replace(tmp, path)
