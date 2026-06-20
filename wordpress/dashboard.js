(async function () {
    const url = window.DASHBOARD_DATA_URL;
    if (!url) return;

    const fmt = (n) => new Intl.NumberFormat("sv-SE").format(n ?? 0);
    const pct = (n) => (n == null ? "–" : `${n}%`);
    const sumValues = (arr) => (arr || []).reduce((s, x) => s + (x.value || 0), 0);
    const sumPosts = (rows) => (rows || []).reduce((s, x) => s + (x.posts || 0), 0);
    const daysBetween = (a, b) => Math.max(0, Math.floor((a - b) / 86400000));

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
    const posts30 = sumPosts(rows);
    const reach30 = sumValues(data.time_series_30d.reach);
    const profileViews = data.totals_30d.profile_views || 0;
    const updatedAt = new Date(data.updated_at);
    const dataAge = daysBetween(new Date(), updatedAt);

    set("updated-at", new Date(data.updated_at).toLocaleString("sv-SE"));
    set("kpi-followers", fmt(data.profile.followers_count));
    set("kpi-reach", fmt(reach30));
    set("kpi-profile-views", fmt(profileViews));
    set("kpi-posts-30", fmt(posts30));
    set("kpi-posts-7", fmt(posts7));

    // Extra KPIs
    const ex = data.extras_30d || {};
    const savesShares = (ex.saves || 0) + (ex.shares || 0);
    set("kpi-engagement-rate", pct(ex.engagement_rate_pct));
    set("kpi-saves-shares", fmt(savesShares));
    set("kpi-non-followers", pct(ex.reach_non_followers_pct));

    // Morgonbrief: snabb tolkning för dagens beslut
    const statusEl = $("brief-status");
    const setBriefStatus = (label, level) => {
        if (!statusEl) return;
        statusEl.textContent = label;
        statusEl.className = `brief-status ${level}`;
    };
    const nonFollowerPct = ex.reach_non_followers_pct;
    const engagementRate = ex.engagement_rate_pct || 0;
    let action = "Fortsätt på samma spår och återanvänd idén från inlägget som driver mest räckvidd.";
    let status = { label: "Bra läge", level: "good" };

    if (dataAge > 2) {
        status = { label: "Kolla dataflödet", level: "needs-action" };
        action = "Datan är äldre än två dagar. Kontrollera GitHub Actions innan du tolkar siffrorna.";
    } else if (posts7 < 3) {
        status = { label: "Behöver action", level: "needs-action" };
        action = "Publicera eller planera ett delbart inlägg idag. Sikta på 3–5 inlägg per vecka för bättre signaler.";
    } else if (savesShares < 3) {
        status = { label: "Okej, men svag delning", level: "watch" };
        action = "Skapa något sparbart: en checklista, konkret Claude-prompt eller karusell som löser ett tydligt problem.";
    } else if (nonFollowerPct != null && nonFollowerPct < 50) {
        status = { label: "Bygg räckvidd", level: "watch" };
        action = "Prioritera innehåll som kan nå nya: tydlig hook, delbar vinkel och nyckelord som Claude, AI och soloentreprenör.";
    } else if (engagementRate >= 5) {
        status = { label: "Stark respons", level: "good" };
        action = "Engagemanget är starkt. Gör en ny variant av bästa idén: byt hook, behåll vinkeln.";
    }

    setBriefStatus(status.label, status.level);
    set("brief-summary", `Senaste 30 dagar: ${fmt(reach30)} i räckvidd, ${pct(engagementRate)} engagement rate och ${pct(nonFollowerPct)} räckvidd från icke-följare.`);
    set("brief-action", action);
    set("brief-posts-7", fmt(posts7));
    set("brief-posts-30", fmt(posts30));
    set("brief-profile-views", fmt(profileViews));
    set("brief-freshness", dataAge === 0 ? "Idag" : `${dataAge} d`);

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

    // Veckovis saves + shares (algoritmens starkaste signaler)
    const wssCanvas = $("chart-weekly-ss");
    if (wssCanvas) {
        const wss = data.weekly_saves_shares || [];
        const target = 3;
        const labels = wss.map((w) => "v" + w.week.split("-W")[1]);
        const saves = wss.map((w) => w.saves);
        const shares = wss.map((w) => w.shares);
        new Chart(wssCanvas, {
            type: "bar",
            data: {
                labels,
                datasets: [
                    { label: "Sparningar", data: saves, backgroundColor: "#2e7d32", stack: "ss" },
                    { label: "Delningar", data: shares, backgroundColor: "#66bb6a", stack: "ss" },
                ]
            },
            options: {
                responsive: true,
                plugins: { legend: { position: "bottom" } },
                scales: { y: { stacked: true, beginAtZero: true, ticks: { precision: 0 } }, x: { stacked: true } }
            }
        });

        // Senaste vecka vs förra
        const last = wss[wss.length - 1] || { total: 0 };
        const prev = wss[wss.length - 2] || { total: 0 };
        const status = last.total >= target
            ? { c: "arrow-up", s: `↑ Mål nått (${last.total} av ${target})` }
            : last.total > prev.total
                ? { c: "arrow-up", s: `↑ Bättre än förra veckan (${last.total} vs ${prev.total})` }
                : last.total === prev.total
                    ? { c: "arrow-flat", s: `→ Samma som förra veckan (${last.total})` }
                    : { c: "arrow-down", s: `↓ Sämre än förra veckan (${last.total} vs ${prev.total})` };
        const statusEl = $("weekly-ss-status");
        if (statusEl) {
            statusEl.innerHTML = `<span class="${status.c}">${status.s}</span>`;
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
