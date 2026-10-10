import { beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { selectAccount, type DriveAccountRow } from '../src/drive.js';
import { connectAccount, login, makeCtx, validSoftware, type Ctx } from './helpers.js';

const GB = 1024 ** 3;
const acc = (over: Partial<DriveAccountRow>): DriveAccountRow => ({ id: Math.random().toString(), google_email: 'a@x.com', friendly_name: null, status: 'connected', encrypted_refresh_token: 'v1:x', is_default: false, quota_limit_bytes: 15 * GB, quota_used_bytes: 5 * GB, quota_checked_at: null, last_error: null, ...over });

describe('automatic account selection', () => {
  it('prefers the connected account with the most free space that fits', () => {
    const a = acc({ google_email: 'a', quota_used_bytes: 14 * GB });
    const b = acc({ google_email: 'b', quota_used_bytes: 2 * GB });
    const c = acc({ google_email: 'c', quota_used_bytes: 1 * GB, status: 'needs_reauth' });
    expect(selectAccount([a, b, c], 3 * GB).account?.google_email).toBe('b');
  });
  it('reports clear reasons instead of guessing', () => {
    expect(selectAccount([], 1).reason).toBe('no_connected');
    expect(selectAccount([acc({ status: 'disconnected', encrypted_refresh_token: null })], 1).reason).toBe('no_connected');
    expect(selectAccount([acc({ quota_limit_bytes: null })], 1).reason).toBe('unknown_quota');
    expect(selectAccount([acc({ quota_used_bytes: 15 * GB })], 1).reason).toBe('no_space');
  });
});

let ctx: Ctx;
let a: Awaited<ReturnType<typeof login>>;
beforeAll(async () => {
  ctx = await makeCtx();
  a = await login(ctx);
});

describe('Google account connection', () => {
  it('rejects an invalid OAuth state and stores nothing', async () => {
    await a.post('/api/admin/drive/connect').send({});
    const r = await a.agent.get('/api/admin/drive/callback?code=abc&state=forged');
    expect(r.status).toBe(302);
    expect(r.headers.location).toContain('error=invalid_state');
    expect((await ctx.db.query('select count(*)::int as n from drive_accounts')).rows[0].n).toBe(0);
  });
  it('rejects a state that was already used (single use)', async () => {
    const c = await a.post('/api/admin/drive/connect').send({});
    const state = new URL(c.body.url).searchParams.get('state')!;
    await a.agent.get(`/api/admin/drive/callback?code=abc&state=${state}`);
    const again = await a.agent.get(`/api/admin/drive/callback?code=abc&state=${state}`);
    expect(again.headers.location).toContain('error=invalid_state');
  });
  it('connects an account, encrypts the refresh token and never returns it', async () => {
    await ctx.db.query('delete from drive_accounts');
    const { cb } = await connectAccount(ctx, a);
    expect(cb.headers.location).toContain('connected=one%40example.com');
    const stored = (await ctx.db.query<any>('select encrypted_refresh_token, is_default from drive_accounts')).rows[0];
    expect(stored.encrypted_refresh_token.startsWith('v1:')).toBe(true);
    expect(stored.encrypted_refresh_token).not.toContain('SECRET');
    expect(stored.is_default).toBe(true);
    const list = await a.agent.get('/api/admin/drive/accounts');
    expect(JSON.stringify(list.body)).not.toContain('SECRET');
    expect(JSON.stringify(list.body)).not.toContain('v1:');
    expect(list.body.accounts[0]).toMatchObject({ email: 'one@example.com', status: 'connected', quotaFreeBytes: 14 * GB });
  });
  it('refuses the connection when the Drive permission was not granted', async () => {
    ctx.state.exchange.scopes = ['openid', 'email'];
    const { cb } = await connectAccount(ctx, a, 'two@example.com', 'tok-2');
    expect(cb.headers.location).toContain('missing_drive_permission');
    ctx.state.exchange.scopes = ['https://www.googleapis.com/auth/drive.file', 'openid', 'email'];
  });
  it('manages several accounts, a single default, and renaming', async () => {
    await connectAccount(ctx, a, 'two@example.com', 'tok-2');
    await connectAccount(ctx, a, 'three@example.com', 'tok-3');
    const list = (await a.agent.get('/api/admin/drive/accounts')).body.accounts;
    expect(list).toHaveLength(3);
    const two = list.find((x: any) => x.email === 'two@example.com');
    await a.patch(`/api/admin/drive/accounts/${two.id}`).send({ isDefault: true, friendlyName: 'Backup' });
    const after = (await a.agent.get('/api/admin/drive/accounts')).body.accounts;
    expect(after.filter((x: any) => x.isDefault).map((x: any) => x.email)).toEqual(['two@example.com']);
    expect(after.find((x: any) => x.email === 'two@example.com').friendlyName).toBe('Backup');
  });
  it('is not configured gracefully', async () => {
    const c = await makeCtx();
    c.gw.isConfigured = () => false;
    const x = await login(c);
    const r = await x.post('/api/admin/drive/connect').send({});
    expect(r.status).toBe(503);
    expect(r.body.error).toBe('google_not_configured');
  });
});

describe('uploads', () => {
  it('creates a resumable session on an automatically chosen account', async () => {
    const r = await a.post('/api/admin/drive/uploads/init').send({ accountId: 'auto', fileName: 'big.iso', mimeType: 'application/octet-stream', size: 3 * GB });
    expect(r.status).toBe(200);
    expect(r.body.sessionUri).toContain('upload.example');
    expect(r.body.chunkSize % (256 * 1024)).toBe(0);
    expect(ctx.gw.startResumableUpload).toHaveBeenCalled();
  });
  it('validates upload requests', async () => {
    expect((await a.post('/api/admin/drive/uploads/init').send({ accountId: 'auto', fileName: '../evil', size: 10 })).status).toBe(400);
    expect((await a.post('/api/admin/drive/uploads/init').send({ accountId: 'auto', fileName: 'a.bin', size: -5 })).status).toBe(400);
  });
  it('reports a clear error when no account has enough space', async () => {
    ctx.state.quota = { limit: 15 * GB, usage: 15 * GB };
    const r = await a.post('/api/admin/drive/uploads/init').send({ accountId: 'auto', fileName: 'big.iso', size: 3 * GB });
    expect(r.status).toBe(409);
    expect(r.body.error).toBe('no_eligible_account');
    ctx.state.quota = { limit: 15 * GB, usage: 1 * GB };
  });
  it('does not guess when Google reports no quota', async () => {
    ctx.state.quota = { limit: null, usage: null };
    await ctx.db.query('update drive_accounts set quota_limit_bytes=null, quota_used_bytes=null');
    const r = await a.post('/api/admin/drive/uploads/init').send({ accountId: 'auto', fileName: 'x.bin', size: 5 });
    expect(r.status).toBe(409);
    expect(r.body.error).toBe('quota_unknown');
    ctx.state.quota = { limit: 15 * GB, usage: 1 * GB };
  });
  it('marks an account as needing reauthorization when Google revoked access', async () => {
    const list = (await a.agent.get('/api/admin/drive/accounts')).body.accounts;
    const acct = list.find((x: any) => x.email === 'three@example.com');
    ctx.state.revoked.add('tok-3');
    const r = await a.post('/api/admin/drive/uploads/init').send({ accountId: acct.id, fileName: 'x.bin', size: 5 });
    expect(r.status).toBe(409);
    expect(r.body.error).toBe('account_needs_reauth');
    const after = (await a.agent.get('/api/admin/drive/accounts')).body.accounts.find((x: any) => x.id === acct.id);
    expect(after.status).toBe('needs_reauth');
    const again = await a.post('/api/admin/drive/uploads/init').send({ accountId: acct.id, fileName: 'x.bin', size: 5 });
    expect(again.body.error).toBe('account_unavailable');
  });
  it('disconnect erases the token; accounts without files are removed', async () => {
    const list = (await a.agent.get('/api/admin/drive/accounts')).body.accounts;
    const acct = list.find((x: any) => x.email === 'three@example.com');
    const r = await a.del(`/api/admin/drive/accounts/${acct.id}`).send();
    expect(r.body.removed).toBe(true);
  });
});

describe('downloads', () => {
  let fileId: string;
  beforeAll(async () => {
    const accountId = (await a.agent.get('/api/admin/drive/accounts')).body.accounts[0].id;
    ctx.state.files.set('DLFILE_aaaaaaaaaaaa', { id: 'DLFILE_aaaaaaaaaaaa', name: 'app.exe', mimeType: 'a/b', size: 99, md5: null, trashed: false });
    const c = await a.post('/api/admin/software').send(validSoftware({ slug: 'dl-app', name: 'DL App' }));
    const f = await a.post(`/api/admin/software/${c.body.id}/files`).send({ driveAccountId: accountId, driveFileId: 'DLFILE_aaaaaaaaaaaa', label: 'Installer', redistributionConfirmed: true });
    fileId = f.body.files[0].id;
    await a.post(`/api/admin/software/${c.body.id}/publish`).send({});
  });
  it('hands out a link only after checking, and counts started downloads', async () => {
    expect((await request(ctx.app).get('/api/home')).body.popular).toHaveLength(0);
    const r = await request(ctx.app).post(`/api/downloads/${fileId}/start`).send({});
    expect(r.status).toBe(200);
    expect(r.body.url).toBe('https://drive.example/download?id=DLFILE_aaaaaaaaaaaa');
    const home = (await request(ctx.app).get('/api/home')).body;
    expect(home.popular[0].downloads).toBe(1);
  });
  it('never pretends success when the file is gone or limited', async () => {
    const before = (await ctx.db.query('select count(*)::int as n from download_events')).rows[0].n;
    await ctx.db.query(`update software_files set availability='unknown', last_checked_at=null`);
    ctx.state.files.delete('DLFILE_aaaaaaaaaaaa');
    ctx.state.publicCheck = 'missing';
    const gone = await request(ctx.app).post(`/api/downloads/${fileId}/start`).send({});
    expect(gone.status).toBe(410);
    expect(gone.body.error).toBe('file_missing');
    ctx.state.publicCheck = 'quota';
    await ctx.db.query(`update software_files set availability='unknown', last_checked_at=null`);
    const q = await request(ctx.app).post(`/api/downloads/${fileId}/start`).send({});
    expect(q.status).toBe(429);
    expect(q.body.error).toBe('quota_exceeded');
    ctx.state.publicCheck = 'forbidden';
    await ctx.db.query(`update software_files set availability='unknown', last_checked_at=null`);
    expect((await request(ctx.app).post(`/api/downloads/${fileId}/start`).send({})).status).toBe(403);
    expect((await ctx.db.query('select count(*)::int as n from download_events')).rows[0].n).toBe(before);
    ctx.state.publicCheck = 'available';
  });
  it('does not serve files of unpublished software or unknown ids', async () => {
    expect((await request(ctx.app).post('/api/downloads/not-a-uuid/start').send({})).status).toBe(404);
    expect((await request(ctx.app).post('/api/downloads/00000000-0000-4000-8000-000000000000/start').send({})).status).toBe(404);
    await ctx.db.query(`update software set status='draft' where slug='dl-app'`);
    expect((await request(ctx.app).post(`/api/downloads/${fileId}/start`).send({})).status).toBe(404);
  });
});

describe('backup format', () => {
  it('audit log records sensitive actions without secrets', async () => {
    const rows = (await ctx.db.query<any>('select action, details from audit_logs')).rows;
    expect(rows.some((r) => r.action === 'drive.connect')).toBe(true);
    expect(JSON.stringify(rows)).not.toContain('SECRET');
    expect(JSON.stringify(rows)).not.toContain('tok-2');
  });
});
