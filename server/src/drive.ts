import type { Config } from './config.js';
import { decryptSecret, encryptSecret } from './crypto.js';
import type { Db, Queryable } from './db.js';
import { AppError } from './errors.js';
import { GoogleApiError, GoogleAuthError, type GoogleGateway, type PublicCheck } from './google.js';

export type DriveAccountRow = {
  id: string;
  google_email: string;
  friendly_name: string | null;
  status: 'connected' | 'needs_reauth' | 'disconnected';
  encrypted_refresh_token: string | null;
  is_default: boolean;
  quota_limit_bytes: number | null;
  quota_used_bytes: number | null;
  quota_checked_at: Date | null;
  last_error: string | null;
};

/** Safe view for the browser: never includes tokens. */
export function publicAccount(a: DriveAccountRow, fileCount = 0) {
  const free = a.quota_limit_bytes != null && a.quota_used_bytes != null ? Math.max(0, a.quota_limit_bytes - a.quota_used_bytes) : null;
  return {
    id: a.id,
    email: a.google_email,
    friendlyName: a.friendly_name,
    status: a.status,
    isDefault: a.is_default,
    quotaLimitBytes: a.quota_limit_bytes,
    quotaUsedBytes: a.quota_used_bytes,
    quotaFreeBytes: free,
    quotaCheckedAt: a.quota_checked_at,
    lastError: a.last_error,
    fileCount,
  };
}

/**
 * Automatic account selection.
 * Only accounts that are connected AND report usable quota are considered.
 * Returns the eligible account with the most free space that can hold `size`.
 */
export function selectAccount(accounts: DriveAccountRow[], size: number): { account?: DriveAccountRow; reason?: 'no_connected' | 'unknown_quota' | 'no_space' } {
  const connected = accounts.filter((a) => a.status === 'connected' && a.encrypted_refresh_token);
  if (!connected.length) return { reason: 'no_connected' };
  const known = connected.filter((a) => a.quota_limit_bytes != null && a.quota_used_bytes != null);
  if (!known.length) return { reason: 'unknown_quota' };
  const fits = known
    .map((a) => ({ a, free: (a.quota_limit_bytes as number) - (a.quota_used_bytes as number) }))
    .filter((x) => x.free >= size)
    .sort((x, y) => y.free - x.free || Number(y.a.is_default) - Number(x.a.is_default));
  if (!fits.length) return { reason: 'no_space' };
  return { account: fits[0].a };
}

