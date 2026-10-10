import { beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { decryptSecret, encryptSecret, hashPassword, verifyPassword } from '../src/crypto.js';
import { loadConfig } from '../src/config.js';
import { login, makeCtx, PASSWORD, type Ctx } from './helpers.js';

let ctx: Ctx;
beforeAll(async () => { ctx = await makeCtx(); });

describe('crypto', () => {
  it('hashes and verifies passwords', async () => {
    const h = await hashPassword('hunter2hunter2');
    expect(h.startsWith('scrypt$')).toBe(true);
    expect(await verifyPassword('hunter2hunter2', h)).toBe(true);
    expect(await verifyPassword('wrong', h)).toBe(false);
  });
  it('encrypts secrets with AES-GCM and detects tampering', () => {
    const key = Buffer.alloc(32, 7);
    const enc = encryptSecret('top-secret', key);
    expect(enc).not.toContain('top-secret');
    expect(decryptSecret(enc, key)).toBe('top-secret');
    const tampered = enc.slice(0, -2) + (enc.endsWith('AA') ? 'BB' : 'AA');
    expect(() => decryptSecret(tampered, key)).toThrow();
  });
  it('rejects bad encryption keys and pglite in production', () => {
    expect(() => loadConfig({ DATABASE_URL: 'x', TOKEN_ENCRYPTION_KEY: 'short' })).toThrow(/32 random bytes/);
    const key = Buffer.alloc(32, 1).toString('base64');
    expect(() => loadConfig({ NODE_ENV: 'production', DATABASE_URL: 'pglite:x', TOKEN_ENCRYPTION_KEY: key })).toThrow(/local development/);
  });
});

describe('administrator authentication', () => {
  it('rejects wrong credentials without revealing which part was wrong', async () => {
    const a = await request(ctx.app).post('/api/auth/login').send({ email: 'admin@example.com', password: 'nope' });
    const b = await request(ctx.app).post('/api/auth/login').send({ email: 'ghost@example.com', password: 'nope' });
    expect(a.status).toBe(401);
    expect(b.status).toBe(401);
    expect(a.body.message).toBe(b.body.message);
  });
  it('protects every admin route without a session', async () => {
    for (const url of ['/api/admin/overview', '/api/admin/software', '/api/admin/drive/accounts', '/api/admin/audit', '/api/admin/categories']) {
      expect((await request(ctx.app).get(url)).status).toBe(401);
    }
    expect((await request(ctx.app).post('/api/admin/software').send({})).status).toBe(401);
    expect((await request(ctx.app).post('/api/admin/uploads/init').send({})).status).toBe(401);
  });
  it('sets an HttpOnly session cookie and requires the CSRF header for changes', async () => {
    const res = await request(ctx.app).post('/api/auth/login').send({ email: 'admin@example.com', password: PASSWORD });
    expect(res.status).toBe(200);
    const cookie = (res.headers['set-cookie'] as unknown as string[])[0];
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Lax/i);
    const agent = request.agent(ctx.app);
    await agent.post('/api/auth/login').send({ email: 'admin@example.com', password: PASSWORD });
    expect((await agent.post('/api/admin/categories').send({ name: 'Tools' })).status).toBe(403);
    expect((await agent.post('/api/admin/categories').set('X-CSRF-Token', 'wrong').send({ name: 'Tools' })).status).toBe(403);
  });
  it('expires sessions and supports logout', async () => {
    const a = await login(ctx);
    expect((await a.agent.get('/api/auth/me')).status).toBe(200);
    await ctx.db.query(`update sessions set expires_at = now() - interval '1 minute'`);
    const r = await a.agent.get('/api/admin/overview');
    expect(r.status).toBe(401);
    expect(r.body.error).toBe('session_expired');
    const b = await login(ctx);
    await b.post('/api/auth/logout').send({});
    expect((await b.agent.get('/api/admin/overview')).status).toBe(401);
  });
  it('locks the account after repeated failures', async () => {
    const c = await makeCtx();
    for (let i = 0; i < 5; i++) await request(c.app).post('/api/auth/login').send({ email: 'admin@example.com', password: 'bad' + i });
    const res = await request(c.app).post('/api/auth/login').send({ email: 'admin@example.com', password: PASSWORD });
    expect(res.status).toBe(429);
  });
  it('has no public registration endpoint', async () => {
    for (const url of ['/api/auth/register', '/api/auth/signup', '/api/admin/register']) {
      const r = await request(ctx.app).post(url).send({ email: 'x@y.com', password: 'abcdefghijkl' });
      expect([401, 404]).toContain(r.status);
    }
    expect((await ctx.db.query('select count(*)::int as n from admins')).rows[0].n).toBe(1);
  });
});
