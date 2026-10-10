import { HardDrive, Package } from 'lucide-react';
import { Link } from 'react-router-dom';
import { formatBytes, type Software } from '../api';
import { Badge } from './ui';

export function SoftwareCard({ s }: { s: Software }) {
  return (
    <Link to={`/software/${s.slug}`} className="group fade-up flex h-full flex-col rounded-2xl border border-line bg-surface p-5 transition hover:-translate-y-0.5 hover:border-accent/50 hover:shadow-xl hover:shadow-accent/5">
      <div className="flex items-start gap-4">
        <div className="grid size-14 shrink-0 place-items-center overflow-hidden rounded-xl border border-line bg-surface-2">
          {s.iconUrl ? <img src={s.iconUrl} alt="" loading="lazy" width={56} height={56} className="size-full object-contain" /> : <Package className="size-6 text-muted" aria-hidden="true" />}
        </div>
        <div className="min-w-0">
          <h3 className="truncate text-base font-bold group-hover:text-accent">{s.name}</h3>
          <p className="text-xs text-muted">{s.publisher || 'Unknown publisher'} · v{s.version}</p>
        </div>
      </div>
      <p className="mt-4 line-clamp-2 flex-1 text-sm text-muted">{s.shortDescription}</p>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        {s.category && <Badge tone="accent">{s.category.name}</Badge>}
        {s.operatingSystems.slice(0, 3).map((o) => <Badge key={o}>{o}</Badge>)}
        <span className="ml-auto inline-flex items-center gap-1 text-xs text-muted"><HardDrive className="size-3.5" aria-hidden="true" />{formatBytes(s.sizeBytes)}</span>
      </div>
    </Link>
  );
}

export function CardSkeletons({ n = 3 }: { n?: number }) {
  return <>{Array.from({ length: n }, (_, i) => <div key={i} className="skeleton h-52" aria-hidden="true" />)}</>;
}
