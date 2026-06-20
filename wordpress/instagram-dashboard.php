<?php
/**
 * Instagram Dashboard shortcode för Digitala Elle.
 *
 * Placering: /wp-content/themes/<ditt-tema>/instagram-dashboard.php
 * Aktivering: lägg till raden nedan längst ner i temats functions.php:
 *
 *     require_once get_theme_file_path( 'instagram-dashboard.php' );
 *
 * Användning: skriv [instagram_dashboard] i en shortcode-block på valfri sida.
 */

if ( ! defined( 'ABSPATH' ) ) { exit; }

define( 'IGDASH_DATA_URL', 'https://raw.githubusercontent.com/elleandersson/digitala-elle-dashboard/main/data/instagram.json' );

function igdash_enqueue() {
    wp_register_style( 'igdash-css', get_theme_file_uri( 'dashboard.css' ), array(), '1.1' );
    wp_register_script( 'igdash-chartjs', 'https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js', array(), '4.4.1', true );
    wp_register_script( 'igdash-js', get_theme_file_uri( 'dashboard.js' ), array( 'igdash-chartjs' ), '1.1', true );
}
add_action( 'wp_enqueue_scripts', 'igdash_enqueue' );

function igdash_shortcode() {
    wp_enqueue_style( 'igdash-css' );
    wp_enqueue_script( 'igdash-js' );

    ob_start(); ?>
    <script>window.DASHBOARD_DATA_URL = <?php echo wp_json_encode( IGDASH_DATA_URL ); ?>;</script>
    <main class="dashboard-wrap">
        <header class="dashboard-header">
            <h1>Instagram Dashboard</h1>
            <p class="dashboard-sub">Senaste 30 dagarna · uppdateras varje natt</p>
            <p class="dashboard-updated">Senast uppdaterad: <span id="updated-at">…</span></p>
        </header>

        <section class="morning-brief">
            <div class="brief-main">
                <span class="brief-status" id="brief-status">Laddar…</span>
                <h2>Dagens Instagram-läge</h2>
                <p id="brief-summary">Analyserar senaste siffrorna…</p>
            </div>
            <div class="brief-action">
                <span class="brief-action-label">Rekommenderad action idag</span>
                <p id="brief-action">–</p>
            </div>
            <div class="brief-facts">
                <div><span>Inlägg 7d</span><strong id="brief-posts-7">–</strong></div>
                <div><span>Inlägg 30d</span><strong id="brief-posts-30">–</strong></div>
                <div><span>Profilbesök</span><strong id="brief-profile-views">–</strong></div>
                <div><span>Dataålder</span><strong id="brief-freshness">–</strong></div>
            </div>
        </section>

        <section class="kpi-grid">
            <div class="kpi"><span class="kpi-label">Följare</span><span class="kpi-value" id="kpi-followers">–</span></div>
            <div class="kpi"><span class="kpi-label">Räckvidd 30d</span><span class="kpi-value" id="kpi-reach">–</span></div>
            <div class="kpi"><span class="kpi-label">Profilbesök 30d</span><span class="kpi-value" id="kpi-profile-views">–</span></div>
            <div class="kpi"><span class="kpi-label">Inlägg 30d</span><span class="kpi-value" id="kpi-posts-30">–</span></div>
        </section>

        <section class="kpi-grid kpi-grid-secondary">
            <div class="kpi"><span class="kpi-label">Engagement rate</span><span class="kpi-value" id="kpi-engagement-rate">–</span><span class="kpi-hint">interaktioner ÷ räckvidd · mål ≥ 3%</span></div>
            <div class="kpi"><span class="kpi-label">Sparningar + delningar</span><span class="kpi-value" id="kpi-saves-shares">–</span><span class="kpi-hint">starkaste algoritmsignalerna</span></div>
            <div class="kpi"><span class="kpi-label">Räckvidd från icke-följare</span><span class="kpi-value" id="kpi-non-followers">–</span><span class="kpi-hint">tillväxtindikator</span></div>
            <div class="kpi"><span class="kpi-label">Inlägg 7d</span><span class="kpi-value" id="kpi-posts-7">–</span><span class="kpi-hint">hållbar takt: 3–5/vecka</span></div>
        </section>

        <section class="chart-card">
            <h2>Räckvidd &amp; nya följare — senaste 30 dagarna</h2>
            <canvas id="chart-reach" height="120"></canvas>
        </section>

        <section class="chart-card">
            <h2>Snitt-engagemang per format</h2>
            <canvas id="chart-format" height="120"></canvas>
        </section>

        <section class="chart-card">
            <h2>Sparningar &amp; delningar per vecka <span class="chart-card-hint">— mål: minst 3/vecka</span></h2>
            <p class="chart-card-status" id="weekly-ss-status">–</p>
            <canvas id="chart-weekly-ss" height="100"></canvas>
            <div class="signal-media">
                <h3>Inlägg som gav sparningar/delningar</h3>
                <div id="signal-media-list" class="signal-media-list"></div>
            </div>
        </section>

        <section class="best-posting">
            <h2>Bästa tid att posta</h2>
            <p class="best-posting-body">
                Dina följare engagerar sig mest på <strong id="best-weekday">–</strong> runt <strong id="best-hour">–</strong>.
                <span class="best-posting-hint">Baserat på <span id="best-posts-analyzed">0</span> inlägg senaste 30 dagarna.</span>
            </p>
        </section>

        <section class="daily-insights">
            <h2>Dagliga insikter</h2>
            <p class="daily-insights-hint">Pilarna visar värdet jämfört med 7-dagars rullande snitt. <span class="arrow-up">↑</span> &gt; +10% · <span class="arrow-flat">→</span> inom ±10% · <span class="arrow-down">↓</span> &lt; −10%.</p>
            <div class="daily-insights-scroll">
                <table class="daily-insights-table">
                    <thead>
                        <tr>
                            <th>Datum</th>
                            <th>Räckvidd</th>
                            <th>Nya följare</th>
                            <th>Engagemang</th>
                            <th>Inlägg</th>
                        </tr>
                    </thead>
                    <tbody id="daily-insights-body"></tbody>
                </table>
            </div>
        </section>

        <section class="top-media">
            <h2>Topp 5 inlägg (efter räckvidd)</h2>
            <div id="top-media-grid" class="top-media-grid"></div>
        </section>
    </main>
    <?php
    return ob_get_clean();
}
add_shortcode( 'instagram_dashboard', 'igdash_shortcode' );
