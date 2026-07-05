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
STORY_METRICS = ["impressions", "reach", "replies", "taps_forward", "taps_back", "exits", "link_clicks"]


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
        total_value = data["data"][0].get("total_value", {})
        return {
            "available": True,
            "metric": metric,
            "value": _scalar(total_value),
            "total_value": total_value,
            "breakdowns": total_value.get("breakdowns", []) if isinstance(total_value, dict) else [],
        }
    except (requests.HTTPError, KeyError, IndexError) as e:
        breakdown_note = f" med breakdown={breakdown}" if breakdown else ""
        print(f"total_value {metric}{breakdown_note} misslyckades: {e}", file=sys.stderr)
        return {"available": False, "metric": metric, "value": 0, "total_value": {}, "breakdowns": []}


def total_value(metric, days=30, breakdown=None):
    result = total_value_result(metric, days=days, breakdown=breakdown)
    if not result["available"]:
        return {}
    total = result.get("total_value")
    return total if isinstance(total, dict) else {"value": result["value"]}


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


def _breakdown_counts(total_value):
    counts = {}
    if not isinstance(total_value, dict):
        return counts
    for breakdown in total_value.get("breakdowns", []):
        for result in breakdown.get("results", []):
            keys = result.get("dimension_values", [])
            if not keys:
                continue
            counts[keys[0]] = counts.get(keys[0], 0) + result.get("value", 0)
    return counts


def media_insight_breakdown(media_id, metric, breakdown, media_kind="unknown"):
    """Hämta breakdown för ett enskilt media-mått, om formatet stöder det."""
    metric_key = (media_kind, metric, breakdown)
    if metric_key in UNSUPPORTED_MEDIA_METRICS:
        return {}
    try:
        ins = get(f"{media_id}/insights", metric=metric, breakdown=breakdown)
        data = ins.get("data", [])
        if not data:
            return {}
        return _breakdown_counts(data[0].get("total_value", {}))
    except requests.HTTPError as e:
        status = e.response.status_code if e.response is not None else None
        if status == 400:
            UNSUPPORTED_MEDIA_METRICS.add(metric_key)
            print(
                f"media insight {metric}/{breakdown} stöds inte av Meta för {media_kind}; hoppar över.",
                file=sys.stderr,
            )
        else:
            print(f"media insight {metric}/{breakdown} misslyckades för {media_id}: {e}", file=sys.stderr)
        return {}


def load_existing_payload():
    if not OUT.exists():
        return {}
    try:
        return json.loads(OUT.read_text())
    except (OSError, json.JSONDecodeError) as e:
        print(f"Kunde inte läsa befintlig JSON för historik: {e}", file=sys.stderr)
        return {}


def fetch_active_stories():
    """Hämta aktiva händelser. Instagram lämnar bara ut Stories medan de är aktiva."""
    try:
        stories = get(
            f"{IG_ID}/stories",
            fields="id,media_type,media_url,permalink,timestamp",
            limit=50,
        ).get("data", [])
    except requests.HTTPError as e:
        print(f"stories misslyckades: {e}", file=sys.stderr)
        return []

    out = []
    for story in stories:
        story.update(media_insights(story["id"], STORY_METRICS, "STORY"))
        story["story_interactions"] = (
            story.get("replies", 0)
            + story.get("taps_back", 0)
            + story.get("taps_forward", 0)
            + story.get("exits", 0)
            + story.get("link_clicks", 0)
        )
        out.append(story)
    return out


