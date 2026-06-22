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
from collections import Counter, defaultdict
from datetime import datetime, timedelta, timezone
from pathlib import Path

import requests

GRAPH = "https://graph.facebook.com/v21.0"
TOKEN = os.environ["IG_ACCESS_TOKEN"]
IG_ID = os.environ["IG_USER_ID"]
OUT = Path(__file__).resolve().parent.parent / "data" / "instagram.json"

WEEKDAYS_SV = ["Måndag", "Tisdag", "Onsdag", "Torsdag", "Fredag", "Lördag", "Söndag"]
UNSUPPORTED_MEDIA_METRICS = set()


def get(path, **params):
    params["access_token"] = TOKEN
    r = requests.get(f"{GRAPH}/{path}", params=params, timeout=30)
    try:
        r.raise_for_status()
    except requests.HTTPError as e:
        detail = ""
        try:
            payload = r.json()
        except ValueError:
            payload = None

        if isinstance(payload, dict):
            err = payload.get("error", {})
            message = err.get("message") or payload.get("message") or ""
            err_type = err.get("type") or "API error"
            code = err.get("code")
            detail = f"{err_type}"
            if code is not None:
                detail += f" {code}"
            if message:
                detail += f": {message}"
        elif r.text:
            detail = r.text[:300]

        if detail:
            raise requests.HTTPError(f"{e} | {detail}", response=r) from e
        raise
    return r.json()


def refresh_token():
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
    # IG API tillåter inte framtida `until`. Workflow körs 03:00 UTC = 05:00 CEST,
    # då har "idag" UTC redan passerat midnatt sv. tid → gårdagens data ingår.
    until = datetime.now(timezone.utc).date()
    since = until - timedelta(days=days)
    try:
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
    except (requests.HTTPError, KeyError, IndexError) as e:
        print(f"time_series {metric} misslyckades: {e}", file=sys.stderr)
        return []


def total_value_result(metric, days=30, breakdown=None):
    # IG API tillåter inte framtida `until`. Se kommentar i time_series().
    until = datetime.now(timezone.utc).date()
    since = until - timedelta(days=days)
    params = dict(metric=metric, period="day", metric_type="total_value",
                  since=since.isoformat(), until=until.isoformat())
    if breakdown:
        params["breakdown"] = breakdown
    try:
        data = get(f"{IG_ID}/insights", **params)
        return {
            "available": True,
            "metric": metric,
            "value": _scalar(data["data"][0].get("total_value", {})),
        }
    except (requests.HTTPError, KeyError, IndexError) as e:
        print(f"total_value {metric} misslyckades: {e}", file=sys.stderr)
        return {"available": False, "metric": metric, "value": 0}


def total_value(metric, days=30, breakdown=None):
    result = total_value_result(metric, days=days, breakdown=breakdown)
    return {"value": result["value"]} if result["available"] else {}


def first_total_value(metrics, days=30):
    """Returnera första total_value-mått som Meta accepterar."""
    for metric in metrics:
        result = total_value_result(metric, days=days)
        if result["available"]:
            return result
    return {"available": False, "metric": None, "value": 0}


def media_insights(media_id, metrics, media_kind="unknown"):
    """Hämta per-post insights och ignorera mått som inte stöds för formatet."""
    out = {}
    for metric in metrics:
        metric_key = (media_kind, metric)
        if metric_key in UNSUPPORTED_MEDIA_METRICS:
            out[metric] = 0
            continue
        try:
            ins = get(f"{media_id}/insights", metric=metric)
            for v in ins.get("data", []):
                values = v.get("values", [])
                out[v["name"]] = values[0].get("value", 0) if values else 0
        except requests.HTTPError as e:
            status = e.response.status_code if e.response is not None else None
            if status == 400:
                UNSUPPORTED_MEDIA_METRICS.add(metric_key)
                print(f"media insight {metric} stöds inte av Meta för {media_kind}; hoppar över.", file=sys.stderr)
            else:
                print(f"media insight {metric} misslyckades för {media_id}: {e}", file=sys.stderr)
            out[metric] = 0
    return out


def fetch_recent_media(days=30):
    """Alla inlägg senaste N dagarna med per-post insights."""
    media = get(f"{IG_ID}/media",
                fields="id,caption,media_type,media_product_type,permalink,thumbnail_url,media_url,timestamp,like_count,comments_count",
                limit=50).get("data", [])
    cutoff = datetime.now(timezone.utc) - timedelta(days=days)
    recent = []
    for m in media:
        ts = datetime.strptime(m["timestamp"], "%Y-%m-%dT%H:%M:%S%z")
        if ts < cutoff:
            continue
        m.update(media_insights(
            m["id"],
            ["reach", "saved", "shares", "follows", "profile_activity", "profile_visits"],
            "REELS" if m.get("media_product_type") == "REELS" else m.get("media_type", "unknown")
        ))
        m["engagement"] = (m.get("like_count", 0) + m.get("comments_count", 0)
                           + m.get("saved", 0) + m.get("shares", 0))
        recent.append(m)
    return recent


