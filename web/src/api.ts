export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string, public issues?: { path: string; message: string }[], public details?: unknown) {
    super(message);
  }
}
let csrf = '';
export const setCsrf = (t: string) => { csrf = t; };

async function request<T>(method: string, url: string, body?: unknown, form?: FormData): Promise<T> {
  const headers: Record<string, string> = {};
  if (method !== 'GET') headers['X-CSRF-Token'] = csrf;
  const init: RequestInit = { method, headers, credentials: 'same-origin' };
  if (form) init.body = form;
  else if (body !== undefined) { headers['Content-Type'] = 'application/json'; init.body = JSON.stringify(body); }
  let res: Response;
  try { res = await fetch(url, init); } catch { throw new ApiError(0, 'network', 'Could not reach the server. Check your internet connection and try again.'); }
  const text = await res.text();
  let data: any = null;
  try { data = text ? JSON.parse(text) : null; } catch { /* not json */ }
  if (!res.ok) {
    if (res.status === 401 && data?.error !== 'invalid_credentials') window.dispatchEvent(new Event('bs:unauthorized'));
    throw new ApiError(res.status, data?.error ?? 'error', data?.message ?? `Request failed (${res.status}).`, data?.issues, data?.details);
  }
  return data as T;
}
export const api = {
  get: <T,>(u: string) => request<T>('GET', u),
  post: <T,>(u: string, b?: unknown) => request<T>('POST', u, b ?? {}),
  put: <T,>(u: string, b?: unknown) => request<T>('PUT', u, b ?? {}),
  patch: <T,>(u: string, b?: unknown) => request<T>('PATCH', u, b ?? {}),
  del: <T,>(u: string) => request<T>('DELETE', u),
  upload: <T,>(u: string, f: FormData) => request<T>('POST', u, undefined, f),
};

export type Category = { id: string; name: string; slug: string; count?: number };
export type SoftwareFile = {
  id: string; label: string; fileName: string | null; sizeBytes: number | null; md5: string | null; sha256: string | null; operatingSystem: string | null;
  versionId: string | null; availability: string; driveAccountId?: string; driveAccountEmail?: string; driveFileId?: string; isPublic?: boolean; lastCheckedAt?: string | null;
};
export type Version = { id: string; version: string; releaseDate: string | null; changelog: string | null; isCurrent: boolean; createdAt: string };
export type Software = {
  id: string; slug: string; name: string; shortDescription: string; description: string; publisher: string | null; publisherUrl: string | null;
  category: Category | null; operatingSystems: string[]; systemRequirements: string | null; installationInstructions: string | null; version: string;
  releaseDate: string | null; sizeBytes: number | null; iconUrl: string | null; iconMediaId: string | null; screenshotUrls: string[]; screenshotMediaIds: string[];
  downloadSource: 'self' | 'publisher' | 'third_party'; downloadSourceNote: string | null; redistributionConfirmed: boolean; featured: boolean;
  status: 'draft' | 'published' | 'archived'; publishedAt: string | null; createdAt: string; updatedAt: string; downloads?: number; fileCount?: number;
  files?: SoftwareFile[]; versions?: Version[];
};
export type Paged<T> = { items: T[]; total: number; page: number; pageSize: number; totalPages: number; hasPopularity?: boolean };
export type Account = {
  id: string; email: string; friendlyName: string | null; status: 'connected' | 'needs_reauth' | 'disconnected'; isDefault: boolean;
  quotaLimitBytes: number | null; quotaUsedBytes: number | null; quotaFreeBytes: number | null; quotaCheckedAt: string | null; lastError: string | null; fileCount: number;
};
export const OS_LIST = ['Windows', 'macOS', 'Linux', 'Android', 'iOS', 'Web'] as const;

export function formatBytes(n: number | null | undefined): string {
  if (n == null) return 'Unknown';
  if (n < 1024) return `${n} B`;
  const u = ['KB', 'MB', 'GB', 'TB'];
  let v = n / 1024, i = 0;
  while (v >= 1024 && i < u.length - 1) { v /= 1024; i++; }
  return `${v >= 100 ? v.toFixed(0) : v.toFixed(1)} ${u[i]}`;
}
export function formatDate(s: string | null | undefined): string {
  if (!s) return '—';
  const d = new Date(s.length === 10 ? s + 'T00:00:00' : s);
  return isNaN(d.getTime()) ? '—' : d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}
export const formatDateTime = (s: string) => new Date(s).toLocaleString();
