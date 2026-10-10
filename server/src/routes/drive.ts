import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { audit } from '../audit.js';
import { getActor, getSession } from '../auth.js';
import type { Config } from '../config.js';
import { decryptSecret, randomToken, safeEqual } from '../crypto.js';
import type { Db } from '../db.js';
import { publicAccount, type DriveAccountRow, type DriveService } from '../drive.js';
import { AppError, notFound } from '../errors.js';
import { DRIVE_SCOPE, GoogleAuthError, type GoogleGateway } from '../google.js';

const CHUNK_SIZE = 8 * 1024 * 1024; // multiple of 256 KiB, as Google requires
const MAX_FILE = 5 * 1024 ** 4; // Google Drive's 5 TB per-file limit

/** Mounted behind requireAdmin. */
export function driveRouter(deps: { db: Db; config: Config; google: GoogleGateway; drive: DriveService }) {
  const { db, config, google, drive } = deps;
  const r = Router();

  r.get('/accounts', async (_req, res) => {
    const rows = await db.query<DriveAccountRow & { file_count: number }>(
      `select a.*, (select count(*)::int from software_files f where f.drive_account_id = a.id) as file_count from drive_accounts a order by a.created_at`,
    );
    res.json({ configured: google.isConfigured(), redirectUri: config.googleRedirectUri, accounts: rows.rows.map((a) => publicAccount(a, a.file_count)) });
  });

  r.post('/connect', async (req, res) => {
    const body = z.object({ accountId: z.string().uuid().optional() }).parse(req.body ?? {});
    if (!google.isConfigured()) throw new AppError(503, 'google_not_configured', 'Google OAuth is not configured yet. Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET (see README, section "Google Cloud setup").');
    let hint: string | undefined;
    if (body.accountId) hint = (await drive.getAccount(body.accountId)).google_email;
    const state = randomToken(24);
    await db.query(`update sessions set oauth_state=$2, oauth_state_expires_at = now() + interval '10 minutes' where id=$1`, [getSession(res).id, state]);
    res.json({ url: google.authUrl(state, hint) });
  });

  // Google redirects the admin's browser here.
  r.get('/callback', async (req, res) => {
    const fail = (code: string) => res.redirect(`/admin/storage?error=${encodeURIComponent(code)}`);
    const session = getSession(res);
    const q = z.object({ code: z.string().optional(), state: z.string().optional(), error: z.string().optional() }).parse(req.query);
    const row = (await db.query<any>(`select oauth_state, oauth_state_expires_at from sessions where id=$1`, [session.id])).rows[0];
    await db.query(`update sessions set oauth_state=null, oauth_state_expires_at=null where id=$1`, [session.id]); // single use
    if (!row?.oauth_state || !q.state || !safeEqual(q.state, row.oauth_state) || new Date(row.oauth_state_expires_at) < new Date()) return fail('invalid_state');
    if (q.error) return fail(q.error === 'access_denied' ? 'access_denied' : 'google_error');
    if (!q.code) return fail('missing_code');
    try {
      const ex = await google.exchangeCode(q.code);
      if (!ex.scopes.includes(DRIVE_SCOPE)) return fail('missing_drive_permission');
      let refresh = ex.refreshToken;
      if (!refresh) {
        // Re-authorising an account Google already knows can omit the refresh token; keep the stored one if we have it.
        const existing = (await db.query<any>('select encrypted_refresh_token from drive_accounts where google_email=$1', [ex.email])).rows[0];
        if (!existing?.encrypted_refresh_token) return fail('no_refresh_token');
        refresh = decryptSecret(existing.encrypted_refresh_token, config.encryptionKey);
      }
      const saved = await drive.saveConnectedAccount(ex.email, refresh);
      await audit(db, getActor(res), saved.created ? 'drive.connect' : 'drive.reauthorize', 'drive_account', saved.id, { email: ex.email });
      await drive.refreshQuota(saved.id).catch(() => {});
      return res.redirect(`/admin/storage?connected=${encodeURIComponent(ex.email)}`);
    } catch (e) {
      if (e instanceof GoogleAuthError) return fail(e.kind === 'not_configured' ? 'not_configured' : 'oauth_failed');
      console.error('OAuth callback error:', (e as Error).message);
      return fail('oauth_failed');
    }
  });

  r.patch('/accounts/:id', async (req, res) => {
    const body = z.object({ friendlyName: z.string().trim().max(60).nullable().optional(), isDefault: z.boolean().optional() }).parse(req.body);
    const acc = await drive.getAccount(req.params.id as string);
    await db.tx(async (q) => {
      if (body.friendlyName !== undefined) await q.query('update drive_accounts set friendly_name=$2, updated_at=now() where id=$1', [acc.id, body.friendlyName || null]);
      if (body.isDefault === true) {
        if (acc.status !== 'connected') throw new AppError(409, 'account_unavailable', 'Only a connected account can be the default.');
        await q.query('update drive_accounts set is_default=false where is_default');
        await q.query('update drive_accounts set is_default=true, updated_at=now() where id=$1', [acc.id]);
      }
      if (body.isDefault === false) await q.query('update drive_accounts set is_default=false where id=$1', [acc.id]);
    });
    await audit(db, getActor(res), 'drive.update', 'drive_account', acc.id, { email: acc.google_email, ...body });
    res.json({ ok: true });
  });

  r.post('/accounts/:id/refresh', async (req, res) => {
    const id = req.params.id as string;
    await drive.refreshQuota(id);
    const a = await drive.getAccount(id);
    res.json(publicAccount(a));
  });

  r.delete('/accounts/:id', async (req, res) => {
    const acc = await drive.getAccount(req.params.id as string);
    if (acc.encrypted_refresh_token) await google.revoke(decryptSecret(acc.encrypted_refresh_token, config.encryptionKey));
    const files = (await db.query<{ n: number }>('select count(*)::int as n from software_files where drive_account_id=$1', [acc.id])).rows[0].n;
    if (files === 0) {
      await db.query('delete from drive_accounts where id=$1', [acc.id]);
    } else {
      // Keep the record so existing file links stay visible (as "disconnected"); the stored token is erased.
      await db.query(`update drive_accounts set status='disconnected', encrypted_refresh_token=null, is_default=false, last_error=null, updated_at=now() where id=$1`, [acc.id]);
    }
    await audit(db, getActor(res), 'drive.disconnect', 'drive_account', acc.id, { email: acc.google_email, removed: files === 0, linkedFiles: files });
    res.json({ removed: files === 0, linkedFiles: files });
  });

  const uploadLimiter = rateLimit({ windowMs: 60 * 60_000, limit: 60, skip: () => !config.rateLimitEnabled, handler: (_q, s) => s.status(429).json({ error: 'rate_limited', message: 'Too many uploads started. Try again later.' }) });

  // Creates a Google resumable-upload session. The browser then sends the file straight to Google,
  // so the (small, free-tier) server never has to hold a multi-gigabyte installer in memory.
  r.post('/uploads/init', uploadLimiter, async (req, res) => {
    const b = z
      .object({
        accountId: z.union([z.literal('auto'), z.string().uuid()]),
        fileName: z.string().trim().min(1).max(255).regex(/^[^\\/\0]+$/, 'Invalid file name'),
        mimeType: z.string().trim().min(1).max(100).regex(/^[\w.+-]+\/[\w.+-]+$/).default('application/octet-stream'),
        size: z.number().int().positive().max(MAX_FILE),
      })
      .parse(req.body);
    const account = await drive.chooseUploadAccount(b.accountId, b.size);
    const origin = req.get('origin') || new URL(config.appUrl).origin;
    const { sessionUri } = await drive.withAccount(account.id, (token) => google.startResumableUpload(token, { name: b.fileName, mimeType: b.mimeType, size: b.size, origin }));
    await audit(db, getActor(res), 'drive.upload_started', 'drive_account', account.id, { fileName: b.fileName, size: b.size });
    res.json({ accountId: account.id, accountEmail: account.google_email, sessionUri, chunkSize: CHUNK_SIZE });
  });

  r.get('/accounts/:id/quota', async (req, res) => {
    const a = await drive.getAccount(req.params.id as string);
    if (!a) throw notFound('Account');
    res.json(publicAccount(a));
  });

  return r;
}
