# Digitala Elle — Instagram Dashboard

Nattlig hämtning av Instagram-statistik via Meta Graph API → JSON i GitHub-repo → visualisering på `digitalaelle.se/dashboard`.

## Översikt

```
GitHub Actions (kör 23:00 UTC = 01:00 svensk sommartid)
        ↓
scripts/fetch_instagram.py (hämtar via Graph API)
        ↓
data/instagram.json (committas till repo)
        ↓
WP-sidan läser JSON via fetch() från GitHub raw-URL
        ↓
Chart.js renderar grafer
```

## Morgonrutinen

Dashboarden ska vara redo när du börjar dagen:

- GitHub Actions hämtar ny Instagram-data en gång per natt/tidig morgon.
- Aktiva händelser/Stories försöker hämtas vid varje körning och sparas som 30-dagarshistorik i JSON-filen.
- Watchdoggen kan trigga en separat reservkörning om den schemalagda nattkörningen inte har uppdaterat datan i tid.
- `https://digitalaelle.se/dashboard` visar den senaste publicerade JSON-filen.
- `scripts/open_dashboard.sh` öppnar dashboarden i webbläsaren.
- `scripts/install_morning_dashboard.sh` installerar en macOS LaunchAgent som öppnar dashboarden varje dag kl. 08:00.

Installera morgonöppningen på datorn:

```bash
cd "/Users/elleandersson/Claude på datorn/digitala-elle-dashboard"
zsh scripts/install_morning_dashboard.sh
```

Vill du ändra tid senare: uppdatera `Hour`/`Minute` i `scripts/install_morning_dashboard.sh` och kör installeraren igen.

## Setup — gör detta en gång

### Steg 1 — Meta Developer-app

1. Gå till https://developers.facebook.com/apps → **Create App**
2. Välj typ: **Business** → ge appen namnet `Digitala Elle Dashboard`
3. När appen är skapad: lägg till produkten **Instagram Graph API**
4. Under **App Settings → Basic** — kopiera **App ID** och **App Secret** (sparas senare som secrets)

### Steg 2 — Hämta din IG Business Account ID + access token

Enklaste vägen är via **Graph API Explorer**: https://developers.facebook.com/tools/explorer

1. Välj din app i dropdownen (uppe till höger)
2. Klicka **Generate Access Token** → bocka i scope:
   - `instagram_basic`
   - `instagram_manage_insights`
   - `pages_show_list`
   - `pages_read_engagement`
   - `business_management`
3. Logga in med Facebook-kontot som äger sidan kopplad till @digitalaelle
4. Kör frågan: `me/accounts` → notera `id` för din Facebook-sida
5. Kör: `<sid-id>?fields=instagram_business_account` → notera `id` (det här är din **IG_USER_ID**)
6. Den token som visas är en **kort** token (1 timme). Byt till long-lived (60 dagar):

   Öppna i webbläsare:
   ```
   https://graph.facebook.com/v21.0/oauth/access_token?grant_type=fb_exchange_token&client_id=<APP_ID>&client_secret=<APP_SECRET>&fb_exchange_token=<KORT_TOKEN>
   ```
   → kopiera `access_token` ur svaret. Detta är din **IG_ACCESS_TOKEN**.

### Steg 3 — Skapa GitHub-repo

1. Logga in på https://github.com → **New repository**
   - Namn: `digitala-elle-dashboard`
   - **Public** (krävs för att GitHub raw-URL ska vara åtkomlig utan token)
2. På din dator, i mappen `/Users/elleandersson/Claude på datorn/digitala-elle-dashboard/`:
   ```bash
   cd "/Users/elleandersson/Claude på datorn/digitala-elle-dashboard"
   git init
   git add .
   git commit -m "init"
   git branch -M main
   git remote add origin https://github.com/<DITT-ANVANDARNAMN>/digitala-elle-dashboard.git
   git push -u origin main
   ```

### Steg 4 — Lägg in secrets i GitHub

Gå till repot → **Settings → Secrets and variables → Actions → New repository secret**.
Lägg till fem:

