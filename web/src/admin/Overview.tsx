import { Cloud, FileText, Package, PencilLine } from 'lucide-react';
import { Link } from 'react-router-dom';
import { api, formatDateTime } from '../api';
import { Card, ErrorState, LinkButton, Notice, Spinner, useAsync, usePageMeta } from '../components/ui';

type O = {
  software: { published: number; drafts: number; archived: number };
  accounts: { connected: number; attention: number; total: number };
  files: { total: number; available: number; problems: number };
  downloads: { total: number; last30: number; note: string };
  topSoftware: { name: string; slug: string; downloads: number }[];
  recentActivity: { id: string; admin_email: string | null; action: string; entity_type: string | null; created_at: string }[];
};

export default function Overview() {
  usePageMeta('Admin overview');
  const { data: o, error, loading, reload } = useAsync(() => api.get<O>('/api/admin/overview'), []);
  if (loading) return <Spinner />;
  if (error || !o) return <ErrorState message={error ?? 'Failed to load'} onRetry={reload} />;
  const stat = (icon: React.ReactNode, label: string, value: number, sub: string) => (
    <Card className="p-5"><div className="flex items-center gap-3 text-muted">{icon}<span className="text-sm">{label}</span></div><p className="mt-3 text-3xl font-extrabold">{value}</p><p className="text-xs text-muted">{sub}</p></Card>
  );
  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-3"><h1 className="text-2xl font-bold">Overview</h1><LinkButton to="/admin/software/new">Add software</LinkButton></div>
      {o.accounts.total === 0 && <Notice tone="info" title="Connect your first Google account">Files are stored in your Google Drive accounts. <Link to="/admin/storage">Open Storage Manager</Link> to connect one.</Notice>}
      {o.accounts.attention > 0 && <Notice tone="warn" title="A Google account needs attention"><Link to="/admin/storage">Open Storage Manager</Link> to reauthorize it.</Notice>}
      {o.files.problems > 0 && <Notice tone="bad" title="Some files are reported unavailable">{o.files.problems} linked file(s) were last seen missing, limited or inaccessible. Open the software listing and run “Check”.</Notice>}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stat(<Package className="size-4" />, 'Published', o.software.published, `${o.software.archived} archived`)}
        {stat(<PencilLine className="size-4" />, 'Drafts', o.software.drafts, 'not visible to visitors')}
        {stat(<Cloud className="size-4" />, 'Google accounts', o.accounts.connected, `${o.accounts.total} total`)}
        {stat(<FileText className="size-4" />, 'Available files', o.files.available, `${o.files.total} registered`)}
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="p-5">
          <h2 className="font-bold">Downloads started</h2>
          <p className="mt-3 text-3xl font-extrabold">{o.downloads.total} <span className="text-sm font-normal text-muted">({o.downloads.last30} in the last 30 days)</span></p>
          <p className="mt-1 text-xs text-muted">{o.downloads.note}</p>
          {o.topSoftware.length > 0 && <ol className="mt-4 space-y-2 text-sm">{o.topSoftware.map((t) => <li key={t.slug} className="flex justify-between"><Link className="text-accent hover:underline" to={`/software/${t.slug}`}>{t.name}</Link><span className="text-muted">{t.downloads}</span></li>)}</ol>}
        </Card>
        <Card className="p-5">
          <div className="flex items-center justify-between"><h2 className="font-bold">Recent activity</h2><Link to="/admin/activity" className="text-sm text-accent hover:underline">All</Link></div>
          {o.recentActivity.length === 0 ? <p className="mt-4 text-sm text-muted">Nothing yet.</p> : (
            <ul className="mt-4 space-y-3 text-sm">{o.recentActivity.map((a) => <li key={a.id}><span className="font-medium">{a.action}</span> <span className="text-muted">· {a.admin_email ?? 'system'} · {formatDateTime(a.created_at)}</span></li>)}</ul>
          )}
        </Card>
      </div>
    </div>
  );
}
