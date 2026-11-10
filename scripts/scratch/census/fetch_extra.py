"""Append one extra raw download to SOURCES.txt. usage: fetch_extra.py <raw_dir> <rel_path> <url>"""
import hashlib, sys, urllib.request, datetime, pathlib
raw, rel, url = pathlib.Path(sys.argv[1]), sys.argv[2], sys.argv[3]
req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (ma-scratch-2026 local research)"})
with urllib.request.urlopen(req, timeout=600) as r:
    body, status, final = r.read(), r.status, r.geturl()
assert final == url, final
(raw / rel).parent.mkdir(parents=True, exist_ok=True); (raw / rel).write_bytes(body)
ts = datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
line = f"{rel}\t{url}\t{ts}\tHTTP {status}\t{len(body)} bytes\tsha256={hashlib.sha256(body).hexdigest()}"
with open(raw / "SOURCES.txt", "a") as f: f.write(line + "\n")
print(line)
