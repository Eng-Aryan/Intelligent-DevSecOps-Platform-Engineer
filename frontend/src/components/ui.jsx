import { useEffect, useState, useCallback } from 'react';
import { X, AlertTriangle, Inbox } from 'lucide-react';
import { motion } from 'framer-motion'; import { api, errMsg } from '../api'; import { Tilt } from './fx';

export function useFetch(url, params, deps = []) {
  const [state, set] = useState({ data: null, loading: true, error: null });
  const load = useCallback(() => { if (!url) return; set(s => ({ ...s, loading: true, error: null })); api.get(url, { params }).then(r => set({ data: r.data, loading: false, error: null })).catch(e => set({ data: null, loading: false, error: errMsg(e) })); }, [url, JSON.stringify(params)]); // eslint-disable-line
  useEffect(load, [load, ...deps]); return { ...state, reload: load };
}
const tone = { green: 'bg-emerald-500/15 text-emerald-400', red: 'bg-red-500/15 text-red-400', amber: 'bg-amber-500/15 text-amber-400', blue: 'bg-blue-500/15 text-blue-400', gray: 'bg-slate-500/15 text-slate-400' };
const map = { success: 'green', succeeded: 'green', healthy: 'green', ok: 'green', resolved: 'green', connected: 'green', active: 'green', up: 'green', running: 'blue', approved: 'blue', low: 'blue', queued: 'blue', info: 'blue', deploying: 'amber',
  failed: 'red', error: 'red', critical: 'red', blocked: 'red', unavailable: 'red', rejected: 'red', suspended: 'red', exited: 'red', denied: 'red', failure: 'red', high: 'amber', medium: 'amber', warning: 'amber', degraded: 'amber', pending_approval: 'amber', unstable: 'amber', acknowledged: 'amber', open: 'amber', invited: 'amber' };
export const Badge = ({ v, children }) => <span className={`px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap ${tone[map[String(v).toLowerCase()] || 'gray']}`}>{children ?? String(v).replace(/_/g, ' ')}</span>;
export const Card = ({ title, actions, children, className = '', tilt }) => { const body = <section className={`card p-4 ${tilt ? 'h-full' : ''} ${className}`}>{(title || actions) && <div className="flex items-center justify-between mb-3 gap-2"><h3 className="font-semibold text-sm">{title}</h3><div className="flex gap-2">{actions}</div></div>}{children}</section>; return tilt ? <Tilt className="rounded-2xl">{body}</Tilt> : body; };
export const Page = ({ title, subtitle, actions, children }) => <div className="p-4 lg:p-6 space-y-4 max-w-[1500px] mx-auto"><div className="flex flex-wrap items-center justify-between gap-3"><div><h1 className="text-xl font-semibold">{title}</h1>{subtitle && <p className="text-sm text-muted">{subtitle}</p>}</div><div className="flex gap-2 flex-wrap">{actions}</div></div>{children}</div>;
export const Skeleton = ({ rows = 4 }) => <div className="space-y-2">{Array.from({ length: rows }).map((_, i) => <div key={i} className="skeleton h-8" />)}</div>;
export const ErrorBox = ({ error, retry }) => <div className="flex items-center gap-3 p-3 rounded-xl bg-red-500/10 text-red-400 text-sm"><AlertTriangle size={16} /><span className="flex-1">{error}</span>{retry && <button className="btn" onClick={retry}>Retry</button>}</div>;
export const Empty = ({ text = 'Nothing to show yet.' }) => <div className="py-10 text-center text-muted text-sm"><Inbox className="mx-auto mb-2 opacity-60" />{text}</div>;
export function Async({ q, children, rows }) { if (q.loading && !q.data) return <Skeleton rows={rows} />; if (q.error) return <ErrorBox error={q.error} retry={q.reload} />; return q.data ? children(q.data) : null; }
export function Table({ cols, rows, empty, onRow }) {
  if (!rows?.length) return <Empty text={empty} />;
  return <div className="overflow-x-auto"><table><thead><tr>{cols.map(c => <th key={c.h}>{c.h}</th>)}</tr></thead><tbody>{rows.map((r, i) => <tr key={r._id || r.id || i} className={onRow ? 'cursor-pointer hover:bg-panel2' : ''} onClick={() => onRow?.(r)}>{cols.map(c => <td key={c.h}>{c.r(r)}</td>)}</tr>)}</tbody></table></div>;
}
export function Modal({ title, onClose, children, wide }) {
  useEffect(() => { const k = e => e.key === 'Escape' && onClose(); window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k); }, [onClose]);
  return <motion.div className="fixed inset-0 z-50 bg-black/60 flex items-start justify-center p-4 overflow-auto" initial={{ opacity: 0 }} animate={{ opacity: 1 }} onClick={onClose} role="dialog" aria-modal="true"><motion.div initial={{ opacity: 0, y: 24, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ type: 'spring', stiffness: 380, damping: 30 }} className={`card w-full ${wide ? 'max-w-4xl' : 'max-w-lg'} p-5 my-8`} onClick={e => e.stopPropagation()}><div className="flex justify-between mb-4"><h2 className="font-semibold">{title}</h2><button onClick={onClose} aria-label="Close"><X size={18} /></button></div>{children}</motion.div></motion.div>;
}
export const Field = ({ label, children, hint }) => <label className="block space-y-1"><span className="text-xs text-muted">{label}</span>{children}{hint && <span className="block text-xs text-muted">{hint}</span>}</label>;
export const Input = p => <input className="input" {...p} />;
export const Select = ({ children, ...p }) => <select className="input" {...p}>{children}</select>;
export function Msg({ m }) { return m ? <div className={`text-sm p-2 rounded-lg ${m.err ? 'bg-red-500/10 text-red-400' : 'bg-emerald-500/10 text-emerald-400'}`}>{m.text}</div> : null; }
export const fmtDur = ms => { if (!ms && ms !== 0) return '-'; const s = Math.round(ms / 1000); return s >= 60 ? `${Math.floor(s / 60)}m ${s % 60}s` : `${s}s`; };
export const fmtDate = d => d ? new Date(d).toLocaleString() : '-';
export const fmtBytes = b => b == null ? '-' : b > 1e9 ? (b / 1e9).toFixed(2) + ' GB' : (b / 1e6).toFixed(1) + ' MB';
export function useAction() { const [msg, setMsg] = useState(null); const [busy, setBusy] = useState(false);
  const run = async (fn, ok = 'Done') => { setBusy(true); setMsg(null); try { await fn(); setMsg({ text: ok }); return true; } catch (e) { setMsg({ err: 1, text: errMsg(e) }); return false; } finally { setBusy(false); } }; return { msg, busy, run, setMsg }; }
