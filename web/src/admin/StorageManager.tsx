import { Cloud, Link2, RefreshCw, Star, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ApiError, api, formatBytes, formatDateTime, type Account } from '../api';
import { Badge, Button, Card, EmptyState, ErrorState, Notice, Spinner, TextInput, useAsync, useConfirm, usePageMeta, useToast } from '../components/ui';

type Resp = { configured: boolean; redirectUri: string; accounts: Account[] };

const ERRORS: Record<string, string> = {
  access_denied: 'You cancelled the Google permission screen. Nothing was connected.',
  invalid_state: 'The security check failed (the request expired or was reused). Please start the connection again.',
  missing_drive_permission: 'Google did not grant access to Drive. On the permission screen, keep the Drive checkbox ticked, then try again.',
  no_refresh_token: 'Google did not return a long-lived token. Remove “BUTROS” at myaccount.google.com/permissions for that account, then connect again.',
  oauth_failed: 'Google sign-in failed. Check your OAuth client ID, secret and redirect URL, then try again.',
  not_configured: 'Google OAuth is not configured on the server yet.',
  google_error: 'Google reported an error. Try again.',
  missing_code: 'Google did not return an authorization code. Try again.',
};

export default function StorageManager() {
  usePageMeta('Storage Manager');
  const toast = useToast();
  const confirm = useConfirm();
  const [params, setParams] = useSearchParams();
  const { data, error, loading, reload } = useAsync(() => api.get<Resp>('/api/admin/drive/accounts'), []);
  const [busy, setBusy] = useState<string>('');
  const err = params.get('error');
  const connected = params.get('connected');
  useEffect(() => { if (connected) toast.success(`Connected ${connected}`); }, [connected]); // eslint-disable-line

  async function connect(accountId?: string) {
    setBusy(accountId ?? 'new');
    try {
      const r = await api.post<{ url: string }>('/api/admin/drive/connect', accountId ? { accountId } : {});
      window.location.assign(r.url);
    } catch (e) { toast.error(e instanceof ApiError ? e.message : 'Could not start the connection.'); setBusy(''); }
  }
  async function act(id: string, fn: () => Promise<unknown>, ok: string) {
    setBusy(id);
    try { await fn(); toast.success(ok); reload(); } catch (e) { toast.error(e instanceof ApiError ? e.message : 'Failed.'); }
    finally { setBusy(''); }
  }
  async function disconnect(a: Account) {
    const yes = await confirm({ title: `Disconnect ${a.email}?`, danger: true, confirmLabel: 'Disconnect', message: a.fileCount > 0 ? `${a.fileCount} registered file(s) live in this account. Their records stay, but downloads that rely on this account's access can no longer be checked through the API. Google access will be revoked and the stored token erased.` : 'Google access will be revoked, the stored token erased and this account removed from the list.' });
    if (yes) act(a.id, () => api.del(`/api/admin/drive/accounts/${a.id}`), 'Account disconnected');
  }

  if (loading && !data) return <Spinner />;
  if (error || !data) return <ErrorState message={error ?? 'Failed'} onRetry={reload} />;
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><h1 className="text-2xl font-bold">Storage Manager</h1><p className="text-sm text-muted">Each Google account is a separate Drive with its own quota. They are managed together here but are not merged.</p></div>
        <Button onClick={() => connect()} loading={busy === 'new'} disabled={!data.configured}><Link2 className="size-4" aria-hidden="true" />Connect Google account</Button>
      </div>
      {err && <Notice tone="bad" title="Connection failed">{ERRORS[err] ?? 'Unknown error.'}<div className="mt-2"><Button variant="ghost" onClick={() => setParams({})}>Dismiss</Button></div></Notice>}
      {!data.configured && (
        <Notice tone="warn" title="Google OAuth is not set up yet">
          Add <code>GOOGLE_CLIENT_ID</code> and <code>GOOGLE_CLIENT_SECRET</code> to your environment, then restart. In Google Cloud, add this exact redirect URI: <code className="break-all">{data.redirectUri}</code>. The README has step-by-step instructions.
        </Notice>
      )}
      {data.accounts.length === 0 ? (
        <EmptyState icon={<Cloud className="size-6" />} title="No Google accounts connected">Connect up to as many accounts as you like. You will sign in on Google’s own page; this site never sees your password.</EmptyState>
      ) : (
        <div className="grid gap-5 lg:grid-cols-2">
          {data.accounts.map((a) => <AccountCard key={a.id} a={a} busy={busy === a.id} onReauth={() => connect(a.id)} onDefault={() => act(a.id, () => api.patch(`/api/admin/drive/accounts/${a.id}`, { isDefault: true }), 'Default account updated')} onRefresh={() => act(a.id, () => api.post(`/api/admin/drive/accounts/${a.id}/refresh`), 'Quota refreshed')} onRename={(n) => act(a.id, () => api.patch(`/api/admin/drive/accounts/${a.id}`, { friendlyName: n }), 'Name saved')} onDisconnect={() => disconnect(a)} />)}
        </div>
      )}
      <Notice tone="info" title="Good to know">Google Drive is not unlimited file hosting. Each account has its own storage limit and Google can temporarily limit downloads of popular files. Connecting more accounts adds storage; it does not raise per-file download limits.</Notice>
    </div>
  );
}

