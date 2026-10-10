import { useState } from 'react';
import { api, formatDateTime, type Paged } from '../api';
import { Card, ErrorState, Pagination, Spinner, useAsync, usePageMeta } from '../components/ui';

type Row = { id: string; admin_email: string | null; action: string; entity_type: string | null; details: Record<string, unknown>; created_at: string };

export default function ActivityPage() {
  usePageMeta('Activity log');
  const [page, setPage] = useState(1);
  const { data, error, loading, reload } = useAsync(() => api.get<{ items: Row[]; total: number; page: number; pageSize: number }>(`/api/admin/audit?page=${page}`), [page]);
  if (loading && !data) return <Spinner />;
  if (error || !data) return <ErrorState message={error ?? 'Failed'} onRetry={reload} />;
  const totalPages = Math.max(1, Math.ceil(data.total / data.pageSize));
  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold">Activity log</h1>
      <Card className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead><tr className="border-b border-line text-muted"><th className="p-3 font-medium">When</th><th className="p-3 font-medium">Administrator</th><th className="p-3 font-medium">Action</th><th className="p-3 font-medium">Details</th></tr></thead>
          <tbody>{data.items.map((r) => (
            <tr key={r.id} className="border-b border-line/50 align-top"><td className="p-3 whitespace-nowrap text-muted">{formatDateTime(r.created_at)}</td><td className="p-3">{r.admin_email ?? 'system'}</td><td className="p-3 font-medium">{r.action}</td><td className="p-3 break-all text-xs text-muted">{Object.keys(r.details ?? {}).length ? JSON.stringify(r.details) : ''}</td></tr>
          ))}</tbody>
        </table>
      </Card>
      <Pagination page={page} totalPages={totalPages} onChange={setPage} />
    </div>
  );
}
