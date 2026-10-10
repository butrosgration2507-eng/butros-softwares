import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import request from 'supertest';
import { vi } from 'vitest';
import { createApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { hashPassword } from '../src/crypto.js';
import { createPgDb, createPgliteDb, runMigrations } from '../src/db.js';
import type { DriveFileInfo, GoogleGateway, PublicCheck } from '../src/google.js';

export function makeMockGoogle() {
  const state = {
    files: new Map<string, DriveFileInfo>(),
    publicCheck: 'available' as PublicCheck,
    quota: { limit: 15 * 1024 ** 3, usage: 1 * 1024 ** 3 } as { limit: number | null; usage: number | null },
    exchange: { refreshToken: 'refresh-token-SECRET-1' as string | undefined, email: 'one@example.com', scopes: ['https://www.googleapis.com/auth/drive.file', 'openid', 'email'] },
    revoked: new Set<string>(),
  };
  const gw: GoogleGateway & Record<string, any> = {
    isConfigured: () => true,
    authUrl: vi.fn((s: string) => `https://accounts.example/auth?state=${s}`),
    exchangeCode: vi.fn(async () => ({ ...state.exchange })),
    getQuota: vi.fn(async (t: string) => {
      if (state.revoked.has(t)) { const { GoogleAuthError } = await import('../src/google.js'); throw new GoogleAuthError('revoked', 'revoked'); }
      return { ...state.quota };
    }),
    startResumableUpload: vi.fn(async (t: string) => {
      if (state.revoked.has(t)) { const { GoogleAuthError } = await import('../src/google.js'); throw new GoogleAuthError('revoked', 'revoked'); }
      return { sessionUri: 'https://upload.example/session/abc' };
    }),
    getFile: vi.fn(async (_t: string, id: string) => state.files.get(id) ?? null),
    makePublic: vi.fn(async () => {}),
    deleteFile: vi.fn(async () => {}),
    revoke: vi.fn(async () => {}),
    checkPublic: vi.fn(async () => state.publicCheck),
    downloadUrl: (id: string) => `https://drive.example/download?id=${id}`,
  };
  return { gw, state };
}

export const PASSWORD = 'correct horse battery staple';

export async function makeCtx() {
  const dist = fs.mkdtempSync(path.join(os.tmpdir(), 'bs-web-'));
  fs.writeFileSync(path.join(dist, 'index.html'), '<!doctype html><html><head><!--SEO_HEAD--></head><body><div id="root"><!--SSR_BODY--></div></body></html>');
  const config = loadConfig({
    NODE_ENV: 'test',
    DATABASE_URL: 'pglite:memory',
    TOKEN_ENCRYPTION_KEY: crypto.randomBytes(32).toString('base64'),
    APP_URL: 'https://butros.example',
    WEB_DIST: dist,
  });
  let db;
  if (process.env.TEST_DATABASE_URL) {
    // Optional: run the same tests against REAL PostgreSQL (each context gets its own schema).
    const schema = 't_' + crypto.randomBytes(6).toString('hex');
    const admin = createPgDb(process.env.TEST_DATABASE_URL);
    await admin.exec(`create schema ${schema}`);
    await admin.close();
    db = createPgDb(process.env.TEST_DATABASE_URL, { schema });
  } else {
    db = await createPgliteDb('memory://');
  }
  await runMigrations(db);
  const { gw, state } = makeMockGoogle();
  const app = createApp({ db, config, google: gw });
  await db.query('insert into admins(email, password_hash) values ($1,$2)', ['admin@example.com', await hashPassword(PASSWORD)]);
  return { app, db, config, gw, state };
}
export type Ctx = Awaited<ReturnType<typeof makeCtx>>;

export async function login(ctx: Ctx) {
  const agent = request.agent(ctx.app);
  const res = await agent.post('/api/auth/login').send({ email: 'admin@example.com', password: PASSWORD });
  if (res.status !== 200) throw new Error('login failed ' + JSON.stringify(res.body));
  const csrf = res.body.csrfToken as string;
  const call = (method: 'post' | 'put' | 'patch' | 'delete', url: string) => (agent as any)[method](url).set('X-CSRF-Token', csrf);
  return { agent, csrf, post: (u: string) => call('post', u), put: (u: string) => call('put', u), patch: (u: string) => call('patch', u), del: (u: string) => call('delete', u) };
}

export async function connectAccount(ctx: Ctx, a: Awaited<ReturnType<typeof login>>, email = 'one@example.com', token = 'refresh-token-SECRET-1') {
  ctx.state.exchange = { ...ctx.state.exchange, email, refreshToken: token };
  const c = await a.post('/api/admin/drive/connect').send({});
  const state = new URL(c.body.url).searchParams.get('state')!;
  const cb = await a.agent.get(`/api/admin/drive/callback?code=abc&state=${state}`);
  return { cb, state };
}

export const validSoftware = (over: Record<string, unknown> = {}) => ({
  name: 'Test App', slug: 'test-app', shortDescription: 'A test app.', description: 'Full description.', publisher: 'Acme', publisherUrl: 'https://acme.example',
  operatingSystems: ['Windows'], version: '1.0.0', releaseDate: '2026-01-15', downloadSource: 'self', redistributionConfirmed: true, ...over,
});