function AccountCard({ a, busy, onReauth, onDefault, onRefresh, onRename, onDisconnect }: { a: Account; busy: boolean; onReauth: () => void; onDefault: () => void; onRefresh: () => void; onRename: (n: string) => void; onDisconnect: () => void }) {
  const [name, setName] = useState(a.friendlyName ?? '');
  const pct = a.quotaLimitBytes && a.quotaUsedBytes != null ? Math.min(100, (a.quotaUsedBytes / a.quotaLimitBytes) * 100) : null;
  const tone = a.status === 'connected' ? 'ok' : a.status === 'needs_reauth' ? 'warn' : 'neutral';
  return (
    <Card className="flex flex-col gap-4 p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0"><p className="truncate font-semibold">{a.friendlyName || a.email}</p>{a.friendlyName && <p className="truncate text-sm text-muted">{a.email}</p>}</div>
        <div className="flex flex-wrap justify-end gap-2">{a.isDefault && <Badge tone="accent">Default</Badge>}<Badge tone={tone}>{a.status === 'needs_reauth' ? 'Needs reauthorization' : a.status === 'connected' ? 'Connected' : 'Disconnected'}</Badge></div>
      </div>
      {a.lastError && a.status !== 'connected' && <p className="text-xs text-warn">{a.lastError}</p>}
      <div>
        {pct != null ? (<>
          <div className="mb-1.5 flex justify-between text-xs text-muted"><span>{formatBytes(a.quotaUsedBytes)} used of {formatBytes(a.quotaLimitBytes)}</span><span>{formatBytes(a.quotaFreeBytes)} free</span></div>
          <div className="h-2 overflow-hidden rounded-full bg-surface-2" role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100} aria-label="Storage used"><div className={`h-full rounded-full ${pct > 90 ? 'bg-bad' : 'bg-accent'}`} style={{ width: `${pct}%` }} /></div>
        </>) : <p className="text-xs text-muted">Google did not report storage quota for this account{a.status !== 'connected' ? ' (account not connected)' : ''}.</p>}
        {a.quotaCheckedAt && <p className="mt-1 text-xs text-muted">Checked {formatDateTime(a.quotaCheckedAt)} · {a.fileCount} registered file(s)</p>}
      </div>
      <form className="flex items-end gap-2" onSubmit={(e) => { e.preventDefault(); onRename(name.trim()); }}>
        <div className="flex-1"><TextInput id={`n-${a.id}`} label="Friendly name" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} placeholder="e.g. Storage A" /></div>
        <Button type="submit" variant="secondary" disabled={busy || name.trim() === (a.friendlyName ?? '')}>Save</Button>
      </form>
      <div className="flex flex-wrap gap-2 border-t border-line pt-4">
        {a.status !== 'connected' && <Button onClick={onReauth} loading={busy}>Reauthorize</Button>}
        {a.status === 'connected' && <Button variant="secondary" onClick={onRefresh} loading={busy}><RefreshCw className="size-4" aria-hidden="true" />Refresh quota</Button>}
        {a.status === 'connected' && !a.isDefault && <Button variant="secondary" onClick={onDefault} disabled={busy}><Star className="size-4" aria-hidden="true" />Make default</Button>}
        <Button variant="danger" onClick={onDisconnect} disabled={busy} className="ml-auto"><Trash2 className="size-4" aria-hidden="true" />Disconnect</Button>
      </div>
    </Card>
  );
}
