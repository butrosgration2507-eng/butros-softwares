import { ArrowRight, Boxes, Search } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, type Category, type Software } from '../api';
import { CardSkeletons, SoftwareCard } from '../components/SoftwareCard';
import { Button, EmptyState, ErrorState, usePageMeta, useAsync } from '../components/ui';

type Home = { featured: Software[]; recent: Software[]; popular: Software[] };

export default function HomePage() {
  usePageMeta('BUTROS SOFTWARES', 'Discover, search and download professional software. Browse apps and utilities by category and operating system.');
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const home = useAsync(() => api.get<Home>('/api/home'), []);
  const cats = useAsync(() => api.get<Category[]>('/api/categories'), []);
  const d = home.data;
  const empty = d && !d.recent.length;

  const section = (title: string, items: Software[] | undefined, id: string, link = true) =>
    items && items.length > 0 && (
      <section aria-labelledby={id} className="mt-16">
        <div className="mb-6 flex items-end justify-between">
          <h2 id={id} className="text-2xl font-bold">{title}</h2>
          {link && <Link to="/catalogue" className="inline-flex items-center gap-1 text-sm font-medium text-accent hover:underline">View all <ArrowRight className="size-4" aria-hidden="true" /></Link>}
        </div>
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">{items.map((s) => <SoftwareCard key={s.id} s={s} />)}</div>
      </section>
    );

  return (
    <>
      <div className="bg-hero border-b border-line">
        <div className="mx-auto max-w-4xl px-4 pb-20 pt-20 text-center sm:px-6">
          <h1 className="text-4xl font-extrabold tracking-tight sm:text-6xl">Find and download <span className="bg-gradient-to-r from-blue-400 to-indigo-400 bg-clip-text text-transparent">professional software</span></h1>
          <p className="mx-auto mt-5 max-w-2xl text-lg text-muted">A curated catalogue of apps and utilities, with clear version, size and system requirement details before you download.</p>
          <form role="search" className="mx-auto mt-9 flex max-w-2xl gap-2" onSubmit={(e) => { e.preventDefault(); navigate(`/catalogue?q=${encodeURIComponent(q)}`); }}>
            <div className="relative flex-1">
              <label htmlFor="hero-search" className="sr-only">Search software</label>
              <Search className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-muted" aria-hidden="true" />
              <input id="hero-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by software name…" className="w-full rounded-xl border-2 border-line bg-surface/80 py-3.5 pl-12 pr-4 text-base placeholder:text-muted/60 focus:border-accent" />
            </div>
            <Button type="submit" className="px-6">Search</Button>
          </form>
        </div>
      </div>

      <div className="mx-auto max-w-7xl px-4 pb-4 sm:px-6 lg:px-8">
        {home.error && <ErrorState message={home.error} onRetry={home.reload} />}
        {home.loading && <div className="mt-16 grid gap-5 sm:grid-cols-2 lg:grid-cols-3"><CardSkeletons n={3} /></div>}
        {empty && <div className="mt-16"><EmptyState icon={<Boxes className="size-6" />} title="No software published yet">Check back soon. New listings appear here as soon as they are published.</EmptyState></div>}
        {section('Featured software', d?.featured, 'featured')}
        {section('Recently added', d?.recent, 'recent')}
        {section('Popular downloads', d?.popular, 'popular', false)}
        {cats.data && cats.data.some((c) => (c.count ?? 0) > 0) && (
          <section aria-labelledby="cats" className="mt-16">
            <h2 id="cats" className="mb-6 text-2xl font-bold">Browse by category</h2>
            <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {cats.data.filter((c) => (c.count ?? 0) > 0).map((c) => (
                <li key={c.id}><Link to={`/catalogue?category=${c.slug}`} className="block rounded-2xl border border-line bg-surface p-5 transition hover:border-accent/50"><span className="block font-semibold">{c.name}</span><span className="text-sm text-muted">{c.count} {c.count === 1 ? 'app' : 'apps'}</span></Link></li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </>
  );
}
