import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion, animate, useInView, useMotionTemplate, useMotionValue, useReducedMotion, useSpring, useTransform } from 'framer-motion';
import { Search, CornerDownLeft, Radar as RadarIcon, Radio } from 'lucide-react';
import { api } from '../api';

/* ---------- animated counter ---------- */
export function Counter({ value, decimals = 0, suffix = '' }) {
  const n = typeof value === 'number' ? value : parseFloat(value);
  const ref = useRef(null); const seen = useInView(ref, { once: true }); const reduce = useReducedMotion(); const prev = useRef(0);
  const fmt = v => v.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals }) + suffix;
  const [txt, setTxt] = useState(Number.isFinite(n) ? fmt(0) : '');
  useEffect(() => {
    if (!Number.isFinite(n) || !seen) return;
    if (reduce) { setTxt(fmt(n)); return; }
    const c = animate(prev.current, n, { duration: 1.1, ease: [0.16, 1, 0.3, 1], onUpdate: v => setTxt(fmt(v)) }); prev.current = n; return () => c.stop();
  }, [n, seen, reduce]); // eslint-disable-line
  return <span ref={ref} className="tabular-nums">{Number.isFinite(n) ? txt : (value ?? '—')}</span>;
}

/* ---------- 3D tilt with moving glare ---------- */
export function Tilt({ children, className = '', max = 7 }) {
  const reduce = useReducedMotion(); const mx = useMotionValue(0.5); const my = useMotionValue(0.5);
  const sx = useSpring(mx, { stiffness: 220, damping: 22 }); const sy = useSpring(my, { stiffness: 220, damping: 22 });
  const rotateY = useTransform(sx, [0, 1], [-max, max]); const rotateX = useTransform(sy, [0, 1], [max, -max]);
  const gx = useTransform(sx, v => v * 100 + '%'); const gy = useTransform(sy, v => v * 100 + '%');
  const glare = useMotionTemplate`radial-gradient(220px circle at ${gx} ${gy}, rgba(255,255,255,.11), transparent 65%)`;
  if (reduce) return <div className={className}>{children}</div>;
  const move = e => { const r = e.currentTarget.getBoundingClientRect(); mx.set((e.clientX - r.left) / r.width); my.set((e.clientY - r.top) / r.height); };
  const leave = () => { mx.set(0.5); my.set(0.5); };
  return <motion.div className={`relative ${className}`} style={{ rotateX, rotateY, transformPerspective: 900, transformStyle: 'preserve-3d' }} onPointerMove={move} onPointerLeave={leave} whileHover={{ scale: 1.015 }}>
    {children}<motion.div aria-hidden className="absolute inset-0 rounded-[inherit] pointer-events-none" style={{ background: glare }} /></motion.div>;
}

/* ---------- packets travelling along a pipeline diagram ---------- */
export function Packets({ colors = ['#60a5fa', '#a78bfa', '#22d3ee'], count = 3 }) {
  const reduce = useReducedMotion(); if (reduce) return null;
  return <div aria-hidden className="absolute inset-x-3 top-1/2 h-0 pointer-events-none">
    <div className="absolute inset-x-0 h-px bg-gradient-to-r from-transparent via-[var(--line)] to-transparent" />
    {Array.from({ length: count }).map((_, i) => <motion.span key={i} className="absolute -top-[3px] w-[7px] h-[7px] rounded-full" style={{ background: colors[i % colors.length], boxShadow: `0 0 10px 2px ${colors[i % colors.length]}` }}
      animate={{ left: ['0%', '100%'], opacity: [0, 1, 1, 0], scale: [0.6, 1, 1, 0.6] }} transition={{ duration: 4.2, delay: i * (4.2 / count), repeat: Infinity, ease: 'linear' }} />)}
  </div>;
}

