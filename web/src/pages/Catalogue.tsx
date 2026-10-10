import { SearchX } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api, OS_LIST, type Category, type Paged, type Software } from '../api';
import { CardSkeletons, SoftwareCard } from '../components/SoftwareCard';
import { EmptyState, ErrorState, Pagination, Select, TextInput, useAsync, usePageMeta } from '../components/ui';

export default function CataloguePage() {
  usePageMeta('Software Catalogue', 'Browse and search the full BUTROS SOFTWARES catalogue by category and operating system.');
  const [params, setParams] = useSearchParams();
  const q = params.get('q') ?? '';
  const category = params.get('category') ?? '';
  const os = params.get('os') ?? '';
  const sort = params.get('sort') ?? 'newest';
  const page = Math.max(1, Number(params.get('page') ?? 1) || 1);
  const [text, setText] = useState(q);
  useEffect(() => setText(q), [q]);

  const set = (patch: Record<string, string>) => {
    const n = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) (v ? n.set(k, v) : n.delete(k));
    if (!('page' in patch)) n.delete('page');
    setParams(n, { replace: true });
  };
  useEffect(() => {
    if (text === q) return;
    const t = setTimeout(() => set({ q: text.trim() }), 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text]);

  const cats = useAsync(() => api.get<Category[]>('/api/categories'), []);
  const list = useAsync(() => {
    const u = new URLSearchParams({ sort, page: String(page), pageSize: '12' });
    if (q) u.set('q', q); if (category) u.set('category', category); if (os) u.set('os', os);
    return api.get<Paged<Software>>(`/api/software?${u}`);
  }, [q, category, os, sort, page]);
  const showPopular = list.data?.hasPopularity;

  return (
    <>
      <div className="border-b border-line bg-surface/50">
        <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
          <h1 className="text-3xl font-bold sm:text-4xl">Software Catalogue</h1>
          <form role="search" className="mt-6 grid gap-4 md:grid-cols-4" onSubmit={(e) => e.preventDefault()}>
            <TextInput id="f-q" label="Search" type="search" value={text} onChange={(e) => setText(e.target.value)} placeholder="Name or publisher" />
            <Select id="f-cat" label="Category" value={category} onChange={(e) => set({ category: e.target.value })}>
              <option value="">All categories</option>
              {cats.data?.map((c) => <option key={c.id} value={c.slug}>{c.name}</option>)}
            </Select>
            <Select id="f-os" label="Operating system" value={os} onChange={(e) => set({ os: e.target.value })}>
              <option value="">All systems</option>
              {OS_LIST.map((o) => <option key={o}>{o}</option>)}
            </Select>
            <Select id="f-sort" label="Sort by" value={sort} onChange={(e) => set({ sort: e.target.value })}>
              <option value="newest">Newest</option>
              <option value="name">Name (A–Z)</option>
              {showPopular && <option value="popular">Most downloaded</option>}
            </Select>
          </form>
        </div>
      </div>
      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        {list.error && <ErrorState message={list.error} onRetry={list.reload} />}
        {list.loading && !list.data && <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"><CardSkeletons n={8} /></div>}
        {list.data && (
          <>
            <p className="mb-5 text-sm text-muted" aria-live="polite">{list.data.total} {list.data.total === 1 ? 'result' : 'results'}</p>
            {list.data.items.length === 0 ? (
              <EmptyState icon={<SearchX className="size-6" />} title="No software found">Try a different search or clear the filters.</EmptyState>
            ) : (
              <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">{list.data.items.map((s) => <SoftwareCard key={s.id} s={s} />)}</div>
            )}
            <Pagination page={list.data.page} totalPages={list.data.totalPages} onChange={(p) => { set({ page: String(p) }); window.scrollTo({ top: 0 }); }} />
          </>
        )}
      </div>
    </>
  );
}
