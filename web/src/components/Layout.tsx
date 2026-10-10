import { Menu, Search, X } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { Logo } from './ui';

const nav = [{ to: '/', label: 'Home', end: true }, { to: '/catalogue', label: 'Catalogue' }, { to: '/about', label: 'About' }, { to: '/contact', label: 'Contact' }];

export function PublicLayout({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const linkCls = ({ isActive }: { isActive: boolean }) => `rounded-md px-3 py-2 text-sm font-medium transition-colors ${isActive ? 'text-accent' : 'text-muted hover:text-fg'}`;
  return (
    <div className="flex min-h-screen flex-col">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-lg focus:bg-accent-strong focus:px-4 focus:py-2 focus:text-white">Skip to content</a>
      <header className="sticky top-0 z-40 border-b border-line bg-bg/80 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
          <Link to="/" aria-label="BUTROS SOFTWARES home"><Logo /></Link>
          <nav aria-label="Main" className="hidden items-center gap-1 md:flex">
            {nav.map((n) => <NavLink key={n.to} to={n.to} end={n.end} className={linkCls}>{n.label}</NavLink>)}
          </nav>
          <form role="search" className="hidden md:block" onSubmit={(e) => { e.preventDefault(); navigate(`/catalogue?q=${encodeURIComponent(q)}`); }}>
            <label htmlFor="hdr-search" className="sr-only">Search software</label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" aria-hidden="true" />
              <input id="hdr-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search software" className="w-56 rounded-lg border border-line bg-surface py-2 pl-9 pr-3 text-sm placeholder:text-muted/60 focus:border-accent" />
            </div>
          </form>
          <button className="rounded-md p-2 text-muted hover:text-fg md:hidden" aria-label={open ? 'Close menu' : 'Open menu'} aria-expanded={open} onClick={() => setOpen(!open)}>
            {open ? <X className="size-6" /> : <Menu className="size-6" />}
          </button>
        </div>
        {open && (
          <nav aria-label="Mobile" className="border-t border-line bg-surface px-4 py-3 md:hidden">
            {nav.map((n) => <NavLink key={n.to} to={n.to} end={n.end} onClick={() => setOpen(false)} className={({ isActive }) => `block rounded-md px-3 py-3 text-base font-medium ${isActive ? 'text-accent' : 'text-fg'}`}>{n.label}</NavLink>)}
          </nav>
        )}
      </header>
      <main id="main" className="flex-1">{children}</main>
      <Footer />
    </div>
  );
}

function Footer() {
  return (
    <footer className="mt-20 border-t border-line bg-surface/40">
      <div className="mx-auto grid max-w-7xl gap-10 px-4 py-12 sm:px-6 md:grid-cols-4 lg:px-8">
        <div className="md:col-span-2">
          <Logo />
          <p className="mt-4 max-w-sm text-sm text-muted">A software discovery and download platform. Every listing is reviewed by an administrator before it is published.</p>
        </div>
        <nav aria-label="Platform">
          <h2 className="mb-3 text-sm font-semibold">Platform</h2>
          <ul className="space-y-2 text-sm text-muted">
            <li><Link className="hover:text-fg" to="/catalogue">Catalogue</Link></li>
            <li><Link className="hover:text-fg" to="/about">About</Link></li>
            <li><Link className="hover:text-fg" to="/contact">Contact</Link></li>
            <li><Link className="hover:text-fg" to="/submission-policy">Submission policy</Link></li>
          </ul>
        </nav>
        <nav aria-label="Legal">
          <h2 className="mb-3 text-sm font-semibold">Legal</h2>
          <ul className="space-y-2 text-sm text-muted">
            <li><Link className="hover:text-fg" to="/privacy">Privacy Policy</Link></li>
            <li><Link className="hover:text-fg" to="/terms">Terms of Use</Link></li>
            <li><Link className="hover:text-fg" to="/takedown">Copyright &amp; takedown</Link></li>
          </ul>
        </nav>
      </div>
      <div className="border-t border-line py-5 text-center text-xs text-muted">© {new Date().getFullYear()} BUTROS SOFTWARES. All rights reserved.</div>
    </footer>
  );
}
