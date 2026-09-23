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
    wp_register_style( 'igdash-css', get_theme_file_uri( 'dashboard.css' ), array(), '1.3' );
    wp_register_script( 'igdash-chartjs', 'https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js', array(), '4.4.1', true );
    wp_register_script( 'igdash-js', get_theme_file_uri( 'dashboard.js' ), array( 'igdash-chartjs' ), '1.3', true );
}
add_action( 'wp_enqueue_scripts', 'igdash_enqueue' );

function igdash_shortcode() {
    wp_enqueue_style( 'igdash-css' );
    wp_enqueue_script( 'igdash-js' );

    ob_start(); ?>
    <script>window.DASHBOARD_DATA_URL = <?php echo wp_json_encode( IGDASH_DATA_URL ); ?>;</script>
    <main class="dashboard-wrap">
        <header class="dashboard-header">
            <div>
                <span class="section-kicker">@digitalaelle.se</span>
                <h2>Din Instagramresa</h2>
                <p class="dashboard-sub">Se utvecklingen, hitta mönster och påminn dig om att det du gör faktiskt ger effekt.</p>
            </div>
            <div class="dashboard-freshness">
                <span class="overview-status" id="overview-status">Laddar…</span>
                <span>Senast hämtad <strong id="updated-at">…</strong></span>
            </div>
        </header>

        <nav class="period-switch" aria-label="Välj tidsperiod">
            <button type="button" data-period-days="30" aria-pressed="false">30 dagar</button>
            <button type="button" data-period-days="90" aria-pressed="true">3 månader</button>
            <button type="button" data-period-days="180" aria-pressed="false">6 månader</button>
            <button type="button" data-period-days="365" aria-pressed="false">1 år</button>
        </nav>

        <section class="journey-band">
            <div class="journey-copy">
                <span class="section-kicker" id="journey-period">Senaste 30 dagarna</span>
                <h2 id="journey-title">Din utveckling laddas…</h2>
                <p id="journey-summary">Samlar ihop det som har hänt under perioden.</p>
                <p class="history-coverage" id="history-coverage"></p>
            </div>
            <div class="journey-facts">
                <div><span>Följare idag</span><strong id="period-followers">–</strong><em id="period-followers-delta">–</em></div>
                <div><span>Publicerat</span><strong id="period-posts">–</strong><em id="period-active-days">–</em></div>
                <div><span>Räckvidd</span><strong id="period-reach">–</strong><em id="period-reach-note">under perioden</em></div>
                <div><span>Nya följare</span><strong id="period-new-followers">–</strong><em id="period-follow-rate">–</em></div>
            </div>
        </section>

        <section class="dashboard-overview">
            <div class="overview-main">
                <span class="section-kicker">Det här ser jag</span>
                <h2>Dagens överblick</h2>
                <p id="overview-summary">Analyserar senaste siffrorna…</p>
            </div>
            <div class="overview-action">
                <span class="section-kicker">Nästa smarta steg</span>
                <p id="focus-action">–</p>
                <div class="overview-facts">
                    <span><strong id="focus-posts-7">–</strong> senaste veckan</span>
                    <span><strong id="focus-non-followers">–</strong> nådda är nya</span>
                </div>
            </div>
        </section>

        <ul class="signal-strip" aria-label="Viktiga signaler">
            <li id="highlight-primary">–</li>
            <li id="highlight-secondary">–</li>
            <li id="highlight-tertiary">–</li>
        </ul>

        <section class="history-panel">
            <div class="section-heading">
                <div>
                    <span class="section-kicker">Utveckling över tid</span>
                    <h2>Det händer när du gör något</h2>
                </div>
                <p id="history-chart-caption">Räckvidd, nya följare och dina publiceringsdagar.</p>
            </div>
            <div class="history-chart-wrap"><canvas id="chart-history" height="115"></canvas></div>
            <div class="activity-comparison">
                <div><span>Publiceringsdagar</span><strong id="impact-post-days">–</strong><em id="impact-post-days-note">i vald period</em></div>
                <div><span>Snitträckvidd när du publicerar</span><strong id="impact-post-reach">–</strong><em id="impact-post-reach-note">–</em></div>
                <div><span>Snitträckvidd övriga dagar</span><strong id="impact-quiet-reach">–</strong><em>ett jämförelsevärde</em></div>
                <div><span>Starkaste dagen</span><strong id="impact-best-day">–</strong><em id="impact-best-day-note">–</em></div>
            </div>
            <p class="context-note">Jämförelsen visar samband i din egen data. Den bevisar inte att ett enskilt inlägg ensamt orsakade resultatet.</p>
        </section>

        <section class="content-results">
            <div class="section-heading">
                <div>
                    <span class="section-kicker">Från uppmärksamhet till handling</span>
                    <h2>Vad människor gjorde efteråt</h2>
                </div>
                <p id="content-period-note">Inlägg från vald period.</p>
            </div>
            <div class="action-overview" aria-label="Värdefulla handlingar i vald period">
                <div><span>Värdefulla handlingar</span><strong id="action-total">–</strong><em>profilbesök, sparat, delat eller nästa steg</em></div>
                <div><span>Inlägg som ledde vidare</span><strong id="action-post-count">–</strong><em id="action-post-share">av inläggen i perioden</em></div>
                <div><span>Handlingar per 100 i räckvidd</span><strong id="action-rate">–</strong><em>för inläggen i perioden</em></div>
            </div>
            <div class="response-comparison">
                <div>
                    <span class="section-kicker">Tydligast nästa steg</span>
                    <div id="action-best-card" class="response-post"></div>
                </div>
                <div>
                    <span class="section-kicker">Räckvidd utan handling</span>
                    <div id="reach-only-card" class="response-post"></div>
                </div>
            </div>
            <div class="content-result-grid">
                <div>
                    <h3>Ledde till värdefull handling</h3>
                    <p id="link-click-story">–</p>
                    <div id="follower-media-list" class="signal-media-list"></div>
                </div>
                <div>
                    <h3>Gav sparningar eller delningar</h3>
                    <p class="chart-card-status" id="weekly-ss-status">–</p>
                    <div id="signal-media-list" class="signal-media-list"></div>
                </div>
            </div>
        </section>

        <section class="top-media">
            <div class="section-heading">
                <div>
                    <span class="section-kicker">Räckvidd i sitt sammanhang</span>
                    <h2>Inlägg som nådde långt</h2>
                </div>
                <p>Räckvidden visar att innehållet sågs. Handlingarna visar om det väckte ett nästa steg.</p>
            </div>
            <div id="top-media-grid" class="top-media-grid"></div>
        </section>

        <details class="dashboard-details">
            <summary id="details-summary">Visa fler detaljer för vald period</summary>
            <div class="details-body">
                <section class="profile-funnel-card">
                    <div class="profile-funnel-summary">
                        <span class="section-kicker">Profiltratten</span>
                        <h2>Från räckvidd till nästa steg</h2>
                        <p id="profile-funnel-story">–</p>
                    </div>
                    <div class="funnel-steps">
                        <div><span>Räckvidd</span><strong id="funnel-reach">–</strong><em>konton såg innehållet</em></div>
                        <div><span>Profilbesök</span><strong id="funnel-profile-views">–</strong><em id="funnel-profile-hint">ville veta mer</em></div>
                        <div><span>Vidare</span><strong id="funnel-outbound-clicks">–</strong><em id="funnel-outbound-hint">klick eller kontakt</em></div>
                        <div><span>Nya följare</span><strong id="funnel-new-followers">–</strong><em>relationer skapade</em></div>
                    </div>
                    <div class="profile-rates">
                        <div><span>Profilbesöksgrad</span><strong id="profile-rate">–</strong></div>
                        <div><span>Klick från profil</span><strong id="profile-click-rate">–</strong></div>
                        <div><span>Nya följare / räckvidd</span><strong id="profile-follow-rate">–</strong></div>
                    </div>
                    <div class="profile-chart" id="profile-chart-block">
                        <div><h3>Profilbesök över tid</h3><p id="profile-chart-status">–</p></div>
                        <canvas id="chart-profile" height="110"></canvas>
                    </div>
                    <div class="profile-days"><h3>Dagar som stack ut</h3><div id="profile-day-list" class="profile-day-list"></div></div>
                </section>

                <section class="stories-card" id="stories-block">
                    <div class="stories-summary">
                        <span class="section-kicker">Händelser</span>
                        <h2>Ger Stories effekt?</h2>
                        <p id="stories-result">–</p>
                    </div>
                    <div class="story-metrics">
                        <div><span>Fångade</span><strong id="kpi-stories">–</strong></div>
                        <div><span>Story-räckvidd</span><strong id="story-reach">–</strong></div>
                        <div><span>Visningar</span><strong id="story-impressions">–</strong></div>
                        <div><span>Svar</span><strong id="story-replies">–</strong></div>
                        <div><span>Bakåttryck</span><strong id="story-taps-back">–</strong></div>
                    </div>
                    <div class="story-days"><h3>Senaste fångade händelser</h3><div id="story-list" class="story-list"></div></div>
                </section>

                <section class="chart-card" id="format-block">
                    <h2>Snitt-engagemang per format</h2>
                    <p class="chart-card-status" id="format-status"></p>
                    <canvas id="chart-format" height="105"></canvas>
                </section>

                <section class="chart-card">
                    <h2 id="save-share-heading">Sparningar och delningar vecka för vecka</h2>
                    <canvas id="chart-weekly-ss" height="95"></canvas>
                </section>

                <section class="best-posting" id="best-posting-block">
                    <h2>Bästa tid att posta</h2>
                    <p class="best-posting-body">Dina följare engagerar sig mest på <strong id="best-weekday">–</strong> runt <strong id="best-hour">–</strong>.<span class="best-posting-hint">Baserat på <span id="best-posts-analyzed">0</span> inlägg senaste 30 dagarna.</span></p>
                </section>

                <section class="daily-insights">
                    <h2 id="insights-heading">Dagliga insikter</h2>
                    <p class="daily-insights-hint" id="insights-hint">Pilarna jämför dagen med föregående dag.</p>
                    <div class="insights-visual">
                        <div>
                            <span class="section-kicker">Handlingar över tid</span>
                            <h3 id="insights-chart-heading">Vad människor gjorde</h3>
                            <p id="insights-chart-summary">–</p>
                        </div>
                        <div class="insights-chart-wrap"><canvas id="chart-period-insights" height="115"></canvas></div>
                    </div>
                    <div class="daily-insights-scroll">
                        <table class="daily-insights-table">
                            <thead><tr><th id="insights-period-header">Datum</th><th>Räckvidd</th><th>Handlingar</th><th>Profil</th><th>Sparat</th><th>Delat</th><th>Nya följare</th><th>Inlägg</th></tr></thead>
                            <tbody id="daily-insights-body"></tbody>
                        </table>
                    </div>
                </section>
            </div>
        </details>

        <div class="legacy-kpis" hidden>
            <span id="kpi-followers"></span><span id="kpi-reach"></span><span id="kpi-new-followers"></span>
            <span id="kpi-profile-views"></span><span id="kpi-link-clicks"></span><span id="kpi-engagement-rate"></span>
            <span id="kpi-saves-shares"></span><span id="focus-freshness"></span>
        </div>
    </main>
    <?php
    return ob_get_clean();
}
add_shortcode( 'instagram_dashboard', 'igdash_shortcode' );
