import { Activity, Cloud, LayoutDashboard, LogOut, Menu, Package, Settings as Cog, X } from 'lucide-react';
import { createContext, useContext, useEffect, useState } from 'react';
import { NavLink, Route, Routes } from 'react-router-dom';
import { ApiError, api, setCsrf } from '../api';
import { Button, Logo, Notice, Spinner, TextInput, usePageMeta } from '../components/ui';
import Activitypage from './ActivityPage';
import Overview from './Overview';
import SettingsPage from './SettingsPage';
import SoftwareEditor from './SoftwareEditor';
import SoftwareList from './SoftwareList';
import StorageManager from './StorageManager';

type User = { email: string; displayName: string | null };
const AuthCtx = createContext<{ user: User; logout: () => void } | null>(null);
export const useAuth = () => useContext(AuthCtx)!;

export default function AdminApp() {
  const [status, setStatus] = useState<'loading' | 'out' | 'in'>('loading');
  const [user, setUser] = useState<User | null>(null);
  const [notice, setNotice] = useState('');

  useEffect(() => {
    api.get<User & { csrfToken: string }>('/api/auth/me').then((u) => { setCsrf(u.csrfToken); setUser(u); setStatus('in'); }).catch(() => setStatus('out'));
    const onUnauth = () => { setNotice('Your session has expired. Please sign in again.'); setStatus('out'); };
    window.addEventListener('bs:unauthorized', onUnauth);
    return () => window.removeEventListener('bs:unauthorized', onUnauth);
  }, []);

  if (status === 'loading') return <Spinner />;
  if (status === 'out' || !user) return <Login notice={notice} onDone={(u) => { setUser(u); setNotice(''); setStatus('in'); }} />;
  const logout = async () => { await api.post('/api/auth/logout').catch(() => {}); setStatus('out'); setNotice(''); };
  return (
    <AuthCtx.Provider value={{ user, logout }}>
      <Shell />
    </AuthCtx.Provider>
  );
}

function Login({ notice, onDone }: { notice: string; onDone: (u: User) => void }) {
  usePageMeta('Administrator sign in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError('');
    try {
      const r = await api.post<User & { csrfToken: string }>('/api/auth/login', { email, password });
      setCsrf(r.csrfToken);
      onDone(r);
    } catch (err) { setError(err instanceof ApiError ? err.message : 'Sign in failed.'); }
    finally { setBusy(false); }
  }
  return (
    <div className="grid min-h-screen place-items-center bg-hero px-4">
      <form onSubmit={submit} className="fade-up w-full max-w-sm space-y-5 rounded-2xl border border-line bg-surface p-8 shadow-2xl">
        <div className="text-center"><Logo className="justify-center" /><h1 className="mt-5 text-xl font-bold">Administrator sign in</h1></div>
        {notice && <Notice tone="warn">{notice}</Notice>}
        {error && <Notice tone="bad">{error}</Notice>}
        <TextInput id="email" label="Email" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} />
        <TextInput id="password" label="Password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        <Button type="submit" loading={busy} className="w-full py-2.5">Sign in</Button>
        <p className="text-center text-xs text-muted">Administrator accounts are created by the site owner from the command line. There is no public sign-up.</p>
      </form>
    </div>
  );
}

const links = [
  { to: '/admin', label: 'Overview', icon: LayoutDashboard, end: true },
  { to: '/admin/software', label: 'Software', icon: Package },
  { to: '/admin/storage', label: 'Storage Manager', icon: Cloud },
  { to: '/admin/activity', label: 'Activity log', icon: Activity },
  { to: '/admin/settings', label: 'Settings', icon: Cog },
];

function Shell() {
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const nav = (
    <nav aria-label="Administrator" className="flex flex-col gap-1 p-3">
      {links.map(({ to, label, icon: Icon, end }) => (
        <NavLink key={to} to={to} end={end} onClick={() => setOpen(false)} className={({ isActive }) => `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium ${isActive ? 'bg-accent-strong text-white' : 'text-muted hover:bg-surface-2 hover:text-fg'}`}>
          <Icon className="size-4" aria-hidden="true" />{label}
        </NavLink>
      ))}
    </nav>
  );
  return (
    <div className="min-h-screen md:flex">
      <aside className="hidden w-60 shrink-0 border-r border-line bg-surface md:block">
        <div className="border-b border-line p-4"><Logo /><p className="mt-2 text-xs text-muted">Administrator</p></div>
        {nav}
        <div className="absolute bottom-0 w-60 border-t border-line p-3"><p className="truncate px-3 pb-2 text-xs text-muted">{user.email}</p><button onClick={logout} className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-muted hover:bg-bad/10 hover:text-bad"><LogOut className="size-4" aria-hidden="true" />Sign out</button></div>
      </aside>
      <div className="flex items-center justify-between border-b border-line bg-surface px-4 py-3 md:hidden">
        <Logo /><button aria-label={open ? 'Close menu' : 'Open menu'} aria-expanded={open} onClick={() => setOpen(!open)} className="p-2 text-muted">{open ? <X /> : <Menu />}</button>
      </div>
      {open && <div className="border-b border-line bg-surface md:hidden">{nav}<div className="border-t border-line p-3"><button onClick={logout} className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-muted"><LogOut className="size-4" />Sign out ({user.email})</button></div></div>}
      <main className="min-w-0 flex-1 p-4 sm:p-6 lg:p-8"><div className="mx-auto max-w-6xl">
        <Routes>
          <Route index element={<Overview />} />
          <Route path="software" element={<SoftwareList />} />
          <Route path="software/new" element={<SoftwareEditor />} />
          <Route path="software/:id" element={<SoftwareEditor />} />
          <Route path="storage" element={<StorageManager />} />
          <Route path="activity" element={<Activitypage />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="*" element={<Notice tone="warn">Page not found.</Notice>} />
        </Routes>
      </div></main>
    </div>
  );
}
