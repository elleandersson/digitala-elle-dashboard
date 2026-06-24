#!/usr/bin/env python3
"""
Kontrollerar om publicerad Instagram-data är uppdaterad för dagens datum i Europe/Stockholm.

Exit codes:
  0 = färsk
  1 = stale eller saknar updated_at
  2 = kunde inte läsa eller tolka JSON
"""

from __future__ import annotations

import json
import sys
from datetime import datetime
from urllib.error import HTTPError, URLError
from urllib.request import urlopen
from zoneinfo import ZoneInfo


DATA_URL = "https://raw.githubusercontent.com/elleandersson/digitala-elle-dashboard/main/data/instagram.json"
LOCAL_TZ = ZoneInfo("Europe/Stockholm")


def main() -> int:
    try:
        with urlopen(DATA_URL, timeout=30) as response:
            payload = json.load(response)
    except (HTTPError, URLError, TimeoutError, json.JSONDecodeError) as exc:
        print(f"ERROR: could not load dashboard data: {exc}", file=sys.stderr)
        return 2

    updated_at_raw = payload.get("updated_at")
    if not updated_at_raw:
        print("STALE: missing updated_at")
        return 1

    try:
        updated_at = datetime.fromisoformat(updated_at_raw)
    except ValueError:
        print(f"ERROR: invalid updated_at: {updated_at_raw}", file=sys.stderr)
        return 2

    updated_local = updated_at.astimezone(LOCAL_TZ)
    today_local = datetime.now(LOCAL_TZ).date()

    print(f"updated_at_utc={updated_at.isoformat()}")
    print(f"updated_at_local={updated_local.isoformat()}")
    print(f"today_local={today_local.isoformat()}")

    if updated_local.date() == today_local:
        print("FRESH")
        return 0

    print("STALE")
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
