import { AlertCircle, CheckCircle2, Info, Loader2, X } from 'lucide-react';
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { Link } from 'react-router-dom';

export function Logo({ src, className = '' }: { src?: string; className?: string }) {
  if (src) return <img src={src} alt="BUTROS SOFTWARES" className={`h-8 ${className}`} />;
  return (
    <span className={`inline-flex items-center gap-2 font-extrabold tracking-tight ${className}`} aria-label="BUTROS SOFTWARES">
      <span className="grid size-8 place-items-center rounded-lg bg-gradient-to-br from-accent to-accent-strong text-white shadow-lg shadow-accent/20" aria-hidden="true">B</span>
      <span className="text-lg leading-none">BUTROS<span className="text-accent"> SOFTWARES</span></span>
    </span>
  );
}

type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'danger' | 'ghost'; loading?: boolean };
const base = 'inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50';
const variants = {
  primary: 'bg-accent-strong text-white hover:bg-accent shadow-lg shadow-accent/10',
  secondary: 'border border-line bg-surface-2 text-fg hover:bg-line',
  danger: 'bg-bad/10 text-bad border border-bad/30 hover:bg-bad/20',
  ghost: 'text-muted hover:text-fg hover:bg-surface-2',
};
export const btnClass = (v: keyof typeof variants = 'primary', extra = '') => `${base} ${variants[v]} ${extra}`;
export function Button({ variant = 'primary', loading, children, className = '', disabled, ...p }: BtnProps) {
  return (
    <button {...p} disabled={disabled || loading} className={btnClass(variant, className)}>
      {loading && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
      {children}
    </button>
  );
}
export function LinkButton({ to, variant = 'primary', children, className = '' }: { to: string; variant?: keyof typeof variants; children: ReactNode; className?: string }) {
  return <Link to={to} className={btnClass(variant, className)}>{children}</Link>;
}

const field = 'w-full rounded-lg border border-line bg-bg px-3 py-2 text-sm text-fg placeholder:text-muted/60 focus:border-accent disabled:opacity-60';
export function Field({ label, hint, error, children, htmlFor }: { label: string; hint?: string; error?: string; children: ReactNode; htmlFor: string }) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="block text-sm font-medium text-fg">{label}</label>
      {children}
      {hint && !error && <p className="text-xs text-muted">{hint}</p>}
      {error && <p role="alert" className="text-xs text-bad">{error}</p>}
    </div>
  );
}
export function TextInput({ label, hint, error, id, ...p }: InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: string; error?: string; id: string }) {
  return <Field label={label} hint={hint} error={error} htmlFor={id}><input id={id} aria-invalid={!!error} className={field} {...p} /></Field>;
}
export function TextArea({ label, hint, error, id, ...p }: TextareaHTMLAttributes<HTMLTextAreaElement> & { label: string; hint?: string; error?: string; id: string }) {
  return <Field label={label} hint={hint} error={error} htmlFor={id}><textarea id={id} aria-invalid={!!error} className={`${field} min-h-24`} {...p} /></Field>;
}
export function Select({ label, hint, error, id, children, ...p }: SelectHTMLAttributes<HTMLSelectElement> & { label: string; hint?: string; error?: string; id: string }) {
  return <Field label={label} hint={hint} error={error} htmlFor={id}><select id={id} className={field} {...p}>{children}</select></Field>;
}
export const fieldClass = field;

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-2xl border border-line bg-surface ${className}`}>{children}</div>;
}
export function Badge({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'accent' | 'ok' | 'warn' | 'bad' }) {
  const t = { neutral: 'border-line bg-surface-2 text-muted', accent: 'border-accent/30 bg-accent/10 text-accent', ok: 'border-ok/30 bg-ok/10 text-ok', warn: 'border-warn/30 bg-warn/10 text-warn', bad: 'border-bad/30 bg-bad/10 text-bad' }[tone];
  return <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${t}`}>{children}</span>;
}
export function Notice({ tone = 'info', title, children }: { tone?: 'info' | 'warn' | 'bad' | 'ok'; title?: string; children: ReactNode }) {
  const t = { info: 'border-accent/30 bg-accent/5 text-fg', warn: 'border-warn/40 bg-warn/5 text-fg', bad: 'border-bad/40 bg-bad/5 text-fg', ok: 'border-ok/40 bg-ok/5 text-fg' }[tone];
  const Icon = tone === 'info' ? Info : tone === 'ok' ? CheckCircle2 : AlertCircle;
  const c = { info: 'text-accent', warn: 'text-warn', bad: 'text-bad', ok: 'text-ok' }[tone];
  return (
    <div role={tone === 'bad' ? 'alert' : 'note'} className={`flex gap-3 rounded-xl border p-4 text-sm ${t}`}>
      <Icon className={`mt-0.5 size-5 shrink-0 ${c}`} aria-hidden="true" />
      <div className="space-y-1">{title && <p className="font-semibold">{title}</p>}<div className="text-muted [&_a]:text-accent [&_a]:underline">{children}</div></div>
    </div>
  );
}
export function Spinner({ label = 'Loading' }: { label?: string }) {
  return <div role="status" className="flex items-center justify-center gap-2 py-16 text-muted"><Loader2 className="size-5 animate-spin" aria-hidden="true" />{label}…</div>;
}
export function EmptyState({ icon, title, children }: { icon?: ReactNode; title: string; children?: ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed border-line bg-surface/50 px-6 py-14 text-center">
      {icon && <div className="mx-auto mb-4 grid size-12 place-items-center rounded-xl bg-surface-2 text-muted" aria-hidden="true">{icon}</div>}
      <h3 className="text-lg font-semibold">{title}</h3>
      {children && <div className="mx-auto mt-2 max-w-md text-sm text-muted">{children}</div>}
    </div>
  );
}
export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return <div className="py-10"><Notice tone="bad" title="Something went wrong">{message}{onRetry && <div className="mt-3"><Button variant="secondary" onClick={onRetry}>Try again</Button></div>}</Notice></div>;
}

