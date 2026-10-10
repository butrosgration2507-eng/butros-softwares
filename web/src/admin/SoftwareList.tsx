import { Pencil, Plus, Search } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, formatDate, type Paged, type Software } from '../api';
import { Badge, Card, EmptyState, ErrorState, LinkButton, Pagination, Select, Spinner, TextInput, useAsync, usePageMeta } from '../components/ui';

export default function SoftwareList() {
  usePageMeta('Manage software');
  const [q, setQ] = useState('');
  const [debounced, setDebounced] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  useEffect(() => { const t = setTimeout(() => { setDebounced(q); setPage(1); }, 300); return () => clearTimeout(t); }, [q]);
  const { data, error, loading, reload } = useAsync(() => {
    const u = new URLSearchParams({ page: String(page), pageSize: '20' });
    if (debounced) u.set('q', debounced); if (status) u.set('status', status);
    return api.get<Paged<Software>>(`/api/admin/software?${u}`);
  }, [debounced, status, page]);
  const tone = { published: 'ok', draft: 'warn', archived: 'neutral' } as const;
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3"><h1 className="text-2xl font-bold">Software</h1><LinkButton to="/admin/software/new"><Plus className="size-4" aria-hidden="true" />Add software</LinkButton></div>
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="sm:col-span-2"><TextInput id="s-q" label="Search" placeholder="Name or slug" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        <Select id="s-st" label="Status" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}><option value="">All</option><option value="published">Published</option><option value="draft">Draft</option><option value="archived">Archived</option></Select>
      </div>
      {error && <ErrorState message={error} onRetry={reload} />}
      {loading && !data && <Spinner />}
      {data && (data.items.length === 0 ? (
        <EmptyState icon={<Search className="size-6" />} title="No software yet">Add your first listing, then attach a file and publish it.</EmptyState>
      ) : (
        <Card className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead><tr className="border-b border-line text-muted"><th className="p-3 font-medium">Name</th><th className="p-3 font-medium">Version</th><th className="p-3 font-medium">Status</th><th className="p-3 font-medium">Files</th><th className="p-3 font-medium">Updated</th><th className="p-3"><span className="sr-only">Actions</span></th></tr></thead>
            <tbody>{data.items.map((s) => (
              <tr key={s.id} className="border-b border-line/50 hover:bg-surface-2/50">
                <td className="p-3"><Link to={`/admin/software/${s.id}`} className="font-semibold hover:text-accent">{s.name}</Link><div className="text-xs text-muted">/{s.slug}</div></td>
                <td className="p-3 text-muted">{s.version}</td>
                <td className="p-3"><Badge tone={tone[s.status]}>{s.status}</Badge></td>
                <td className="p-3 text-muted">{s.fileCount ?? 0}</td>
                <td className="p-3 text-muted">{formatDate(s.updatedAt)}</td>
                <td className="p-3 text-right"><Link to={`/admin/software/${s.id}`} aria-label={`Edit ${s.name}`} className="inline-flex rounded-lg p-2 text-muted hover:bg-surface-2 hover:text-fg"><Pencil className="size-4" /></Link></td>
              </tr>
            ))}</tbody>
          </table>
        </Card>
      ))}
      {data && <Pagination page={data.page} totalPages={data.totalPages} onChange={setPage} />}
    </div>
  );
}
