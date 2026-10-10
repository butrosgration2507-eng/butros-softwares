import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  APP_URL: z.string().url().default('http://localhost:3000'),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  TOKEN_ENCRYPTION_KEY: z.string().min(1, 'TOKEN_ENCRYPTION_KEY is required'),
  SESSION_TTL_HOURS: z.coerce.number().positive().default(12),
  GOOGLE_CLIENT_ID: z.string().optional().default(''),
  GOOGLE_CLIENT_SECRET: z.string().optional().default(''),
  GOOGLE_REDIRECT_URI: z.string().optional().default(''),
  SITE_NAME: z.string().default('BUTROS SOFTWARES'),
  CONTACT_EMAIL: z.string().optional().default(''),
  TRUST_PROXY: z.coerce.number().int().min(0).default(1),
  RATE_LIMIT_ENABLED: z.enum(['true', 'false']).default('true'),
  WEB_DIST: z.string().optional().default(''),
  GOOGLE_SITE_VERIFICATION: z.string().optional().default(''),
});

export type Config = {
  nodeEnv: 'development' | 'test' | 'production';
  isProd: boolean;
  port: number;
  appUrl: string;
  databaseUrl: string;
  encryptionKey: Buffer;
  sessionTtlHours: number;
  googleClientId: string;
  googleClientSecret: string;
  googleRedirectUri: string;
  siteName: string;
  contactEmail: string;
  trustProxy: number;
  rateLimitEnabled: boolean;
  webDist: string;
  googleSiteVerification: string;
};

export function loadConfig(env: Record<string, string | undefined> = process.env): Config {
  const parsed = schema.safeParse(env);
  if (!parsed.success) {
    const lines = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`);
    throw new Error(`Invalid configuration:\n${lines.join('\n')}\nSee .env.example and the README.`);
  }
  const e = parsed.data;
  const key = Buffer.from(e.TOKEN_ENCRYPTION_KEY, 'base64');
  if (key.length !== 32) {
    throw new Error(
      'TOKEN_ENCRYPTION_KEY must be 32 random bytes encoded as base64. Generate one with: ' +
        `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`,
    );
  }
  const isProd = e.NODE_ENV === 'production';
  if (isProd && e.DATABASE_URL.startsWith('pglite:')) {
    throw new Error('The embedded pglite database is for local development only. Use a PostgreSQL DATABASE_URL in production.');
  }
  const appUrl = e.APP_URL.replace(/\/+$/, '');
  return {
    nodeEnv: e.NODE_ENV,
    isProd,
    port: e.PORT,
    appUrl,
    databaseUrl: e.DATABASE_URL,
    encryptionKey: key,
    sessionTtlHours: e.SESSION_TTL_HOURS,
    googleClientId: e.GOOGLE_CLIENT_ID,
    googleClientSecret: e.GOOGLE_CLIENT_SECRET,
    googleRedirectUri: e.GOOGLE_REDIRECT_URI || `${appUrl}/api/admin/drive/callback`,
    siteName: e.SITE_NAME,
    contactEmail: e.CONTACT_EMAIL,
    trustProxy: e.TRUST_PROXY,
    rateLimitEnabled: e.RATE_LIMIT_ENABLED === 'true' && e.NODE_ENV !== 'test',
    webDist: e.WEB_DIST,
    googleSiteVerification: e.GOOGLE_SITE_VERIFICATION.trim(),
  };
}
