import { ArrowLeft, ExternalLink, ImagePlus, Trash2, UploadCloud, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ApiError, OS_LIST, api, formatBytes, formatDate, type Account, type Category, type Software } from '../api';
import { Badge, Button, Card, ErrorState, Notice, Select, Spinner, TextArea, TextInput, fieldClass, useAsync, useConfirm, usePageMeta, useToast } from '../components/ui';
import { uploadResumable } from './upload';

type Form = {
  name: string; slug: string; shortDescription: string; description: string; publisher: string; publisherUrl: string; categoryId: string;
  operatingSystems: string[]; systemRequirements: string; installationInstructions: string; version: string; releaseDate: string;
  sizeValue: string; sizeUnit: 'MB' | 'GB'; iconMediaId: string | null; screenshotMediaIds: string[];
  downloadSource: 'self' | 'publisher' | 'third_party'; downloadSourceNote: string; redistributionConfirmed: boolean; featured: boolean;
};
const blank: Form = { name: '', slug: '', shortDescription: '', description: '', publisher: '', publisherUrl: '', categoryId: '', operatingSystems: [], systemRequirements: '', installationInstructions: '', version: '1.0.0', releaseDate: '', sizeValue: '', sizeUnit: 'MB', iconMediaId: null, screenshotMediaIds: [], downloadSource: 'self', downloadSourceNote: '', redistributionConfirmed: false, featured: false };
const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 100);

function fromSoftware(s: Software): Form {
  const gb = s.sizeBytes != null && s.sizeBytes >= 1024 ** 3;
  return {
    name: s.name, slug: s.slug, shortDescription: s.shortDescription, description: s.description ?? '', publisher: s.publisher ?? '', publisherUrl: s.publisherUrl ?? '', categoryId: s.category?.id ?? '',
    operatingSystems: s.operatingSystems, systemRequirements: s.systemRequirements ?? '', installationInstructions: s.installationInstructions ?? '', version: s.version, releaseDate: s.releaseDate ?? '',
    sizeValue: s.sizeBytes == null ? '' : String(+(s.sizeBytes / (gb ? 1024 ** 3 : 1024 ** 2)).toFixed(2)), sizeUnit: gb ? 'GB' : 'MB', iconMediaId: s.iconMediaId, screenshotMediaIds: s.screenshotMediaIds,
    downloadSource: s.downloadSource, downloadSourceNote: s.downloadSourceNote ?? '', redistributionConfirmed: s.redistributionConfirmed, featured: s.featured,
  };
}
function toPayload(f: Form) {
  const n = f.sizeValue.trim() === '' ? null : Math.round(Number(f.sizeValue) * (f.sizeUnit === 'GB' ? 1024 ** 3 : 1024 ** 2));
  return { ...f, sizeBytes: n != null && Number.isFinite(n) && n >= 0 ? n : null, categoryId: f.categoryId || null, releaseDate: f.releaseDate || null, sizeValue: undefined, sizeUnit: undefined };
}