def format_breakdown(media_list):
    buckets = {"IMAGE": [], "CAROUSEL_ALBUM": [], "VIDEO": [], "REELS": []}
    for m in media_list:
        key = "REELS" if m.get("media_product_type") == "REELS" else m.get("media_type")
        if key in buckets:
            buckets[key].append(m.get("engagement", 0))
    return {
        k: {"count": len(v), "avg_engagement": round(sum(v) / len(v), 1) if v else 0}
        for k, v in buckets.items()
    }


def best_posting(media_list):
    """Hitta veckodag/timme med högst genomsnittligt engagemang."""
    by_weekday = defaultdict(list)
    by_hour = defaultdict(list)
    for m in media_list:
        ts = datetime.strptime(m["timestamp"], "%Y-%m-%dT%H:%M:%S%z")
        # Konvertera till svensk tid (UTC+1/UTC+2 — approximera UTC+2 för CEST)
        local = ts + timedelta(hours=2)
        by_weekday[local.weekday()].append(m.get("engagement", 0))
        by_hour[local.hour].append(m.get("engagement", 0))

    def top(d):
        if not d:
            return None
        return max(d.items(), key=lambda kv: sum(kv[1]) / len(kv[1]))

    w = top(by_weekday)
    h = top(by_hour)
    return {
        "weekday": WEEKDAYS_SV[w[0]] if w else None,
        "weekday_avg_engagement": round(sum(w[1]) / len(w[1]), 1) if w else 0,
        "hour": h[0] if h else None,
        "hour_avg_engagement": round(sum(h[1]) / len(h[1]), 1) if h else 0,
        "posts_analyzed": len(media_list),
    }


def daily_insights(reach_series, follower_series, media_list):
    """Kombinera daglig räckvidd, nya följare och post-engagemang per dag."""
    reach_by_date = {d["date"]: d["value"] for d in reach_series}
    followers_by_date = {d["date"]: d["value"] for d in follower_series}
    engagement_by_date = defaultdict(int)
    posts_by_date = defaultdict(int)
    for m in media_list:
        date = m["timestamp"][:10]
        engagement_by_date[date] += m.get("engagement", 0)
        posts_by_date[date] += 1

    all_dates = sorted(set(reach_by_date) | set(followers_by_date))
    rows = []
    for date in all_dates:
        rows.append({
            "date": date,
            "reach": reach_by_date.get(date, 0),
            "new_followers": followers_by_date.get(date, 0),
            "engagement": engagement_by_date.get(date, 0),
            "posts": posts_by_date.get(date, 0),
        })
    return rows


def weekly_saves_shares(media_list, weeks=6):
    """Summera sparningar + delningar per ISO-vecka baserat på postdatum."""
    buckets = defaultdict(lambda: {"saves": 0, "shares": 0, "posts": 0})
    today = datetime.now(timezone.utc).date()
    current_year, current_week, _ = today.isocalendar()
    current_key = f"{current_year}-W{current_week:02d}"
    for m in media_list:
        ts = datetime.strptime(m["timestamp"], "%Y-%m-%dT%H:%M:%S%z")
        iso_year, iso_week, _ = ts.isocalendar()
        key = f"{iso_year}-W{iso_week:02d}"
        buckets[key]["saves"] += m.get("saved", 0)
        buckets[key]["shares"] += m.get("shares", 0)
        buckets[key]["posts"] += 1

    # Fyll i tomma veckor bakåt från idag
    today = datetime.now(timezone.utc).date()
    out = []
    for i in range(weeks - 1, -1, -1):
        d = today - timedelta(weeks=i)
        iso_year, iso_week, _ = d.isocalendar()
        key = f"{iso_year}-W{iso_week:02d}"
        b = buckets.get(key, {"saves": 0, "shares": 0, "posts": 0})
        out.append({
            "week": key,
            "saves": b["saves"],
            "shares": b["shares"],
            "total": b["saves"] + b["shares"],
            "posts": b["posts"],
            "is_current": key == current_key,
        })
    return out


def signal_media(media_list):
    """Inlägg som skapat sparningar/delningar, sorterat på starkaste signal."""
    rows = []
    for m in media_list:
        saves = m.get("saved", 0)
        shares = m.get("shares", 0)
        if saves + shares <= 0:
            continue
        rows.append({
            "id": m.get("id"),
            "caption": m.get("caption", ""),
            "media_type": m.get("media_type"),
            "media_product_type": m.get("media_product_type"),
            "permalink": m.get("permalink"),
            "thumbnail_url": m.get("thumbnail_url"),
            "media_url": m.get("media_url"),
            "timestamp": m.get("timestamp"),
            "reach": m.get("reach", 0),
            "saved": saves,
            "shares": shares,
            "signal_score": saves + shares,
        })
    return sorted(rows, key=lambda x: (x["signal_score"], x.get("reach", 0)), reverse=True)[:5]