/* ---------- threat radar: real open findings, plotted by severity ring ---------- */
const SEV = { CRITICAL: { r: 34, c: '#ef4444' }, HIGH: { r: 66, c: '#f59e0b' }, MEDIUM: { r: 96, c: '#facc15' }, LOW: { r: 122, c: '#38bdf8' } };
export function ThreatRadar({ severity = {} }) {
  const reduce = useReducedMotion();
  const blips = useMemo(() => Object.entries(SEV).flatMap(([k, s], si) => Array.from({ length: Math.min(severity[k] || 0, 24) }, (_, i) => {
    const a = (i * 137.5 + si * 47) * Math.PI / 180, r = s.r + ((i * 7) % 11) - 5; return { k, x: 130 + r * Math.cos(a), y: 130 + r * Math.sin(a), c: s.c, d: (i * 0.37 + si * 0.2) % 3 };
  })), [JSON.stringify(severity)]); // eslint-disable-line
  const total = Object.keys(SEV).reduce((t, k) => t + (severity[k] || 0), 0);
  return <div className="flex flex-col sm:flex-row items-center gap-4">
    <svg viewBox="0 0 260 260" className="w-60 h-60 shrink-0" role="img" aria-label={`Threat radar: ${total} open findings`}>
      <defs><radialGradient id="rbg"><stop offset="0" stopColor="#3b82f6" stopOpacity=".16" /><stop offset="1" stopColor="#3b82f6" stopOpacity="0" /></radialGradient>
        <linearGradient id="rsw" x1="1" y1="0" x2="0" y2="0"><stop offset="0" stopColor="#22d3ee" stopOpacity=".55" /><stop offset="1" stopColor="#22d3ee" stopOpacity="0" /></linearGradient></defs>
      <circle cx="130" cy="130" r="128" fill="url(#rbg)" />
      {[34, 66, 96, 126].map(r => <circle key={r} cx="130" cy="130" r={r} fill="none" stroke="var(--line)" strokeWidth="1" strokeDasharray="3 4" />)}
      <path d="M130 4V256M4 130H256" stroke="var(--line)" strokeWidth="1" opacity=".6" />
      <g transform="translate(130 130)"><g>{!reduce && <animateTransform attributeName="transform" type="rotate" from="0" to="360" dur="4.5s" repeatCount="indefinite" />}
        <path d="M0 0 L126 0 A126 126 0 0 0 98 -79 Z" fill="url(#rsw)" /><line x1="0" y1="0" x2="126" y2="0" stroke="#22d3ee" strokeWidth="1.5" /></g></g>
      {blips.map((b, i) => <g key={i}><motion.circle cx={b.x} cy={b.y} r="3.4" fill={b.c} animate={reduce ? {} : { opacity: [0.35, 1, 0.35] }} transition={{ duration: 3, delay: b.d, repeat: Infinity }} />
        {b.k === 'CRITICAL' && !reduce && <motion.circle cx={b.x} cy={b.y} fill="none" stroke={b.c} strokeWidth="1" initial={{ r: 3, opacity: 0.9 }} animate={{ r: 13, opacity: 0 }} transition={{ duration: 1.8, delay: b.d, repeat: Infinity }} />}</g>)}
      <circle cx="130" cy="130" r="3" fill="#22d3ee" />
    </svg>
    <div className="text-sm space-y-2 w-full">
      <div className="text-3xl font-bold"><Counter value={total} /><span className="text-xs font-normal text-muted ml-2">open findings</span></div>
      {Object.entries(SEV).map(([k, s]) => <div key={k} className="flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full" style={{ background: s.c }} /><span className="text-muted capitalize flex-1">{k.toLowerCase()}</span><b><Counter value={severity[k] || 0} /></b></div>)}
      {!total && <p className="text-xs text-muted">Nothing open. Import a Trivy or Gitleaks scan in the Security Center to see threats here.</p>}
    </div>
  </div>;
}

/* ---------- live event stream: recent activity + real server-sent events ---------- */
const dot = s => ({ success: '#10b981', completed: '#10b981', passed: '#10b981', ok: '#10b981', failed: '#ef4444', error: '#ef4444', critical: '#ef4444', warning: '#f59e0b', failure: '#ef4444' }[String(s).toLowerCase()] || '#60a5fa');
const ago = t => { const s = Math.max(0, (Date.now() - new Date(t)) / 1000); return s < 60 ? 'just now' : s < 3600 ? Math.floor(s / 60) + 'm ago' : s < 86400 ? Math.floor(s / 3600) + 'h ago' : Math.floor(s / 86400) + 'd ago'; };
export function EventStream({ initial = [] }) {
  const [live, setLive] = useState([]); const [on, setOn] = useState(false);
  useEffect(() => {
    const es = new EventSource('/api/events?token=' + localStorage.getItem('token')); es.onopen = () => setOn(true); es.onerror = () => setOn(false);
    const add = kind => e => { const d = JSON.parse(e.data); setLive(l => [{ id: 'l' + Date.now() + Math.random(), title: d.title, status: d.severity || d.type || kind, at: new Date().toISOString(), fresh: true }, ...l].slice(0, 20)); };
    es.addEventListener('notification', add('info')); es.addEventListener('activity', add('info')); return () => es.close();
  }, []);
  const items = [...live, ...initial.map(a => ({ id: a._id, title: a.title, status: a.status || a.type, at: a.at }))].slice(0, 12);
  return <div>
    <div className="flex items-center gap-2 text-xs text-muted mb-2"><Radio size={13} className={on ? 'text-emerald-400' : ''} />{on ? 'Connected, new events appear instantly' : 'Reconnecting…'}</div>
    <ul className="space-y-1 max-h-72 overflow-hidden">
      <AnimatePresence initial={false}>{items.map(e => <motion.li key={e.id} layout initial={{ opacity: 0, x: -24, height: 0 }} animate={{ opacity: 1, x: 0, height: 'auto' }} exit={{ opacity: 0 }} transition={{ type: 'spring', stiffness: 380, damping: 32 }}
        className="flex items-center gap-3 text-sm rounded-lg px-2 py-1.5 overflow-hidden" style={e.fresh ? { background: dot(e.status) + '1f' } : undefined}>
        <span className="w-2 h-2 rounded-full shrink-0" style={{ background: dot(e.status), boxShadow: `0 0 8px ${dot(e.status)}` }} /><span className="flex-1 truncate">{e.title}</span><span className="text-xs text-muted shrink-0">{ago(e.at)}</span></motion.li>)}</AnimatePresence>
      {!items.length && <li className="text-sm text-muted py-6 text-center">No activity yet. Run a pipeline or import a scan and it shows up here.</li>}
    </ul></div>;
}