export default function SoftwareEditor() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const confirm = useConfirm();
  usePageMeta(id ? 'Edit software' : 'Add software');
  const loaded = useAsync(() => (id ? api.get<Software>(`/api/admin/software/${id}`) : Promise.resolve(null)), [id]);
  const cats = useAsync(() => api.get<Category[]>('/api/admin/categories'), []);
  const [sw, setSw] = useState<Software | null>(null);
  const [form, setForm] = useState<Form>(blank);
  const [slugTouched, setSlugTouched] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [topError, setTopError] = useState<string[]>([]);
  const [busy, setBusy] = useState('');
  const [dirty, setDirty] = useState(false);

  useEffect(() => { if (loaded.data) { setSw(loaded.data); setForm(fromSoftware(loaded.data)); setSlugTouched(true); setDirty(false); } }, [loaded.data]);
  useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [dirty]);

  const set = <K extends keyof Form>(k: K, v: Form[K]) => {
    setForm((f) => { const n = { ...f, [k]: v }; if (k === 'name' && !slugTouched && !id) n.slug = slugify(String(v)); return n; });
    setDirty(true);
    setErrors((e) => { const c = { ...e }; delete c[k]; return c; });
  };

  function handleError(e: unknown, fallback: string) {
    if (e instanceof ApiError) {
      if (e.issues?.length) {
        const m: Record<string, string> = {};
        for (const i of e.issues) m[i.path] = i.message;
        setErrors(m);
        setTopError([`Please fix: ${e.issues.map((i) => i.path).join(', ')}`]);
      } else if (Array.isArray(e.details)) setTopError([e.message, ...(e.details as string[])]);
      else setTopError([e.message]);
    } else setTopError([fallback]);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function save(): Promise<Software | null> {
    setErrors({}); setTopError([]);
    if (!form.name.trim() || !form.slug.trim() || !form.shortDescription.trim()) {
      setErrors({ ...(form.name.trim() ? {} : { name: 'Required' }), ...(form.slug.trim() ? {} : { slug: 'Required' }), ...(form.shortDescription.trim() ? {} : { shortDescription: 'Required' }) });
      setTopError(['Name, URL slug and short description are required.']);
      return null;
    }
    setBusy('save');
    try {
      const saved = id ? await api.put<Software>(`/api/admin/software/${id}`, toPayload(form)) : await api.post<Software>('/api/admin/software', toPayload(form));
      setSw(saved); setForm(fromSoftware(saved)); setDirty(false);
      toast.success('Saved');
      if (!id) navigate(`/admin/software/${saved.id}`, { replace: true });
      return saved;
    } catch (e) { handleError(e, 'Could not save.'); return null; }
    finally { setBusy(''); }
  }
  async function publish() {
    const saved = dirty || !sw ? await save() : sw;
    if (!saved) return;
    setBusy('publish');
    try { const s = await api.post<Software>(`/api/admin/software/${saved.id}/publish`); setSw(s); toast.success('Published'); setTopError([]); }
    catch (e) { handleError(e, 'Could not publish.'); }
    finally { setBusy(''); }
  }
  async function unpublish() {
    if (!sw) return;
    setBusy('unpublish');
    try { setSw(await api.post<Software>(`/api/admin/software/${sw.id}/unpublish`)); toast.success('Unpublished. It is now a draft.'); } catch (e) { handleError(e, 'Failed'); } finally { setBusy(''); }
  }
  async function archive() {
    if (!sw || !(await confirm({ title: 'Archive this listing?', message: 'It will disappear from the public site. You can restore it later by publishing again.', confirmLabel: 'Archive' }))) return;
    try { await api.del(`/api/admin/software/${sw.id}?mode=archive`); toast.success('Archived'); navigate('/admin/software'); } catch (e) { handleError(e, 'Failed'); }
  }
  async function remove() {
    if (!sw || !(await confirm({ title: `Permanently delete “${sw.name}”?`, danger: true, confirmLabel: 'Delete permanently', message: 'The listing, its versions and file records are removed. This cannot be undone.' }))) return;
    const files = sw.files?.length ?? 0;
    const fromDrive = files > 0 && (await confirm({ title: 'Also delete the files from Google Drive?', danger: true, confirmLabel: 'Delete from Drive too', message: `Choose “Cancel” to keep ${files} file(s) in Drive and only remove the listing.` }));
    try { await api.del(`/api/admin/software/${sw.id}?mode=delete&deleteFromDrive=${fromDrive}`); toast.success('Deleted'); navigate('/admin/software'); } catch (e) { handleError(e, 'Failed'); }
  }

  async function uploadImage(file: File): Promise<string | null> {
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) { toast.error('Use a PNG, JPEG or WebP image.'); return null; }
    if (file.size > 2 * 1024 * 1024) { toast.error('Images must be 2 MB or smaller.'); return null; }
    const fd = new FormData(); fd.append('file', file);
    try { return (await api.upload<{ id: string }>('/api/admin/media', fd)).id; } catch (e) { toast.error(e instanceof ApiError ? e.message : 'Upload failed'); return null; }
  }

  if (id && loaded.loading && !sw) return <Spinner />;
  if (id && loaded.error) return <ErrorState message={loaded.error} onRetry={loaded.reload} />;
  const toggleOs = (o: string) => set('operatingSystems', form.operatingSystems.includes(o) ? form.operatingSystems.filter((x) => x !== o) : [...form.operatingSystems, o]);
  const status = sw?.status;

  return (
    <div className="space-y-6 pb-24">
      <div><Link to="/admin/software" className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-fg"><ArrowLeft className="size-4" aria-hidden="true" />All software</Link></div>
      <div className="flex flex-wrap items-center gap-3"><h1 className="text-2xl font-bold">{id ? form.name || 'Edit software' : 'Add software'}</h1>{status && <Badge tone={status === 'published' ? 'ok' : status === 'draft' ? 'warn' : 'neutral'}>{status}</Badge>}{status === 'published' && sw && <a className="inline-flex items-center gap-1 text-sm text-accent hover:underline" href={`/software/${sw.slug}`} target="_blank" rel="noopener noreferrer">View live <ExternalLink className="size-3.5" aria-hidden="true" /></a>}</div>
      {topError.length > 0 && <Notice tone="bad" title={topError[0]}>{topError.length > 1 && <ul className="list-disc pl-5">{topError.slice(1).map((t) => <li key={t}>{t}</li>)}</ul>}</Notice>}

      <Card className="grid gap-5 p-6 md:grid-cols-2">
        <h2 className="text-lg font-bold md:col-span-2">Basics</h2>
        <TextInput id="name" label="Software name *" value={form.name} maxLength={120} error={errors.name} onChange={(e) => set('name', e.target.value)} />
        <TextInput id="slug" label="URL slug *" value={form.slug} maxLength={100} error={errors.slug} hint="Part of the page address, e.g. /software/my-app. Changing it later breaks old links." onChange={(e) => { setSlugTouched(true); set('slug', e.target.value.toLowerCase()); }} />
        <div className="md:col-span-2"><TextInput id="short" label="Short description *" value={form.shortDescription} maxLength={300} error={errors.shortDescription} hint="One or two sentences. Shown on cards and in Google results." onChange={(e) => set('shortDescription', e.target.value)} /></div>
        <Select id="cat" label="Category" value={form.categoryId} onChange={(e) => set('categoryId', e.target.value)} hint={cats.data?.length === 0 ? 'Create categories under Settings.' : undefined}><option value="">Uncategorised</option>{cats.data?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select>
        <TextInput id="pub" label="Publisher" value={form.publisher} maxLength={120} onChange={(e) => set('publisher', e.target.value)} />
        <TextInput id="puburl" label="Official website" type="url" placeholder="https://" value={form.publisherUrl} error={errors.publisherUrl} onChange={(e) => set('publisherUrl', e.target.value)} />
        <TextInput id="ver" label="Current version" value={form.version} maxLength={40} error={errors.version} onChange={(e) => set('version', e.target.value)} />
        <TextInput id="date" label="Release date" type="date" value={form.releaseDate} error={errors.releaseDate} onChange={(e) => set('releaseDate', e.target.value)} />
        <div className="grid grid-cols-[1fr_6rem] gap-2"><TextInput id="size" label="File size (display)" type="number" min="0" step="any" value={form.sizeValue} error={errors.sizeBytes} onChange={(e) => set('sizeValue', e.target.value)} /><Select id="unit" label="Unit" value={form.sizeUnit} onChange={(e) => set('sizeUnit', e.target.value as 'MB' | 'GB')}><option>MB</option><option>GB</option></Select></div>
        <fieldset className="md:col-span-2"><legend className="mb-2 text-sm font-medium">Supported operating systems</legend><div className="flex flex-wrap gap-2">{OS_LIST.map((o) => (
          <label key={o} className={`cursor-pointer rounded-lg border px-3 py-1.5 text-sm ${form.operatingSystems.includes(o) ? 'border-accent bg-accent/10 text-accent' : 'border-line text-muted'}`}><input type="checkbox" className="sr-only" checked={form.operatingSystems.includes(o)} onChange={() => toggleOs(o)} />{o}</label>
        ))}</div></fieldset>
      </Card>

      <Card className="grid gap-5 p-6">
        <h2 className="text-lg font-bold">Content</h2>
        <TextArea id="desc" label="Full description" value={form.description} error={errors.description} className="min-h-40" onChange={(e) => set('description', e.target.value)} hint="Plain text. Line breaks are kept." />
        <TextArea id="inst" label="Installation instructions" value={form.installationInstructions} onChange={(e) => set('installationInstructions', e.target.value)} />
        <TextArea id="req" label="Minimum system requirements" value={form.systemRequirements} onChange={(e) => set('systemRequirements', e.target.value)} />
      </Card>

      <Card className="p-6">
        <h2 className="mb-4 text-lg font-bold">Images</h2>
        <div className="grid gap-6 md:grid-cols-2">
          <div><p className="mb-2 text-sm font-medium">Icon</p>
            <div className="flex items-center gap-4"><div className="grid size-20 place-items-center overflow-hidden rounded-2xl border border-line bg-surface-2">{form.iconMediaId ? <img src={`/media/${form.iconMediaId}`} alt="Current icon" className="size-full object-contain" /> : <ImagePlus className="size-6 text-muted" aria-hidden="true" />}</div>
              <div className="flex flex-col gap-2"><ImageButton label={form.iconMediaId ? 'Replace icon' : 'Upload icon'} onFile={async (f) => { const m = await uploadImage(f); if (m) set('iconMediaId', m); }} />{form.iconMediaId && <Button variant="ghost" onClick={() => set('iconMediaId', null)}>Remove</Button>}</div></div>
          </div>
          <div><p className="mb-2 text-sm font-medium">Screenshots (up to 12)</p>
            <ul className="mb-3 flex flex-wrap gap-3">{form.screenshotMediaIds.map((m) => (<li key={m} className="relative"><img src={`/media/${m}`} alt="Screenshot" className="h-20 w-32 rounded-lg border border-line object-cover" /><button aria-label="Remove screenshot" onClick={() => set('screenshotMediaIds', form.screenshotMediaIds.filter((x) => x !== m))} className="absolute -right-2 -top-2 grid size-6 place-items-center rounded-full bg-bad text-white"><X className="size-3.5" /></button></li>))}</ul>
            {form.screenshotMediaIds.length < 12 && <ImageButton label="Add screenshot" onFile={async (f) => { const m = await uploadImage(f); if (m) set('screenshotMediaIds', [...form.screenshotMediaIds, m]); }} />}
          </div>
        </div>
        <p className="mt-3 text-xs text-muted">PNG, JPEG or WebP, up to 2 MB each. Images are stored in the database, so keep them small.</p>
      </Card>

      <Card className="grid gap-5 p-6">
        <h2 className="text-lg font-bold">Distribution</h2>
        <Select id="src" label="Download source" value={form.downloadSource} onChange={(e) => set('downloadSource', e.target.value as Form['downloadSource'])} hint="Visitors see a warning for third-party sources.">
          <option value="self">My own software or software I am licensed to redistribute</option><option value="publisher">Original installer provided by its publisher</option><option value="third_party">Third-party / unofficial build</option>
        </Select>
        <TextArea id="srcnote" label="Source note (shown to visitors)" value={form.downloadSourceNote} maxLength={500} onChange={(e) => set('downloadSourceNote', e.target.value)} className="min-h-16" />
        <label className="flex items-start gap-3 text-sm"><input type="checkbox" className="mt-1 size-4 accent-blue-500" checked={form.redistributionConfirmed} onChange={(e) => set('redistributionConfirmed', e.target.checked)} /><span><strong>I confirm I am authorized to redistribute this software.</strong> <span className="text-muted">Required before publishing.</span></span></label>
        <label className="flex items-center gap-3 text-sm"><input type="checkbox" className="size-4 accent-blue-500" checked={form.featured} onChange={(e) => set('featured', e.target.checked)} />Feature on the homepage</label>
      </Card>

      {sw ? <FilesSection sw={sw} onChange={setSw} /> : <Notice tone="info" title="Files and versions">Save this listing first. Then you can upload files and add version history.</Notice>}
      {sw && <VersionsSection sw={sw} onChange={setSw} />}

      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-bg/90 backdrop-blur md:left-60">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3 px-4 py-3 sm:px-6 lg:px-8">
          <Button onClick={save} loading={busy === 'save'} variant="secondary">{id ? 'Save changes' : 'Save draft'}</Button>
          {status !== 'published' ? <Button onClick={publish} loading={busy === 'publish'}>Publish</Button> : <Button variant="secondary" onClick={unpublish} loading={busy === 'unpublish'}>Unpublish</Button>}
          {dirty && <span className="text-xs text-warn">Unsaved changes</span>}
          {sw && <div className="ml-auto flex gap-2"><Button variant="ghost" onClick={archive}>Archive</Button><Button variant="danger" onClick={remove}><Trash2 className="size-4" aria-hidden="true" />Delete</Button></div>}
        </div>
      </div>
    </div>
  );
}