| Namn | Värde |
|---|---|
| `IG_ACCESS_TOKEN` | long-lived token från steg 2 |
| `IG_USER_ID` | IG Business Account ID från steg 2 |
| `FB_APP_ID` | App ID från steg 1 |
| `FB_APP_SECRET` | App Secret från steg 1 |
| `SECRET_UPDATE_TOKEN` | GitHub-token som får uppdatera repo secrets |

`SECRET_UPDATE_TOKEN` behövs för att workflowet ska kunna spara tillbaka en refreshad Instagram-token till `IG_ACCESS_TOKEN`. Skapa den som en GitHub fine-grained personal access token:

1. Gå till GitHub → **Settings → Developer settings → Personal access tokens → Fine-grained tokens**
2. Skapa en token för repot `elleandersson/digitala-elle-dashboard`
3. Ge den repository-behörigheten **Secrets: Read and write**
4. Lägg token-värdet som repository secret med namnet `SECRET_UPDATE_TOKEN`

### Steg 5 — Testa workflow:et manuellt

1. Gå till repot → fliken **Actions** → välj `Nightly Instagram fetch` → **Run workflow**
2. Vänta ~30 sek. När den blir grön: kontrollera att `data/instagram.json` har uppdaterats med riktiga siffror.

### Steg 6 — Lägg dashboarden på digitalaelle.se

1. Kontrollera data-URL:en i `wordpress/instagram-dashboard.php`:
   ```php
   define( 'IGDASH_DATA_URL', 'https://raw.githubusercontent.com/elleandersson/digitala-elle-dashboard/main/data/instagram.json' );
   ```
2. Ladda upp **alla tre filer** via FTP till ditt aktiva temas mapp:
   - `instagram-dashboard.php` → `/wp-content/themes/<ditt-tema>/`
   - `dashboard.css` → `/wp-content/themes/<ditt-tema>/`
   - `dashboard.js` → `/wp-content/themes/<ditt-tema>/`
3. Lägg till detta längst ner i temats `functions.php`:
   ```php
   require_once get_theme_file_path( 'instagram-dashboard.php' );
   ```
4. I WP-admin: **Sidor → Lägg till ny**
   - Titel: `Dashboard`
   - Permalänk: `dashboard`
   - Lägg in ett shortcode-block med `[instagram_dashboard]`
   - Publicera
5. Besök `https://digitalaelle.se/dashboard` → grafer ska ladda.

## Underhåll

- **Token förnyas automatiskt** varje natt av skriptet (giltig 60 dagar, refreshas i tid).
  - När Meta returnerar en ny token skriver workflowet tillbaka den till GitHub-secret `IG_ACCESS_TOKEN`.
  - Om `SECRET_UPDATE_TOKEN` saknas uppdateras dashboard-datan ändå, men workflowet visar en varning om att token inte kunde sparas automatiskt.
- **Händelser/Stories:** Instagram Graph API lämnar bara ut händelser medan de är aktiva. Dashboarden kan därför inte återskapa gamla händelse-resultat, men den bygger historik framåt när nattkörningen eller watchdoggen hinner fånga aktiva Stories.
- **Cron-tid:** Kör `00:17 UTC` varje natt, vilket motsvarar **02:17 svensk sommartid** och **01:17 vintertid**. GitHub Actions kan starta schemalagda jobb senare än utsatt tid, men watchdoggen fungerar som reserv om nattkörningen inte har uppdaterat datan.
- **Manuell körning:** Actions-fliken → Run workflow.

## Felsökning

| Symptom | Trolig orsak |
|---|---|
| 400-fel med `(#10) Application does not have permission` | Du har inte godkänt alla scopes i steg 2 |
| `OAuthException: Invalid OAuth access token` | Token utgången → generera ny long-lived (steg 2.6) |
| Grafer blanka på sidan | Fel raw-URL i `dashboard-template.php`, eller repot är privat |
| Workflow misslyckas på `git push` | `permissions: contents: write` saknas — kontrollera workflow-filen |
