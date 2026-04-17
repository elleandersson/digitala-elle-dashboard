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
Lägg till fyra:

| Namn | Värde |
|---|---|
| `IG_ACCESS_TOKEN` | long-lived token från steg 2 |
| `IG_USER_ID` | IG Business Account ID från steg 2 |
| `FB_APP_ID` | App ID från steg 1 |
| `FB_APP_SECRET` | App Secret från steg 1 |

### Steg 5 — Testa workflow:et manuellt

1. Gå till repot → fliken **Actions** → välj `Nightly Instagram fetch` → **Run workflow**
2. Vänta ~30 sek. När den blir grön: kontrollera att `data/instagram.json` har uppdaterats med riktiga siffror.

### Steg 6 — Lägg dashboarden på digitalaelle.se

1. Öppna `wordpress/dashboard-template.php` och ändra rad ~14:
   ```php
   $data_url = 'https://raw.githubusercontent.com/<DITT-ANVANDARNAMN>/digitala-elle-dashboard/main/data/instagram.json';
   ```
2. Ladda upp **alla tre filer** via FTP till ditt aktiva temas mapp:
   - `dashboard-template.php` → `/wp-content/themes/<ditt-tema>/`
   - `dashboard.css` → `/wp-content/themes/<ditt-tema>/`
   - `dashboard.js` → `/wp-content/themes/<ditt-tema>/`
3. I WP-admin: **Sidor → Lägg till ny**
   - Titel: `Dashboard`
   - Permalänk: `dashboard`
   - I sidofältet, under **Sidans attribut → Mall**: välj **Instagram Dashboard**
   - Publicera
4. Besök `https://digitalaelle.se/dashboard` → grafer ska ladda.

## Underhåll

- **Token förnyas automatiskt** varje natt av skriptet (giltig 60 dagar, refreshas i tid).
  - *OBS:* Den nya token skrivs idag bara till GitHub Actions-loggen. När du vill kan vi bygga ut detta att skriva tillbaka till secret automatiskt — men kolla loggen var ~50:e dag och uppdatera `IG_ACCESS_TOKEN` manuellt om något går fel.
- **Cron-tid:** Kör 23:00 UTC = **01:00 svensk sommartid** (CEST), **00:00 vintertid** (CET). GitHub Actions stödjer inte tidszoner.
- **Manuell körning:** Actions-fliken → Run workflow.

## Felsökning

| Symptom | Trolig orsak |
|---|---|
| 400-fel med `(#10) Application does not have permission` | Du har inte godkänt alla scopes i steg 2 |
| `OAuthException: Invalid OAuth access token` | Token utgången → generera ny long-lived (steg 2.6) |
| Grafer blanka på sidan | Fel raw-URL i `dashboard-template.php`, eller repot är privat |
| Workflow misslyckas på `git push` | `permissions: contents: write` saknas — kontrollera workflow-filen |