export function Pagination({ page, totalPages, onChange }: { page: number; totalPages: number; onChange: (p: number) => void }) {
  if (totalPages <= 1) return null;
  return (
    <nav aria-label="Pagination" className="mt-8 flex items-center justify-center gap-3">
      <Button variant="secondary" disabled={page <= 1} onClick={() => onChange(page - 1)}>Previous</Button>
      <span className="text-sm text-muted" aria-live="polite">Page {page} of {totalPages}</span>
      <Button variant="secondary" disabled={page >= totalPages} onClick={() => onChange(page + 1)}>Next</Button>
    </nav>
  );
}

// ---------- toasts ----------
type Toast = { id: number; tone: 'ok' | 'bad' | 'info'; text: string };
const ToastCtx = createContext<{ success: (t: string) => void; error: (t: string) => void }>({ success: () => {}, error: () => {} });
export const useToast = () => useContext(ToastCtx);
export function ToastProvider({ children }: { children: ReactNode }) {
  const [list, setList] = useState<Toast[]>([]);
  const push = useCallback((tone: Toast['tone'], text: string) => {
    const id = Date.now() + Math.random();
    setList((l) => [...l, { id, tone, text }]);
    setTimeout(() => setList((l) => l.filter((x) => x.id !== id)), tone === 'bad' ? 7000 : 3500);
  }, []);
  const value = { success: (t: string) => push('ok', t), error: (t: string) => push('bad', t) };
  return (
    <ToastCtx.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex flex-col items-center gap-2 px-4" aria-live="polite">
        {list.map((t) => (
          <div key={t.id} role={t.tone === 'bad' ? 'alert' : 'status'} className={`fade-up pointer-events-auto flex max-w-md items-start gap-3 rounded-xl border px-4 py-3 text-sm shadow-2xl ${t.tone === 'bad' ? 'border-bad/40 bg-[#2a1517] text-fg' : 'border-ok/40 bg-[#10241d] text-fg'}`}>
            {t.tone === 'bad' ? <AlertCircle className="mt-0.5 size-4 shrink-0 text-bad" aria-hidden="true" /> : <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-ok" aria-hidden="true" />}
            <span>{t.text}</span>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

// ---------- confirm dialog ----------
type ConfirmOpts = { title: string; message: ReactNode; confirmLabel?: string; danger?: boolean };
const ConfirmCtx = createContext<(o: ConfirmOpts) => Promise<boolean>>(async () => false);
export const useConfirm = () => useContext(ConfirmCtx);
export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<(ConfirmOpts & { resolve: (v: boolean) => void }) | null>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const confirm = useCallback((o: ConfirmOpts) => new Promise<boolean>((resolve) => setState({ ...o, resolve })), []);
  const close = (v: boolean) => { state?.resolve(v); setState(null); };
  useEffect(() => {
    if (!state) return;
    cancelRef.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { state.resolve(false); setState(null); } };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [state]);
  return (
    <ConfirmCtx.Provider value={confirm}>
      {children}
      {state && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) close(false); }}>
          <div role="alertdialog" aria-modal="true" aria-labelledby="cf-title" aria-describedby="cf-msg" className="fade-up w-full max-w-md rounded-2xl border border-line bg-surface p-6 shadow-2xl">
            <h2 id="cf-title" className="text-lg font-bold">{state.title}</h2>
            <div id="cf-msg" className="mt-2 text-sm text-muted">{state.message}</div>
            <div className="mt-6 flex justify-end gap-3">
              <button ref={cancelRef} className={btnClass('secondary')} onClick={() => close(false)}>Cancel</button>
              <button className={btnClass(state.danger ? 'danger' : 'primary')} onClick={() => close(true)}>{state.confirmLabel ?? 'Confirm'}</button>
            </div>
          </div>
        </div>
      )}
    </ConfirmCtx.Provider>
  );
}

export function useAsync<T>(fn: () => Promise<T>, deps: unknown[]) {
  const [state, setState] = useState<{ data?: T; error?: string; loading: boolean }>({ loading: true });
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let live = true;
    setState((s) => ({ ...s, loading: true, error: undefined }));
    fn().then((data) => live && setState({ data, loading: false })).catch((e) => live && setState({ error: e?.message ?? 'Failed to load', loading: false }));
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);
  return { ...state, reload: () => setTick((t) => t + 1) };
}

export function usePageMeta(title: string, description?: string) {
  useEffect(() => {
    document.title = title === 'BUTROS SOFTWARES' ? title : `${title} | BUTROS SOFTWARES`;
    if (description) {
      let m = document.querySelector('meta[name="description"]');
      if (!m) { m = document.createElement('meta'); m.setAttribute('name', 'description'); document.head.appendChild(m); }
      m.setAttribute('content', description.slice(0, 160));
    }
  }, [title, description]);
}
