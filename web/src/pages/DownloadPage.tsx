import { CheckCircle2, Download, XCircle } from 'lucide-react';
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ApiError, api, formatBytes } from '../api';
import { Button, Card, Notice, usePageMeta } from '../components/ui';

type Start = { url: string; fileName: string | null; sizeBytes: number | null; softwareSlug: string };

export default function DownloadPage() {
  usePageMeta('Download');
  const { fileId = '' } = useParams();
  const [state, setState] = useState<{ phase: 'idle' | 'checking' | 'ready' | 'error'; start?: Start; error?: ApiError }>({ phase: 'idle' });

  async function begin() {
    setState({ phase: 'checking' });
    try {
      const start = await api.post<Start>(`/api/downloads/${encodeURIComponent(fileId)}/start`);
      setState({ phase: 'ready', start });
      window.location.assign(start.url);
    } catch (e) {
      setState({ phase: 'error', error: e instanceof ApiError ? e : new ApiError(0, 'unknown', 'Something went wrong.') });
    }
  }
  const back = state.start?.softwareSlug ? `/software/${state.start.softwareSlug}` : '/catalogue';

  return (
    <div className="mx-auto max-w-xl px-4 py-16">
      <Card className="p-8 text-center">
        {state.phase === 'idle' && (<>
          <div className="mx-auto mb-4 grid size-14 place-items-center rounded-2xl bg-accent/10 text-accent" aria-hidden="true"><Download className="size-7" /></div>
          <h1 className="text-2xl font-bold">Ready to download</h1>
          <p className="mt-2 text-sm text-muted">We will check that the file is available, then hand you over to Google Drive to start the transfer.</p>
          <Button className="mt-6 px-8 py-3 text-base" onClick={begin}>Start download</Button>
        </>)}
        {state.phase === 'checking' && <div role="status" className="py-4"><p className="text-lg font-semibold">Checking the file…</p><p className="mt-1 text-sm text-muted">This usually takes a few seconds.</p></div>}
        {state.phase === 'ready' && state.start && (<>
          <CheckCircle2 className="mx-auto mb-3 size-10 text-ok" aria-hidden="true" />
          <h1 className="text-2xl font-bold">Your download link is ready</h1>
          <p className="mt-2 text-sm text-muted">{state.start.fileName ?? 'File'} {state.start.sizeBytes != null && `· ${formatBytes(state.start.sizeBytes)}`}</p>
          <p className="mt-4 text-sm text-muted">Your browser should start the download now. If nothing happens, use the button below. We cannot see whether Google finished the transfer.</p>
          <a href={state.start.url} className="mt-5 inline-flex rounded-lg bg-accent-strong px-6 py-2.5 text-sm font-semibold text-white hover:bg-accent">Download manually</a>
        </>)}
        {state.phase === 'error' && (<>
          <XCircle className="mx-auto mb-3 size-10 text-bad" aria-hidden="true" />
          <h1 className="text-2xl font-bold">Download unavailable</h1>
          <div className="mt-4 text-left"><Notice tone="bad">{state.error?.message}</Notice></div>
          <Button variant="secondary" className="mt-5" onClick={begin}>Try again</Button>
        </>)}
        <div className="mt-6"><Link to={back} className="text-sm text-accent hover:underline">← Back to software details</Link></div>
      </Card>
    </div>
  );
}
