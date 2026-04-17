(async function () {
    const url = window.DASHBOARD_DATA_URL;
    if (!url) return;

    const fmt = (n) => new Intl.NumberFormat("sv-SE").format(n ?? 0);
    const pct = (n) => (n == null ? "–" : `${n}%`);
    const sumValues = (arr) => (arr || []).reduce((s, x) => s + (x.value || 0), 0);

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

    set("updated-at", new Date(data.updated_at).toLocaleString("sv-SE"));
    set("kpi-followers", fmt(data.profile.followers_count));
    set("kpi-media", fmt(data.profile.media_count));
    set("kpi-reach", fmt(sumValues(data.time_series_30d.reach)));
    set("kpi-views", fmt(data.totals_30d.views));

    // Extra KPIs
    const ex = data.extras_30d || {};
    set("kpi-engagement-rate", pct(ex.engagement_rate_pct));
    set("kpi-saves-shares", fmt((ex.saves || 0) + (ex.shares || 0)));
    set("kpi-non-followers", pct(ex.reach_non_followers_pct));

    // Best posting
    const bp = data.best_posting || {};
    if ($("best-weekday")) $("best-weekday").textContent = bp.weekday || "–";
    if ($("best-hour")) $("best-hour").textContent = bp.hour != null ? `kl ${bp.hour}:00` : "–";
    if ($("best-posts-analyzed")) $("best-posts-analyzed").textContent = fmt(bp.posts_analyzed || 0);

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

    // Daglig insiktstabell med trend-pilar
    const insightsBody = $("daily-insights-body");
    if (insightsBody) {
        const rows = data.daily_insights || [];
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
