"""Bygg dashboardens långtidshistorik från tidigare JSON-versioner i Git."""

import json
import subprocess
from datetime import datetime, timedelta, timezone
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent
DATA_FILE = ROOT / "data" / "instagram.json"
RETENTION_DAYS = 366


def git(*args):
    return subprocess.check_output(["git", *args], cwd=ROOT, text=True)


def snapshot_from(payload):
    date = (payload.get("updated_at") or "")[:10]
    if not date:
        return None

    profile = payload.get("profile", {})
    totals = payload.get("totals_30d", {})
    extras = payload.get("extras_30d", {})
    profile_totals = payload.get("profile_summary_30d", {}).get("totals", {})
    daily = payload.get("daily_insights", [])
    followers = payload.get("time_series_30d", {}).get("follower_count", [])

    return {
        "date": date,
        "followers": profile.get("followers_count", 0),
        "following": profile.get("follows_count", 0),
        "media_count": profile.get("media_count", 0),
        "reach_30d": totals.get("reach", 0),
        "profile_views_30d": totals.get("profile_views", 0),
        "new_followers_30d": profile_totals.get(
            "new_followers",
            sum(row.get("value", 0) for row in followers),
        ),
        "outbound_clicks_30d": profile_totals.get(
            "outbound_clicks",
            totals.get("profile_link_clicks", 0),
        ),
        "engagement_rate_30d": extras.get("engagement_rate_pct", 0),
        "posts_30d": sum(row.get("posts", 0) for row in daily),
        "saves_shares_30d": extras.get("saves", 0) + extras.get("shares", 0),
    }


def main():
    commits = git("log", "--format=%H", "--", "data/instagram.json").splitlines()
    daily_by_date = {}
    snapshots_by_date = {}
    media_by_id = {}

    def collect_media(payload):
        history = payload.get("history", {})
        sources = [
            history.get("media", []),
            payload.get("top_media", []),
            payload.get("signal_media", []),
            payload.get("follower_media", []),
            payload.get("profile_media", []),
        ]
        for source in sources:
            for media in source:
                key = media.get("id") or media.get("permalink")
                if key:
                    media_by_id[key] = {**media_by_id.get(key, {}), **media}

    for commit in reversed(commits):
        try:
            payload = json.loads(git("show", f"{commit}:data/instagram.json"))
        except (subprocess.CalledProcessError, json.JSONDecodeError):
            continue

        for row in payload.get("daily_insights", []):
            if row.get("date"):
                daily_by_date[row["date"]] = row

        snapshot = snapshot_from(payload)
        if snapshot:
            snapshots_by_date[snapshot["date"]] = snapshot
        collect_media(payload)

    current = json.loads(DATA_FILE.read_text())
    for row in current.get("daily_insights", []):
        if row.get("date"):
            daily_by_date[row["date"]] = row
    current_snapshot = snapshot_from(current)
    if current_snapshot:
        snapshots_by_date[current_snapshot["date"]] = current_snapshot
    collect_media(current)

    cutoff = datetime.now(timezone.utc).date() - timedelta(days=RETENTION_DAYS)
    daily = [
        daily_by_date[date]
        for date in sorted(daily_by_date)
        if datetime.strptime(date, "%Y-%m-%d").date() >= cutoff
    ]
    snapshots = [
        snapshots_by_date[date]
        for date in sorted(snapshots_by_date)
        if datetime.strptime(date, "%Y-%m-%d").date() >= cutoff
    ]
    media = []
    for item in media_by_id.values():
        timestamp = item.get("timestamp")
        if not timestamp:
            continue
        try:
            published = datetime.strptime(timestamp, "%Y-%m-%dT%H:%M:%S%z").date()
        except ValueError:
            try:
                published = datetime.fromisoformat(timestamp.replace("Z", "+00:00")).date()
            except ValueError:
                continue
        if published >= cutoff:
            media.append(item)
    media.sort(key=lambda item: item.get("timestamp", ""), reverse=True)

    current["history"] = {
        "retention_days": RETENTION_DAYS,
        "available_from": daily[0]["date"] if daily else current_snapshot["date"],
        "daily": daily,
        "snapshots": snapshots,
        "media": media,
    }
    DATA_FILE.write_text(json.dumps(current, indent=2, ensure_ascii=False) + "\n")
    print(
        f"Historik klar: {len(daily)} dagar från {current['history']['available_from']} "
        f"{len(snapshots)} kontoögonblicksbilder och {len(media)} inlägg."
    )


if __name__ == "__main__":
    main()
