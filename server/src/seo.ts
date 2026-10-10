import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Router, type Request, type Response } from 'express';
import type { Config } from './config.js';
import type { Db } from './db.js';
import { getSettings } from './routes/public.js';

export const STATIC_PAGES: Record<string, { title: string; description: string }> = {
  '/about': { title: 'About Us', description: 'Learn about BUTROS SOFTWARES, a software discovery and download platform.' },
  '/contact': { title: 'Contact', description: 'Contact BUTROS SOFTWARES for support, software submissions and copyright notices.' },
  '/privacy': { title: 'Privacy Policy', description: 'How BUTROS SOFTWARES handles visitor and administrator data.' },
  '/terms': { title: 'Terms of Use', description: 'The terms that apply when you use BUTROS SOFTWARES.' },
  '/submission-policy': { title: 'Software Submission Policy', description: 'Rules for submitting software to BUTROS SOFTWARES.' },
  '/takedown': { title: 'Copyright and Takedown Policy', description: 'How to report copyright infringement to BUTROS SOFTWARES.' },
};

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const xmlEsc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
const jsonLd = (o: unknown) => JSON.stringify(o).replace(/</g, '\\u003c');
const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s);

type Meta = { title: string; description: string; canonical?: string; noindex?: boolean; image?: string; type?: string; ld?: unknown; body: string; status: number };

function headTags(m: Meta, cfg: Config): string {
  const site = cfg.siteName;
  const title = m.title === site ? site : `${m.title} | ${site}`;
  const t: string[] = [`<title>${esc(title)}</title>`, `<meta name="description" content="${esc(clip(m.description, 160))}" />`];
  if (m.noindex) t.push('<meta name="robots" content="noindex, nofollow" />');
  else t.push('<meta name="robots" content="index, follow" />');
  if (m.canonical) t.push(`<link rel="canonical" href="${esc(m.canonical)}" />`);
  t.push(`<meta property="og:site_name" content="${esc(site)}" />`, `<meta property="og:title" content="${esc(title)}" />`, `<meta property="og:description" content="${esc(clip(m.description, 200))}" />`, `<meta property="og:type" content="${m.type ?? 'website'}" />`);
  if (m.canonical) t.push(`<meta property="og:url" content="${esc(m.canonical)}" />`);
  if (m.image) t.push(`<meta property="og:image" content="${esc(m.image)}" />`);
  t.push(`<meta name="twitter:card" content="${m.image ? 'summary' : 'summary'}" />`, `<meta name="twitter:title" content="${esc(title)}" />`, `<meta name="twitter:description" content="${esc(clip(m.description, 200))}" />`);
  if (cfg.googleSiteVerification) t.push(`<meta name="google-site-verification" content="${esc(cfg.googleSiteVerification)}" />`);
  if (m.ld) t.push(`<script type="application/ld+json">${jsonLd(m.ld)}</script>`);
  return t.join('\n    ');
}

