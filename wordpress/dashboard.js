(async function () {
    const url = window.DASHBOARD_DATA_URL;
    if (!url) return;

    const fmt = (n) => new Intl.NumberFormat("sv-SE").format(n ?? 0);
    const countLabel = (n, singular, plural) => `${fmt(n)} ${n === 1 ? singular : plural}`;
    const pct = (n) => {
        if (n == null) return "–";
        return `${new Intl.NumberFormat("sv-SE", { maximumFractionDigits: 1 }).format(n)}%`;
    };
    const sumValues = (arr) => (arr || []).reduce((s, x) => s + (x.value || 0), 0);
    const sumPosts = (rows) => (rows || []).reduce((s, x) => s + (x.posts || 0), 0);
    const daysBetween = (a, b) => Math.max(0, Math.floor((a - b) / 86400000));
    const profileDayValue = (r) => r.profile_views || r.content_profile_visits || 0;
    const outboundDayValue = (r) => r.profile_link_clicks || r.bio_link_clicks || r.story_link_clicks || 0;
    const mediaLabel = (m) => m.media_product_type === "REELS"
        ? "Reel"
        : ({ IMAGE: "Bild", CAROUSEL_ALBUM: "Karusell", VIDEO: "Video" }[m.media_type] || "Inlägg");
    const deltaText = (n) => {
        if (n == null) return null;
        if (n > 0) return `${pct(n)} högre`;
        if (n < 0) return `${pct(Math.abs(n))} lägre`;
        return "oförändrad";
    };
    const shortCaption = (text, length = 95) => {
        const clean = (text || "").replace(/\s+/g, " ").trim();
        return clean.length > length ? `${clean.slice(0, length)}…` : clean || "Ingen caption";
    };
    const escapeHtml = (value) => String(value || "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");

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
    const timeSeries = data.time_series_30d || {};
    const totals30 = data.totals_30d || {};
    const history = data.history || {};
    const historyDaily = history.daily || rows;
    const historySnapshots = history.snapshots || [];
    const historyMedia = history.media || data.top_media || [];
    const profileSummary = data.profile_summary_30d || {};
    const profileTotals = profileSummary.totals || {};
    const profileRates = profileSummary.rates || {};
    const recent7 = rows.slice(-7);
    const posts7 = sumPosts(recent7);
    const reach30 = profileTotals.reach != null ? profileTotals.reach : sumValues(timeSeries.reach);
    const newFollowers30 = profileTotals.new_followers != null ? profileTotals.new_followers : sumValues(timeSeries.follower_count);
    const profileViews = profileTotals.profile_views != null ? profileTotals.profile_views : (totals30.profile_views || 0);
    const linkClicks = profileTotals.profile_link_clicks != null ? profileTotals.profile_link_clicks : (totals30.profile_link_clicks || 0);
    const outboundClicks = profileTotals.outbound_clicks != null ? profileTotals.outbound_clicks : linkClicks;
    const linkClicksAvailable = profileSummary.link_clicks_available === true || totals30.profile_link_clicks_available === true || totals30.profile_link_clicks_metric;
    const rateOf = (part, whole) => whole ? Math.round((part / whole) * 1000) / 10 : null;
    const profileVisitRate = profileRates.profile_visit_rate_pct ?? profileRates.content_profile_visit_rate_pct ?? rateOf(profileViews, reach30);
    const linkClickRate = profileRates.link_click_rate_pct ?? ((linkClicksAvailable || outboundClicks) ? rateOf(outboundClicks, profileViews) : null);
    const followRate = profileRates.follow_rate_pct ?? rateOf(newFollowers30, profileViews);
    const updatedAt = new Date(data.updated_at);
    const dataAge = daysBetween(new Date(), updatedAt);

    const periodLabels = {
        30: "Senaste 30 dagarna",
        90: "Senaste 3 månaderna",
        180: "Senaste 6 månaderna",
        365: "Senaste året",
    };
    const signed = (n) => `${n > 0 ? "+" : ""}${fmt(n)}`;
    const average = (list, key) => list.length
        ? list.reduce((sum, row) => sum + (row[key] || 0), 0) / list.length
        : 0;
    const dateLabel = (date) => new Date(`${date}T00:00:00`).toLocaleDateString("sv-SE", {
        day: "numeric",
        month: "short",
    });
    let historyChart;

    const isoWeek = (dateString) => {
        const date = new Date(`${dateString}T00:00:00Z`);
        const day = date.getUTCDay() || 7;
        date.setUTCDate(date.getUTCDate() + 4 - day);
        const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
        return Math.ceil((((date - yearStart) / 86400000) + 1) / 7);
    };

    const periodBucketKey = (dateString, periodDays) => {
        if (periodDays === 30) return dateString;
        if (periodDays === 365) return dateString.slice(0, 7);
        const date = new Date(`${dateString}T00:00:00Z`);
        const day = date.getUTCDay() || 7;
        date.setUTCDate(date.getUTCDate() - day + 1);
        return date.toISOString().slice(0, 10);
    };

    const actionMetrics = (media) => {
        const profile = media.profile_visits || 0;
        const saves = media.saved || 0;
        const shares = media.shares || 0;
        const next = (media.bio_link_clicks || 0) + (media.contact_actions || 0) + (media.follows || 0);
        return { profile, saves, shares, next, total: profile + saves + shares + next };
    };
    const meaningfulActions = (media) => actionMetrics(media).total;
    const actionLine = (media) => {
        const metrics = actionMetrics(media);
        return [
            metrics.profile ? `${fmt(metrics.profile)} profilbesök` : "",
            metrics.saves ? countLabel(metrics.saves, "sparning", "sparningar") : "",
            metrics.shares ? countLabel(metrics.shares, "delning", "delningar") : "",
            metrics.next ? `${fmt(metrics.next)} nästa steg` : "",
        ].filter(Boolean).join(" · ") || "Ingen registrerad handling";
    };

    const aggregateRows = (selectedRows, periodDays) => {
        const mode = periodDays === 30 ? "day" : periodDays === 365 ? "month" : "week";
        if (mode === "day") {
            return selectedRows.map((row) => ({
                ...row,
                date: row.date,
                profile: profileDayValue(row),
                outbound: outboundDayValue(row),
                label: new Date(`${row.date}T00:00:00`).toLocaleDateString("sv-SE", { weekday: "short", month: "2-digit", day: "2-digit" }),
            }));
        }

        const grouped = new Map();
        selectedRows.forEach((row) => {
            const date = new Date(`${row.date}T00:00:00Z`);
            const key = periodBucketKey(row.date, periodDays);
            let label;
            if (mode === "month") {
                label = date.toLocaleDateString("sv-SE", { month: "long", year: "numeric", timeZone: "UTC" });
            } else {
                const monday = new Date(`${key}T00:00:00Z`);
                label = `v${isoWeek(row.date)} · ${dateLabel(monday.toISOString().slice(0, 10))}`;
            }
            if (!grouped.has(key)) {
                grouped.set(key, { date: key, label, reach: 0, new_followers: 0, profile: 0, outbound: 0, engagement: 0, posts: 0, stories: 0, story_reach: 0 });
            }
            const target = grouped.get(key);
            target.reach += row.reach || 0;
            target.new_followers += row.new_followers || 0;
            target.profile += profileDayValue(row);
            target.outbound += outboundDayValue(row);
            target.engagement += row.engagement || 0;
            target.posts += row.posts || 0;
            target.stories += row.stories || 0;
            target.story_reach += row.story_reach || 0;
        });
        return Array.from(grouped.values());
    };

    const signalCard = (media, type) => {
        const image = media.thumbnail_url || media.media_url || "";
        const date = new Date(media.timestamp).toLocaleDateString("sv-SE", { month: "short", day: "numeric" });
        let lead;
        if (type === "saves") {
            lead = `${countLabel(media.saved || 0, "sparning", "sparningar")} · ${countLabel(media.shares || 0, "delning", "delningar")}`;
        } else {
            lead = `${fmt(meaningfulActions(media))} värdefulla handlingar`;
        }
        const actions = type === "saves" ? "" : actionLine(media);
        return `
            <a class="signal-item" href="${escapeHtml(media.permalink || "#")}" target="_blank" rel="noopener">
                ${image ? `<img src="${escapeHtml(image)}" alt="" loading="lazy">` : ""}
                <span class="signal-copy">
                    <strong>${lead}</strong>
                    <span>${mediaLabel(media)} · ${date} · ${fmt(media.reach || 0)} räckvidd</span>
                    ${actions ? `<span>${actions}</span>` : ""}
                    <em>${escapeHtml(shortCaption(media.caption))}</em>
                </span>
            </a>`;
    };

    const responseCard = (media, type) => {
        if (!media) return `<div class="response-post empty">Det finns inget tydligt jämförelseinlägg i vald period ännu.</div>`;
        const image = media.thumbnail_url || media.media_url || "";
        const date = new Date(media.timestamp).toLocaleDateString("sv-SE", { month: "long", day: "numeric" });
        const total = meaningfulActions(media);
        const primary = type === "action"
            ? `${fmt(total)} värdefulla handlingar`
            : `${fmt(media.reach || 0)} i räckvidd · ingen handling`;
        return `
            <a href="${escapeHtml(media.permalink || "#")}" target="_blank" rel="noopener">
                ${image ? `<img src="${escapeHtml(image)}" alt="" loading="lazy">` : ""}
                <span class="response-post-copy">
                    <strong>${primary}</strong>
                    <span>${date} · ${fmt(media.reach || 0)} i räckvidd</span>
                    <span>${actionLine(media)}</span>
                    <p>${escapeHtml(shortCaption(media.caption, 100))}</p>
                </span>
            </a>`;
    };

    const renderPeriodDetails = (periodDays, selectedRows, cutoffKey, latestDate) => {
        const periodLabel = periodLabels[periodDays].toLowerCase();
        const mediaEndDate = (data.updated_at || latestDate).slice(0, 10);
        const selectedMedia = historyMedia
            .filter((media) => {
                const date = (media.timestamp || "").slice(0, 10);
                return date >= cutoffKey && date <= mediaEndDate;
            });
        const aggregates = aggregateRows(selectedRows, periodDays);
        const aggregateByKey = new Map(aggregates.map((row) => [row.date, row]));
        aggregates.forEach((row) => {
            row.action_profile = 0;
            row.action_saves = 0;
            row.action_shares = 0;
            row.action_next = 0;
            row.meaningful_actions = 0;
        });
        selectedMedia.forEach((media) => {
            const key = periodBucketKey((media.timestamp || "").slice(0, 10), periodDays);
            const target = aggregateByKey.get(key);
            if (!target) return;
            const metrics = actionMetrics(media);
            target.action_profile += metrics.profile;
            target.action_saves += metrics.saves;
            target.action_shares += metrics.shares;
            target.action_next += metrics.next;
            target.meaningful_actions += metrics.total;
        });
        const modeLabel = periodDays === 30 ? "Dagliga" : periodDays === 365 ? "Månadsvisa" : "Veckovisa";
        const periodHeader = periodDays === 30 ? "Datum" : periodDays === 365 ? "Månad" : "Vecka";
        const totalActions = selectedMedia.reduce((sum, media) => sum + meaningfulActions(media), 0);
        const mediaReach = selectedMedia.reduce((sum, media) => sum + (media.reach || 0), 0);
        const actionMedia = selectedMedia
            .filter((media) => meaningfulActions(media) > 0)
            .sort((a, b) => meaningfulActions(b) - meaningfulActions(a) || (b.reach || 0) - (a.reach || 0));
        const bestActionMedia = actionMedia[0];
        const reachOnlyMedia = selectedMedia
            .filter((media) => meaningfulActions(media) === 0)
            .sort((a, b) => (b.reach || 0) - (a.reach || 0))[0];

        set("content-period-note", `${fmt(selectedMedia.length)} inlägg från ${periodLabel}.`);
        set("action-total", fmt(totalActions));
        set("action-post-count", `${fmt(actionMedia.length)} av ${fmt(selectedMedia.length)}`);
        set("action-post-share", selectedMedia.length ? `${fmt(Math.round((actionMedia.length / selectedMedia.length) * 100))}% av inläggen ledde vidare` : "inga inlägg i perioden");
        set("action-rate", mediaReach ? new Intl.NumberFormat("sv-SE", { maximumFractionDigits: 1 }).format((totalActions / mediaReach) * 100) : "–");
        const actionBestCard = $("action-best-card");
        if (actionBestCard) actionBestCard.innerHTML = responseCard(bestActionMedia, "action");
        const reachOnlyCard = $("reach-only-card");
        if (reachOnlyCard) reachOnlyCard.innerHTML = responseCard(reachOnlyMedia, "reach");
        set("details-summary", `Visa fler detaljer för ${periodLabel}`);
        set("insights-heading", `${modeLabel} insikter`);
        set("insights-period-header", periodHeader);
        set("insights-hint", `Pilarna jämför med föregående ${periodDays === 30 ? "dag" : periodDays === 365 ? "månad" : "vecka"}.`);

        const topMedia = selectedMedia.slice().sort((a, b) => (b.reach || 0) - (a.reach || 0)).slice(0, 5);
        const topGrid = $("top-media-grid");
        if (topGrid) {
            topGrid.innerHTML = topMedia.length ? topMedia.map((media) => {
                const image = media.thumbnail_url || media.media_url || "";
                const date = new Date(media.timestamp).toLocaleDateString("sv-SE", { month: "short", day: "numeric" });
                return `
                    <div class="media-card">
                        <a href="${escapeHtml(media.permalink || "#")}" target="_blank" rel="noopener">
                            ${image ? `<img src="${escapeHtml(image)}" alt="" loading="lazy">` : ""}
                            <div class="meta">
                                <strong>${fmt(meaningfulActions(media))} värdefulla handlingar</strong>
                                <span>${fmt(media.reach || 0)} i räckvidd · ${mediaLabel(media)} · ${date}</span>
                                <span>${actionLine(media)}</span>
                                <p>${escapeHtml(shortCaption(media.caption, 80))}</p>
                            </div>
                        </a>
                    </div>`;
            }).join("") : `<p class="signal-empty">Inga inlägg finns sparade för ${periodLabel} ännu.</p>`;
        }

        const followerList = $("follower-media-list");
        if (followerList) {
            followerList.innerHTML = actionMedia.length
                ? actionMedia.slice(0, 8).map((media) => signalCard(media, "profile")).join("")
                : `<p class="signal-empty">Inga värdefulla handlingar har registrerats för inlägg under ${periodLabel}.</p>`;
        }

        const signalMedia = selectedMedia
            .filter((media) => (media.saved || 0) + (media.shares || 0) > 0)
            .sort((a, b) => ((b.saved || 0) + (b.shares || 0)) - ((a.saved || 0) + (a.shares || 0)))
            .slice(0, 8);
        const totalSaves = selectedMedia.reduce((sum, media) => sum + (media.saved || 0), 0);
        const totalShares = selectedMedia.reduce((sum, media) => sum + (media.shares || 0), 0);
        set("weekly-ss-status", signalMedia.length
            ? `${fmt(signalMedia.length)} inlägg fick tillsammans ${countLabel(totalSaves, "sparning", "sparningar")} och ${countLabel(totalShares, "delning", "delningar")} under perioden.`
            : `Inga sparningar eller delningar har registrerats under ${periodLabel}.`);
        const signalList = $("signal-media-list");
        if (signalList) {
            signalList.innerHTML = signalMedia.length
                ? signalMedia.map((media) => signalCard(media, "saves")).join("")
                : `<p class="signal-empty">När ett inlägg sparas eller delas visas själva inlägget här.</p>`;
        }

        const reach = selectedRows.reduce((sum, row) => sum + (row.reach || 0), 0);
        const newFollowers = selectedRows.reduce((sum, row) => sum + (row.new_followers || 0), 0);
        const rowProfile = selectedRows.reduce((sum, row) => sum + profileDayValue(row), 0);
        const rowOutbound = selectedRows.reduce((sum, row) => sum + outboundDayValue(row), 0);
        const mediaProfile = selectedMedia.reduce((sum, media) => sum + (media.profile_visits || 0), 0);
        const mediaOutbound = selectedMedia.reduce((sum, media) => sum + (media.bio_link_clicks || 0) + (media.contact_actions || 0), 0);
        const profile = rowProfile || mediaProfile;
        const outbound = rowOutbound || mediaOutbound;
        set("funnel-reach", fmt(reach));
        set("funnel-profile-views", fmt(profile));
        set("funnel-outbound-clicks", fmt(outbound));
        set("funnel-new-followers", fmt(newFollowers));
        set("profile-rate", pct(rateOf(profile, reach)));
        set("profile-click-rate", pct(rateOf(outbound, profile)));
        set("profile-follow-rate", pct(rateOf(newFollowers, reach)));
        set("profile-funnel-story", `${fmt(profile)} profilbesök på ${fmt(reach)} i summerad räckvidd under ${periodLabel}. ${outbound ? `${fmt(outbound)} mätbara nästa steg registrerades.` : "Inga mätbara nästa steg registrerades i perioden."}`);
        set("profile-chart-status", `${modeLabel} värden för vald period.`);
        set("link-click-story", actionMedia.length
            ? `${fmt(actionMedia.length)} inlägg ledde till ${fmt(totalActions)} värdefulla handlingar under ${periodLabel}. Räckvidden är sammanhanget, handlingen är resultatet.`
            : `Här visas inlägg som leder människor mot profil eller nästa steg under ${periodLabel}.`);

        const bestProfileDays = selectedRows.slice().sort((a, b) => profileDayValue(b) - profileDayValue(a)).filter((row) => profileDayValue(row) > 0).slice(0, 5);
        const profileDayList = $("profile-day-list");
        if (profileDayList) {
            profileDayList.innerHTML = bestProfileDays.length ? bestProfileDays.map((row) => `
                <div class="profile-day-item">
                    <span>${new Date(`${row.date}T00:00:00`).toLocaleDateString("sv-SE", { weekday: "short", month: "short", day: "numeric" })}</span>
                    <strong>${fmt(profileDayValue(row))} profilbesök</strong>
                    <em>${fmt(row.reach || 0)} räckvidd · ${row.posts ? `${fmt(row.posts)} inlägg` : "ingen publicering"}${outboundDayValue(row) ? ` · ${fmt(outboundDayValue(row))} vidare` : ""}</em>
                </div>`).join("") : `<p class="signal-empty">Inga dagar med registrerade profilbesök i vald period.</p>`;
        }

        const profileCanvas = $("chart-profile");
        const oldProfileChart = profileCanvas ? Chart.getChart(profileCanvas) : null;
        if (oldProfileChart) oldProfileChart.destroy();
        const hasProfileData = aggregates.some((row) => row.profile || row.outbound);
        const profileChartBlock = $("profile-chart-block");
        if (profileChartBlock) profileChartBlock.hidden = !hasProfileData;
        if (profileCanvas && hasProfileData) {
            new Chart(profileCanvas, {
                type: "bar",
                data: {
                    labels: aggregates.map((row) => row.label),
                    datasets: [
                        { label: "Profilbesök", data: aggregates.map((row) => row.profile), backgroundColor: "#6d5bd0", yAxisID: "y" },
                        { label: "Vidare", data: aggregates.map((row) => row.outbound), type: "line", borderColor: "#0f766e", backgroundColor: "rgba(15,118,110,.12)", tension: .3, fill: false, yAxisID: "y1" },
                    ],
                },
                options: { responsive: true, plugins: { legend: { position: "bottom" } }, scales: { y: { beginAtZero: true, ticks: { precision: 0 } }, y1: { beginAtZero: true, position: "right", ticks: { precision: 0 }, grid: { drawOnChartArea: false } } } },
            });
        }

        const formatGroups = new Map();
        selectedMedia.forEach((media) => {
            const key = media.media_product_type === "REELS" ? "REELS" : media.media_type || "OTHER";
            const value = formatGroups.get(key) || { count: 0, engagement: 0 };
            value.count += 1;
            value.engagement += media.engagement ?? ((media.like_count || 0) + (media.comments_count || 0) + (media.saved || 0) + (media.shares || 0));
            formatGroups.set(key, value);
        });
        const formatEntries = Array.from(formatGroups.entries()).filter(([, value]) => value.count > 0);
        const formatBlock = $("format-block");
        const showFormats = selectedMedia.length >= 3 && formatEntries.length >= 2;
        if (formatBlock) formatBlock.hidden = !showFormats;
        const formatCanvas = $("chart-format");
        const oldFormatChart = formatCanvas ? Chart.getChart(formatCanvas) : null;
        if (oldFormatChart) oldFormatChart.destroy();
        if (formatCanvas && showFormats) {
            set("format-status", `Baserat på ${fmt(selectedMedia.length)} inlägg i ${fmt(formatEntries.length)} format under ${periodLabel}.`);
            new Chart(formatCanvas, {
                type: "bar",
                data: {
                    labels: formatEntries.map(([key]) => ({ IMAGE: "Bild", CAROUSEL_ALBUM: "Karusell", VIDEO: "Video", REELS: "Reels" }[key] || key)),
                    datasets: [{ label: "Snitt-engagemang", data: formatEntries.map(([, value]) => Math.round(value.engagement / value.count * 10) / 10), backgroundColor: ["#c85f45", "#28745d", "#d49a32", "#6a6a78"] }],
                },
                options: { responsive: true, plugins: { legend: { display: false } } },
            });
        }

        const saveGroups = new Map();
        selectedMedia.slice().reverse().forEach((media) => {
            const date = (media.timestamp || "").slice(0, 10);
            const key = periodDays === 365 ? date.slice(0, 7) : `${date.slice(0, 4)}-W${String(isoWeek(date)).padStart(2, "0")}`;
            const label = periodDays === 365
                ? new Date(`${date.slice(0, 7)}-01T00:00:00`).toLocaleDateString("sv-SE", { month: "short" })
                : `v${isoWeek(date)}`;
            const target = saveGroups.get(key) || { label, saves: 0, shares: 0 };
            target.saves += media.saved || 0;
            target.shares += media.shares || 0;
            saveGroups.set(key, target);
        });
        const saveRows = Array.from(saveGroups.values());
        set("save-share-heading", periodDays === 365 ? "Sparningar och delningar månad för månad" : "Sparningar och delningar vecka för vecka");
        const saveCanvas = $("chart-weekly-ss");
        const oldSaveChart = saveCanvas ? Chart.getChart(saveCanvas) : null;
        if (oldSaveChart) oldSaveChart.destroy();
        if (saveCanvas) {
            new Chart(saveCanvas, {
                type: "bar",
                data: { labels: saveRows.map((row) => row.label), datasets: [
                    { label: "Sparningar", data: saveRows.map((row) => row.saves), backgroundColor: "#2e7d32", stack: "ss" },
                    { label: "Delningar", data: saveRows.map((row) => row.shares), backgroundColor: "#66bb6a", stack: "ss" },
                ] },
                options: { responsive: true, plugins: { legend: { position: "bottom" } }, scales: { y: { stacked: true, beginAtZero: true, ticks: { precision: 0 } }, x: { stacked: true, ticks: { maxTicksLimit: 12 } } } },
            });
        }

        const bestPostingBlock = $("best-posting-block");
        if (bestPostingBlock) bestPostingBlock.hidden = selectedMedia.length < 8;
        if (selectedMedia.length >= 8) {
            const weekdayScores = new Map();
            const hourScores = new Map();
            selectedMedia.forEach((media) => {
                const date = new Date(media.timestamp);
                const score = media.engagement ?? ((media.like_count || 0) + (media.comments_count || 0) + (media.saved || 0) + (media.shares || 0));
                const weekday = date.toLocaleDateString("sv-SE", { weekday: "long", timeZone: "Europe/Stockholm" });
                const hour = new Intl.DateTimeFormat("sv-SE", { hour: "2-digit", hour12: false, timeZone: "Europe/Stockholm" }).format(date).slice(0, 2);
                for (const [map, key] of [[weekdayScores, weekday], [hourScores, hour]]) {
                    const value = map.get(key) || { total: 0, count: 0 };
                    value.total += score;
                    value.count += 1;
                    map.set(key, value);
                }
            });
            const best = (map) => Array.from(map.entries()).sort((a, b) => (b[1].total / b[1].count) - (a[1].total / a[1].count))[0]?.[0];
            set("best-weekday", best(weekdayScores) || "–");
            set("best-hour", best(hourScores) ? `kl ${best(hourScores)}:00` : "–");
            set("best-posts-analyzed", fmt(selectedMedia.length));
            const hint = document.querySelector(".best-posting-hint");
            if (hint) hint.innerHTML = `Baserat på <span id="best-posts-analyzed">${fmt(selectedMedia.length)}</span> inlägg under ${periodLabel}.`;
        }

        const storySummary = data.story_summary_30d || {};
        const selectedStories = (storySummary.recent_stories || []).filter((story) => {
            const date = (story.timestamp || story.first_seen_at || "").slice(0, 10);
            return date >= cutoffKey && date <= mediaEndDate;
        });
        const storyDays = selectedRows.filter((row) => (row.stories || 0) > 0);
        const storyCount = storyDays.reduce((sum, row) => sum + (row.stories || 0), 0) || selectedStories.length;
        const storyReach = storyDays.reduce((sum, row) => sum + (row.story_reach || 0), 0) || selectedStories.reduce((sum, story) => sum + (story.reach || 0), 0);
        const storyImpressions = selectedStories.reduce((sum, story) => sum + (story.impressions || 0), 0);
        const storyReplies = selectedStories.reduce((sum, story) => sum + (story.replies || 0), 0);
        const storyTapsBack = selectedStories.reduce((sum, story) => sum + (story.taps_back || 0), 0);
        const storiesBlock = $("stories-block");
        if (storiesBlock) storiesBlock.hidden = storyCount === 0 && selectedStories.length === 0;
        set("kpi-stories", fmt(storyCount));
        set("story-reach", fmt(storyReach));
        set("story-impressions", fmt(storyImpressions));
        set("story-replies", fmt(storyReplies));
        set("story-taps-back", fmt(storyTapsBack));
        set("stories-result", storyCount
            ? `${fmt(storyCount)} händelser har fångats under ${periodLabel}, med ${fmt(storyReach)} i registrerad Story-räckvidd.`
            : `Inga händelser har fångats under ${periodLabel}.`);
        const storyList = $("story-list");
        if (storyList) {
            storyList.innerHTML = selectedStories.length ? selectedStories.map((story) => {
                const image = story.thumbnail_url || story.media_url || "";
                const date = new Date(story.timestamp || story.first_seen_at).toLocaleDateString("sv-SE", { weekday: "short", month: "short", day: "numeric" });
                return `
                    <a class="story-item" href="${escapeHtml(story.permalink || "#")}" target="_blank" rel="noopener">
                        ${image ? `<img src="${escapeHtml(image)}" alt="" loading="lazy">` : ""}
                        <span><strong>${date}</strong><em>${fmt(story.reach || 0)} räckvidd · ${fmt(story.impressions || 0)} visningar · ${fmt(story.replies || 0)} svar</em></span>
                    </a>`;
            }).join("") : `<p class="signal-empty">Inga enskilda händelser finns sparade för vald period.</p>`;
        }

        const strongestActionPeriod = aggregates.reduce(
            (best, row) => !best || (row.meaningful_actions || 0) > (best.meaningful_actions || 0) ? row : best,
            null,
        );
        const intervalText = periodDays === 30 ? "dag för dag" : periodDays === 365 ? "månad för månad" : "vecka för vecka";
        set("insights-chart-heading", `Handlingar ${intervalText}`);
        set("insights-chart-summary", strongestActionPeriod && strongestActionPeriod.meaningful_actions
            ? `${strongestActionPeriod.label} gav flest värdefulla handlingar: ${fmt(strongestActionPeriod.meaningful_actions)} på ${fmt(strongestActionPeriod.posts || 0)} inlägg. Räckvidden visas som jämförelse, inte som huvudresultat.`
            : `Inga värdefulla handlingar är registrerade ännu. Räckvidden visas som jämförelse medan historiken fylls på.`);

        const actionCanvas = $("chart-period-insights");
        const oldActionChart = actionCanvas ? Chart.getChart(actionCanvas) : null;
        if (oldActionChart) oldActionChart.destroy();
        if (actionCanvas) {
            new Chart(actionCanvas, {
                type: "bar",
                data: {
                    labels: aggregates.map((row) => row.label),
                    datasets: [
                        { label: "Profilbesök", data: aggregates.map((row) => row.action_profile || 0), backgroundColor: "#28745d", stack: "actions", yAxisID: "y" },
                        { label: "Sparningar", data: aggregates.map((row) => row.action_saves || 0), backgroundColor: "#c85f45", stack: "actions", yAxisID: "y" },
                        { label: "Delningar", data: aggregates.map((row) => row.action_shares || 0), backgroundColor: "#d49a32", stack: "actions", yAxisID: "y" },
                        { label: "Andra nästa steg", data: aggregates.map((row) => row.action_next || 0), backgroundColor: "#77727d", stack: "actions", yAxisID: "y" },
                        { label: "Räckvidd", data: aggregates.map((row) => row.reach || 0), type: "line", borderColor: "#5f5a55", backgroundColor: "transparent", borderWidth: 1.5, pointRadius: periodDays === 30 ? 1 : 2, tension: .25, yAxisID: "y1" },
                    ],
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    interaction: { mode: "index", intersect: false },
                    plugins: { legend: { position: "bottom", labels: { usePointStyle: true, boxWidth: 8 } } },
                    scales: {
                        x: { stacked: true, ticks: { maxTicksLimit: periodDays === 30 ? 10 : 14, maxRotation: 0 }, grid: { display: false } },
                        y: { stacked: true, beginAtZero: true, ticks: { precision: 0 }, title: { display: true, text: "Handlingar" } },
                        y1: { beginAtZero: true, position: "right", ticks: { precision: 0 }, title: { display: true, text: "Räckvidd" }, grid: { drawOnChartArea: false } },
                    },
                },
            });
        }

        const arrow = (value, previous) => {
            if (previous == null || previous === 0) return { c: "arrow-flat", s: "→" };
            const delta = (value - previous) / previous;
            if (delta > .1) return { c: "arrow-up", s: "↑" };
            if (delta < -.1) return { c: "arrow-down", s: "↓" };
            return { c: "arrow-flat", s: "→" };
        };
        const insightsBody = $("daily-insights-body");
        if (insightsBody) {
            insightsBody.innerHTML = aggregates.map((row, index) => {
                const previous = aggregates[index - 1];
                const reachArrow = arrow(row.reach || 0, previous?.reach);
                const actionArrow = arrow(row.meaningful_actions || 0, previous?.meaningful_actions);
                const followerArrow = arrow(row.new_followers || 0, previous?.new_followers);
                return `
                    <tr>
                        <td>${escapeHtml(row.label)}</td>
                        <td>${fmt(row.reach || 0)} <span class="${reachArrow.c}">${reachArrow.s}</span></td>
                        <td>${fmt(row.meaningful_actions || 0)} <span class="${actionArrow.c}">${actionArrow.s}</span></td>
                        <td>${row.action_profile ? fmt(row.action_profile) : "–"}</td>
                        <td>${row.action_saves ? fmt(row.action_saves) : "–"}</td>
                        <td>${row.action_shares ? fmt(row.action_shares) : "–"}</td>
                        <td>${fmt(row.new_followers || 0)} <span class="${followerArrow.c}">${followerArrow.s}</span></td>
                        <td>${row.posts ? fmt(row.posts) : "–"}</td>
                    </tr>`;
            }).reverse().join("");
        }

        document.querySelectorAll(".content-results img, .top-media img, .stories-card img").forEach((image) => {
            const hideBrokenImage = () => {
                image.hidden = true;
                const link = image.closest("a");
                if (link) link.classList.add("image-missing");
            };
            image.addEventListener("error", hideBrokenImage, { once: true });
            if (image.complete && !image.naturalWidth) hideBrokenImage();
        });
    };

    const renderHistory = (periodDays) => {
        if (!historyDaily.length) return;

        const latestDate = historyDaily[historyDaily.length - 1].date;
        const latest = new Date(`${latestDate}T00:00:00Z`);
        const cutoff = new Date(latest);
        cutoff.setUTCDate(cutoff.getUTCDate() - periodDays + 1);
        const cutoffKey = cutoff.toISOString().slice(0, 10);
        const selectedRows = historyDaily.filter((row) => row.date >= cutoffKey && row.date <= latestDate);
        const selectedSnapshots = historySnapshots.filter((row) => row.date >= cutoffKey);
        const firstSnapshot = selectedSnapshots[0] || historySnapshots[0] || {};
        const lastSnapshot = selectedSnapshots[selectedSnapshots.length - 1]
            || historySnapshots[historySnapshots.length - 1]
            || {};
        const currentFollowers = lastSnapshot.followers ?? (data.profile || {}).followers_count ?? 0;
        const hasFollowerBaseline = selectedSnapshots.length >= 2 && firstSnapshot.followers != null;
        const followerDelta = !hasFollowerBaseline
            ? null
            : currentFollowers - firstSnapshot.followers;
        const reach = selectedRows.reduce((sum, row) => sum + (row.reach || 0), 0);
        const newFollowers = selectedRows.reduce((sum, row) => sum + (row.new_followers || 0), 0);
        const posts = selectedRows.reduce((sum, row) => sum + (row.posts || 0), 0);
        const postRows = selectedRows.filter((row) => (row.posts || 0) > 0);
        const quietRows = selectedRows.filter((row) => (row.posts || 0) === 0);
        const avgPostReach = average(postRows, "reach");
        const avgQuietReach = average(quietRows, "reach");
        const impactDelta = avgQuietReach > 0
            ? Math.round(((avgPostReach - avgQuietReach) / avgQuietReach) * 100)
            : null;
        const bestDay = selectedRows.reduce(
            (best, row) => !best || (row.reach || 0) > (best.reach || 0) ? row : best,
            null,
        );
        const coverageDays = selectedRows.length;
        const coverageStart = selectedRows[0] ? dateLabel(selectedRows[0].date) : "–";
        const coverageEnd = selectedRows[selectedRows.length - 1] ? dateLabel(selectedRows[selectedRows.length - 1].date) : "–";

        set("journey-period", periodLabels[periodDays]);
        set("period-followers", fmt(currentFollowers));
        set("period-followers-delta", followerDelta == null
            ? `${fmt(newFollowers)} nya följare registrerade`
            : `${signed(followerDelta)} sedan ${dateLabel(firstSnapshot.date)}`);
        set("period-posts", `${fmt(posts)} inlägg`);
        set("period-active-days", `${fmt(postRows.length)} publiceringsdagar`);
        set("period-reach", fmt(reach));
        set("period-reach-note", `summerad daglig räckvidd`);
        set("period-new-followers", fmt(newFollowers));
        set("period-follow-rate", reach ? `${new Intl.NumberFormat("sv-SE", { maximumFractionDigits: 1 }).format((newFollowers / reach) * 1000)} per 1 000 i räckvidd` : "–");

        const growthTitle = followerDelta == null
            ? newFollowers > 0
                ? `${fmt(newFollowers)} nya följare är registrerade`
                : "Din långtidshistorik fortsätter byggas"
            : followerDelta > 0
                ? `Du har vuxit med ${fmt(followerDelta)} följare`
                : followerDelta < 0
                    ? `Du har ${fmt(Math.abs(followerDelta))} färre följare i perioden`
                    : "Följarantalet är stabilt";
        set("journey-title", growthTitle);
        set("journey-summary", posts
            ? `Du publicerade ${fmt(posts)} inlägg på ${fmt(postRows.length)} dagar. De dagarna syns som tydliga markeringar i grafen, så att du kan se vad som hände runt din aktivitet.`
            : "Ingen publicering är registrerad i den del av perioden vi har data för. Historiken ligger kvar och fortsätter fyllas på." );
        set("history-coverage", coverageDays < periodDays
            ? `Tillgänglig data: ${coverageStart}–${coverageEnd} (${fmt(coverageDays)} av ${fmt(periodDays)} dagar).`
            : `Visar ${coverageStart}–${coverageEnd}`);

        set("impact-post-days", fmt(postRows.length));
        set("impact-post-days-note", `${fmt(posts)} inlägg totalt`);
        set("impact-post-reach", fmt(Math.round(avgPostReach)));
        set("impact-post-reach-note", impactDelta == null
            ? "fler dagar behövs för jämförelse"
            : `${impactDelta > 0 ? "+" : ""}${fmt(impactDelta)}% mot övriga dagar`);
        set("impact-quiet-reach", fmt(Math.round(avgQuietReach)));
        set("impact-best-day", bestDay ? dateLabel(bestDay.date) : "–");
        set("impact-best-day-note", bestDay
            ? `${fmt(bestDay.reach || 0)} räckvidd${bestDay.posts ? ` · ${fmt(bestDay.posts)} inlägg` : ""}`
            : "–");
        set("history-chart-caption", `Daglig räckvidd och nya följare under ${periodLabels[periodDays].toLowerCase()}. Punkterna visar dagar då du publicerade.`);

        renderPeriodDetails(periodDays, selectedRows, cutoffKey, latestDate);

        const canvas = $("chart-history");
        if (!canvas) return;
        if (historyChart) historyChart.destroy();
        historyChart = new Chart(canvas, {
            type: "line",
            data: {
                labels: selectedRows.map((row) => dateLabel(row.date)),
                datasets: [
                    {
                        label: "Räckvidd",
                        data: selectedRows.map((row) => row.reach || 0),
                        borderColor: "#c85f45",
                        backgroundColor: "rgba(200,95,69,.09)",
                        borderWidth: 2,
                        pointRadius: 0,
                        tension: .25,
                        fill: true,
                        yAxisID: "y",
                    },
                    {
                        label: "Nya följare",
                        data: selectedRows.map((row) => row.new_followers || 0),
                        borderColor: "#28745d",
                        backgroundColor: "#28745d",
                        borderWidth: 2,
                        pointRadius: 1.5,
                        tension: .2,
                        fill: false,
                        yAxisID: "y1",
                    },
                    {
                        label: "Publicerat",
                        data: selectedRows.map((row) => row.posts ? row.reach || 0 : null),
                        borderColor: "#111111",
                        backgroundColor: "#ffffff",
                        pointBorderWidth: 2,
                        pointRadius: selectedRows.map((row) => row.posts ? 4 : 0),
                        pointHoverRadius: 6,
                        showLine: false,
                        yAxisID: "y",
                    },
                ],
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: { mode: "index", intersect: false },
                plugins: {
                    legend: { position: "bottom", labels: { usePointStyle: true, boxWidth: 8 } },
                    tooltip: {
                        callbacks: {
                            afterBody: (items) => {
                                const row = selectedRows[items[0].dataIndex];
                                return row && row.posts ? `${fmt(row.posts)} publicerade inlägg` : "";
                            },
                        },
                    },
                },
                scales: {
                    x: { ticks: { maxTicksLimit: periodDays > 90 ? 8 : 10, maxRotation: 0 }, grid: { display: false } },
                    y: { beginAtZero: true, title: { display: true, text: "Räckvidd" }, ticks: { precision: 0 } },
                    y1: { beginAtZero: true, position: "right", title: { display: true, text: "Nya följare" }, ticks: { precision: 0 }, grid: { drawOnChartArea: false } },
                },
            },
        });
    };

    const periodButtons = Array.from(document.querySelectorAll("[data-period-days]"));
    periodButtons.forEach((button) => {
        button.addEventListener("click", () => {
            periodButtons.forEach((item) => item.setAttribute("aria-pressed", String(item === button)));
            renderHistory(Number(button.dataset.periodDays));
        });
    });
    set("updated-at", new Date(data.updated_at).toLocaleString("sv-SE"));
    set("kpi-followers", fmt((data.profile || {}).followers_count));
    set("kpi-reach", fmt(reach30));
    set("kpi-new-followers", fmt(newFollowers30));
    set("kpi-profile-views", fmt(profileViews));
    set("kpi-link-clicks", linkClicksAvailable ? fmt(linkClicks) : outboundClicks ? fmt(outboundClicks) : "–");

    // Extra KPIs
    const ex = data.extras_30d || {};
    const savesShares = (ex.saves || 0) + (ex.shares || 0);
    set("kpi-engagement-rate", pct(ex.engagement_rate_pct));
    set("kpi-saves-shares", fmt(savesShares));

    set("funnel-reach", fmt(reach30));
    set("funnel-profile-views", fmt(profileViews));
    set("funnel-outbound-clicks", fmt(outboundClicks));
    set("funnel-new-followers", fmt(newFollowers30));
    set("profile-rate", pct(profileVisitRate));
    set("profile-click-rate", pct(linkClickRate));
    set("profile-follow-rate", pct(followRate));

    const profileHint = $("funnel-profile-hint");
    if (profileHint) {
        profileHint.textContent = profileSummary.profile_views_series_available
            ? "faktiska profilbesök"
            : profileTotals.content_profile_visits
                ? "kopplat till inlägg"
                : "ville veta mer";
    }
    const outboundHint = $("funnel-outbound-hint");
    if (outboundHint) {
        outboundHint.textContent = linkClicksAvailable
            ? "klick från profilen"
            : profileTotals.bio_link_clicks || profileTotals.story_link_clicks
                ? "bio-/story-klick"
                : "väntar på klickdata";
    }

    const profileFunnelStory = $("profile-funnel-story");
    if (profileFunnelStory) {
        const clickSentence = outboundClicks
            ? `${fmt(outboundClicks)} tog ett mätbart nästa steg från profil, bio eller Story.`
            : linkClicksAvailable
                ? "Inga klick vidare har registrerats i perioden."
                : "Meta lämnar inte alltid ut klick vidare från profilen, så dashboarden visar bio-/Story-klick när de finns.";
        profileFunnelStory.textContent = `${fmt(profileViews)} profilbesök på ${fmt(reach30)} nådda konton ger en profilbesöksgrad på ${pct(profileVisitRate)}. ${clickSentence}`;
    }

    const profileChartStatus = $("profile-chart-status");
    if (profileChartStatus) {
        profileChartStatus.textContent = profileSummary.profile_views_series_available
            ? "Visar faktiska profilbesök per dag när Meta lämnar ut tidsserien."
            : profileTotals.content_profile_visits
                ? "Meta ger inte alltid dagliga profilbesök; grafen visar profilbesök som kan kopplas till publicerat innehåll."
                : "När nästa hämtning hittar daglig profilaktivitet fylls grafen på här.";
    }

    const profileDayList = $("profile-day-list");
    if (profileDayList) {
        const bestDays = profileSummary.best_days || [];
        profileDayList.innerHTML = bestDays.length ? bestDays.map((day) => {
            const date = new Date(day.date + "T00:00:00").toLocaleDateString("sv-SE", { weekday: "short", month: "short", day: "numeric" });
            const links = day.link_clicks ? ` · ${fmt(day.link_clicks)} vidare` : "";
            const posts = day.posts ? `${fmt(day.posts)} inlägg` : day.stories ? `${fmt(day.stories)} händelser` : "ingen publicering";
            return `
                <div class="profile-day-item">
                    <span>${date}</span>
                    <strong>${fmt(day.profile_visits || day.content_profile_visits || 0)} profilbesök</strong>
                    <em>${fmt(day.reach || 0)} räckvidd · ${posts}${links}</em>
                </div>
            `;
        }).join("") : `<p class="signal-empty">När profilbesök kan kopplas till dagar visas toppdagarna här.</p>`;
    }

    const storySummary = data.story_summary_30d || {};
    const storyTotals = storySummary.totals || {};
    const recentStories = storySummary.recent_stories || [];
    const storiesBlock = $("stories-block");
    if (storiesBlock) storiesBlock.hidden = !storySummary.tracking_started;
    set("kpi-stories", fmt(storyTotals.stories || 0));
    set("story-reach", fmt(storyTotals.reach || 0));
    set("story-impressions", fmt(storyTotals.impressions || 0));
    set("story-replies", fmt(storyTotals.replies || 0));
    set("story-taps-back", fmt(storyTotals.taps_back || 0));

    const storyResult = $("stories-result");
    if (storyResult) {
        if (storySummary.tracking_started) {
            const storyDelta = deltaText(storySummary.story_day_reach_delta_pct);
            const tuesdayDelta = deltaText(storySummary.tuesday_reach_delta_pct);
            const storyCompare = storyDelta
                ? `Det är ${storyDelta} än övriga dagar.`
                : "Det behövs fler jämförelsedagar innan händelseeffekten går att läsa säkert.";
            const tuesdayCompare = tuesdayDelta
                ? `Det är ${tuesdayDelta} än 30-dagarsnittet.`
                : "Tisdagsmönstret behöver fler dagar innan det går att läsa säkert.";
            storyResult.textContent = `Dashboarden har fångat ${fmt(storyTotals.stories || 0)} händelser på ${fmt(storySummary.story_days || 0)} dagar. Dagar med fångade händelser har i snitt ${fmt(storySummary.avg_reach_story_days || 0)} räckvidd. ${storyCompare} Tisdagar ligger på ${fmt(storySummary.avg_reach_tuesdays || 0)} i snitt. ${tuesdayCompare}`;
        } else {
            storyResult.textContent = `Händelser mäts inte historiskt i den nuvarande datan. Från och med nästa körning försöker dashboarden fånga aktiva Stories och jämföra tisdagar mot övriga dagar. Tisdagarna i befintlig kontodata ligger på ${fmt(storySummary.avg_reach_tuesdays || 0)} räckvidd i snitt jämfört med ${fmt(storySummary.avg_reach_all_days || 0)} totalt.`;
        }
    }

    const storyList = $("story-list");
    if (storyList) {
        storyList.innerHTML = recentStories.length ? recentStories.map((s) => {
            const date = new Date(s.timestamp || s.first_seen_at).toLocaleDateString("sv-SE", { weekday: "short", month: "short", day: "numeric" });
            const img = s.thumbnail_url || s.media_url || "";
            return `
                <a class="story-item" href="${s.permalink || "#"}" target="_blank" rel="noopener">
                    ${img ? `<img src="${img}" alt="" loading="lazy">` : ""}
                    <span>
                        <strong>${date}</strong>
                        <em>${fmt(s.reach || 0)} räckvidd · ${fmt(s.impressions || 0)} visningar · ${fmt(s.replies || 0)} svar</em>
                    </span>
                </a>
            `;
        }).join("") : `<p class="signal-empty">Inga händelser har fångats ännu. När tisdagens Story fortfarande är aktiv vid nattkörningen sparas den här.</p>`;
    }

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
    set("overview-summary", `Senaste 30 dagarna har kontot nått ${fmt(reach30)} konton och fått ${fmt(profileViews)} profilbesök${outboundClicks ? `, med ${fmt(outboundClicks)} mätbara nästa steg` : ""}. Här är signalerna som hjälper dig välja nästa innehåll.`);
    set("highlight-primary", reach30 > 0 ? `Räckvidden ger dig en tydlig bas att analysera: ${fmt(reach30)} konton senaste 30 dagarna.` : "Räckviddsdatan är på plats och fylls på i takt med nya inlägg.");
    set("highlight-secondary", linkClicksAvailable
        ? `${fmt(linkClicks)} klick vidare visar hur profilen leder människor mot hemsidan.`
        : outboundClicks
            ? `${fmt(outboundClicks)} vidare-signaler visar att vissa redan tar nästa steg via bio, Story eller kontakt.`
            : "Hemsidelänken följs upp här när Meta lämnar ut länk-klick via API:t.");
    set("highlight-tertiary", newFollowers30 > 0 ? `${fmt(newFollowers30)} nya följare visar att innehållet kan omvandlas till relationer.` : "Följarutvecklingen blir lättare att läsa när de kommande inläggen börjar jämföras över tid.");
    set("focus-action", action);
    set("focus-posts-7", `${fmt(posts7)} inlägg`);
    set("focus-non-followers", pct(nonFollowerPct));
    set("focus-freshness", dataAge === 0 ? "Färsk" : `${dataAge} d`);
    set("link-click-story", linkClicksAvailable
        ? `${fmt(linkClicks)} klick vidare från Instagram-profilen har registrerats senaste 30 dagarna. Listan visar vilket innehåll som verkar få människor att först besöka profilen och sedan ta nästa steg.`
        : outboundClicks
            ? `${fmt(outboundClicks)} vidare-signaler har registrerats via bio-/Story-klick eller kontaktåtgärder. För exakt destination efter profilen behöver länken mätas på din egen sida.`
            : "Här visas klick vidare från profilen när Meta skickar den datan via API:t. Under tiden använder vi profilbesök, bio-klick och följar-signaler för att se vilka inlägg som får människor att närma sig dig.");

    // Best posting
    const bp = data.best_posting || {};
    if ($("best-weekday")) $("best-weekday").textContent = bp.weekday || "–";
    if ($("best-hour")) $("best-hour").textContent = bp.hour != null ? `kl ${bp.hour}:00` : "–";
    if ($("best-posts-analyzed")) $("best-posts-analyzed").textContent = fmt(bp.posts_analyzed || 0);
    const bestHint = document.querySelector(".best-posting-hint");
    const bestPostingBlock = $("best-posting-block");
    if (bestPostingBlock) bestPostingBlock.hidden = (bp.posts_analyzed || 0) < 8;
    if (bestHint && (bp.posts_analyzed || 0) < 8) {
        bestHint.textContent += " För få inlägg för säker slutsats.";
    }

    const profileCanvas = $("chart-profile");
    if (profileCanvas) {
        const profileValues = rows.map(profileDayValue);
        const outboundValues = rows.map(outboundDayValue);
        const profileChartBlock = $("profile-chart-block");
        if (profileChartBlock) {
            profileChartBlock.hidden = !profileValues.some(Boolean) && !outboundValues.some(Boolean);
        }
        new Chart(profileCanvas, {
            type: "bar",
            data: {
                labels: rows.map((r) => r.date),
                datasets: [
                    { label: "Profilbesök", data: profileValues, backgroundColor: "#6d5bd0", yAxisID: "y" },
                    { label: "Vidare", data: outboundValues, type: "line", borderColor: "#0f766e", backgroundColor: "rgba(15,118,110,.12)", tension: .3, fill: false, yAxisID: "y1" }
                ]
            },
            options: {
                responsive: true,
                plugins: { legend: { position: "bottom" } },
                scales: {
                    y: { beginAtZero: true, ticks: { precision: 0 }, title: { display: true, text: "Profil" } },
                    y1: { beginAtZero: true, position: "right", ticks: { precision: 0 }, title: { display: true, text: "Vidare" }, grid: { drawOnChartArea: false } }
                }
            }
        });
    }

    const reach = timeSeries.reach || [];
    const followers = timeSeries.follower_count || [];
    const reachCanvas = $("chart-reach");
    if (reachCanvas) {
        new Chart(reachCanvas, {
            type: "line",
            data: {
                labels: reach.map((d) => d.date),
                datasets: [
                    { label: "Räckvidd (dagligen)", data: reach.map((d) => d.value), borderColor: "#c85f45", backgroundColor: "rgba(200,95,69,.1)", tension: .3, fill: true, yAxisID: "y" },
                    { label: "Nya följare", data: followers.map((d) => d.value), borderColor: "#28745d", backgroundColor: "rgba(40,116,93,.1)", tension: .3, fill: false, yAxisID: "y1" }
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
    }

    const fb = data.format_breakdown || {};
    const labels = { IMAGE: "Bild", CAROUSEL_ALBUM: "Karusell", VIDEO: "Video", REELS: "Reels" };
    const formatCanvas = $("chart-format");
    const formatEntries = Object.entries(fb).filter(([, value]) => (value.count || 0) > 0);
    const formatPostCount = formatEntries.reduce((sum, [, value]) => sum + (value.count || 0), 0);
    const formatBlock = $("format-block");
    if (formatBlock) formatBlock.hidden = formatPostCount < 3 || formatEntries.length < 2;
    if (formatCanvas && formatPostCount >= 3 && formatEntries.length >= 2) {
        set("format-status", `Baserat på ${fmt(formatPostCount)} inlägg i ${fmt(formatEntries.length)} format.`);
        new Chart(formatCanvas, {
            type: "bar",
            data: {
                labels: formatEntries.map(([key]) => labels[key] || key),
                datasets: [{
                    label: "Snitt-engagemang",
                    data: formatEntries.map(([, value]) => value.avg_engagement),
                    backgroundColor: ["#c85f45", "#28745d", "#d49a32", "#6a6a78"]
                }]
            },
            options: { responsive: true, plugins: { legend: { display: false } } }
        });
    }

    // Top media
    const grid = $("top-media-grid");
    if (grid) {
        grid.innerHTML = (data.top_media || []).map((m) => {
            const img = m.thumbnail_url || m.media_url || "";
            const caption = (m.caption || "").slice(0, 80) + ((m.caption || "").length > 80 ? "…" : "");
            const date = new Date(m.timestamp).toLocaleDateString("sv-SE", { month: "short", day: "numeric" });
            return `
                <div class="media-card">
                    <a href="${m.permalink}" target="_blank" rel="noopener">
                        <img src="${img}" alt="" loading="lazy">
                        <div class="meta">
                            <strong>${fmt(m.reach)} räckvidd</strong>
                            <span>${mediaLabel(m)} · ${date}</span>
                            <span>${fmt(m.like_count)} gilla · ${fmt(m.comments_count)} kommentarer · ${fmt(m.saved)} sparningar</span>
                            <p>${caption}</p>
                        </div>
                    </a>
                </div>
            `;
        }).join("");
    }

    const followerList = $("follower-media-list");
    if (followerList) {
        const profileMedia = data.profile_media || data.follower_media || [];
        followerList.innerHTML = profileMedia.length ? profileMedia.map((m) => {
            const img = m.thumbnail_url || m.media_url || "";
            const date = new Date(m.timestamp).toLocaleDateString("sv-SE", { month: "short", day: "numeric" });
            const rate = m.profile_visit_rate_pct != null ? ` · ${pct(m.profile_visit_rate_pct)} av räckvidd` : "";
            const leadMetric = (m.profile_visits || 0) > 0
                ? `${fmt(m.profile_visits)} profilbesök`
                : (m.bio_link_clicks || 0) > 0
                    ? `${fmt(m.bio_link_clicks)} bio-klick`
                    : (m.profile_activity || 0) > 0
                        ? `${fmt(m.profile_activity)} profilaktiviteter`
                        : `${fmt(m.follows || 0)} nya följare`;
            const actionLine = [
                m.bio_link_clicks ? `${fmt(m.bio_link_clicks)} bio-klick` : "",
                m.contact_actions ? `${fmt(m.contact_actions)} kontakt` : "",
                m.follows ? `${fmt(m.follows)} följare` : "",
            ].filter(Boolean).join(" · ");
            return `
                <a class="signal-item" href="${m.permalink}" target="_blank" rel="noopener">
                    ${img ? `<img src="${img}" alt="" loading="lazy">` : ""}
                    <span class="signal-copy">
                        <strong>${leadMetric}</strong>
                        <span>${mediaLabel(m)} · ${date} · ${fmt(m.reach || 0)} räckvidd${rate}</span>
                        ${actionLine ? `<span>${actionLine}</span>` : ""}
                        <em>${shortCaption(m.caption)}</em>
                    </span>
                </a>
            `;
        }).join("") : `<p class="signal-empty">När nästa hämtning har körts visas inlägg som gett profilbesök, bio-klick eller nya följare här.</p>`;
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
            const profileValue = profileDayValue(r);
            const outboundValue = outboundDayValue(r);
            return `
                <tr>
                    <td>${label}</td>
                    <td>${fmt(r.reach)} <span class="${reachArrow.c}">${reachArrow.s}</span></td>
                    <td>${fmt(r.new_followers)} <span class="${followersArrow.c}">${followersArrow.s}</span></td>
                    <td>${profileValue ? fmt(profileValue) : "–"}</td>
                    <td>${outboundValue ? fmt(outboundValue) : "–"}</td>
                    <td>${fmt(r.engagement)} <span class="${engagementArrow.c}">${engagementArrow.s}</span></td>
                    <td>${r.posts ? fmt(r.posts) : "–"}</td>
                    <td>${r.stories ? `${fmt(r.stories)} (${fmt(r.story_reach || 0)})` : "–"}</td>
                </tr>
            `;
        }).join("");
    }

    const details = document.querySelector(".dashboard-details");
    if (details) {
        details.addEventListener("toggle", () => {
            if (!details.open) return;
            requestAnimationFrame(() => {
                ["chart-profile", "chart-format", "chart-weekly-ss", "chart-period-insights"].forEach((id) => {
                    const canvas = $(id);
                    const chart = canvas ? Chart.getChart(canvas) : null;
                    if (chart) chart.resize();
                });
            });
        });
    }

    renderHistory(90);
})();
