# Architecture

One Node.js service does everything, so there is a single thing to deploy:

```
Browser ──► Express (server/)
             ├─ /api/*        public JSON API (catalogue, downloads)
             ├─ /api/auth/*   administrator sign-in (cookie session)
             ├─ /api/admin/*  protected API (software, files, Google accounts, audit)
             ├─ /media/:id    small images from PostgreSQL
             ├─ /sitemap.xml, /robots.txt
             └─ everything else → React app (web/dist) with SEO tags injected per page
PostgreSQL  ← metadata only (never installers)
Google Drive (4–6 separate accounts) ← installers; browser uploads straight to Google
```

## Folders
| Path | What it is |
|---|---|
| `server/src/app.ts` | Builds the Express app (security headers, rate limits, routes) |
| `server/src/routes/` | `public`, `auth`, `admin`, `drive` route files |
| `server/src/google.ts` | The ONLY file that talks to Google (tests replace it with a mock) |
| `server/src/drive.ts` | Account selection, token handling, file checks |
| `server/src/seo.ts` | Per-page `<title>`, canonical, Open Graph, JSON-LD, sitemap, robots |
| `server/migrations/` | SQL schema; applied automatically on start |
| `server/src/scripts/` | `migrate`, `create-admin`, `backup`, `restore` |
| `web/src/pages/` | Public pages |
| `web/src/admin/` | Dashboard (lazy-loaded, separate bundle) |
| `server/tests/` | Automated tests (no real Google needed) |

## Key design decisions
* **Uploads bypass the server.** The server asks Google for a *resumable upload session* and the browser sends the file to Google in 8 MB chunks. Render's free tier has little memory and an ephemeral disk.
* **Limited Google permission.** Only `drive.file` (files this app creates) plus the account email. The app cannot browse the rest of anyone's Drive.
* **Refresh tokens** are encrypted with AES-256-GCM using `TOKEN_ENCRYPTION_KEY`; they never reach the browser.
* **Downloads** are public Google Drive links. The server checks the file first, then redirects the visitor to Google. Visitors download from Google, not from your server.
* **Download statistics** count *started* downloads (a working link was issued). Google does not report finished downloads.
* **Sessions** are random tokens stored hashed in PostgreSQL, sent as HTTP-only cookies, plus a CSRF token header on every change.
