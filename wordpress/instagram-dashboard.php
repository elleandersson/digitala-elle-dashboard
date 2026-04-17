<?php
/**
 * Plugin Name: Instagram Dashboard (Digitala Elle)
 * Description: Shortcode [instagram_dashboard] som visar Instagram-statistik från GitHub-JSON.
 * Version: 1.0
 *
 * Installation: ladda upp denna fil (plus mappen instagram-dashboard/) till
 * /wp-content/mu-plugins/. WordPress laddar den automatiskt — ingen aktivering behövs.
 */

if ( ! defined( 'ABSPATH' ) ) { exit; }

define( 'IGDASH_DATA_URL', 'https://raw.githubusercontent.com/elleandersson/digitala-elle-dashboard/main/data/instagram.json' );
define( 'IGDASH_ASSETS_URL', content_url( 'mu-plugins/instagram-dashboard' ) );

function igdash_enqueue() {
    wp_register_style( 'igdash-css', IGDASH_ASSETS_URL . '/dashboard.css', array(), '1.0' );
    wp_register_script( 'igdash-chartjs', 'https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js', array(), '4.4.1', true );
    wp_register_script( 'igdash-js', IGDASH_ASSETS_URL . '/dashboard.js', array( 'igdash-chartjs' ), '1.0', true );
}
add_action( 'wp_enqueue_scripts', 'igdash_enqueue' );

function igdash_shortcode() {
    wp_enqueue_style( 'igdash-css' );
    wp_enqueue_script( 'igdash-js' );
    wp_add_inline_script( 'igdash-js', 'window.DASHBOARD_DATA_URL = ' . wp_json_encode( IGDASH_DATA_URL ) . ';', 'before' );

    ob_start(); ?>
    <main class="dashboard-wrap">
        <header class="dashboard-header">
            <h1>Instagram Dashboard</h1>
            <p class="dashboard-sub">Senaste 30 dagarna · uppdateras varje natt</p>
            <p class="dashboard-updated">Senast uppdaterad: <span id="updated-at">…</span></p>
        </header>
        <section class="kpi-grid">
            <div class="kpi"><span class="kpi-label">Följare</span><span class="kpi-value" id="kpi-followers">–</span></div>
            <div class="kpi"><span class="kpi-label">Inlägg totalt</span><span class="kpi-value" id="kpi-media">–</span></div>
            <div class="kpi"><span class="kpi-label">Räckvidd 30d</span><span class="kpi-value" id="kpi-reach">–</span></div>
            <div class="kpi"><span class="kpi-label">Visningar 30d</span><span class="kpi-value" id="kpi-views">–</span></div>
        </section>
        <section class="chart-card">
            <h2>Räckvidd &amp; nya följare — senaste 30 dagarna</h2>
            <canvas id="chart-reach" height="120"></canvas>
        </section>
        <section class="chart-card">
            <h2>Snitt-engagemang per format</h2>
            <canvas id="chart-format" height="120"></canvas>
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