def follower_media(media_list):
    """Inlägg som bäst visar väg mot följare: follows om Meta ger det, annars profilaktivitet."""
    rows = []
    for m in media_list:
        follows = m.get("follows", 0)
        profile_activity = m.get("profile_activity", 0)
        profile_visits = m.get("profile_visits", 0)
        if follows + profile_activity + profile_visits <= 0:
            continue
        rows.append({
            "id": m.get("id"),
            "caption": m.get("caption", ""),
            "media_type": m.get("media_type"),
            "media_product_type": m.get("media_product_type"),
            "permalink": m.get("permalink"),
            "thumbnail_url": m.get("thumbnail_url"),
            "media_url": m.get("media_url"),
            "timestamp": m.get("timestamp"),
            "reach": m.get("reach", 0),
            "follows": follows,
            "profile_activity": profile_activity,
            "profile_visits": profile_visits,
        })
    return sorted(
        rows,
        key=lambda x: (x["follows"], x["profile_activity"], x["profile_visits"], x["reach"]),
        reverse=True
    )[:5]


def extras_30d(media_list, totals):
    """Engagement rate, saves+shares, räckvidd non-followers."""
    saves = sum(m.get("saved", 0) for m in media_list)
    shares = sum(m.get("shares", 0) for m in media_list)
    interactions = totals.get("total_interactions", 0)
    reach = totals.get("reach", 0)
    engagement_rate = round((interactions / reach) * 100, 2) if reach else 0

    # Försök hämta reach-breakdown follower/non-follower
    reach_bd = total_value("reach", breakdown="follow_type")
    non_follower_pct = None
    if isinstance(reach_bd, dict) and "breakdowns" in reach_bd:
        results = reach_bd["breakdowns"][0].get("results", [])
        total = sum(r.get("value", 0) for r in results)
        non = sum(r.get("value", 0) for r in results if "NON_FOLLOWER" in r.get("dimension_values", []))
        if total:
            non_follower_pct = round((non / total) * 100, 1)

    return {
        "saves": saves,
        "shares": shares,
        "engagement_rate_pct": engagement_rate,
        "reach_non_followers_pct": non_follower_pct,
    }


def main():
    try:
        refresh_token()
        prof = profile()
        media_list = fetch_recent_media(days=30)
        reach = time_series("reach")
        followers = time_series("follower_count")

        link_clicks = first_total_value(["profile_links_taps", "website_clicks"])
        totals = {
            "views": _scalar(total_value("views")),
            "profile_views": _scalar(total_value("profile_views")),
            "profile_link_clicks": link_clicks["value"],
            "profile_link_clicks_metric": link_clicks["metric"],
            "profile_link_clicks_available": link_clicks["available"],
            "accounts_engaged": _scalar(total_value("accounts_engaged")),
            "total_interactions": _scalar(total_value("total_interactions")),
            "reach": sum(d["value"] for d in reach),
        }

        payload = {
            "updated_at": datetime.now(timezone.utc).isoformat(),
            "profile": prof,
            "totals_30d": totals,
            "extras_30d": extras_30d(media_list, totals),
            "time_series_30d": {"reach": reach, "follower_count": followers},
            "daily_insights": daily_insights(reach, followers, media_list),
            "weekly_saves_shares": weekly_saves_shares(media_list, weeks=6),
            "signal_media": signal_media(media_list),
            "follower_media": follower_media(media_list),
            "best_posting": best_posting(media_list),
            "top_media": sorted(media_list, key=lambda x: x.get("reach", 0), reverse=True)[:5],
            "format_breakdown": format_breakdown(media_list),
        }
        OUT.parent.mkdir(parents=True, exist_ok=True)
        OUT.write_text(json.dumps(payload, indent=2, ensure_ascii=False))
        print(f"OK: skrev {OUT}")
    except requests.HTTPError as e:
        msg = str(e)
        if "Invalid OAuth access token" in msg or "OAuthException" in msg:
            print(
                "IG_ACCESS_TOKEN verkar ogiltig eller utgången. Uppdatera GitHub-secret "
                "IG_ACCESS_TOKEN med en ny long-lived token om felet återkommer.",
                file=sys.stderr,
            )
        raise


def _scalar(v):
    """total_value() kan returnera {'value': N} eller {} — plocka ut talet."""
    if isinstance(v, dict):
        return v.get("value", 0)
    return v or 0


if __name__ == "__main__":
    main()
