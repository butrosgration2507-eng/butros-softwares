import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { audit } from '../audit.js';
import { SESSION_COOKIE, cookieOptions, createSession, getSession, requireAdmin } from '../auth.js';
import type { Config } from '../config.js';
import { hashPassword, sha256Hex, verifyPassword } from '../crypto.js';
import type { Db } from '../db.js';
import { AppError } from '../errors.js';

const DUMMY_HASH_PROMISE = hashPassword('not-a-real-password');

export function authRouter(db: Db, config: Config) {
  const r = Router();
  const loginLimiter = rateLimit({
    windowMs: 15 * 60_000,
    limit: 10,
    standardHeaders: true,
    legacyHeaders: false,
    skip: () => !config.rateLimitEnabled,
    handler: (_req, res) => res.status(429).json({ error: 'rate_limited', message: 'Too many sign-in attempts. Try again in 15 minutes.' }),
  });

  r.post('/login', loginLimiter, async (req, res) => {
    const body = z.object({ email: z.string().trim().toLowerCase().email().max(200), password: z.string().min(1).max(200) }).parse(req.body);
    const admin = (await db.query<any>('select * from admins where email = $1', [body.email])).rows[0];
    const invalid = new AppError(401, 'invalid_credentials', 'Incorrect email or password.');
    if (!admin) {
      await verifyPassword(body.password, await DUMMY_HASH_PROMISE); // equalise timing
      throw invalid;
    }
    if (admin.locked_until && new Date(admin.locked_until) > new Date()) {
      throw new AppError(429, 'account_locked', 'Too many failed attempts. Try again in 15 minutes.');
    }
    const ok = await verifyPassword(body.password, admin.password_hash);
    if (!ok) {
      const attempts = admin.failed_attempts + 1;
      await db.query(`update admins set failed_attempts=$2, locked_until = case when $2 >= 5 then now() + interval '15 minutes' else null end where id=$1`, [admin.id, attempts]);
      await audit(db, { id: admin.id, email: admin.email }, 'auth.login_failed', 'admin', admin.id, { attempts });
      throw invalid;
    }
    await db.query('update admins set failed_attempts=0, locked_until=null, last_login_at=now() where id=$1', [admin.id]);
    await db.query('delete from sessions where expires_at < now()');
    const { token, csrf } = await createSession(db, config, admin.id);
    res.cookie(SESSION_COOKIE, token, cookieOptions(config));
    await audit(db, { id: admin.id, email: admin.email }, 'auth.login', 'admin', admin.id);
    res.json({ email: admin.email, displayName: admin.display_name, csrfToken: csrf });
  });

  r.get('/me', requireAdmin(db), (_req, res) => {
    const s = getSession(res);
    res.json({ email: s.email, displayName: s.displayName, csrfToken: s.csrfToken });
  });

  r.post('/logout', requireAdmin(db), async (req, res) => {
    const s = getSession(res);
    await db.query('delete from sessions where id = $1', [s.id]);
    await audit(db, { id: s.adminId, email: s.email }, 'auth.logout');
    res.clearCookie(SESSION_COOKIE, { ...cookieOptions(config), maxAge: undefined });
    res.json({ ok: true });
  });

  return r;
}
export { sha256Hex };
