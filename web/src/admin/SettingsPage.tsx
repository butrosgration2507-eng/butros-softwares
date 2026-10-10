import { Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { ApiError, api, type Category } from '../api';
import { Button, Card, ErrorState, Spinner, TextInput, useAsync, useConfirm, usePageMeta, useToast } from '../components/ui';

type Settings = { siteName: string; contactEmail: string; organisationName: string; location: string };

export default function SettingsPage() {
  usePageMeta('Settings');
  const toast = useToast();
  const confirm = useConfirm();
  const settings = useAsync(() => api.get<Settings>('/api/settings'), []);
  const cats = useAsync(() => api.get<Category[]>('/api/admin/categories'), []);
  const [form, setForm] = useState({ contactEmail: '', organisationName: '', location: '' });
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  useEffect(() => { if (settings.data) setForm({ contactEmail: settings.data.contactEmail, organisationName: settings.data.organisationName, location: settings.data.location }); }, [settings.data]);

  async function save(e: React.FormEvent) {
    e.preventDefault(); setSaving(true);
    try { await api.put('/api/admin/settings', form); toast.success('Settings saved'); settings.reload(); }
    catch (err) { toast.error(err instanceof ApiError ? (err.issues?.[0]?.message ?? err.message) : 'Failed'); }
    finally { setSaving(false); }
  }
  async function addCat(e: React.FormEvent) {
    e.preventDefault();
    try { await api.post('/api/admin/categories', { name }); setName(''); cats.reload(); toast.success('Category added'); }
    catch (err) { toast.error(err instanceof ApiError ? err.message : 'Failed'); }
  }
  async function delCat(c: Category) {
    if (!(await confirm({ title: `Delete “${c.name}”?`, danger: true, confirmLabel: 'Delete', message: 'Software in this category will become uncategorised.' }))) return;
    try { await api.del(`/api/admin/categories/${c.id}`); cats.reload(); } catch (err) { toast.error(err instanceof ApiError ? err.message : 'Failed'); }
  }
  if (settings.loading && !settings.data) return <Spinner />;
  if (settings.error) return <ErrorState message={settings.error} onRetry={settings.reload} />;
  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-bold">Settings</h1>
      <Card className="p-6">
        <h2 className="font-bold">Business details</h2>
        <p className="mb-4 text-sm text-muted">Shown on the About, Contact and policy pages. Fill these in before launch.</p>
        <form onSubmit={save} className="grid max-w-xl gap-4">
          <TextInput id="st-org" label="Organisation / owner name" value={form.organisationName} onChange={(e) => setForm({ ...form, organisationName: e.target.value })} />
          <TextInput id="st-mail" label="Public contact email" type="email" value={form.contactEmail} onChange={(e) => setForm({ ...form, contactEmail: e.target.value })} hint="Used for support, submissions and copyright notices." />
          <TextInput id="st-loc" label="Location (optional)" value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} />
          <div><Button type="submit" loading={saving}>Save settings</Button></div>
        </form>
      </Card>
      <Card className="p-6">
        <h2 className="mb-4 font-bold">Categories</h2>
        <form onSubmit={addCat} className="mb-5 flex max-w-md items-end gap-2"><div className="flex-1"><TextInput id="cat-name" label="New category" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} placeholder="e.g. Developer Tools" /></div><Button type="submit" disabled={!name.trim()}>Add</Button></form>
        {cats.data && cats.data.length === 0 && <p className="text-sm text-muted">No categories yet.</p>}
        <ul className="divide-y divide-line">{cats.data?.map((c) => (
          <li key={c.id} className="flex items-center justify-between py-2.5 text-sm"><span>{c.name} <span className="text-muted">· {c.count} listing(s)</span></span><button aria-label={`Delete ${c.name}`} onClick={() => delCat(c)} className="rounded-lg p-2 text-muted hover:bg-bad/10 hover:text-bad"><Trash2 className="size-4" /></button></li>
        ))}</ul>
      </Card>
    </div>
  );
}
