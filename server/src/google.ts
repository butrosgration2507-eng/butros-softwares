import { OAuth2Client } from 'google-auth-library';
import type { Config } from './config.js';

export class GoogleAuthError extends Error {
  constructor(public kind: 'revoked' | 'not_configured' | 'oauth', message: string) {
    super(message);
  }
}
export class GoogleApiError extends Error {
  constructor(public status: number, message: string, public reason?: string) {
    super(message);
  }
}

export type DriveFileInfo = {
  id: string;
  name: string;
  mimeType: string;
  size: number | null;
  md5: string | null;
  trashed: boolean;
};
export type PublicCheck = 'available' | 'missing' | 'quota' | 'forbidden';

/** Everything the app needs from Google. Tests replace this with a mock. */
export interface GoogleGateway {
  isConfigured(): boolean;
  authUrl(state: string, loginHint?: string): string;
  exchangeCode(code: string): Promise<{ refreshToken?: string; email: string; scopes: string[] }>;
  getQuota(refreshToken: string): Promise<{ limit: number | null; usage: number | null }>;
  startResumableUpload(refreshToken: string, p: { name: string; mimeType: string; size: number; origin: string }): Promise<{ sessionUri: string }>;
  getFile(refreshToken: string, fileId: string): Promise<DriveFileInfo | null>;
  makePublic(refreshToken: string, fileId: string): Promise<void>;
  deleteFile(refreshToken: string, fileId: string): Promise<void>;
  revoke(refreshToken: string): Promise<void>;
  checkPublic(fileId: string): Promise<PublicCheck>;
  downloadUrl(fileId: string): string;
}

export const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file';
const SCOPES = [DRIVE_SCOPE, 'openid', 'email'];
const DRIVE = 'https://www.googleapis.com/drive/v3';

