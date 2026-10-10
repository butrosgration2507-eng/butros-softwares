import { AlertTriangle, Calendar, Download, ExternalLink, FileCheck2, HardDrive, Package, ShieldCheck } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { ApiError, api, formatBytes, formatDate, type Software } from '../api';
import { Badge, Card, ErrorState, LinkButton, Notice, Spinner, usePageMeta, useAsync } from '../components/ui';
import NotFound from './NotFound';

export default function SoftwareDetail() {
  const { slug = '' } = useParams();
  const { data: s, error, loading, reload } = useAsync(() => api.get<Software>(`/api/software/${encodeURIComponent(slug)}`).catch((e) => { if (e instanceof ApiError && e.status === 404) return null; throw e; }), [slug]);
  usePageMeta(s ? `${s.name} ${s.version} download` : 'Software', s?.shortDescription);

  if (loading) return <Spinner />;
  if (error) return <div className="mx-auto max-w-3xl px-4"><ErrorState message={error} onRetry={reload} /></div>;
  if (!s) return <NotFound />;

  const files = s.files ?? [];
  const row = (label: string, value: string | null | undefined) => (
    <div className="flex justify-between gap-4 border-b border-line/60 py-2.5 text-sm last:border-0"><dt className="text-muted">{label}</dt><dd className="text-right font-medium">{value || '—'}</dd></div>
  );

  return (
    <article>
      <div className="border-b border-line bg-hero">
        <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
          <nav aria-label="Breadcrumb" className="mb-6 text-sm text-muted"><Link to="/catalogue" className="hover:text-fg">Catalogue</Link> <span aria-hidden="true">/</span> {s.name}</nav>
          <div className="flex flex-col gap-6 md:flex-row md:items-center">
            <div className="grid size-28 shrink-0 place-items-center overflow-hidden rounded-3xl border border-line bg-surface-2 shadow-xl">
              {s.iconUrl ? <img src={s.iconUrl} alt={`${s.name} icon`} width={112} height={112} className="size-full object-contain p-2" /> : <Package className="size-12 text-muted" aria-hidden="true" />}
            </div>
            <div className="min-w-0 flex-1">
              <div className="mb-3 flex flex-wrap gap-2">
                {s.category && <Badge tone="accent">{s.category.name}</Badge>}
                <Badge>v{s.version}</Badge>
                {s.operatingSystems.map((o) => <Badge key={o}>{o}</Badge>)}
              </div>
              <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">{s.name}</h1>
              <p className="mt-3 max-w-3xl text-lg text-muted">{s.shortDescription}</p>
              {s.publisher && <p className="mt-2 text-sm text-muted">by {s.publisher}</p>}
            </div>
          </div>
        </div>
      </div>

      <div className="mx-auto grid max-w-7xl gap-10 px-4 py-10 sm:px-6 lg:grid-cols-3 lg:px-8">
        <div className="space-y-10 lg:col-span-2">
          {(s.downloadSource === 'third_party' || s.downloadSource === 'publisher') && (
            <Notice tone="warn" title={s.downloadSource === 'third_party' ? 'Third-party download' : 'Provided by the publisher'}>
              {s.downloadSource === 'third_party' ? 'This file was not created by the software’s publisher. ' : ''}{s.downloadSourceNote || 'Verify the file against the checksum below and scan it with a trusted antivirus before running it.'}
            </Notice>
          )}

          <section aria-labelledby="dl">
            <h2 id="dl" className="mb-4 text-xl font-bold">Download</h2>
            {files.length === 0 ? <Notice tone="warn">No downloadable files are available right now.</Notice> : (
              <ul className="space-y-3">
                {files.map((f) => (
                  <li key={f.id}>
                    <Card className="p-4">
                      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                        <div className="min-w-0">
                          <p className="font-semibold">{f.label}</p>
                          <p className="mt-0.5 flex flex-wrap items-center gap-x-3 text-sm text-muted"><span className="inline-flex items-center gap-1"><HardDrive className="size-3.5" aria-hidden="true" />{formatBytes(f.sizeBytes)}</span>{f.fileName && <span className="truncate">{f.fileName}</span>}{f.operatingSystem && <span>{f.operatingSystem}</span>}</p>
                        </div>
                        <LinkButton to={`/download/${f.id}`} className="shrink-0 py-2.5"><Download className="size-4" aria-hidden="true" /> Download</LinkButton>
                      </div>
                      {(f.md5 || f.sha256) && (
                        <details className="mt-3 text-sm">
                          <summary className="inline-flex cursor-pointer items-center gap-1.5 text-muted hover:text-fg"><FileCheck2 className="size-4" aria-hidden="true" /> Verify this file</summary>
                          <dl className="mt-2 space-y-1 break-all font-mono text-xs text-muted">
                            {f.md5 && <div><dt className="inline font-sans font-semibold text-fg">MD5 (from Google Drive): </dt><dd className="inline">{f.md5}</dd></div>}
                            {f.sha256 && <div><dt className="inline font-sans font-semibold text-fg">SHA-256 (from administrator): </dt><dd className="inline">{f.sha256}</dd></div>}
                          </dl>
                        </details>
                      )}
                    </Card>
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-3 flex items-start gap-2 text-xs text-muted"><AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />Files are delivered by Google Drive. If a file has been downloaded too many times Google may pause it for about 24 hours.</p>
          </section>

          {s.screenshotUrls.length > 0 && (
            <section aria-labelledby="shots">
              <h2 id="shots" className="mb-4 text-xl font-bold">Screenshots</h2>
              <ul className="grid gap-4 sm:grid-cols-2">{s.screenshotUrls.map((u, i) => <li key={u}><a href={u} target="_blank" rel="noopener noreferrer"><img src={u} loading="lazy" alt={`${s.name} screenshot ${i + 1}`} className="aspect-video w-full rounded-xl border border-line bg-surface-2 object-cover" /></a></li>)}</ul>
            </section>
          )}

          <section aria-labelledby="ov"><h2 id="ov" className="mb-4 text-xl font-bold">Overview</h2><div className="whitespace-pre-line leading-relaxed text-muted">{s.description || s.shortDescription}</div></section>
          {s.installationInstructions && <section aria-labelledby="inst"><h2 id="inst" className="mb-4 text-xl font-bold">Installation instructions</h2><Card className="whitespace-pre-line p-5 text-sm leading-relaxed text-muted">{s.installationInstructions}</Card></section>}
          {s.versions && s.versions.some((v) => v.changelog) && (
            <section aria-labelledby="log">
              <h2 id="log" className="mb-4 text-xl font-bold">Changelog</h2>
              <ol className="space-y-5">{s.versions.filter((v) => v.changelog).map((v) => (
                <li key={v.id} className="border-l-2 border-line pl-4"><p className="font-semibold">v{v.version} {v.isCurrent && <Badge tone="ok">Current</Badge>} <span className="ml-1 text-sm font-normal text-muted">{formatDate(v.releaseDate)}</span></p><p className="mt-1 whitespace-pre-line text-sm text-muted">{v.changelog}</p></li>
              ))}</ol>
            </section>
          )}
        </div>

        <aside className="space-y-6">
          <Card className="p-5">
            <h2 className="mb-2 text-base font-bold">Details</h2>
            <dl>
              {row('Publisher', s.publisher)}{row('Version', s.version)}{row('Category', s.category?.name)}{row('Systems', s.operatingSystems.join(', '))}
              {row('File size', s.sizeBytes != null ? formatBytes(s.sizeBytes) : null)}{row('Released', s.releaseDate ? formatDate(s.releaseDate) : null)}{row('Last updated', formatDate(s.updatedAt))}
            </dl>
            {s.publisherUrl && <a href={s.publisherUrl} target="_blank" rel="noopener noreferrer" className="mt-3 inline-flex items-center gap-1.5 text-sm text-accent hover:underline"><ExternalLink className="size-4" aria-hidden="true" /> Official website</a>}
          </Card>
          {s.systemRequirements && <Card className="p-5"><h2 className="mb-2 text-base font-bold">System requirements</h2><p className="whitespace-pre-line text-sm text-muted">{s.systemRequirements}</p></Card>}
          <Card className="p-5"><div className="flex gap-3"><ShieldCheck className="size-5 shrink-0 text-accent" aria-hidden="true" /><p className="text-xs leading-relaxed text-muted">Always scan downloaded files with a trusted antivirus. Listings are reviewed by the site administrator, but this does not replace your own checks.</p></div></Card>
          <p className="flex items-center gap-2 text-xs text-muted"><Calendar className="size-3.5" aria-hidden="true" /> Listing updated {formatDate(s.updatedAt)}</p>
        </aside>
      </div>
    </article>
  );
}