def merge_story_history(existing_payload, active_stories, days=30):
    """Behåll Story-historik genom att slå ihop dagens aktiva Stories med tidigare JSON."""
    history = {
        s.get("id"): s
        for s in existing_payload.get("story_history_30d", [])
        if s.get("id")
    }
    fetched_at = datetime.now(timezone.utc).isoformat()

    for story in active_stories:
        story_id = story.get("id")
        if not story_id:
            continue
        previous = history.get(story_id, {})
        merged = {**previous, **story}
        merged["first_seen_at"] = previous.get("first_seen_at") or fetched_at
        merged["last_seen_at"] = fetched_at
        for metric in STORY_METRICS + ["story_interactions"]:
            merged[metric] = max(previous.get(metric, 0) or 0, story.get(metric, 0) or 0)
        history[story_id] = merged

    cutoff = datetime.now(timezone.utc) - timedelta(days=days)
    recent = []
    for story in history.values():
        timestamp = story.get("timestamp") or story.get("first_seen_at")
        if not timestamp:
            continue
        try:
            ts = datetime.strptime(timestamp, "%Y-%m-%dT%H:%M:%S%z")
        except ValueError:
            ts = datetime.fromisoformat(timestamp)
        if ts >= cutoff:
            recent.append(story)

    return sorted(recent, key=lambda s: s.get("timestamp", s.get("first_seen_at", "")))


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
        media_kind = "REELS" if m.get("media_product_type") == "REELS" else m.get("media_type", "unknown")
        m.update(media_insights(
            m["id"],
            ["reach", "saved", "shares", "follows", "profile_activity", "profile_visits"],
            media_kind
        ))
        if m.get("profile_activity", 0):
            breakdown = media_insight_breakdown(m["id"], "profile_activity", "action_type", media_kind)
            m["profile_activity_breakdown"] = breakdown
            m["bio_link_clicks"] = breakdown.get("BIO_LINK_CLICKED", 0)
            m["contact_actions"] = sum(
                breakdown.get(action, 0)
                for action in ("CALL", "DIRECTION", "EMAIL", "TEXT", "OTHER")
            )
        else:
            m["profile_activity_breakdown"] = {}
            m["bio_link_clicks"] = 0
            m["contact_actions"] = 0
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


