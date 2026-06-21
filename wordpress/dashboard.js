(async function () {
    const url = window.DASHBOARD_DATA_URL;
    if (!url) return;

    const fmt = (n) => new Intl.NumberFormat("sv-SE").format(n ?? 0);
    const pct = (n) => (n == null ? "–" : `${n}%`);
    const sumValues = (arr) => (arr || []).reduce((s, x) => s + (x.value || 0), 0);
    const sumPosts = (rows) => (rows || []).reduce((s, x) => s + (x.posts || 0), 0);
    const daysBetween = (a, b) => Math.max(0, Math.floor((a - b) / 86400000));
    const mediaLabel = (m) => m.media_product_type === "REELS"
        ? "Reel"
        : ({ IMAGE: "Bild", CAROUSEL_ALBUM: "Karusell", VIDEO: "Video" }[m.media_type] || "Inlägg");
    const shortCaption = (text, length = 95) => {
        const clean = (text || "").replace(/\s+/g, " ").trim();
        return clean.length > length ? `${clean.slice(0, length)}…` : clean || "Ingen caption";
    };

    let data;
    try {
        const res = await fetch(url, { cache: "no-store" });
        data = await res.json();
    } catch (e) {
        document.querySelector(".dashboard-wrap").innerHTML =
            "<p>Kunde inte ladda dashboard-data. Kontrollera att data-URL är korrekt.</p>";
        return;
    }

    const $ = (id) => document.getElementById(id);
    const set = (id, v) => { const el = $(id); if (el) el.textContent = v; };

    const rows = data.daily_insights || [];
    const recent7 = rows.slice(-7);
    const posts7 = sumPosts(recent7);
    const reach30 = sumValues(data.time_series_30d.reach);
    const newFollowers30 = sumValues(data.time_series_30d.follower_count);
    const profileViews = data.totals_30d.profile_views || 0;
    const linkClicks = data.totals_30d.profile_link_clicks || 0;
    const linkClicksAvailable = data.totals_30d.profile_link_clicks_available === true || data.totals_30d.profile_link_clicks_metric;
    const updatedAt = new Date(data.updated_at);
    const dataAge = daysBetween(new Date(), updatedAt);

    set("updated-at", new Date(data.updated_at).toLocaleString("sv-SE"));
    set("kpi-followers", fmt(data.profile.followers_count));
    set("kpi-reach", fmt(reach30));
    set("kpi-new-followers", fmt(newFollowers30));
    set("kpi-profile-views", fmt(profileViews));
    set("kpi-link-clicks", linkClicksAvailable ? fmt(linkClicks) : "–");

    // Extra KPIs
    const ex = data.extras_30d || {};
    const savesShares = (ex.saves || 0) + (ex.shares || 0);
    set("kpi-engagement-rate", pct(ex.engagement_rate_pct));
    set("kpi-saves-shares", fmt(savesShares));

    // Överblick: börja med fakta och det som går att bygga vidare på.
    const statusEl = $("overview-status");
    const setOverviewStatus = (label, level) => {
        if (!statusEl) return;
        statusEl.textContent = label;
        statusEl.className = `overview-status ${level}`;
    };
    const nonFollowerPct = ex.reach_non_followers_pct;
    const engagementRate = ex.engagement_rate_pct || 0;
    let action = "Välj ett inlägg som redan fungerar och gör en ny variant: samma idé, ny hook eller tydligare exempel.";

    if (dataAge > 2) {
        action = "Börja med att uppdatera datan, så nästa beslut bygger på färska siffror.";
    } else if (posts7 < 3) {
        action = "Planera ett enkelt, sparbart inlägg den här veckan: en checklista, en tydlig AI-prompt eller ett konkret före/efter-exempel.";
    } else if (savesShares < 3) {
        action = "Testa ett format som är lätt att spara: en mini-guide, en mall eller tre konkreta steg som målgruppen kan återvända till.";
    } else if (nonFollowerPct != null && nonFollowerPct < 50) {
        action = "Bygg vidare med en tydlig hook och ord som nya personer kan hitta dig via: AI, Claude, marknadsföring och soloentreprenör.";
    } else if (engagementRate >= 5) {
        action = "Responsen är stark. Gör mer av samma typ av innehåll och paketera om bästa vinkeln till en ny post.";
    }

    setOverviewStatus(dataAge === 0 ? "Uppdaterad idag" : `Uppdaterad för ${dataAge} dagar sedan`, dataAge > 2 ? "stale" : "fresh");
    set("overview-summary", `Senaste 30 dagarna har kontot nått ${fmt(reach30)} konton och fått ${fmt(profileViews)} profilbesök${linkClicksAvailable ? `, varav ${fmt(linkClicks)} klick vidare från profilen` : ""}. Här är signalerna som hjälper dig välja nästa innehåll.`);
    set("highlight-primary", reach30 > 0 ? `Räckvidden ger dig en tydlig bas att analysera: ${fmt(reach30)} konton senaste 30 dagarna.` : "Räckviddsdatan är på plats och fylls på i takt med nya inlägg.");
    set("highlight-secondary", linkClicksAvailable ? `${fmt(linkClicks)} klick vidare visar hur profilen leder människor mot hemsidan.` : "Hemsidelänken följs upp här när Meta lämnar ut länk-klick via API:t.");
    set("highlight-tertiary", newFollowers30 > 0 ? `${fmt(newFollowers30)} nya följare visar att innehållet kan omvandlas till relationer.` : "Följarutvecklingen blir lättare att läsa när de kommande inläggen börjar jämföras över tid.");
    set("focus-action", action);
    set("focus-posts-7", `${fmt(posts7)} inlägg`);
    set("focus-non-followers", pct(nonFollowerPct));
    set("focus-freshness", dataAge === 0 ? "Färsk" : `${dataAge} d`);
    set("link-click-story", linkClicksAvailable
        ? `${fmt(linkClicks)} personer har klickat vidare från Instagram-profilen till din länk/hemsida senaste 30 dagarna. Titta på inläggen nedan för att se vilket innehåll som verkar få människor att ta nästa steg.`
        : "Här visas klick vidare från profilen när Meta skickar den datan via API:t. Under tiden använder vi profilbesök och följar-signaler för att se vilka inlägg som får människor att närma sig dig.");

    // Best posting
    const bp = data.best_posting || {};
    if ($("best-weekday")) $("best-weekday").textContent = bp.weekday || "–";
    if ($("best-hour")) $("best-hour").textContent = bp.hour != null ? `kl ${bp.hour}:00` : "–";
    if ($("best-posts-analyzed")) $("best-posts-analyzed").textContent = fmt(bp.posts_analyzed || 0);
    const bestHint = document.querySelector(".best-posting-hint");
    if (bestHint && (bp.posts_analyzed || 0) < 8) {
        bestHint.textContent += " För få inlägg för säker slutsats.";
    }

    const reach = data.time_series_30d.reach || [];
    const followers = data.time_series_30d.follower_count || [];
    new Chart($("chart-reach"), {
        type: "line",
        data: {
            labels: reach.map((d) => d.date),
            datasets: [
                { label: "Räckvidd (dagligen)", data: reach.map((d) => d.value), borderColor: "#e91e63", backgroundColor: "rgba(233,30,99,.1)", tension: .3, fill: true, yAxisID: "y" },
                { label: "Nya följare", data: followers.map((d) => d.value), borderColor: "#3f51b5", backgroundColor: "rgba(63,81,181,.1)", tension: .3, fill: false, yAxisID: "y1" }
            ]
        },
        options: {
            responsive: true,
            plugins: { legend: { position: "bottom" } },
            scales: {
                y: { type: "linear", position: "left", title: { display: true, text: "Räckvidd" } },
                y1: { type: "linear", position: "right", title: { display: true, text: "Nya följare" }, grid: { drawOnChartArea: false } }
            }
        }
    });

    const fb = data.format_breakdown || {};
    const labels = { IMAGE: "Bild", CAROUSEL_ALBUM: "Karusell", VIDEO: "Video", REELS: "Reels" };
    new Chart($("chart-format"), {
        type: "bar",
        data: {
            labels: Object.keys(fb).map((k) => labels[k] || k),
            datasets: [{
                label: "Snitt-engagemang",
                data: Object.values(fb).map((v) => v.avg_engagement),
                backgroundColor: ["#e91e63", "#3f51b5", "#009688", "#ff9800"]
            }]
        },
        options: { responsive: true, plugins: { legend: { display: false } } }
    });

    // Top media
    const grid = $("top-media-grid");
    if (grid) {
        grid.innerHTML = (data.top_media || []).map((m) => {
            const img = m.thumbnail_url || m.media_url || "";
            const caption = (m.caption || "").slice(0, 80) + ((m.caption || "").length > 80 ? "…" : "");
            return `
                <div class="media-card">
                    <a href="${m.permalink}" target="_blank" rel="noopener">
                        <img src="${img}" alt="" loading="lazy">
                        <div class="meta">
                            <strong>${fmt(m.reach)} räckvidd</strong>
                            ❤ ${fmt(m.like_count)} · 💬 ${fmt(m.comments_count)} · 🔖 ${fmt(m.saved)}
                            <p style="margin:.5rem 0 0;color:#666;">${caption}</p>
                        </div>
                    </a>
                </div>
            `;
        }).join("");
    }

    const followerList = $("follower-media-list");
    if (followerList) {
        const followerMedia = data.follower_media || [];
        followerList.innerHTML = followerMedia.length ? followerMedia.map((m) => {
            const img = m.thumbnail_url || m.media_url || "";
            const date = new Date(m.timestamp).toLocaleDateString("sv-SE", { month: "short", day: "numeric" });
            const leadMetric = (m.follows || 0) > 0
                ? `${fmt(m.follows)} nya följare`
                : (m.profile_activity || 0) > 0
                    ? `${fmt(m.profile_activity)} profilaktiviteter`
                    : `${fmt(m.profile_visits || 0)} profilbesök`;
            return `
                <a class="signal-item" href="${m.permalink}" target="_blank" rel="noopener">
                    ${img ? `<img src="${img}" alt="" loading="lazy">` : ""}
                    <span class="signal-copy">
                        <strong>${leadMetric}</strong>
                        <span>${mediaLabel(m)} · ${date} · ${fmt(m.reach || 0)} räckvidd</span>
                        <em>${shortCaption(m.caption)}</em>
                    </span>
                </a>
            `;
        }).join("") : `<p class="signal-empty">När nästa hämtning har körts visas inlägg som gett nya följare eller profilaktivitet här.</p>`;
    }

    // Veckovis saves + shares (algoritmens starkaste signaler)
    const wssCanvas = $("chart-weekly-ss");
    if (wssCanvas) {
        const wss = data.weekly_saves_shares || [];
        const target = 3;
        const currentIndex = wss.findIndex((w) => w.is_current);
        const labels = wss.map((w) => {
            const label = "v" + w.week.split("-W")[1];
            return w.is_current ? `${label} (nu)` : label;
        });
        const saves = wss.map((w) => w.saves);
        const shares = wss.map((w) => w.shares);
        new Chart(wssCanvas, {
            type: "bar",
            data: {
                labels,
                datasets: [
                    { label: "Sparningar", data: saves, backgroundColor: wss.map((w) => w.is_current ? "#14532d" : "#2e7d32"), stack: "ss" },
                    { label: "Delningar", data: shares, backgroundColor: wss.map((w) => w.is_current ? "#22c55e" : "#66bb6a"), stack: "ss" },
                ]
            },
            options: {
                responsive: true,
                plugins: { legend: { position: "bottom" } },
                scales: {
                    y: { stacked: true, beginAtZero: true, ticks: { precision: 0 } },
                    x: {
                        stacked: true,
                        ticks: {
                            color: (ctx) => ctx.index === currentIndex ? "#111" : "#666",
                            font: (ctx) => ctx.index === currentIndex ? { weight: "bold" } : { weight: "normal" },
                        }
                    }
                }
            }
        });

        // Senaste vecka vs förra
        const last = currentIndex >= 0 ? wss[currentIndex] : (wss[wss.length - 1] || { total: 0 });
        const prev = currentIndex > 0 ? wss[currentIndex - 1] : (wss[wss.length - 2] || { total: 0 });
        const status = last.total >= target
            ? { c: "trend-good", s: `Aktuell vecka har redan ${last.total} sparningar/delningar.` }
            : last.total > prev.total
                ? { c: "trend-good", s: `Aktuell vecka växer: ${last.total} jämfört med ${prev.total} förra veckan.` }
                : last.total === prev.total
                    ? { c: "trend-neutral", s: `Aktuell vecka ligger jämnt med förra veckan (${last.total}).` }
                    : { c: "trend-neutral", s: `Aktuell vecka har ${last.total} sparningar/delningar hittills. Använd inläggen nedan för att se vad som bär.` };
        const statusEl = $("weekly-ss-status");
        if (statusEl) {
            statusEl.innerHTML = `<span class="${status.c}">${status.s}</span>`;
        }

        const signalList = $("signal-media-list");
        if (signalList) {
            const signals = data.signal_media || [];
            signalList.innerHTML = signals.length ? signals.map((m) => {
                const img = m.thumbnail_url || m.media_url || "";
                const date = new Date(m.timestamp).toLocaleDateString("sv-SE", { month: "short", day: "numeric" });
                return `
                    <a class="signal-item" href="${m.permalink}" target="_blank" rel="noopener">
                        ${img ? `<img src="${img}" alt="" loading="lazy">` : ""}
                        <span class="signal-copy">
                            <strong>${fmt(m.saved || 0)} sparningar · ${fmt(m.shares || 0)} delningar</strong>
                            <span>${mediaLabel(m)} · ${date} · ${fmt(m.reach || 0)} räckvidd</span>
                            <em>${shortCaption(m.caption)}</em>
                        </span>
                    </a>
                `;
            }).join("") : `<p class="signal-empty">Inga sparningar eller delningar registrerade för inlägg senaste 30 dagarna.</p>`;
        }
    }

    // Daglig insiktstabell med trend-pilar
    const insightsBody = $("daily-insights-body");
    if (insightsBody) {
        // 7-dagars rullande snitt bakåt (exklusive dagen själv) för räckvidd
        const arrow = (value, avg) => {
            if (avg == null || avg === 0) return { c: "arrow-flat", s: "→" };
            const delta = (value - avg) / avg;
            if (delta > 0.1) return { c: "arrow-up", s: "↑" };
            if (delta < -0.1) return { c: "arrow-down", s: "↓" };
            return { c: "arrow-flat", s: "→" };
        };
        const rollingAvg = (i, key) => {
            const slice = rows.slice(Math.max(0, i - 7), i);
            if (!slice.length) return null;
            return slice.reduce((s, r) => s + (r[key] || 0), 0) / slice.length;
        };

        const weekdayShort = ["Sön", "Mån", "Tis", "Ons", "Tor", "Fre", "Lör"];
        insightsBody.innerHTML = rows.slice().reverse().map((r, idx) => {
            const origIdx = rows.length - 1 - idx;
            const reachArrow = arrow(r.reach, rollingAvg(origIdx, "reach"));
            const followersArrow = arrow(r.new_followers, rollingAvg(origIdx, "new_followers"));
            const engagementArrow = arrow(r.engagement, rollingAvg(origIdx, "engagement"));
            const d = new Date(r.date + "T00:00:00");
            const label = `${weekdayShort[d.getDay()]} ${r.date.slice(5)}`;
            return `
                <tr>
                    <td>${label}</td>
                    <td>${fmt(r.reach)} <span class="${reachArrow.c}">${reachArrow.s}</span></td>
                    <td>${fmt(r.new_followers)} <span class="${followersArrow.c}">${followersArrow.s}</span></td>
                    <td>${fmt(r.engagement)} <span class="${engagementArrow.c}">${engagementArrow.s}</span></td>
                    <td>${r.posts ? fmt(r.posts) : "–"}</td>
                </tr>
            `;
        }).join("");
    }
})();