function ImageButton({ label, onFile }: { label: string; onFile: (f: File) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  return (<><input ref={ref} type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" aria-label={label} onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = ''; }} /><Button variant="secondary" onClick={() => ref.current?.click()}><ImagePlus className="size-4" aria-hidden="true" />{label}</Button></>);
}

// ---------------- files ----------------
const availTone = { available: 'ok', unknown: 'neutral', missing: 'bad', quota: 'warn', forbidden: 'bad' } as const;

function FilesSection({ sw, onChange }: { sw: Software; onChange: (s: Software) => void }) {
  const toast = useToast();
  const confirm = useConfirm();
  const accounts = useAsync(() => api.get<{ accounts: Account[] }>('/api/admin/drive/accounts'), []);
  const [checking, setChecking] = useState('');
  const files = sw.files ?? [];

  async function check(fid: string) {
    setChecking(fid);
    try { await api.post(`/api/admin/files/${fid}/check`); onChange(await api.get<Software>(`/api/admin/software/${sw.id}`)); } catch (e) { toast.error(e instanceof ApiError ? e.message : 'Check failed'); } finally { setChecking(''); }
  }
  async function remove(fid: string, label: string) {
    if (!(await confirm({ title: `Remove “${label}”?`, danger: true, confirmLabel: 'Remove', message: 'The file record is removed from this listing.' }))) return;
    const del = await confirm({ title: 'Also delete it from Google Drive?', danger: true, confirmLabel: 'Delete from Drive', message: 'Choose “Cancel” to keep the file in Drive.' });
    try { onChange(await api.del<Software>(`/api/admin/files/${fid}?deleteFromDrive=${del}`)); toast.success('File removed'); } catch (e) { toast.error(e instanceof ApiError ? e.message : 'Failed'); }
  }
  const connected = accounts.data?.accounts.filter((a) => a.status === 'connected') ?? [];
  return (
    <Card className="p-6">
      <h2 className="text-lg font-bold">Downloadable files</h2>
      {files.length === 0 ? <p className="mt-2 text-sm text-muted">No files yet. Upload one below or register a file that already exists in Drive.</p> : (
        <ul className="mt-4 divide-y divide-line">{files.map((f) => (
          <li key={f.id} className="flex flex-wrap items-center gap-3 py-3 text-sm">
            <div className="min-w-0 flex-1"><p className="font-semibold">{f.label}</p><p className="truncate text-xs text-muted">{f.fileName ?? f.driveFileId} · {formatBytes(f.sizeBytes)} · {f.driveAccountEmail}</p>{f.lastCheckedAt && <p className="text-xs text-muted">Checked {formatDate(f.lastCheckedAt)}</p>}</div>
            <Badge tone={availTone[f.availability as keyof typeof availTone] ?? 'neutral'}>{f.availability}</Badge>
            {!f.isPublic && <Badge tone="warn">not public</Badge>}
            <Button variant="secondary" onClick={() => check(f.id)} loading={checking === f.id}>Check</Button>
            <button aria-label={`Remove ${f.label}`} onClick={() => remove(f.id, f.label)} className="rounded-lg p-2 text-muted hover:bg-bad/10 hover:text-bad"><Trash2 className="size-4" /></button>
          </li>
        ))}</ul>
      )}
      <div className="mt-6 border-t border-line pt-6">
        {connected.length === 0 ? <Notice tone="warn" title="No connected Google account">Connect one in <Link to="/admin/storage">Storage Manager</Link> before uploading.</Notice> : <UploadPanel sw={sw} accounts={connected} onChange={onChange} />}
      </div>
      {accounts.data && accounts.data.accounts.some((a) => a.status === 'connected') && <RegisterExisting sw={sw} accounts={connected} onChange={onChange} />}
    </Card>
  );
}

function PolicyBoxes({ rights, setRights, makePublic, setMakePublic }: { rights: boolean; setRights: (b: boolean) => void; makePublic: boolean; setMakePublic: (b: boolean) => void }) {
  return (<div className="space-y-2 text-sm">
    <label className="flex items-start gap-3"><input type="checkbox" className="mt-1 size-4 accent-blue-500" checked={rights} onChange={(e) => setRights(e.target.checked)} /><span>I am authorized to redistribute this file.</span></label>
    <label className="flex items-start gap-3"><input type="checkbox" className="mt-1 size-4 accent-blue-500" checked={makePublic} onChange={(e) => setMakePublic(e.target.checked)} /><span>Share it as “Anyone with the link can view” so visitors can download it. <span className="text-muted">Anyone with the Drive link can also copy or redistribute it.</span></span></label>
  </div>);
}

function UploadPanel({ sw, accounts, onChange }: { sw: Software; accounts: Account[]; onChange: (s: Software) => void }) {
  const toast = useToast();
  const [file, setFile] = useState<File | null>(null);
  const [accountId, setAccountId] = useState<string>('default');
  const [label, setLabel] = useState('');
  const [os, setOs] = useState('');
  const [versionId, setVersionId] = useState('');
  const [rights, setRights] = useState(false);
  const [makePublic, setMakePublic] = useState(true);
  const [phase, setPhase] = useState<'idle' | 'starting' | 'uploading' | 'registering' | 'error'>('idle');
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState('');
  const [pending, setPending] = useState<{ accountId: string; fileId: string } | null>(null);
  const [drag, setDrag] = useState(false);
  const abort = useRef<AbortController | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const def = accounts.find((a) => a.isDefault) ?? accounts[0];

  const pick = (f: File | null) => { setFile(f); setPending(null); setError(''); setPhase('idle'); if (f && !label) setLabel(f.name); };

  async function register(accId: string, fileId: string) {
    setPhase('registering');
    try {
      const s = await api.post<Software>(`/api/admin/software/${sw.id}/files`, { driveAccountId: accId, driveFileId: fileId, label: label.trim() || file?.name || 'Download', versionId: versionId || null, operatingSystem: os || null, makePublic, redistributionConfirmed: true });
      onChange(s); toast.success('File uploaded and registered');
      setFile(null); setLabel(''); setPending(null); setPhase('idle'); setProgress(0); setRights(false);
    } catch (e) {
      setPhase('error'); setPending({ accountId: accId, fileId });
      setError(`The file reached Google Drive but could not be registered: ${e instanceof ApiError ? e.message : 'unknown error'}. Click “Retry registration”; do not upload it again.`);
    }
  }

  async function start() {
    if (!file) return;
    if (!rights) { setError('Please confirm you are authorized to redistribute this file.'); setPhase('error'); return; }
    setError(''); setPhase('starting'); setProgress(0);
    const ctl = new AbortController(); abort.current = ctl;
    try {
      const init = await api.post<{ accountId: string; accountEmail: string; sessionUri: string; chunkSize: number }>('/api/admin/drive/uploads/init', { accountId: accountId === 'default' ? def.id : accountId, fileName: file.name, mimeType: file.type || 'application/octet-stream', size: file.size });
      setPhase('uploading');
      const { id } = await uploadResumable(init.sessionUri, file, init.chunkSize, (s, t) => setProgress(Math.round((s / t) * 100)), ctl.signal);
      await register(init.accountId, id);
    } catch (e) {
      if ((e as Error).name === 'AbortError') { setPhase('idle'); setProgress(0); toast.success('Upload cancelled'); return; }
      setPhase('error'); setError(e instanceof ApiError ? e.message : (e as Error).message || 'Upload failed.');
    }
  }

  const busy = phase === 'starting' || phase === 'uploading' || phase === 'registering';
  return (
    <div>
      <h3 className="mb-3 font-bold">Upload a file to Google Drive</h3>
      <div role="button" tabIndex={0} aria-label="Choose or drop a file" onClick={() => !busy && inputRef.current?.click()} onKeyDown={(e) => { if ((e.key === 'Enter' || e.key === ' ') && !busy) { e.preventDefault(); inputRef.current?.click(); } }}
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)} onDrop={(e) => { e.preventDefault(); setDrag(false); if (!busy) pick(e.dataTransfer.files?.[0] ?? null); }}
        className={`grid cursor-pointer place-items-center rounded-xl border-2 border-dashed px-4 py-8 text-center text-sm transition-colors ${drag ? 'border-accent bg-accent/5' : 'border-line hover:border-accent/50'}`}>
        <UploadCloud className="mb-2 size-7 text-muted" aria-hidden="true" />
        {file ? <p><strong>{file.name}</strong> <span className="text-muted">· {formatBytes(file.size)}</span></p> : <p className="text-muted">Drag a file here, or click to choose</p>}
        <input ref={inputRef} type="file" className="sr-only" tabIndex={-1} onChange={(e) => pick(e.target.files?.[0] ?? null)} />
      </div>
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <Select id="up-acc" label="Google account" value={accountId} onChange={(e) => setAccountId(e.target.value)} disabled={busy}>
          <option value="default">Default ({def.friendlyName || def.email})</option>
          <option value="auto">Automatic (most free space)</option>
          {accounts.map((a) => <option key={a.id} value={a.id}>{a.friendlyName || a.email}{a.quotaFreeBytes != null ? ` · ${formatBytes(a.quotaFreeBytes)} free` : ''}</option>)}
        </Select>
        <TextInput id="up-label" label="Button label" value={label} onChange={(e) => setLabel(e.target.value)} disabled={busy} placeholder="e.g. Windows installer (64-bit)" />
        <Select id="up-os" label="Operating system (optional)" value={os} onChange={(e) => setOs(e.target.value)} disabled={busy}><option value="">—</option>{OS_LIST.map((o) => <option key={o}>{o}</option>)}</Select>
        <Select id="up-ver" label="Version (optional)" value={versionId} onChange={(e) => setVersionId(e.target.value)} disabled={busy}><option value="">—</option>{sw.versions?.map((v) => <option key={v.id} value={v.id}>{v.version}</option>)}</Select>
      </div>
      <div className="mt-4"><PolicyBoxes rights={rights} setRights={setRights} makePublic={makePublic} setMakePublic={setMakePublic} /></div>
      {error && <div className="mt-4"><Notice tone="bad">{error}</Notice></div>}
      {(phase === 'uploading' || phase === 'starting') && (
        <div className="mt-4"><div className="mb-1 flex justify-between text-xs text-muted"><span>{phase === 'starting' ? 'Preparing…' : 'Uploading straight to Google Drive…'}</span><span>{progress}%</span></div>
          <div className="h-2 overflow-hidden rounded-full bg-surface-2" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100} aria-label="Upload progress"><div className="h-full rounded-full bg-accent transition-all" style={{ width: `${progress}%` }} /></div></div>
      )}
      {phase === 'registering' && <p role="status" className="mt-4 text-sm text-muted">Verifying the file with Google…</p>}
      <div className="mt-4 flex flex-wrap gap-3">
        {pending ? <Button onClick={() => register(pending.accountId, pending.fileId)} loading={phase === 'registering'}>Retry registration</Button> : <Button onClick={start} disabled={!file || busy} loading={phase === 'starting'}>Upload</Button>}
        {phase === 'uploading' && <Button variant="secondary" onClick={() => abort.current?.abort()}>Cancel upload</Button>}
        {phase === 'error' && !pending && file && <Button variant="secondary" onClick={start}>Retry upload</Button>}
      </div>
      <p className="mt-3 text-xs text-muted">Keep this tab open until the upload finishes. If the connection drops, the upload retries automatically. Google Drive allows files up to 5 TB, subject to the account's free space.</p>
    </div>
  );
}