export function createSeo(deps: { db: Db; config: Config }) {
  const { db, config } = deps;
  const here = path.dirname(fileURLToPath(import.meta.url));
  const webDist = config.webDist ? path.resolve(config.webDist) : path.resolve(here, '../../web/dist');
  const indexPath = path.join(webDist, 'index.html');
  let templateCache: string | null = null;
  const template = () => {
    if (templateCache) return templateCache;
    if (!fs.existsSync(indexPath)) return null;
    templateCache = fs.readFileSync(indexPath, 'utf8');
    return templateCache;
  };

  async function resolveMeta(p: string): Promise<Meta> {
    const base = config.appUrl;
    const site = config.siteName;
    const s = await getSettings(db);
    void s;
    if (p === '/' || p === '') {
      return { title: site, description: 'Discover, search and download professional software. Browse apps and utilities by category and operating system.', canonical: `${base}/`, status: 200, ld: { '@context': 'https://schema.org', '@type': 'WebSite', name: site, url: `${base}/`, potentialAction: { '@type': 'SearchAction', target: `${base}/catalogue?q={search_term_string}`, 'query-input': 'required name=search_term_string' } }, body: `<h1>${esc(site)}</h1><p>Discover, search and download professional software.</p><p><a href="/catalogue">Browse the software catalogue</a></p>` };
    }
    if (p === '/catalogue') return { title: 'Software Catalogue', description: 'Browse and search the full BUTROS SOFTWARES catalogue by category and operating system.', canonical: `${base}/catalogue`, status: 200, body: `<h1>Software Catalogue</h1>` };
    if (STATIC_PAGES[p]) return { ...STATIC_PAGES[p], canonical: `${base}${p}`, status: 200, body: `<h1>${esc(STATIC_PAGES[p].title)}</h1>` };
    const m = p.match(/^\/software\/([a-z0-9-]+)$/);
    if (m) {
      const row = (await db.query<any>(`select s.name, s.slug, s.short_description, s.publisher, s.version, s.operating_systems, s.icon_media_id, c.name as category, to_char(s.release_date,'YYYY-MM-DD') as release_date, s.updated_at, s.published_at from software s left join categories c on c.id=s.category_id where s.slug=$1 and s.status='published'`, [m[1]])).rows[0];
      if (!row) return { title: 'Software not found', description: 'This software listing does not exist or is no longer available.', noindex: true, status: 404, body: '<h1>Software not found</h1>' };
      const url = `${base}/software/${row.slug}`;
      const ld: any = {
        '@context': 'https://schema.org',
        '@type': 'SoftwareApplication',
        name: row.name,
        description: row.short_description,
        url,
        applicationCategory: row.category || 'Software',
        operatingSystem: (row.operating_systems as string[]).join(', ') || undefined,
        softwareVersion: row.version,
        dateModified: new Date(row.updated_at).toISOString(),
      };
      if (row.release_date) ld.datePublished = row.release_date;
      if (row.publisher) ld.author = { '@type': 'Organization', name: row.publisher };
      if (row.icon_media_id) ld.image = `${base}/media/${row.icon_media_id}`;
      return { title: `${row.name} ${row.version} download`, description: row.short_description, canonical: url, status: 200, image: row.icon_media_id ? `${base}/media/${row.icon_media_id}` : undefined, ld, body: `<h1>${esc(row.name)}</h1><p>${esc(row.short_description)}</p>` };
    }
    if (p.startsWith('/download/') || p === '/admin' || p.startsWith('/admin/')) return { title: p.startsWith('/admin') ? 'Administrator' : 'Download', description: 'Private page.', noindex: true, status: 200, body: '' };
    return { title: 'Page not found', description: 'The page you requested does not exist.', noindex: true, status: 404, body: '<h1>Page not found</h1><p><a href="/">Return home</a></p>' };
  }

  async function renderPage(req: Request, res: Response) {
    const tpl = template();
    if (!tpl) {
      res.status(503).type('text/plain').send('The frontend has not been built yet. For development run "npm run dev" and open http://localhost:5173. For production run "npm run build" first.');
      return;
    }
    const meta = await resolveMeta(req.path.replace(/\/+$/, '') || '/');
    const html = tpl.replace('<!--SEO_HEAD-->', headTags(meta, config)).replace('<!--SSR_BODY-->', meta.body);
    res.status(meta.status).set('Cache-Control', 'no-cache').type('html').send(html);
  }

  const router = Router();
  router.get('/robots.txt', (_req, res) => {
    res.type('text/plain').send(`User-agent: *\nAllow: /\nDisallow: /admin\nDisallow: /api/\nDisallow: /download/\n\nSitemap: ${config.appUrl}/sitemap.xml\n`);
  });
  router.get('/sitemap.xml', async (_req, res) => {
    const rows = (await db.query<any>(`select slug, updated_at from software where status='published' order by updated_at desc limit 50000`)).rows;
    const urls = [
      { loc: `${config.appUrl}/` },
      { loc: `${config.appUrl}/catalogue` },
      ...Object.keys(STATIC_PAGES).map((p) => ({ loc: `${config.appUrl}${p}` })),
      ...rows.map((r) => ({ loc: `${config.appUrl}/software/${r.slug}`, lastmod: new Date(r.updated_at).toISOString() })),
    ];
    const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls
      .map((u: any) => `  <url><loc>${xmlEsc(u.loc)}</loc>${u.lastmod ? `<lastmod>${u.lastmod}</lastmod>` : ''}</url>`)
      .join('\n')}\n</urlset>\n`;
    res.type('application/xml').set('Cache-Control', 'public, max-age=300').send(xml);
  });

  return { router, renderPage, webDist, resolveMeta };
}
