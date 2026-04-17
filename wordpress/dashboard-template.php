<?php
/**
 * Template Name: Instagram Dashboard
 *
 * Lägg denna fil i ditt WP-tema (t.ex. /wp-content/themes/ditt-tema/).
 * Skapa sedan en sida i WP-admin och välj mallen "Instagram Dashboard".
 *
 * Ändra GITHUB_RAW_URL nedan till URL:en för din data/instagram.json
 * (t.ex. https://raw.githubusercontent.com/<användare>/<repo>/main/data/instagram.json)
 */

get_header();

$data_url = 'https://raw.githubusercontent.com/ANVANDARE/REPO/main/data/instagram.json';
?>

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
        <div class="kpi"><span class="kpi-label">Profilvisningar 30d</span><span class="kpi-value" id="kpi-views">–</span></div>
    </section>

    <section class="chart-card">
        <h2>Räckvidd & visningar — senaste 30 dagarna</h2>
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

<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js"></script>
<script>
    window.DASHBOARD_DATA_URL = <?php echo wp_json_encode( $data_url ); ?>;
</script>
<script src="<?php echo esc_url( get_template_directory_uri() . '/dashboard.js' ); ?>"></script>
<link rel="stylesheet" href="<?php echo esc_url( get_template_directory_uri() . '/dashboard.css' ); ?>">

<?php get_footer(); ?>