export function LiveOps({ sec, activity }) {
  const Box = ({ title, icon: I, children }) => <Tilt className="rounded-2xl"><section className="card p-4 h-full"><h3 className="font-semibold text-sm mb-3 flex items-center gap-2"><I size={15} className="text-brand" />{title}</h3>{children}</section></Tilt>;
  return <div className="grid lg:grid-cols-2 gap-4"><Box title="Threat radar" icon={RadarIcon}><ThreatRadar severity={sec?.severity} /></Box><Box title="Live event stream" icon={Radio}><EventStream initial={activity || []} /></Box></div>;
}

/* ---------- Ctrl+K command palette ---------- */
export function CommandPalette({ nav, canCreate, onTheme, onLogout }) {
  const go = useNavigate(); const [open, setOpen] = useState(false); const [q, setQ] = useState(''); const [hits, setHits] = useState([]); const [i, setI] = useState(0); const inp = useRef(null);
  useEffect(() => {
    const k = e => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setOpen(o => !o); } else if (e.key === 'Escape') setOpen(false); };
    const o = () => setOpen(true); window.addEventListener('keydown', k); window.addEventListener('open-palette', o); return () => { window.removeEventListener('keydown', k); window.removeEventListener('open-palette', o); };
  }, []);
  useEffect(() => { if (open) { setQ(''); setHits([]); setI(0); setTimeout(() => inp.current?.focus(), 30); } }, [open]);
  useEffect(() => { if (q.trim().length < 2) return setHits([]); const t = setTimeout(() => api.get('/dashboard/search', { params: { q } }).then(r => setHits(r.data)).catch(() => {}), 200); return () => clearTimeout(t); }, [q]);
  const cmds = useMemo(() => [...(canCreate ? [{ g: 'Actions', label: 'New project', run: () => go('/projects?new=1') }] : []), { g: 'Actions', label: 'Toggle light/dark theme', run: onTheme }, { g: 'Actions', label: 'Log out', run: onLogout },
    ...nav.map(([to, label]) => ({ g: 'Go to', label, run: () => go(to) })), ...hits.map(h => ({ g: 'Search results', label: `${h.kind}: ${h.label}`, run: () => go(h.to) }))], [nav, hits, canCreate]); // eslint-disable-line
  const list = cmds.filter(c => c.g === 'Search results' || c.label.toLowerCase().includes(q.trim().toLowerCase())); const sel = Math.min(i, Math.max(list.length - 1, 0));
  const exec = c => { setOpen(false); c?.run(); };
  const key = e => { if (e.key === 'ArrowDown') { e.preventDefault(); setI((sel + 1) % list.length); } else if (e.key === 'ArrowUp') { e.preventDefault(); setI((sel - 1 + list.length) % list.length); } else if (e.key === 'Enter') exec(list[sel]); };
  return <AnimatePresence>{open && <motion.div className="fixed inset-0 z-[60] bg-black/55 backdrop-blur-sm flex items-start justify-center pt-[14vh] px-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setOpen(false)} role="dialog" aria-modal="true" aria-label="Command palette">
    <motion.div className="card w-full max-w-xl overflow-hidden" initial={{ opacity: 0, y: -16, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -10, scale: 0.98 }} transition={{ type: 'spring', stiffness: 420, damping: 32 }} onClick={e => e.stopPropagation()}>
      <div className="flex items-center gap-2 px-4 border-b border-line"><Search size={16} className="text-muted" /><input ref={inp} value={q} onChange={e => { setQ(e.target.value); setI(0); }} onKeyDown={key} placeholder="Type a command or search projects, CVEs, builds…" className="flex-1 bg-transparent py-3.5 outline-none text-sm" aria-label="Command" /><kbd className="text-[10px] text-muted border border-line rounded px-1.5 py-0.5">Esc</kbd></div>
      <ul className="max-h-80 overflow-auto p-1.5">{list.map((c, n) => <li key={c.g + c.label + n}>{(n === 0 || list[n - 1].g !== c.g) && <div className="px-3 pt-2 pb-1 text-xs text-muted">{c.g}</div>}
        <button className={`w-full flex items-center justify-between text-left px-3 py-2 rounded-lg text-sm ${n === sel ? 'bg-brand/20 text-txt' : 'text-muted hover:bg-panel2'}`} onMouseEnter={() => setI(n)} onClick={() => exec(c)}>{c.label}{n === sel && <CornerDownLeft size={13} />}</button></li>)}
        {!list.length && <li className="py-8 text-center text-sm text-muted">No match for “{q}”</li>}</ul>
    </motion.div></motion.div>}</AnimatePresence>;
}