function RegisterExisting({ sw, accounts, onChange }: { sw: Software; accounts: Account[]; onChange: (s: Software) => void }) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? '');
  const [fileRef, setFileRef] = useState('');
  const [label, setLabel] = useState('');
  const [os, setOs] = useState('');
  const [sha, setSha] = useState('');
  const [rights, setRights] = useState(false);
  const [makePublic, setMakePublic] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const extract = (s: string) => s.match(/\/d\/([\w-]{10,})/)?.[1] ?? s.match(/[?&]id=([\w-]{10,})/)?.[1] ?? s.trim();
  async function submit(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setError('');
    try {
      onChange(await api.post<Software>(`/api/admin/software/${sw.id}/files`, { driveAccountId: accountId, driveFileId: extract(fileRef), label: label.trim(), operatingSystem: os || null, sha256: sha.trim() || null, makePublic, redistributionConfirmed: rights }));
      toast.success('File registered'); setFileRef(''); setLabel(''); setSha(''); setRights(false); setOpen(false);
    } catch (err) { setError(err instanceof ApiError ? (err.issues?.[0] ? `${err.issues[0].path}: ${err.issues[0].message}` : err.message) : 'Failed'); }
    finally { setBusy(false); }
  }
  return (
    <div className="mt-6 border-t border-line pt-6">
      <button className="text-sm font-medium text-accent hover:underline" aria-expanded={open} onClick={() => setOpen(!open)}>{open ? 'Hide' : 'Register a file that already exists in Drive'}</button>
      {open && (
        <form onSubmit={submit} className="mt-4 grid gap-4 md:grid-cols-2">
          <Select id="rg-acc" label="Google account" value={accountId} onChange={(e) => setAccountId(e.target.value)}>{accounts.map((a) => <option key={a.id} value={a.id}>{a.friendlyName || a.email}</option>)}</Select>
          <TextInput id="rg-id" label="Drive file ID or share link" required value={fileRef} onChange={(e) => setFileRef(e.target.value)} placeholder="https://drive.google.com/file/d/…/view" />
          <TextInput id="rg-label" label="Button label" required value={label} onChange={(e) => setLabel(e.target.value)} />
          <Select id="rg-os" label="Operating system (optional)" value={os} onChange={(e) => setOs(e.target.value)}><option value="">—</option>{OS_LIST.map((o) => <option key={o}>{o}</option>)}</Select>
          <div className="md:col-span-2"><TextInput id="rg-sha" label="SHA-256 checksum (optional)" value={sha} onChange={(e) => setSha(e.target.value)} hint="64 hex characters. Shown to visitors so they can verify the download." /></div>
          <div className="md:col-span-2 space-y-3"><PolicyBoxes rights={rights} setRights={setRights} makePublic={makePublic} setMakePublic={setMakePublic} />
            <Notice tone="info">Because this site only requests the limited <code>drive.file</code> permission, it can manage only files it uploaded itself. A file added some other way can be registered only if it is already shared as “Anyone with the link can view”.</Notice>
            {error && <Notice tone="bad">{error}</Notice>}
            <Button type="submit" loading={busy} disabled={!rights || !fileRef.trim() || !label.trim()}>Register file</Button></div>
        </form>
      )}
    </div>
  );
}

