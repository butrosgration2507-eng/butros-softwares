import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { audit } from '../audit.js';
import { getActor } from '../auth.js';
import type { Db } from '../db.js';
import type { DriveService } from '../drive.js';
import { AppError, conflict, notFound } from '../errors.js';
import { GoogleApiError, type GoogleGateway } from '../google.js';
import { OS_LIST, SW_FROM, SW_SELECT, mapFile, mapSoftware, mapVersion, slugify } from '../software.js';

const uuid = z.string().uuid();
const dateStr = z.preprocess((v) => (v === '' || v == null ? null : v), z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD').nullable());
const optText = (max: number) => z.preprocess((v) => (v == null ? '' : v), z.string().trim().max(max));
const optUrl = z.preprocess((v) => (v == null ? '' : v), z.union([z.literal(''), z.string().trim().url().max(300).refine((u) => /^https?:\/\//i.test(u), 'Must start with http:// or https://')]));

const softwareInput = z.object({
  name: z.string().trim().min(1).max(120),
  slug: z.string().trim().min(1).max(100).regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'Lowercase letters, numbers and single hyphens only'),
  shortDescription: z.string().trim().min(1).max(300),
  description: optText(20000),
  publisher: optText(120),
  publisherUrl: optUrl,
  categoryId: uuid.nullable().default(null),
  operatingSystems: z.array(z.enum(OS_LIST)).max(OS_LIST.length).default([]),
  systemRequirements: optText(4000),
  installationInstructions: optText(8000),
  version: z.string().trim().min(1).max(40).default('1.0.0'),
  releaseDate: dateStr.default(null),
  sizeBytes: z.number().int().min(0).nullable().default(null),
  iconMediaId: uuid.nullable().default(null),
  screenshotMediaIds: z.array(uuid).max(12).default([]),
  downloadSource: z.enum(['self', 'publisher', 'third_party']).default('self'),
  downloadSourceNote: optText(500),
  redistributionConfirmed: z.boolean().default(false),
  featured: z.boolean().default(false),
});

function imageType(buf: Buffer): 'image/png' | 'image/jpeg' | 'image/webp' | null {
  if (buf.length > 12 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf.length > 12 && buf.subarray(0, 4).toString() === 'RIFF' && buf.subarray(8, 12).toString() === 'WEBP') return 'image/webp';
  return null;
}

/** Mounted behind requireAdmin. */
export function adminRouter(deps: { db: Db; google: GoogleGateway; drive: DriveService }) {
  const { db, google, drive } = deps;
  const r = Router();
  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 2 * 1024 * 1024, files: 1 } });

  // ---------- overview ----------
  r.get('/overview', async (_req, res) => {
    const one = async (sql: string) => (await db.query<any>(sql)).rows[0];
    const [sw, accounts, files, dl, top, recent] = await Promise.all([
      one(`select count(*) filter (where status='published')::int as published, count(*) filter (where status='draft')::int as drafts, count(*) filter (where status='archived')::int as archived from software`),
      one(`select count(*) filter (where status='connected')::int as connected, count(*) filter (where status <> 'connected')::int as attention, count(*)::int as total from drive_accounts`),
      one(`select count(*)::int as total, count(*) filter (where availability='available')::int as available, count(*) filter (where availability in ('missing','quota','forbidden'))::int as problems from software_files`),
      one(`select count(*)::int as total, count(*) filter (where created_at > now() - interval '30 days')::int as last30 from download_events`),
      db.query(`select s.name, s.slug, count(e.id)::int as downloads from download_events e join software s on s.id = e.software_id group by s.id order by downloads desc limit 5`),
      db.query(`select id, admin_email, action, entity_type, entity_id, details, created_at from audit_logs order by created_at desc limit 10`),
    ]);
    res.json({ software: sw, accounts, files, downloads: { ...dl, note: 'Counts started downloads (a working link was issued). Google does not report completed downloads.' }, topSoftware: top.rows, recentActivity: recent.rows });
  });

  r.get('/audit', async (req, res) => {
    const page = z.coerce.number().int().min(1).default(1).parse(req.query.page);
    const rows = await db.query(`select id, admin_email, action, entity_type, entity_id, details, created_at from audit_logs order by created_at desc limit 50 offset ${(page - 1) * 50}`);
    const total = (await db.query<{ n: number }>('select count(*)::int as n from audit_logs')).rows[0].n;
    res.json({ items: rows.rows, total, page, pageSize: 50 });
  });

  // ---------- categories ----------
  r.get('/categories', async (_req, res) => {
    res.json((await db.query(`select id, name, slug, (select count(*)::int from software s where s.category_id = c.id) as count from categories c order by name`)).rows);
  });
  r.post('/categories', async (req, res) => {
    const { name } = z.object({ name: z.string().trim().min(1).max(60) }).parse(req.body);
    const slug = slugify(name);
    if (!slug) throw new AppError(400, 'bad_request', 'Category name needs letters or numbers.');
    const row = (await db.query<any>('insert into categories(name, slug) values ($1,$2) returning id, name, slug', [name, slug])).rows[0];
    await audit(db, getActor(res), 'category.create', 'category', row.id, { name });
    res.status(201).json(row);
  });
  r.delete('/categories/:id', async (req, res) => {
    const id = uuid.parse(req.params.id);
    const row = (await db.query<any>('delete from categories where id=$1 returning name', [id])).rows[0];
    if (!row) throw notFound('Category');
    await audit(db, getActor(res), 'category.delete', 'category', id, { name: row.name });
    res.json({ ok: true });
  });

  // ---------- media ----------
  r.post('/media', upload.single('file'), async (req, res) => {
    if (!req.file) throw new AppError(400, 'bad_request', 'Choose an image file (PNG, JPEG or WebP, up to 2 MB).');
    const mime = imageType(req.file.buffer);
    if (!mime) throw new AppError(415, 'unsupported_type', 'Only PNG, JPEG and WebP images are allowed.');
    const row = (await db.query<any>('insert into media(mime, size_bytes, data) values ($1,$2,$3) returning id', [mime, req.file.size, req.file.buffer])).rows[0];
    res.status(201).json({ id: row.id, url: `/media/${row.id}` });
  });

  // ---------- software ----------
  r.get('/software', async (req, res) => {
    const q = z.object({ q: z.string().trim().max(100).optional(), status: z.enum(['draft', 'published', 'archived']).optional(), page: z.coerce.number().int().min(1).default(1), pageSize: z.coerce.number().int().min(1).max(100).default(20) }).parse(req.query);
    const where: string[] = ['true'];
    const params: unknown[] = [];
    if (q.q) {
      params.push(`%${q.q.replace(/[%_\\]/g, (m) => '\\' + m)}%`);
      where.push(`(s.name ilike $${params.length} or s.slug ilike $${params.length})`);
    }
    if (q.status) {
      params.push(q.status);
      where.push(`s.status = $${params.length}`);
    }
    const w = where.join(' and ');
    const total = (await db.query<{ n: number }>(`select count(*)::int as n from software s where ${w}`, params)).rows[0].n;
    const rows = await db.query(
      `select ${SW_SELECT}, (select count(*)::int from software_files f where f.software_id = s.id) as file_count
         from ${SW_FROM} where ${w} order by s.updated_at desc limit ${q.pageSize} offset ${(q.page - 1) * q.pageSize}`,
      params,
    );
    res.json({ items: rows.rows.map((x: any) => ({ ...mapSoftware(x), fileCount: x.file_count })), total, page: q.page, pageSize: q.pageSize, totalPages: Math.max(1, Math.ceil(total / q.pageSize)) });
  });

  async function loadFull(id: string) {
    const row = (await db.query(`select ${SW_SELECT} from ${SW_FROM} where s.id = $1`, [id])).rows[0];
    if (!row) throw notFound('Software');
    const [files, versions] = await Promise.all([
      db.query(`select f.*, a.google_email as account_email from software_files f join drive_accounts a on a.id = f.drive_account_id where f.software_id=$1 order by f.created_at`, [id]),
      db.query(`select id, version, to_char(release_date,'YYYY-MM-DD') as release_date, changelog, is_current, created_at from software_versions where software_id=$1 order by release_date desc nulls last, created_at desc`, [id]),
    ]);
    return { ...mapSoftware(row), files: files.rows.map((f) => mapFile(f, true)), versions: versions.rows.map(mapVersion) };
  }

  r.get('/software/:id', async (req, res) => res.json(await loadFull(uuid.parse(req.params.id))));

  const cols = (b: z.infer<typeof softwareInput>) => [
    b.name, b.slug, b.shortDescription, b.description, b.publisher || null, b.publisherUrl || null, b.categoryId, b.operatingSystems,
    b.systemRequirements || null, b.installationInstructions || null, b.version, b.releaseDate, b.sizeBytes, b.iconMediaId, b.screenshotMediaIds,
    b.downloadSource, b.downloadSourceNote || null, b.redistributionConfirmed, b.featured,
  ];

  r.post('/software', async (req, res) => {
    const b = softwareInput.parse(req.body);
    const row = (
      await db.query<any>(
        `insert into software(name, slug, short_description, description, publisher, publisher_url, category_id, operating_systems, system_requirements,
           installation_instructions, version, release_date, size_bytes, icon_media_id, screenshot_media_ids, download_source, download_source_note, redistribution_confirmed, featured)
         values ($1,$2,$3,$4,$5,$6,$7,$8::text[],$9,$10,$11,$12,$13,$14,$15::uuid[],$16,$17,$18,$19) returning id`,
        cols(b),
      )
    ).rows[0];
    await db.query(`insert into software_versions(software_id, version, release_date, is_current) values ($1,$2,$3,true)`, [row.id, b.version, b.releaseDate]);
    await audit(db, getActor(res), 'software.create', 'software', row.id, { name: b.name, slug: b.slug });
    res.status(201).json(await loadFull(row.id));
  });

  r.put('/software/:id', async (req, res) => {
    const id = uuid.parse(req.params.id);
    const b = softwareInput.parse(req.body);
    const out = await db.query(
      `update software set name=$2, slug=$3, short_description=$4, description=$5, publisher=$6, publisher_url=$7, category_id=$8, operating_systems=$9::text[],
         system_requirements=$10, installation_instructions=$11, version=$12, release_date=$13, size_bytes=$14, icon_media_id=$15, screenshot_media_ids=$16::uuid[],
         download_source=$17, download_source_note=$18, redistribution_confirmed=$19, featured=$20, updated_at=now() where id=$1`,
      [id, ...cols(b)],
    );
    if (!out.rowCount) throw notFound('Software');
    await audit(db, getActor(res), 'software.update', 'software', id, { name: b.name, slug: b.slug });
    res.json(await loadFull(id));
  });

  async function publishProblems(id: string): Promise<string[]> {
    const s = (await db.query<any>('select * from software where id=$1', [id])).rows[0];
    if (!s) throw notFound('Software');
    const problems: string[] = [];
    if (!s.redistribution_confirmed) problems.push('Confirm that you are authorized to redistribute this software.');
    if (!s.description?.trim()) problems.push('Add a full description.');
    if (!s.operating_systems?.length) problems.push('Select at least one supported operating system.');
    const files = (await db.query<any>(`select availability, is_public from software_files where software_id=$1`, [id])).rows;
    if (!files.some((f) => f.is_public)) problems.push('Add at least one public downloadable file.');
    else if (files.some((f) => f.is_public && ['missing', 'forbidden'].includes(f.availability))) problems.push('A linked file is reported missing or inaccessible. Run "Check" on your files.');
    return problems;
  }

  r.post('/software/:id/publish', async (req, res) => {
    const id = uuid.parse(req.params.id);
    const problems = await publishProblems(id);
    if (problems.length) throw new AppError(422, 'not_ready', 'This listing is not ready to publish.', problems);
    await db.query(`update software set status='published', published_at = coalesce(published_at, now()), updated_at=now() where id=$1`, [id]);
    await audit(db, getActor(res), 'software.publish', 'software', id);
    res.json(await loadFull(id));
  });
  r.post('/software/:id/unpublish', async (req, res) => {
    const id = uuid.parse(req.params.id);
    const out = await db.query(`update software set status='draft', updated_at=now() where id=$1`, [id]);
    if (!out.rowCount) throw notFound('Software');
    await audit(db, getActor(res), 'software.unpublish', 'software', id);
    res.json(await loadFull(id));
  });

  r.delete('/software/:id', async (req, res) => {
    const id = uuid.parse(req.params.id);
    const q = z.object({ mode: z.enum(['archive', 'delete']).default('archive'), deleteFromDrive: z.enum(['true', 'false']).default('false') }).parse(req.query);
    const s = (await db.query<any>('select name, slug from software where id=$1', [id])).rows[0];
    if (!s) throw notFound('Software');
    if (q.mode === 'archive') {
      await db.query(`update software set status='archived', updated_at=now() where id=$1`, [id]);
      await audit(db, getActor(res), 'software.archive', 'software', id, s);
      return res.json({ archived: true });
    }
    const failures: string[] = [];
    if (q.deleteFromDrive === 'true') {
      const files = (await db.query<any>('select drive_account_id, drive_file_id from software_files where software_id=$1', [id])).rows;
      for (const f of files) {
        try {
          await drive.withAccount(f.drive_account_id, (t) => google.deleteFile(t, f.drive_file_id));
        } catch (e) {
          failures.push(f.drive_file_id);
        }
      }
    }
    await db.query('delete from software where id=$1', [id]);
    await audit(db, getActor(res), 'software.delete', 'software', id, { ...s, deleteFromDrive: q.deleteFromDrive === 'true', driveDeleteFailures: failures.length });
    res.json({ deleted: true, driveDeleteFailures: failures.length });
  });

  // ---------- versions ----------
  const versionInput = z.object({ version: z.string().trim().min(1).max(40), releaseDate: dateStr.default(null), changelog: optText(10000), makeCurrent: z.boolean().default(false) });

  r.post('/software/:id/versions', async (req, res) => {
    const id = uuid.parse(req.params.id);
    const b = versionInput.parse(req.body);
    await db.tx(async (q) => {
      const exists = await q.query('select 1 from software where id=$1', [id]);
      if (!exists.rowCount) throw notFound('Software');
      if (b.makeCurrent) await q.query('update software_versions set is_current=false where software_id=$1', [id]);
      await q.query('insert into software_versions(software_id, version, release_date, changelog, is_current) values ($1,$2,$3,$4,$5)', [id, b.version, b.releaseDate, b.changelog || null, b.makeCurrent]);
      if (b.makeCurrent) await q.query('update software set version=$2, release_date=$3, updated_at=now() where id=$1', [id, b.version, b.releaseDate]);
    });
    await audit(db, getActor(res), 'version.create', 'software', id, { version: b.version, current: b.makeCurrent });
    res.status(201).json(await loadFull(id));
  });
  r.put('/software/:id/versions/:versionId', async (req, res) => {
    const id = uuid.parse(req.params.id);
    const vid = uuid.parse(req.params.versionId);
    const b = versionInput.parse(req.body);
    await db.tx(async (q) => {
      const out = await q.query('update software_versions set version=$3, release_date=$4, changelog=$5 where id=$2 and software_id=$1', [id, vid, b.version, b.releaseDate, b.changelog || null]);
      if (!out.rowCount) throw notFound('Version');
      if (b.makeCurrent) {
        await q.query('update software_versions set is_current=(id=$2) where software_id=$1', [id, vid]);
        await q.query('update software set version=$2, release_date=$3, updated_at=now() where id=$1', [id, b.version, b.releaseDate]);
      }
    });
    await audit(db, getActor(res), 'version.update', 'software', id, { version: b.version });
    res.json(await loadFull(id));
  });
  r.delete('/software/:id/versions/:versionId', async (req, res) => {
    const id = uuid.parse(req.params.id);
    const vid = uuid.parse(req.params.versionId);
    const v = (await db.query<any>('select is_current, version from software_versions where id=$1 and software_id=$2', [vid, id])).rows[0];
    if (!v) throw notFound('Version');
    if (v.is_current) throw conflict('version_current', 'Make another version current before deleting this one.');
    await db.query('delete from software_versions where id=$1', [vid]);
    await audit(db, getActor(res), 'version.delete', 'software', id, { version: v.version });
    res.json(await loadFull(id));
  });

  // ---------- files ----------
  const fileInput = z.object({
    driveAccountId: uuid,
    driveFileId: z.string().trim().min(10).max(200).regex(/^[A-Za-z0-9_-]+$/, 'That does not look like a Google Drive file ID'),
    label: z.string().trim().min(1).max(120),
    versionId: uuid.nullable().default(null),
    operatingSystem: z.enum(OS_LIST).nullable().default(null),
    makePublic: z.boolean().default(true),
    redistributionConfirmed: z.literal(true, { message: 'You must confirm you are authorized to distribute this file.' }),
    sha256: z.preprocess((v) => (v === '' || v == null ? null : v), z.string().trim().regex(/^[a-fA-F0-9]{64}$/, 'SHA-256 must be 64 hex characters').nullable()).default(null),
    sizeBytes: z.number().int().min(0).nullable().default(null),
  });

  r.post('/software/:id/files', async (req, res) => {
    const id = uuid.parse(req.params.id);
    const b = fileInput.parse(req.body);
    const sw = (await db.query('select 1 from software where id=$1', [id])).rowCount;
    if (!sw) throw notFound('Software');
    const dup = (await db.query('select 1 from software_files where drive_account_id=$1 and drive_file_id=$2', [b.driveAccountId, b.driveFileId])).rowCount;
    if (dup) throw conflict('duplicate_file', 'This Drive file is already registered.');

    const info = await drive.withAccount(b.driveAccountId, (t) => google.getFile(t, b.driveFileId));
    let isPublic = false;
    let availability: 'available' | 'missing' | 'quota' | 'forbidden' = 'available';
    if (info && !info.trashed) {
      if (b.makePublic) {
        try {
          await drive.withAccount(b.driveAccountId, (t) => google.makePublic(t, b.driveFileId));
          isPublic = true;
        } catch (e) {
          throw new AppError(502, 'share_failed', `Could not make the file public: ${(e as Error).message}`);
        }
      }
    } else {
      // With the limited drive.file permission the app can only see files it created. Files uploaded some other way
      // can still be registered if they are already shared publicly ("Anyone with the link").
      availability = await google.checkPublic(b.driveFileId);
      if (availability !== 'available') {
        throw new AppError(422, 'file_not_accessible', 'This file was not found. Either the ID is wrong, or the file was not uploaded through this dashboard and is not shared as "Anyone with the link can view".');
      }
      isPublic = true;
    }
    const row = (
      await db.query<any>(
        `insert into software_files(software_id, version_id, drive_account_id, drive_file_id, label, file_name, mime_type, size_bytes, md5, sha256, operating_system, is_public, availability, last_checked_at)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13, now()) returning id`,
        [id, b.versionId, b.driveAccountId, b.driveFileId, b.label, info?.name ?? null, info?.mimeType ?? null, info?.size ?? b.sizeBytes, info?.md5 ?? null, b.sha256, b.operatingSystem, isPublic, availability],
      )
    ).rows[0];
    await audit(db, getActor(res), 'file.register', 'software', id, { fileId: row.id, label: b.label, verifiedViaApi: Boolean(info), public: isPublic });
    res.status(201).json(await loadFull(id));
  });

  r.patch('/files/:fileId', async (req, res) => {
    const fid = uuid.parse(req.params.fileId);
    const b = z.object({ label: z.string().trim().min(1).max(120), versionId: uuid.nullable().default(null), operatingSystem: z.enum(OS_LIST).nullable().default(null), sha256: fileInput.shape.sha256 }).parse(req.body);
    const row = (await db.query<any>('update software_files set label=$2, version_id=$3, operating_system=$4, sha256=$5, updated_at=now() where id=$1 returning software_id', [fid, b.label, b.versionId, b.operatingSystem, b.sha256])).rows[0];
    if (!row) throw notFound('File');
    await audit(db, getActor(res), 'file.update', 'software', row.software_id, { fileId: fid });
    res.json(await loadFull(row.software_id));
  });

  r.post('/files/:fileId/check', async (req, res) => {
    const fid = uuid.parse(req.params.fileId);
    const result = await drive.checkFile(fid);
    res.json({ availability: result });
  });

  r.delete('/files/:fileId', async (req, res) => {
    const fid = uuid.parse(req.params.fileId);
    const del = z.enum(['true', 'false']).default('false').parse(req.query.deleteFromDrive);
    const f = (await db.query<any>('select software_id, drive_account_id, drive_file_id, label from software_files where id=$1', [fid])).rows[0];
    if (!f) throw notFound('File');
    let driveDeleted = false;
    if (del === 'true') {
      try {
        await drive.withAccount(f.drive_account_id, (t) => google.deleteFile(t, f.drive_file_id));
        driveDeleted = true;
      } catch (e) {
        if (!(e instanceof AppError) && !(e instanceof GoogleApiError)) throw e;
        throw new AppError(502, 'drive_delete_failed', 'Could not delete the file from Google Drive, so nothing was removed. Try again, or remove the record without deleting from Drive.');
      }
    }
    await db.query('delete from software_files where id=$1', [fid]);
    await audit(db, getActor(res), 'file.remove', 'software', f.software_id, { label: f.label, driveDeleted });
    res.json(await loadFull(f.software_id));
  });

  // ---------- settings ----------
  r.put('/settings', async (req, res) => {
    const b = z.object({ contactEmail: z.union([z.literal(''), z.string().email().max(200)]), organisationName: z.string().trim().max(120), location: z.string().trim().max(200) }).parse(req.body);
    for (const [k, v] of Object.entries(b)) {
      await db.query(`insert into site_settings(key, value) values ($1, to_jsonb($2::text)) on conflict (key) do update set value = excluded.value, updated_at = now()`, [k, v]);
    }
    await audit(db, getActor(res), 'settings.update', 'settings', undefined, { keys: Object.keys(b) });
    res.json({ ok: true });
  });

  return r;
}
