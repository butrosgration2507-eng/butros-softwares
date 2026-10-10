import path from 'node:path';
import cookieParser from 'cookie-parser';
import express, { type ErrorRequestHandler } from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import { ZodError } from 'zod';
import { requireAdmin } from './auth.js';
import type { Config } from './config.js';
import type { Db } from './db.js';
import { createDriveService } from './drive.js';
import { AppError } from './errors.js';
import type { GoogleGateway } from './google.js';
import { adminRouter } from './routes/admin.js';
import { authRouter } from './routes/auth.js';
import { driveRouter } from './routes/drive.js';
import { mediaRouter, publicRouter } from './routes/public.js';
import { createSeo } from './seo.js';

export function createApp(deps: { db: Db; config: Config; google: GoogleGateway }) {
  const { db, config, google } = deps;
  const drive = createDriveService({ db, google, config });
  const seo = createSeo({ db, config });
  const app = express();

  app.disable('x-powered-by');
  app.set('trust proxy', config.trustProxy);
  // No CORS headers are sent: the site and its API share one origin, so other websites cannot call the API from a browser.
  app.use(
    helmet({
      contentSecurityPolicy: {
        useDefaults: false,
        directives: {
          'default-src': ["'self'"],
          'script-src': ["'self'"],
          'style-src': ["'self'", "'unsafe-inline'"],
          'img-src': ["'self'", 'data:'],
          'font-src': ["'self'"],
          'connect-src': ["'self'", 'https://www.googleapis.com'], // browser uploads go straight to Google
          'object-src': ["'none'"],
          'base-uri': ["'self'"],
          'form-action': ["'self'"],
          'frame-ancestors': ["'none'"],
          ...(config.isProd ? { 'upgrade-insecure-requests': [] } : {}),
        },
      },
      crossOriginEmbedderPolicy: false,
      strictTransportSecurity: config.isProd,
    }),
  );
  app.use(express.json({ limit: '200kb' }));
  app.use(cookieParser());

  const apiLimiter = rateLimit({
    windowMs: 15 * 60_000,
    limit: 600,
    standardHeaders: true,
    legacyHeaders: false,
    skip: () => !config.rateLimitEnabled,
    handler: (_q, s) => s.status(429).json({ error: 'rate_limited', message: 'Too many requests. Please slow down.' }),
  });
  const downloadLimiter = rateLimit({
    windowMs: 10 * 60_000,
    limit: 40,
    skip: () => !config.rateLimitEnabled,
    handler: (_q, s) => s.status(429).json({ error: 'rate_limited', message: 'Too many download requests. Try again in a few minutes.' }),
  });

  app.use('/api', apiLimiter);
  app.use('/api/downloads', downloadLimiter);
  app.use('/api/auth', authRouter(db, config));
  app.use('/api/admin/drive', requireAdmin(db), driveRouter({ db, config, google, drive }));
  app.use('/api/admin', requireAdmin(db), adminRouter({ db, google, drive }));
  app.use('/api', publicRouter({ db, config, google, drive }));
  app.use('/api', (_req, res) => res.status(404).json({ error: 'not_found', message: 'Unknown API route.' }));
  app.use('/media', mediaRouter(db));
  app.use(seo.router);

  app.use('/assets', express.static(path.join(seo.webDist, 'assets'), { immutable: true, maxAge: '1y', fallthrough: false }));
  app.use(express.static(seo.webDist, { index: false, maxAge: '1h' }));
  app.use(async (req, res) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.status(405).json({ error: 'method_not_allowed', message: 'Method not allowed.' });
      return;
    }
    await seo.renderPage(req, res);
  });

  const onError: ErrorRequestHandler = (err, _req, res, _next) => {
    if (res.headersSent) return;
    if (err instanceof AppError) {
      res.status(err.status).json({ error: err.code, message: err.message, ...(err.details ? { details: err.details } : {}) });
      return;
    }
    if (err instanceof ZodError) {
      res.status(400).json({ error: 'validation_error', message: 'Some fields need attention.', issues: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })) });
      return;
    }
    if (err?.type === 'entity.too.large') {
      res.status(413).json({ error: 'payload_too_large', message: 'Request is too large.' });
      return;
    }
    if (err?.type === 'entity.parse.failed') {
      res.status(400).json({ error: 'bad_json', message: 'Malformed request body.' });
      return;
    }
    if (err?.name === 'MulterError') {
      res.status(413).json({ error: 'file_too_large', message: err.code === 'LIMIT_FILE_SIZE' ? 'Image is larger than 2 MB.' : 'Upload failed.' });
      return;
    }
    if (err?.code === '23505') {
      const c = String(err.constraint ?? '');
      res.status(409).json({ error: 'duplicate', message: c.includes('slug') ? 'That URL slug is already used by another listing.' : c.includes('version') ? 'That version already exists for this software.' : 'That value already exists.' });
      return;
    }
    if (err?.code === '23503') {
      res.status(409).json({ error: 'in_use', message: 'This item is referenced by other records.' });
      return;
    }
    if (err?.status === 404 && err?.code === 'ENOENT') {
      res.status(404).json({ error: 'not_found', message: 'Not found.' });
      return;
    }
    console.error('Unhandled error:', err?.message ?? err); // message only: never log request bodies or tokens
    res.status(500).json({ error: 'internal_error', message: 'Something went wrong on our side. Please try again.' });
  };
  app.use(onError);
  return app;
}
