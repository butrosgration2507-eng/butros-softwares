# BUTROS SOFTWARES

A software discovery and download website with a private admin dashboard. Software files live in **your own Google Drive accounts** (you can connect four to six of them); the website stores only the catalogue information.

**Stack:** React + TypeScript + Vite + Tailwind (website) · Node.js + Express + TypeScript (API) · PostgreSQL (data) · Google Drive API v3 · GitHub + Render (hosting).

> **Honest status.** The code builds, type-checks and passes its automated tests (see [Testing](#8-testing)). Those tests use a **mock** of Google, so the real Google connection, real uploads and real downloads have **not** been exercised: that needs your Google credentials, so you must try them yourself (section 6). Nothing here is deployed; you deploy it (section 9).

---

## 1. What you can do with it

| Visitors | You (administrator at `/admin`) |
|---|---|
| Search and filter the catalogue (category, operating system, sort) | Add, edit, publish, unpublish, archive and delete software |
| See version, size, requirements, changelog, screenshots, checksums | Upload installers straight to a chosen Google Drive account |
| Download through a status page with clear error messages | Connect, rename, reauthorize and disconnect 4-6 Google accounts |
| Find the site on Google (sitemap, structured data, clean URLs) | See quota per account; let the site pick the account with most free space |
| | Activity log of every sensitive action |

**Things this site deliberately does NOT do:** merge Google accounts into one drive, split a file across accounts, get around Google's storage or download limits, invent ratings or download numbers, or store installers in the database or GitHub.

## 2. Legend: automated vs. manual

* **[Auto]** the project does it for you (database tables, build, tests, security headers, sitemap...).
* **[You]** you must do it (Google Cloud setup, creating accounts, deployment buttons, legal text).

## 3. Requirements [You]

1. **Node.js 22** (LTS) from https://nodejs.org . Check with `node -v`.
2. **Git** from https://git-scm.com .
3. A **GitHub** account, a **Render** account, and a **Google Cloud** project (all free to start).
4. For production, a **PostgreSQL** database (section 9.2).

You do **not** need to install PostgreSQL to try the site on your computer. Local mode uses an embedded Postgres (PGlite).

## 4. Run it on your computer

Open a terminal in this folder (on Windows: PowerShell).

```bash
npm install            # [Auto] downloads everything
npm run setup          # [Auto] creates .env with a fresh random encryption key
npm run create-admin   # [You] asks for your admin email + password (min. 12 characters)
npm run dev            # starts the site
```

Open **http://localhost:5173** for the website and **http://localhost:5173/admin** for the dashboard.

* The database is created automatically (folder `.data/`, ignored by Git).
* Forgot your password? `npm run create-admin -- --reset-password`
* There is **no default password** and **no public sign-up**. Only this command creates administrators.

### Local mode vs. Google
Google redirects your browser back to the address in `GOOGLE_REDIRECT_URI`, which by default is `http://localhost:3000/...`. To test Google connections on your computer, use the production-style server instead of `npm run dev`:

```bash
npm run build
npm start              # then open http://localhost:3000/admin
```

## 5. Environment variables

Copy `.env.example` to `.env` (or run `npm run setup`). **Never** commit `.env` (it is in `.gitignore`). On Render you type these into the dashboard instead.

| Variable | Required | Meaning |
|---|---|---|
| `APP_URL` | yes | Public address, no trailing slash. `http://localhost:3000` locally, `https://....onrender.com` on Render |
| `DATABASE_URL` | yes | `pglite:./.data/dev` locally, a `postgresql://...` URL in production |
| `TOKEN_ENCRYPTION_KEY` | yes | 32 random bytes in base64. Encrypts Google tokens. `npm run setup` makes one. **Keep a copy**: if you lose it, reconnect all Google accounts |
| `NODE_ENV` | prod | `production` on Render (`render.yaml` sets it) |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | for Drive | From Google Cloud (section 6) |
| `GOOGLE_REDIRECT_URI` | no | Defaults to `APP_URL/api/admin/drive/callback` |
| `CONTACT_EMAIL` | no | Fallback contact email (you can also set it in Admin → Settings) |
| `GOOGLE_SITE_VERIFICATION` | no | Search Console "HTML tag" code (section 10) |
| `SESSION_TTL_HOURS` | no | Admin session length, default 12 |
| `TRUST_PROXY` | no | Reverse proxies in front of the app, default 1 (right for Render) |
| `PORT` | no | Default 3000 (Render sets it) |

## 6. Google Cloud setup [You]

You do this **once**, with any one Google account. That one project can then connect all your 4-6 storage accounts.

1. Go to https://console.cloud.google.com and create a project (e.g. "Butros Softwares").
2. **APIs & Services → Library** → search **Google Drive API** → **Enable**.
3. **APIs & Services → OAuth consent screen** (called *Google Auth Platform* in newer consoles):
   * User type: **External**. App name: `BUTROS SOFTWARES`. Add your support email.
   * **Scopes:** add `.../auth/drive.file` plus `openid` and `email`. (This is the limited permission: the app only sees files it creates.)
   * **Test users:** while the app is in **Testing**, add **every Google account you want to connect** (your 4-6 emails). Only listed accounts can authorize.
4. **APIs & Services → Credentials → Create credentials → OAuth client ID** → type **Web application**.
   * **Authorized redirect URIs** (exact, no trailing slash). Add the ones you need:
     * `http://localhost:3000/api/admin/drive/callback`
     * `https://YOUR-SERVICE.onrender.com/api/admin/drive/callback`
     * later: `https://yourdomain.com/api/admin/drive/callback`
5. Copy the **Client ID** and **Client secret** into `.env` (locally) or the Render dashboard.

> **Important about "Testing" mode.** As far as I know, Google expires refresh tokens after about 7 days for External apps left in *Testing*. You would then have to click **Reauthorize** weekly. When everything works, go to the consent screen and **Publish app** (move to *In production*). Because `drive.file` is a limited scope you normally don't need Google's verification review, but **check the current Google rules in the console**, as they change.

### Connect each Google account [You]
1. Sign in at `/admin` → **Storage Manager** → **Connect Google account**.
2. Choose the Google account on Google's own page (the site never sees your password). **Keep the Drive checkbox ticked.**
3. Repeat for each account. Give them friendly names ("Storage A"...), and pick a **default** account.
4. **Reauthorize** appears on an account if Google revoked or expired access.

## 7. Using the dashboard

**Upload & publish software**
1. **Software → Add software**. Fill the basics, pick OS(es), tick *I am authorized to redistribute*. **Save draft**.
2. In *Downloadable files* choose the file, the Google account (default / automatic / specific), a button label, tick the two confirmations → **Upload**. The browser sends the file straight to Google in chunks (progress bar, cancel, automatic retry).
3. Add versions and release notes (optional). Add icon and screenshots.
4. **Publish**. It refuses until the listing has a description, an OS, the redistribution confirmation, and at least one public file.

**Automatic account choice** picks a connected account that reports enough free space (most free first). If Google reports no quota, it tells you to choose manually rather than guessing. It never splits a file.

**Existing Drive files:** use *Register a file that already exists in Drive*. Because the app only has the limited `drive.file` permission, it can verify and manage only files it uploaded itself. Other files work only if already shared as "Anyone with the link can view".

**Backups [Auto, you run it]**
```bash
npm run backup                                  # writes backups/butros-backup-<date>.json
npm run restore -- backups/FILE.json            # into an empty database
npm run restore -- backups/FILE.json --force    # replace existing data
```
Backups hold the catalogue, versions, files, images and settings. They intentionally **exclude admin passwords and Google tokens**: after a restore run `npm run create-admin` and reauthorize accounts. Installers themselves stay in Google Drive. For production, also use your database host's own backups.

## 8. Testing

```bash
npm test               # 41 automated tests (uses an in-memory database and a mock Google)
npm run typecheck
npm run build
```
Covered: login, lockout, sessions and CSRF; every admin route requires authentication; validation; drafts never appear publicly; publish rules; sitemap and SEO tags; image upload checks; OAuth state checks; token encryption; multi-account management and automatic selection; upload errors (revoked access, no space, unknown quota); download failures (missing, quota, forbidden); audit log has no secrets.
**Not covered:** the live Google services and Render (see the honest status at the top).

## 9. Deploy: GitHub + Render [You]

### 9.1 Put the code on GitHub
```bash
git init
git add .
git commit -m "BUTROS SOFTWARES"
git branch -M main
git remote add origin https://github.com/YOUR-NAME/butros-softwares.git
git push -u origin main
```
(Create the empty repository on github.com first. Check `git status` shows no `.env`.)

### 9.2 Create the database
**Render's free PostgreSQL expires after about 30 days** (as of my research in Oct 2026, verify at https://render.com/docs/free), so use an external free database. **Neon** (https://neon.com) has a free plan (**verify its current limits at https://neon.com/pricing**). Create a project, copy the **connection string** (`postgresql://...?sslmode=require`). Tables are created automatically on first start.

### 9.3 Create the Render service
1. On https://render.com → **New → Blueprint** → select your GitHub repository (it reads `render.yaml`).
2. Fill the prompted values:
   * `APP_URL` = `https://<your-service-name>.onrender.com` (you can see the name before deploy; edit later if needed)
   * `DATABASE_URL` = the Neon string
   * `TOKEN_ENCRYPTION_KEY` = run `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"` and paste the result (**save it somewhere safe**)
   * `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`
3. **Apply**. Render builds (`npm ci --include=dev && npm run build`) and starts (`npm start`). Health check: `/api/health`.
4. Add `https://<service>.onrender.com/api/admin/drive/callback` to the Google OAuth client's redirect URIs.

### 9.4 Create your production admin
Render's free plan has no shell, so run this **on your computer**, pointing at the production database:

PowerShell:
```powershell
$env:DATABASE_URL = "postgresql://...your Neon string..."
npm run create-admin
Remove-Item Env:DATABASE_URL
```
macOS/Linux: `DATABASE_URL="postgresql://..." npm run create-admin`

### 9.5 What free hosting means
* A free Render web service **goes to sleep after about 15 minutes without traffic** and takes some seconds to wake: the first visit after a quiet period is slow. Google may also crawl a sleeping site less reliably. A paid instance or uptime pinger avoids this.
* The free filesystem is temporary: that is why files go to Google Drive and data to PostgreSQL.
* Free tiers change. Re-check Render and Neon pricing before relying on them.

### 9.6 Large files and Google Drive limits
* Uploads go **browser → Google**, not through Render, so multi-GB installers are fine for the server. Drive allows up to 5 TB per file, but each account has its own storage (typically 15 GB free).
* Downloads go **Google → visitor**. Google can **temporarily block** very popular files ("too many users"); the site then shows a clear message. More accounts add storage but **do not raise per-file download limits**. For heavy traffic consider real file hosting/CDN.
* Public Drive files can be copied and re-shared by anyone with the link.

## 10. Get found on Google [You]

1. Deploy first. Open `https://YOUR-SITE/sitemap.xml` and `/robots.txt` to confirm they load.
2. https://search.google.com/search-console → **Add property**.
   * With a custom domain choose **Domain** and add the DNS TXT record Google shows.
   * With only the `onrender.com` address choose **URL prefix**, then **HTML tag**: copy the code from `content="..."` into the Render variable `GOOGLE_SITE_VERIFICATION`, redeploy, click **Verify**.
3. **Sitemaps** → submit `sitemap.xml`.
4. **URL Inspection** → paste a software page → **Request indexing**.
5. Check **Pages** in Search Console to see what is indexed and why pages are not.

Indexing takes days to weeks and nobody can promise rankings. The site helps by having unique titles and descriptions, canonical URLs, Open Graph tags, `SoftwareApplication` structured data (only real fields; no fake ratings), a sitemap listing published software only, correct 404 status codes, and `noindex` on admin and download pages.

## 11. Custom .com domain later [You]
1. Buy the domain. In Render: service → **Settings → Custom Domains** → add it and create the DNS records Render shows.
2. Change `APP_URL` to `https://yourdomain.com`, redeploy.
3. Add `https://yourdomain.com/api/admin/drive/callback` to Google's redirect URIs.
4. Add the new property in Search Console and resubmit the sitemap.

## 12. Troubleshooting

| Symptom | Fix |
|---|---|
| `Invalid configuration: TOKEN_ENCRYPTION_KEY...` | Run `npm run setup`, or generate a key as in section 9.3 |
| Admin page says "frontend has not been built" | Run `npm run build`, or use `npm run dev` and open port **5173** |
| Google: `redirect_uri_mismatch` | The URI in Google Cloud must match `APP_URL + /api/admin/drive/callback` exactly |
| Google: "Access blocked / app not verified" | Add that Google account under **Test users** on the consent screen |
| Account connection says "no refresh token" | Remove the app at https://myaccount.google.com/permissions for that account, then connect again |
| An account shows **Needs reauthorization** | Click Reauthorize (common weekly while the app is in Testing mode) |
| Upload fails instantly with a network/CORS error | Open the site at the same address as `APP_URL`; check the connection; retry |
| "Insufficient space" / "No eligible account" | Free space in Drive, connect another account, or choose manually |
| Visitors see "downloaded too many times" | Google's temporary limit on that file; wait about 24 hours |
| Site slow on first visit (Render) | Free service was asleep (section 9.5) |
| Can't sign in / "session expired" | Sign in again; after 5 wrong passwords the account locks for 15 minutes |
| `npm run restore` refuses | Database not empty: add `--force` |

## 13. Security summary
Passwords hashed with scrypt · sessions are random tokens stored hashed in the database, HTTP-only + SameSite cookies · CSRF token on every change · login rate limit and account lockout · server-side validation (zod) on every input · parameterised SQL only · React escapes all output, descriptions are plain text, only PNG/JPEG/WebP images accepted (checked by content, not file name) · strict Content-Security-Policy and other secure headers (helmet) · no CORS headers (same-origin only) · Google refresh tokens encrypted with AES-256-GCM, never sent to the browser · audit log without secrets · `.env`, keys and local databases are Git-ignored.

## 14. Known limitations / remaining work
* Live Google OAuth, uploads and downloads untested (need your credentials).
* The browser reads Google's upload-status headers only if Google allows it across origins; if not, a retry after a connection drop resends the current chunk (the normal case, with no drop, is unaffected).
* "Downloads" means *started* downloads, not completed ones.
* The public site is dark-only (no light theme).
* Images are stored in PostgreSQL (limit 2 MB each); orphaned images are not cleaned up automatically.
* No email sending, comments, or user accounts for visitors.
* Legal pages are drafts: see `docs/LEGAL_REVIEW.md`.

More detail: `docs/ARCHITECTURE.md`.
