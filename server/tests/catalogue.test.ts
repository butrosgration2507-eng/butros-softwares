import { beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { connectAccount, login, makeCtx, validSoftware, type Ctx } from './helpers.js';

let ctx: Ctx;
let a: Awaited<ReturnType<typeof login>>;
let accountId: string;
beforeAll(async () => {
  ctx = await makeCtx();
  a = await login(ctx);
  await connectAccount(ctx, a);
  accountId = (await a.agent.get('/api/admin/drive/accounts')).body.accounts[0].id;
  ctx.state.files.set('FILEID_aaaaaaaaaaaa', { id: 'FILEID_aaaaaaaaaaaa', name: 'setup.exe', mimeType: 'application/octet-stream', size: 1234, md5: 'abc', trashed: false });
});

const addFile = (id: string, over: Record<string, unknown> = {}) =>
  a.post(`/api/admin/software/${id}/files`).send({ driveAccountId: accountId, driveFileId: 'FILEID_aaaaaaaaaaaa', label: 'Windows installer', redistributionConfirmed: true, ...over });

describe('software management', () => {
  let id: string;
  it('validates input on the server', async () => {
    const bad = await a.post('/api/admin/software').send(validSoftware({ slug: 'Bad Slug!', name: '' }));
    expect(bad.status).toBe(400);
    expect(bad.body.issues.map((i: any) => i.path)).toEqual(expect.arrayContaining(['slug', 'name']));
    const js = await a.post('/api/admin/software').send(validSoftware({ publisherUrl: 'javascript:alert(1)' }));
    expect(js.status).toBe(400);
  });
  it('creates a draft, rejects duplicate slugs, and edits it', async () => {
    const c = await a.post('/api/admin/software').send(validSoftware());
    expect(c.status).toBe(201);
    id = c.body.id;
    expect(c.body.status).toBe('draft');
    expect(c.body.versions).toHaveLength(1);
    expect((await a.post('/api/admin/software').send(validSoftware())).status).toBe(409);
    const u = await a.put(`/api/admin/software/${id}`).send(validSoftware({ name: 'Test App Pro' }));
    expect(u.body.name).toBe('Test App Pro');
  });
  it('keeps drafts out of public search, details, sitemap and returns 404 for the page', async () => {
    expect((await request(ctx.app).get('/api/software')).body.total).toBe(0);
    expect((await request(ctx.app).get('/api/software/test-app')).status).toBe(404);
    expect((await request(ctx.app).get('/sitemap.xml')).text).not.toContain('test-app');
    const page = await request(ctx.app).get('/software/test-app');
    expect(page.status).toBe(404);
    expect(page.text).toContain('noindex');
  });
  it('refuses to publish without a file, then publishes after a file is registered', async () => {
    const no = await a.post(`/api/admin/software/${id}/publish`).send({});
    expect(no.status).toBe(422);
    expect(no.body.details.join(' ')).toMatch(/public downloadable file/);
    const f = await addFile(id);
    expect(f.status).toBe(201);
    expect(f.body.files[0]).toMatchObject({ fileName: 'setup.exe', isPublic: true, driveAccountEmail: 'one@example.com' });
    expect(ctx.gw.makePublic).toHaveBeenCalled();
    const p = await a.post(`/api/admin/software/${id}/publish`).send({});
    expect(p.status).toBe(200);
    expect(p.body.status).toBe('published');
  });
  it('requires the redistribution confirmation when registering a file', async () => {
    const r = await addFile(id, { driveFileId: 'OTHERFILE_bbbbbbbbbb', redistributionConfirmed: false });
    expect(r.status).toBe(400);
  });
  it('rejects registering a duplicate or an unknown, non-public file', async () => {
    expect((await addFile(id)).status).toBe(409);
    ctx.state.publicCheck = 'missing';
    const r = await addFile(id, { driveFileId: 'UNKNOWNFILE_cccccccc' });
    expect(r.status).toBe(422);
    ctx.state.publicCheck = 'available';
  });
  it('shows published software publicly without leaking Drive details', async () => {
    const list = await request(ctx.app).get('/api/software?q=test&os=Windows');
    expect(list.body.total).toBe(1);
    const d = await request(ctx.app).get('/api/software/test-app');
    expect(d.status).toBe(200);
    const json = JSON.stringify(d.body);
    expect(json).not.toContain('FILEID_aaaaaaaaaaaa');
    expect(json).not.toContain('one@example.com');
    expect(d.body.files[0].md5).toBe('abc');
    expect((await request(ctx.app).get('/api/software?os=Linux')).body.total).toBe(0);
  });
  it('lists published software in the sitemap and pages carry SEO tags', async () => {
    const s = await request(ctx.app).get('/sitemap.xml');
    expect(s.text).toContain('https://butros.example/software/test-app');
    expect(s.text).not.toContain('/admin');
    const page = await request(ctx.app).get('/software/test-app');
    expect(page.status).toBe(200);
    expect(page.text).toContain('<link rel="canonical" href="https://butros.example/software/test-app"');
    expect(page.text).toContain('application/ld+json');
    expect(page.text).toContain('SoftwareApplication');
    expect(page.text).not.toContain('aggregateRating');
  });
  it('unpublishes and archives', async () => {
    await a.post(`/api/admin/software/${id}/unpublish`).send({});
    expect((await request(ctx.app).get('/api/software/test-app')).status).toBe(404);
    await a.post(`/api/admin/software/${id}/publish`).send({});
    const del = await a.del(`/api/admin/software/${id}`).send();
    expect(del.body.archived).toBe(true);
    expect((await request(ctx.app).get('/api/software')).body.total).toBe(0);
  });
  it('manages versions', async () => {
    const c = await a.post('/api/admin/software').send(validSoftware({ slug: 'second', name: 'Second' }));
    const v = await a.post(`/api/admin/software/${c.body.id}/versions`).send({ version: '2.0.0', releaseDate: '2026-03-01', changelog: 'New stuff', makeCurrent: true });
    expect(v.body.version).toBe('2.0.0');
    expect(v.body.versions).toHaveLength(2);
    const dupe = await a.post(`/api/admin/software/${c.body.id}/versions`).send({ version: '2.0.0' });
    expect(dupe.status).toBe(409);
    const cur = v.body.versions.find((x: any) => x.isCurrent);
    expect((await a.del(`/api/admin/software/${c.body.id}/versions/${cur.id}`).send()).status).toBe(409);
  });
  it('accepts only real images as media', async () => {
    const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(32)]);
    const ok = await a.post('/api/admin/media').attach('file', png, 'icon.png');
    expect(ok.status).toBe(201);
    const img = await request(ctx.app).get(ok.body.url);
    expect(img.headers['content-type']).toBe('image/png');
    const bad = await a.post('/api/admin/media').attach('file', Buffer.from('<svg onload=alert(1)>'), 'x.png');
    expect(bad.status).toBe(415);
  });
  it('paginates the public catalogue', async () => {
    for (let i = 0; i < 3; i++) {
      const c = await a.post('/api/admin/software').send(validSoftware({ slug: `bulk-${i}`, name: `Bulk ${i}` }));
      ctx.state.files.set(`BULKFILE_${i}_aaaaaaaa`, { id: `BULKFILE_${i}_aaaaaaaa`, name: 'x.exe', mimeType: 'a/b', size: 1, md5: null, trashed: false });
      await addFile(c.body.id, { driveFileId: `BULKFILE_${i}_aaaaaaaa` });
      await a.post(`/api/admin/software/${c.body.id}/publish`).send({});
    }
    const p = await request(ctx.app).get('/api/software?pageSize=2&page=2&sort=name');
    expect(p.body.total).toBe(3);
    expect(p.body.items).toHaveLength(1);
    expect(p.body.totalPages).toBe(2);
  });
});

describe('static and private pages', () => {
  it('serves robots.txt, 404 pages and noindex admin shell', async () => {
    const robots = await request(ctx.app).get('/robots.txt');
    expect(robots.text).toContain('Disallow: /admin');
    expect(robots.text).toContain('Sitemap: https://butros.example/sitemap.xml');
    expect((await request(ctx.app).get('/nope')).status).toBe(404);
    const admin = await request(ctx.app).get('/admin');
    expect(admin.status).toBe(200);
    expect(admin.text).toContain('noindex');
    expect((await request(ctx.app).get('/about')).text).toContain('<title>About Us | BUTROS SOFTWARES</title>');
    expect((await request(ctx.app).get('/api/health')).body.status).toBe('ok');
  });
  it('sends security headers and no CORS headers', async () => {
    const r = await request(ctx.app).get('/api/health').set('Origin', 'https://evil.example');
    expect(r.headers['content-security-policy']).toContain("default-src 'self'");
    expect(r.headers['x-content-type-options']).toBe('nosniff');
    expect(r.headers['access-control-allow-origin']).toBeUndefined();
    expect(r.headers['x-powered-by']).toBeUndefined();
  });
});
