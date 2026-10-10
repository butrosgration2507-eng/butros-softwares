import type { NextFunction, Request, Response } from 'express';
import type { Config } from './config.js';
import { randomToken, safeEqual, sha256Hex } from './crypto.js';
import type { Db } from './db.js';
import { AppError } from './errors.js';
import type { Actor } from './audit.js';

export const SESSION_COOKIE = 'bs_session';

export type SessionInfo = { id: string; adminId: string; email: string; displayName: string | null; csrfToken: string };

export function cookieOptions(config: Config) {
  return { httpOnly: true, secure: config.isProd, sameSite: 'lax' as const, path: '/', maxAge: config.sessionTtlHours * 3600 * 1000 };
}

export async function createSession(db: Db, config: Config, adminId: string) {
  const token = randomToken(32);
  const csrf = randomToken(24);
  await db.query(`insert into sessions(token_hash, admin_id, csrf_token, expires_at) values ($1,$2,$3, now() + ($4 || ' hours')::interval)`, [
    sha256Hex(token),
    adminId,
    csrf,
    String(config.sessionTtlHours),
  ]);
  return { token, csrf };
}

export function requireAdmin(db: Db) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const token = req.cookies?.[SESSION_COOKIE];
    if (!token || typeof token !== 'string') throw new AppError(401, 'unauthenticated', 'Please sign in.');
    const r = await db.query<any>(
      `select s.id, s.admin_id, s.csrf_token, a.email, a.display_name
         from sessions s join admins a on a.id = s.admin_id
        where s.token_hash = $1 and s.expires_at > now()`,
      [sha256Hex(token)],
    );
    const row = r.rows[0];
    if (!row) throw new AppError(401, 'session_expired', 'Your session has expired. Please sign in again.');
    const unsafe = !['GET', 'HEAD', 'OPTIONS'].includes(req.method);
    if (unsafe) {
      const sent = req.get('x-csrf-token') ?? '';
      if (!sent || !safeEqual(sent, row.csrf_token)) throw new AppError(403, 'csrf_failed', 'Security check failed. Reload the page and try again.');
    }
    const info: SessionInfo = { id: row.id, adminId: row.admin_id, email: row.email, displayName: row.display_name, csrfToken: row.csrf_token };
    res.locals.session = info;
    next();
  };
}

export const getSession = (res: Response): SessionInfo => res.locals.session;
export const getActor = (res: Response): Actor => ({ id: res.locals.session.adminId, email: res.locals.session.email });