export function createGoogleGateway(cfg: Config): GoogleGateway {
  const client = () => new OAuth2Client(cfg.googleClientId, cfg.googleClientSecret, cfg.googleRedirectUri);
  const configured = () => Boolean(cfg.googleClientId && cfg.googleClientSecret);
  const need = () => {
    if (!configured()) throw new GoogleAuthError('not_configured', 'Google OAuth is not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.');
  };

  async function accessToken(refreshToken: string): Promise<string> {
    need();
    const c = client();
    c.setCredentials({ refresh_token: refreshToken });
    try {
      const { token } = await c.getAccessToken();
      if (!token) throw new GoogleAuthError('revoked', 'Google did not return an access token.');
      return token;
    } catch (e: any) {
      if (e instanceof GoogleAuthError) throw e;
      const msg = String(e?.response?.data?.error ?? e?.message ?? '');
      if (msg.includes('invalid_grant')) throw new GoogleAuthError('revoked', 'Google access was revoked or expired. Reauthorize this account.');
      throw new GoogleAuthError('oauth', 'Could not refresh Google access. Try again later.');
    }
  }

  async function drive(token: string, url: string, init: RequestInit = {}): Promise<Response> {
    const res = await fetch(url, { ...init, headers: { ...(init.headers as any), Authorization: `Bearer ${token}` } });
    return res;
  }

  async function apiError(res: Response): Promise<GoogleApiError> {
    let reason: string | undefined;
    let message = `Google Drive returned HTTP ${res.status}`;
    try {
      const j: any = await res.json();
      reason = j?.error?.errors?.[0]?.reason ?? j?.error?.status;
      message = j?.error?.message ?? message;
    } catch {
      /* ignore */
    }
    return new GoogleApiError(res.status, message, reason);
  }

  return {
    isConfigured: configured,

    authUrl(state, loginHint) {
      need();
      return client().generateAuthUrl({
        access_type: 'offline',
        prompt: 'consent', // guarantees a refresh token is issued
        scope: SCOPES,
        state,
        include_granted_scopes: false,
        login_hint: loginHint,
      });
    },

    async exchangeCode(code) {
      need();
      const c = client();
      let tokens;
      try {
        ({ tokens } = await c.getToken(code));
      } catch {
        throw new GoogleAuthError('oauth', 'Google rejected the authorization code. Start the connection again.');
      }
      if (!tokens.access_token) throw new GoogleAuthError('oauth', 'Google did not return an access token.');
      const info = await fetch('https://openidconnect.googleapis.com/v1/userinfo', { headers: { Authorization: `Bearer ${tokens.access_token}` } });
      if (!info.ok) throw new GoogleAuthError('oauth', 'Could not read the Google account email.');
      const profile: any = await info.json();
      if (!profile.email) throw new GoogleAuthError('oauth', 'Google did not share the account email.');
      return { refreshToken: tokens.refresh_token ?? undefined, email: String(profile.email).toLowerCase(), scopes: (tokens.scope ?? '').split(' ').filter(Boolean) };
    },

    async getQuota(refreshToken) {
      const token = await accessToken(refreshToken);
      const res = await drive(token, `${DRIVE}/about?fields=storageQuota`);
      if (!res.ok) throw await apiError(res);
      const j: any = await res.json();
      const q = j.storageQuota ?? {};
      return { limit: q.limit != null ? Number(q.limit) : null, usage: q.usage != null ? Number(q.usage) : null };
    },

    async startResumableUpload(refreshToken, p) {
      const token = await accessToken(refreshToken);
      const res = await drive(token, 'https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&fields=id', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json; charset=UTF-8',
          'X-Upload-Content-Type': p.mimeType,
          'X-Upload-Content-Length': String(p.size),
          Origin: p.origin, // lets the browser upload straight to Google (CORS)
        },
        body: JSON.stringify({ name: p.name, mimeType: p.mimeType }),
      });
      if (!res.ok) throw await apiError(res);
      const uri = res.headers.get('location');
      if (!uri) throw new GoogleApiError(502, 'Google did not return an upload session URL.');
      return { sessionUri: uri };
    },

    async getFile(refreshToken, fileId) {
      const token = await accessToken(refreshToken);
      const res = await drive(token, `${DRIVE}/files/${encodeURIComponent(fileId)}?fields=id,name,mimeType,size,md5Checksum,trashed&supportsAllDrives=false`);
      if (res.status === 404) return null;
      if (!res.ok) throw await apiError(res);
      const j: any = await res.json();
      return { id: j.id, name: j.name, mimeType: j.mimeType, size: j.size != null ? Number(j.size) : null, md5: j.md5Checksum ?? null, trashed: Boolean(j.trashed) };
    },

    async makePublic(refreshToken, fileId) {
      const token = await accessToken(refreshToken);
      const res = await drive(token, `${DRIVE}/files/${encodeURIComponent(fileId)}/permissions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: 'reader', type: 'anyone' }),
      });
      if (!res.ok) throw await apiError(res);
    },

    async deleteFile(refreshToken, fileId) {
      const token = await accessToken(refreshToken);
      const res = await drive(token, `${DRIVE}/files/${encodeURIComponent(fileId)}`, { method: 'DELETE' });
      if (!res.ok && res.status !== 404) throw await apiError(res);
    },

    async revoke(refreshToken) {
      try {
        await fetch('https://oauth2.googleapis.com/revoke', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ token: refreshToken }),
        });
      } catch {
        /* best effort */
      }
    },

    /**
     * Best-effort anonymous check, the same request a visitor's browser makes.
     * Google gives no official "is this public file downloadable" API, so this is a heuristic.
     */
    async checkPublic(fileId) {
      try {
        const res = await fetch(`https://drive.usercontent.google.com/download?id=${encodeURIComponent(fileId)}&export=download&confirm=t`, {
          method: 'GET',
          headers: { Range: 'bytes=0-0' },
          redirect: 'follow',
          signal: AbortSignal.timeout(15_000),
        });
        const ct = res.headers.get('content-type') ?? '';
        if (res.status === 404) { await res.body?.cancel(); return 'missing'; }
        if (res.status === 429) { await res.body?.cancel(); return 'quota'; }
        if (res.status === 401 || res.status === 403) { await res.body?.cancel(); return 'forbidden'; }
        if (res.ok && !ct.includes('text/html')) { await res.body?.cancel(); return 'available'; }
        const body = (await res.text()).slice(0, 20000).toLowerCase();
        if (body.includes('too many users have viewed or downloaded') || body.includes('quota exceeded')) return 'quota';
        if (body.includes('sign in') || body.includes('request access') || body.includes('you need access')) return 'forbidden';
        if (body.includes('not found') || res.status >= 400) return 'missing';
        return 'available';
      } catch {
        return 'forbidden';
      }
    },

    downloadUrl: (fileId) => `https://drive.usercontent.google.com/download?id=${encodeURIComponent(fileId)}&export=download&confirm=t`,
  };
}
