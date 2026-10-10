import { Router } from 'express';
import { z } from 'zod';
import type { Config } from '../config.js';
import type { Db } from '../db.js';
import type { DriveService } from '../drive.js';
import { AppError, notFound } from '../errors.js';
import type { GoogleGateway } from '../google.js';
import { OS_LIST, SW_FROM, SW_SELECT, mapFile, mapSoftware, mapVersion } from '../software.js';

const POPULARITY = `(select count(*) from download_events e where e.software_id = s.id)`;

export async function getSettings(db: Db) {
  const r = await db.query<{ key: string; value: any }>('select key, value from site_settings');
  const out: Record<string, string> = {};
  for (const row of r.rows) out[row.key] = String(row.value);
  return out;
}

export function publicRouter(deps: { db: Db; config: Config; google: GoogleGateway; drive: DriveService }) {
  const { db, config, google, drive } = deps;
  const r = Router();

  r.get('/health', async (_req, res) => {
    await db.query('select 1');
    res.json({ status: 'ok' });
  });

  r.get('/settings', async (_req, res) => {
    const s = await getSettings(db);
    res.json({ siteName: config.siteName, contactEmail: s.contactEmail || config.contactEmail || '', organisationName: s.organisationName || config.siteName, location: s.location || '' });
  });

  r.get('/categories', async (_req, res) => {
    const rows = await db.query<any>(
      `select c.id, c.name, c.slug, (select count(*)::int from software s where s.category_id = c.id and s.status='published') as count
         from categories c order by c.name`,
    );
    res.json(rows.rows);
  });

  r.get('/home', async (_req, res) => {
    const sel = `select ${SW_SELECT}, ${POPULARITY}::int as downloads from ${SW_FROM}`;
    const [featured, recent, popular] = await Promise.all([
      db.query(`${sel} where s.status='published' and s.featured order by s.published_at desc nulls last limit 6`),
      db.query(`${sel} where s.status='published' order by s.published_at desc nulls last, s.created_at desc limit 8`),
      db.query(`${sel} where s.status='published' and ${POPULARITY} > 0 order by ${POPULARITY} desc limit 6`),
    ]);
    res.json({ featured: featured.rows.map(mapSoftware), recent: recent.rows.map(mapSoftware), popular: popular.rows.map(mapSoftware) });
  });

  const listQuery = z.object({
    q: z.string().trim().max(100).optional(),
    category: z.string().trim().max(100).optional(),
    os: z.enum(OS_LIST).optional(),
    sort: z.enum(['newest', 'name', 'popular']).default('newest'),
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(48).default(12),
  });

  r.get('/software', async (req, res) => {
    const q = listQuery.parse(req.query);
    const where = [`s.status = 'published'`];
    const params: unknown[] = [];
    if (q.q) {
      params.push(`%${q.q.replace(/[%_\\]/g, (m) => '\\' + m)}%`);
      where.push(`(s.name ilike $${params.length} or s.short_description ilike $${params.length} or s.publisher ilike $${params.length})`);
    }
    if (q.category) {
      params.push(q.category);
      where.push(`c.slug = $${params.length}`);
    }
    if (q.os) {
      params.push(q.os);
      where.push(`$${params.length} = any(s.operating_systems)`);
    }
    const order = q.sort === 'name' ? 's.name asc' : q.sort === 'popular' ? `${POPULARITY} desc, s.published_at desc nulls last` : 's.published_at desc nulls last, s.created_at desc';
    const w = where.join(' and ');
    const total = (await db.query<{ n: number }>(`select count(*)::int as n from ${SW_FROM} where ${w}`, params)).rows[0].n;
    const rows = await db.query(
      `select ${SW_SELECT}, ${POPULARITY}::int as downloads from ${SW_FROM} where ${w} order by ${order} limit ${q.pageSize} offset ${(q.page - 1) * q.pageSize}`,
      params,
    );
    res.json({ items: rows.rows.map(mapSoftware), total, page: q.page, pageSize: q.pageSize, totalPages: Math.max(1, Math.ceil(total / q.pageSize)), hasPopularity: (await db.query(`select 1 from download_events limit 1`)).rowCount > 0 });
  });

  r.get('/software/:slug', async (req, res) => {
    const row = (await db.query(`select ${SW_SELECT}, ${POPULARITY}::int as downloads from ${SW_FROM} where s.slug = $1 and s.status = 'published'`, [req.params.slug])).rows[0];
    if (!row) throw notFound('Software');
    const [files, versions] = await Promise.all([
      db.query(`select * from software_files where software_id = $1 and is_public order by created_at`, [row.id]),
      db.query(`select id, version, to_char(release_date,'YYYY-MM-DD') as release_date, changelog, is_current, created_at from software_versions where software_id = $1 order by release_date desc nulls last, created_at desc`, [row.id]),
    ]);
    const sw = mapSoftware(row);
    res.json({ ...sw, redistributionConfirmed: undefined, files: files.rows.map((f) => mapFile(f)), versions: versions.rows.map(mapVersion) });
  });

  // Hands out a download link ONLY after checking the file. Counts started downloads, not completed ones.
  r.post('/downloads/:fileId/start', async (req, res) => {
    const id = z.string().uuid().safeParse(req.params.fileId);
    if (!id.success) throw notFound('File');
    const row = (
      await db.query<any>(
        `select f.id, f.software_id, f.drive_file_id, f.availability, f.last_checked_at, f.file_name, f.size_bytes, s.slug
           from software_files f join software s on s.id = f.software_id
          where f.id = $1 and f.is_public and s.status = 'published'`,
        [id.data],
      )
    ).rows[0];
    if (!row) throw notFound('File');
    const fresh = row.availability === 'available' && row.last_checked_at && Date.now() - new Date(row.last_checked_at).getTime() < 5 * 60_000;
    const result = fresh ? 'available' : await drive.checkFile(row.id);
    if (result !== 'available') {
      const map = {
        missing: [410, 'file_missing', 'This file is no longer available. The publisher has been notified through the site administrator.'],
        quota: [429, 'quota_exceeded', 'Google Drive has temporarily limited downloads of this file because it was downloaded too many times. Please try again in about 24 hours.'],
        forbidden: [403, 'file_forbidden', 'Google Drive denied access to this file. The administrator needs to fix its sharing settings.'],
      } as const;
      const [status, code, message] = map[result as 'missing' | 'quota' | 'forbidden'];
      throw new AppError(status, code, message);
    }
    await db.query('insert into download_events(software_id, file_id) values ($1,$2)', [row.software_id, row.id]);
    res.json({ url: google.downloadUrl(row.drive_file_id), fileName: row.file_name, sizeBytes: row.size_bytes, softwareSlug: row.slug });
  });

  return r;
}

export function mediaRouter(db: Db) {
  const r = Router();
  r.get('/:id', async (req, res) => {
    const id = z.string().uuid().safeParse(req.params.id);
    if (!id.success) throw notFound('Image');
    const row = (await db.query<any>('select mime, data from media where id = $1', [id.data])).rows[0];
    if (!row) throw notFound('Image');
    res.set({ 'Content-Type': row.mime, 'Cache-Control': 'public, max-age=86400, immutable', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'" });
    res.send(Buffer.from(row.data));
  });
  return r;
}