export function createDriveService(deps: { db: Db; google: GoogleGateway; config: Config }) {
  const { db, google, config } = deps;

  async function getAccount(id: string, q: Queryable = db): Promise<DriveAccountRow> {
    const r = await q.query<DriveAccountRow>('select * from drive_accounts where id = $1', [id]);
    if (!r.rows[0]) throw new AppError(404, 'account_not_found', 'Google account connection not found.');
    return r.rows[0];
  }

  async function markNeedsReauth(id: string, message: string) {
    await db.query(`update drive_accounts set status='needs_reauth', last_error=$2, updated_at=now() where id=$1`, [id, message.slice(0, 300)]);
  }

  /** Runs `fn` with a decrypted refresh token; translates revoked access into a clear state change. */
  async function withAccount<T>(accountId: string, fn: (refreshToken: string, account: DriveAccountRow) => Promise<T>): Promise<T> {
    const account = await getAccount(accountId);
    if (account.status !== 'connected' || !account.encrypted_refresh_token) {
      throw new AppError(409, 'account_unavailable', `The Google account ${account.google_email} is ${account.status === 'disconnected' ? 'disconnected' : 'not authorized'}. Reauthorize it in Storage Manager.`);
    }
    const token = decryptSecret(account.encrypted_refresh_token, config.encryptionKey);
    try {
      return await fn(token, account);
    } catch (e) {
      if (e instanceof GoogleAuthError) {
        if (e.kind === 'revoked') {
          await markNeedsReauth(accountId, e.message);
          throw new AppError(409, 'account_needs_reauth', `${account.google_email} needs to be reauthorized in Storage Manager.`);
        }
        if (e.kind === 'not_configured') throw new AppError(503, 'google_not_configured', e.message);
        throw new AppError(502, 'google_oauth_error', e.message);
      }
      if (e instanceof GoogleApiError) {
        throw new AppError(e.status === 403 || e.status === 429 ? 429 : 502, e.reason === 'storageQuotaExceeded' ? 'storage_quota_exceeded' : 'google_api_error', `Google Drive error: ${e.message}`);
      }
      throw e;
    }
  }

  async function refreshQuota(accountId: string) {
    return withAccount(accountId, async (token) => {
      const q = await google.getQuota(token);
      await db.query(`update drive_accounts set quota_limit_bytes=$2, quota_used_bytes=$3, quota_checked_at=now(), last_error=null, updated_at=now() where id=$1`, [accountId, q.limit, q.usage]);
      return q;
    });
  }

  async function saveConnectedAccount(email: string, refreshToken: string): Promise<{ id: string; created: boolean }> {
    const enc = encryptSecret(refreshToken, config.encryptionKey);
    const existing = await db.query<{ id: string }>('select id from drive_accounts where google_email=$1', [email]);
    if (existing.rows[0]) {
      await db.query(`update drive_accounts set encrypted_refresh_token=$2, status='connected', last_error=null, updated_at=now() where id=$1`, [existing.rows[0].id, enc]);
      return { id: existing.rows[0].id, created: false };
    }
    const count = (await db.query<{ n: number }>('select count(*)::int as n from drive_accounts')).rows[0].n;
    const ins = await db.query<{ id: string }>(
      'insert into drive_accounts(google_email, encrypted_refresh_token, status, is_default) values ($1,$2,$3,$4) returning id',
      [email, enc, 'connected', count === 0],
    );
    return { id: ins.rows[0].id, created: true };
  }

  async function chooseUploadAccount(requested: string | 'auto', size: number): Promise<DriveAccountRow> {
    if (requested !== 'auto') {
      const a = await getAccount(requested);
      if (a.status !== 'connected') throw new AppError(409, 'account_unavailable', `${a.google_email} is not connected.`);
      await refreshQuota(a.id).catch((e) => {
        if (e instanceof AppError && e.code === 'account_needs_reauth') throw e; // other quota hiccups are not fatal
      });
      const fresh = await getAccount(a.id);
      if (fresh.quota_limit_bytes != null && fresh.quota_used_bytes != null && fresh.quota_limit_bytes - fresh.quota_used_bytes < size) {
        throw new AppError(409, 'insufficient_space', `${fresh.google_email} reports less free space than this file needs. Pick another account.`);
      }
      return fresh;
    }
    const all = (await db.query<DriveAccountRow>(`select * from drive_accounts where status='connected'`)).rows;
    await Promise.all(all.map((a) => refreshQuota(a.id).catch(() => {})));
    const fresh = (await db.query<DriveAccountRow>('select * from drive_accounts')).rows;
    const picked = selectAccount(fresh, size);
    if (picked.account) return picked.account;
    const msg = {
      no_connected: 'No connected Google accounts. Connect one in Storage Manager first.',
      unknown_quota: 'Google did not report storage quota for your accounts, so automatic selection is not reliable. Choose an account manually.',
      no_space: 'No connected account reports enough free space for this file.',
    }[picked.reason!];
    throw new AppError(409, picked.reason === 'unknown_quota' ? 'quota_unknown' : picked.reason === 'no_space' ? 'no_eligible_account' : 'no_accounts', msg);
  }

  /** Checks a registered file and stores the result. */
  async function checkFile(fileId: string): Promise<PublicCheck | 'available'> {
    const r = await db.query<any>(
      `select f.id, f.drive_file_id, f.drive_account_id, a.status as account_status, a.encrypted_refresh_token
         from software_files f join drive_accounts a on a.id = f.drive_account_id where f.id = $1`,
      [fileId],
    );
    const f = r.rows[0];
    if (!f) throw new AppError(404, 'file_not_found', 'File record not found.');
    let result: PublicCheck = 'missing';
    let resolved = false;
    if (f.account_status === 'connected' && f.encrypted_refresh_token) {
      try {
        const info = await google.getFile(decryptSecret(f.encrypted_refresh_token, config.encryptionKey), f.drive_file_id);
        if (info && !info.trashed) {
          result = 'available';
          resolved = true;
        } else if (info?.trashed) {
          result = 'missing';
          resolved = true;
        }
      } catch (e) {
        if (e instanceof GoogleAuthError && e.kind === 'revoked') await markNeedsReauth(f.drive_account_id, e.message);
        // fall through to the public check
      }
    }
    if (!resolved) result = await google.checkPublic(f.drive_file_id);
    await db.query(`update software_files set availability=$2, last_checked_at=now(), updated_at=now() where id=$1`, [fileId, result]);
    return result;
  }

  return { getAccount, withAccount, refreshQuota, saveConnectedAccount, chooseUploadAccount, checkFile, markNeedsReauth };
}
export type DriveService = ReturnType<typeof createDriveService>;