// ---------------- versions ----------------
function VersionsSection({ sw, onChange }: { sw: Software; onChange: (s: Software) => void }) {
  const toast = useToast();
  const confirm = useConfirm();
  const [open, setOpen] = useState(false);
  const [v, setV] = useState({ version: '', releaseDate: '', changelog: '', makeCurrent: true });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function add(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setError('');
    try { onChange(await api.post<Software>(`/api/admin/software/${sw.id}/versions`, { ...v, releaseDate: v.releaseDate || null })); toast.success('Version added'); setV({ version: '', releaseDate: '', changelog: '', makeCurrent: true }); setOpen(false); }
    catch (err) { setError(err instanceof ApiError ? err.message : 'Failed'); } finally { setBusy(false); }
  }
  async function del(id: string, ver: string) {
    if (!(await confirm({ title: `Delete version ${ver}?`, danger: true, confirmLabel: 'Delete', message: 'Its changelog is removed. Files linked to it stay but lose the version link.' }))) return;
    try { onChange(await api.del<Software>(`/api/admin/software/${sw.id}/versions/${id}`)); } catch (err) { toast.error(err instanceof ApiError ? err.message : 'Failed'); }
  }
  return (
    <Card className="p-6">
      <div className="flex items-center justify-between"><h2 className="text-lg font-bold">Versions and changelog</h2><Button variant="secondary" onClick={() => setOpen(!open)}>{open ? 'Cancel' : 'Add version'}</Button></div>
      {open && (
        <form onSubmit={add} className="mt-4 grid gap-4 md:grid-cols-2">
          <TextInput id="v-ver" label="Version *" required value={v.version} onChange={(e) => setV({ ...v, version: e.target.value })} />
          <TextInput id="v-date" label="Release date" type="date" value={v.releaseDate} onChange={(e) => setV({ ...v, releaseDate: e.target.value })} />
          <div className="md:col-span-2"><TextArea id="v-log" label="Release notes" value={v.changelog} onChange={(e) => setV({ ...v, changelog: e.target.value })} /></div>
          <label className="flex items-center gap-3 text-sm md:col-span-2"><input type="checkbox" className="size-4 accent-blue-500" checked={v.makeCurrent} onChange={(e) => setV({ ...v, makeCurrent: e.target.checked })} />Make this the current version</label>
          {error && <div className="md:col-span-2"><Notice tone="bad">{error}</Notice></div>}
          <div><Button type="submit" loading={busy}>Add version</Button></div>
        </form>
      )}
      <ul className="mt-4 divide-y divide-line">{sw.versions?.map((x) => (
        <li key={x.id} className="flex items-start gap-3 py-3 text-sm"><div className="flex-1"><p className="font-semibold">v{x.version} {x.isCurrent && <Badge tone="ok">Current</Badge>} <span className="ml-1 font-normal text-muted">{formatDate(x.releaseDate)}</span></p>{x.changelog && <p className="mt-1 whitespace-pre-line text-muted">{x.changelog}</p>}</div>{!x.isCurrent && <button aria-label={`Delete version ${x.version}`} onClick={() => del(x.id, x.version)} className="rounded-lg p-2 text-muted hover:bg-bad/10 hover:text-bad"><Trash2 className="size-4" /></button>}</li>
      ))}</ul>
    </Card>
  );
}
void fieldClass;
