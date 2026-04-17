(async function () {
    const url = window.DASHBOARD_DATA_URL;
    if (!url) return;

    const fmt = (n) => new Intl.NumberFormat("sv-SE").format(n ?? 0);
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

    document.getElementById("updated-at").textContent =
        new Date(data.updated_at).toLocaleString("sv-SE");
    document.getElementById("kpi-followers").textContent = fmt(data.profile.followers_count);
    document.getElementById("kpi-media").textContent = fmt(data.profile.media_count);
    document.getElementById("kpi-reach").textContent = fmt(sumValues(data.time_series_30d.reach));
    document.getElementById("kpi-views").textContent = fmt(data.totals_30d.views);

    const reach = data.time_series_30d.reach || [];
    const followers = data.time_series_30d.follower_count || [];
    new Chart(document.getElementById("chart-reach"), {
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
    new Chart(document.getElementById("chart-format"), {
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

    const grid = document.getElementById("top-media-grid");
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
})();