def daily_insights(
    reach_series,
    follower_series,
    media_list,
    story_history=None,
    profile_views_series=None,
    profile_link_clicks_series=None,
):
    """Kombinera daglig räckvidd, nya följare och post-engagemang per dag."""
    reach_by_date = {d["date"]: d["value"] for d in reach_series}
    followers_by_date = {d["date"]: d["value"] for d in follower_series}
    profile_views_by_date = {d["date"]: d["value"] for d in profile_views_series or []}
    profile_link_clicks_by_date = {d["date"]: d["value"] for d in profile_link_clicks_series or []}
    engagement_by_date = defaultdict(int)
    posts_by_date = defaultdict(int)
    content_profile_visits_by_date = defaultdict(int)
    content_profile_activity_by_date = defaultdict(int)
    content_follows_by_date = defaultdict(int)
    bio_link_clicks_by_date = defaultdict(int)
    contact_actions_by_date = defaultdict(int)
    story_count_by_date = defaultdict(int)
    story_reach_by_date = defaultdict(int)
    story_replies_by_date = defaultdict(int)
    story_link_clicks_by_date = defaultdict(int)
    for m in media_list:
        date = m["timestamp"][:10]
        engagement_by_date[date] += m.get("engagement", 0)
        posts_by_date[date] += 1
        content_profile_visits_by_date[date] += m.get("profile_visits", 0)
        content_profile_activity_by_date[date] += m.get("profile_activity", 0)
        content_follows_by_date[date] += m.get("follows", 0)
        bio_link_clicks_by_date[date] += m.get("bio_link_clicks", 0)
        contact_actions_by_date[date] += m.get("contact_actions", 0)
    for s in story_history or []:
        date = (s.get("timestamp") or s.get("first_seen_at", ""))[:10]
        if not date:
            continue
        story_count_by_date[date] += 1
        story_reach_by_date[date] += s.get("reach", 0)
        story_replies_by_date[date] += s.get("replies", 0)
        story_link_clicks_by_date[date] += s.get("link_clicks", 0)

    all_dates = sorted(
        set(reach_by_date)
        | set(followers_by_date)
        | set(profile_views_by_date)
        | set(profile_link_clicks_by_date)
        | set(content_profile_visits_by_date)
        | set(story_count_by_date)
    )
    rows = []
    for date in all_dates:
        rows.append({
            "date": date,
            "reach": reach_by_date.get(date, 0),
            "new_followers": followers_by_date.get(date, 0),
            "profile_views": profile_views_by_date.get(date, 0),
            "profile_link_clicks": profile_link_clicks_by_date.get(date, 0),
            "content_profile_visits": content_profile_visits_by_date.get(date, 0),
            "content_profile_activity": content_profile_activity_by_date.get(date, 0),
            "content_follows": content_follows_by_date.get(date, 0),
            "bio_link_clicks": bio_link_clicks_by_date.get(date, 0),
            "contact_actions": contact_actions_by_date.get(date, 0),
            "engagement": engagement_by_date.get(date, 0),
            "posts": posts_by_date.get(date, 0),
            "stories": story_count_by_date.get(date, 0),
            "story_reach": story_reach_by_date.get(date, 0),
            "story_replies": story_replies_by_date.get(date, 0),
            "story_link_clicks": story_link_clicks_by_date.get(date, 0),
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


def profile_media(media_list):
    """Inlägg som bäst förklarar profilbesök och nästa steg från profilen."""
    rows = []
    for m in media_list:
        profile_visits = m.get("profile_visits", 0)
        profile_activity = m.get("profile_activity", 0)
        bio_link_clicks = m.get("bio_link_clicks", 0)
        follows = m.get("follows", 0)
        contact_actions = m.get("contact_actions", 0)
        if profile_visits + profile_activity + bio_link_clicks + follows + contact_actions <= 0:
            continue
        reach = m.get("reach", 0)
        rows.append({
            "id": m.get("id"),
            "caption": m.get("caption", ""),
            "media_type": m.get("media_type"),
            "media_product_type": m.get("media_product_type"),
            "permalink": m.get("permalink"),
            "thumbnail_url": m.get("thumbnail_url"),
            "media_url": m.get("media_url"),
            "timestamp": m.get("timestamp"),
            "reach": reach,
            "follows": follows,
            "profile_activity": profile_activity,
            "profile_visits": profile_visits,
            "bio_link_clicks": bio_link_clicks,
            "contact_actions": contact_actions,
            "profile_visit_rate_pct": round((profile_visits / reach) * 100, 1) if reach else None,
            "profile_activity_breakdown": m.get("profile_activity_breakdown", {}),
        })
    return sorted(
        rows,
        key=lambda x: (
            x["profile_visits"],
            x["bio_link_clicks"],
            x["profile_activity"],
            x["follows"],
            x["reach"],
        ),
        reverse=True,
    )[:8]


def profile_summary(
    totals,
    reach_series,
    follower_series,
    daily_rows,
    media_list,
    story_history,
    profile_views_series,
    profile_link_clicks_series,
):
    profile_views = totals.get("profile_views", 0)
    reach = totals.get("reach", 0)
    new_followers = sum(d.get("value", 0) for d in follower_series)
    profile_link_clicks = totals.get("profile_link_clicks", 0)
    content_profile_visits = sum(m.get("profile_visits", 0) for m in media_list)
    content_profile_activity = sum(m.get("profile_activity", 0) for m in media_list)
    bio_link_clicks = sum(m.get("bio_link_clicks", 0) for m in media_list)
    contact_actions = sum(m.get("contact_actions", 0) for m in media_list)
    story_link_clicks = sum(s.get("link_clicks", 0) for s in story_history)
    fallback_link_clicks = bio_link_clicks + story_link_clicks
    outbound_clicks = profile_link_clicks if totals.get("profile_link_clicks_available") else fallback_link_clicks

    profile_day_key = "profile_views" if profile_views_series else "content_profile_visits"
    best_days = sorted(
        (
            {
                "date": r["date"],
                "profile_visits": r.get(profile_day_key, 0),
                "content_profile_visits": r.get("content_profile_visits", 0),
                "profile_activity": r.get("content_profile_activity", 0),
                "link_clicks": (
                    r.get("profile_link_clicks", 0)
                    or r.get("bio_link_clicks", 0)
                    or r.get("story_link_clicks", 0)
                ),
                "reach": r.get("reach", 0),
                "posts": r.get("posts", 0),
                "stories": r.get("stories", 0),
            }
            for r in daily_rows
            if (
                r.get(profile_day_key, 0)
                or r.get("content_profile_activity", 0)
                or r.get("bio_link_clicks", 0)
                or r.get("story_link_clicks", 0)
            )
        ),
        key=lambda r: (r["profile_visits"], r["link_clicks"], r["profile_activity"], r["reach"]),
        reverse=True,
    )[:5]

    action_counts = Counter()
    for m in media_list:
        action_counts.update(m.get("profile_activity_breakdown", {}))

    def rate(part, whole):
        return round((part / whole) * 100, 1) if whole else None

    return {
        "totals": {
            "reach": reach,
            "profile_views": profile_views,
            "new_followers": new_followers,
            "profile_link_clicks": profile_link_clicks,
            "outbound_clicks": outbound_clicks,
            "content_profile_visits": content_profile_visits,
            "content_profile_activity": content_profile_activity,
            "bio_link_clicks": bio_link_clicks,
            "story_link_clicks": story_link_clicks,
            "contact_actions": contact_actions,
        },
        "rates": {
            "profile_visit_rate_pct": rate(profile_views, reach),
            "content_profile_visit_rate_pct": rate(content_profile_visits, reach),
            "link_click_rate_pct": rate(outbound_clicks, profile_views),
            "follow_rate_pct": rate(new_followers, profile_views),
        },
        "profile_views_series_available": bool(profile_views_series),
        "profile_link_clicks_series_available": bool(profile_link_clicks_series),
        "link_clicks_available": bool(totals.get("profile_link_clicks_available")),
        "link_clicks_metric": totals.get("profile_link_clicks_metric"),
        "best_days": best_days,
        "profile_activity_actions": dict(action_counts),
    }


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


def story_summary(story_history, daily_rows):
    totals = {
        "stories": len(story_history),
        "impressions": sum(s.get("impressions", 0) for s in story_history),
        "reach": sum(s.get("reach", 0) for s in story_history),
        "replies": sum(s.get("replies", 0) for s in story_history),
        "taps_forward": sum(s.get("taps_forward", 0) for s in story_history),
        "taps_back": sum(s.get("taps_back", 0) for s in story_history),
        "exits": sum(s.get("exits", 0) for s in story_history),
        "link_clicks": sum(s.get("link_clicks", 0) for s in story_history),
    }
    story_dates = {
        (s.get("timestamp") or s.get("first_seen_at", ""))[:10]
        for s in story_history
        if s.get("timestamp") or s.get("first_seen_at")
    }
    story_dates.discard("")
    story_day_rows = [r for r in daily_rows if r["date"] in story_dates]
    other_rows = [r for r in daily_rows if r["date"] not in story_dates]
    tuesday_rows = [
        r for r in daily_rows
        if datetime.strptime(r["date"], "%Y-%m-%d").weekday() == 1
    ]

    def avg(rows, key):
        return round(sum(r.get(key, 0) for r in rows) / len(rows), 1) if rows else 0

    def pct_delta(a, b):
        if not b:
            return None
        return round(((a - b) / b) * 100, 1)

    story_avg_reach = avg(story_day_rows, "reach")
    other_avg_reach = avg(other_rows, "reach")
    tuesday_avg_reach = avg(tuesday_rows, "reach")
    all_avg_reach = avg(daily_rows, "reach")

    return {
        "tracking_started": bool(story_history),
        "story_days": len(story_dates),
        "tuesday_days": len(tuesday_rows),
        "totals": totals,
        "avg_reach_story_days": story_avg_reach,
        "avg_reach_other_days": other_avg_reach,
        "story_day_reach_delta_pct": pct_delta(story_avg_reach, other_avg_reach),
        "avg_reach_tuesdays": tuesday_avg_reach,
        "avg_reach_all_days": all_avg_reach,
        "tuesday_reach_delta_pct": pct_delta(tuesday_avg_reach, all_avg_reach),
        "recent_stories": sorted(
            story_history,
            key=lambda s: s.get("timestamp", s.get("first_seen_at", "")),
            reverse=True,
        )[:5],
    }


def main():
    try:
        existing_payload = load_existing_payload()
        refresh_token()
        prof = profile()
        media_list = fetch_recent_media(days=30)
        active_stories = fetch_active_stories()
        story_history = merge_story_history(existing_payload, active_stories, days=30)
        reach = time_series("reach")
        followers = time_series("follower_count")

        link_clicks = first_total_value(["profile_links_taps", "website_clicks"])
        profile_views_series = time_series("profile_views")
        profile_link_clicks_series = time_series(link_clicks["metric"]) if link_clicks["metric"] else []
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

        daily_rows = daily_insights(
            reach,
            followers,
            media_list,
            story_history,
            profile_views_series,
            profile_link_clicks_series,
        )

        payload = {
            "updated_at": datetime.now(timezone.utc).isoformat(),
            "profile": prof,
            "totals_30d": totals,
            "extras_30d": extras_30d(media_list, totals),
            "time_series_30d": {
                "reach": reach,
                "follower_count": followers,
                "profile_views": profile_views_series,
                "profile_link_clicks": profile_link_clicks_series,
            },
            "daily_insights": daily_rows,
            "active_stories": active_stories,
            "story_history_30d": story_history,
            "story_summary_30d": story_summary(story_history, daily_rows),
            "profile_summary_30d": profile_summary(
                totals,
                reach,
                followers,
                daily_rows,
                media_list,
                story_history,
                profile_views_series,
                profile_link_clicks_series,
            ),
            "weekly_saves_shares": weekly_saves_shares(media_list, weeks=6),
            "signal_media": signal_media(media_list),
            "follower_media": follower_media(media_list),
            "profile_media": profile_media(media_list),
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
