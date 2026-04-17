"""
Hämtar Instagram-statistik via Meta Graph API och sparar till data/instagram.json.

Krav (sätts som GitHub Secrets):
  IG_ACCESS_TOKEN   – long-lived user access token (60 dagar)
  IG_USER_ID        – Instagram Business Account ID
  FB_APP_ID         – Meta App ID (för token-refresh)
  FB_APP_SECRET     – Meta App Secret (för token-refresh)
"""

import json
import os
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

import requests

GRAPH = "https://graph.facebook.com/v21.0"
TOKEN = os.environ["IG_ACCESS_TOKEN"]
IG_ID = os.environ["IG_USER_ID"]
OUT = Path(__file__).resolve().parent.parent / "data" / "instagram.json"


def get(path, **params):
    params["access_token"] = TOKEN
    r = requests.get(f"{GRAPH}/{path}", params=params, timeout=30)
    r.raise_for_status()
    return r.json()


def refresh_token():
    """Förlänger long-lived token (giltig 60 dagar). Skriver ny token till GITHUB_OUTPUT."""
    try:
        data = get("oauth/access_token",
                   grant_type="fb_exchange_token",
                   fb_exchange_token=TOKEN,
                   client_id=os.environ.get("FB_APP_ID", ""),
                   client_secret=os.environ.get("FB_APP_SECRET", ""))
        new_token = data.get("access_token")
        if new_token and (gh_out := os.environ.get("GITHUB_OUTPUT")):
            with open(gh_out, "a") as f:
                f.write(f"new_token={new_token}\n")
    except Exception as e:
        print(f"Token-refresh misslyckades (ej kritiskt): {e}", file=sys.stderr)


def profile():
    return get(IG_ID, fields="username,followers_count,follows_count,media_count")


def time_series(metric, days=30):
    until = datetime.now(timezone.utc).date()
    since = until - timedelta(days=days)
    data = get(f"{IG_ID}/insights",
               metric=metric,
               period="day",
               since=since.isoformat(),
               until=until.isoformat())
    series = []
    for m in data.get("data", []):
        for v in m["values"]:
            series.append({"date": v["end_time"][:10], "value": v["value"]})
    return series


def total_value(metric, days=30):
    """För metrics som kräver metric_type=total_value (views, profile_views m.fl.)."""
    until = datetime.now(timezone.utc).date()
    since = until - timedelta(days=days)
    try:
        data = get(f"{IG_ID}/insights",
                   metric=metric,
                   period="day",
                   metric_type="total_value",
                   since=since.isoformat(),
                   until=until.isoformat())
        return data["data"][0].get("total_value", {}).get("value", 0)
    except (requests.HTTPError, KeyError, IndexError) as e:
        print(f"Kunde inte hämta {metric}: {e}", file=sys.stderr)
        return 0


def top_media(limit=5):
    media = get(f"{IG_ID}/media",
                fields="id,caption,media_type,media_product_type,permalink,thumbnail_url,media_url,timestamp,like_count,comments_count",
                limit=25).get("data", [])

    cutoff = datetime.now(timezone.utc) - timedelta(days=30)
    recent = []
    for m in media:
        ts = datetime.strptime(m["timestamp"], "%Y-%m-%dT%H:%M:%S%z")
        if ts < cutoff:
            continue
        try:
            ins = get(f"{m['id']}/insights", metric="reach,saved,shares")
            for v in ins.get("data", []):
                m[v["name"]] = v["values"][0]["value"]
        except requests.HTTPError:
            m["reach"] = m["saved"] = m["shares"] = 0
        m["engagement"] = (m.get("like_count", 0) + m.get("comments_count", 0)
                           + m.get("saved", 0) + m.get("shares", 0))
        recent.append(m)

    recent.sort(key=lambda x: x.get("reach", 0), reverse=True)
    return recent[:limit]


def format_breakdown(media_list):
    """Snitt-engagemang per format."""
    buckets = {"IMAGE": [], "CAROUSEL_ALBUM": [], "VIDEO": [], "REELS": []}
    for m in media_list:
        key = "REELS" if m.get("media_product_type") == "REELS" else m.get("media_type")
        if key in buckets:
            buckets[key].append(m.get("engagement", 0))
    return {
        k: {"count": len(v), "avg_engagement": round(sum(v) / len(v), 1) if v else 0}
        for k, v in buckets.items()
    }


def main():
    refresh_token()
    prof = profile()
    media = top_media(limit=5)

    payload = {
        "updated_at": datetime.now(timezone.utc).isoformat(),
        "profile": prof,
        "totals_30d": {
            "views": total_value("views"),
            "profile_views": total_value("profile_views"),
            "accounts_engaged": total_value("accounts_engaged"),
            "total_interactions": total_value("total_interactions"),
        },
        "time_series_30d": {
            "reach": time_series("reach"),
            "follower_count": time_series("follower_count"),
        },
        "top_media": media,
        "format_breakdown": format_breakdown(media),
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(payload, indent=2, ensure_ascii=False))
    print(f"OK: skrev {OUT}")


if __name__ == "__main__":
    main()
