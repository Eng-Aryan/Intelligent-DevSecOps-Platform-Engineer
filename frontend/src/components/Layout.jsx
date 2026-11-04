import { useEffect, useState } from 'react'; import { NavLink, useOutlet, useLocation, useNavigate, Link } from 'react-router-dom'; import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'; import { CommandPalette } from './fx';
import { LayoutDashboard, FolderKanban, Github, Workflow, Gauge, ShieldAlert, Container, Rocket, Activity, Bot, FileText, Bell, ScrollText, Users, Plug, Settings, Search, Sun, Moon, Menu, LogOut, ChevronsLeft, Zap, ShieldCheck } from 'lucide-react';
import { useAuth } from '../auth'; import { api } from '../api'; import { useFetch, Badge } from './ui';
const NAV = [['/', 'Overview Dashboard', LayoutDashboard], ['/projects', 'Projects', FolderKanban], ['/repos', 'GitHub Repositories', Github], ['/pipelines', 'CI/CD Pipelines', Workflow], ['/quality', 'Code Quality', Gauge], ['/security', 'Security Center', ShieldAlert],
  ['/docker', 'Docker Management', Container], ['/deployments', 'Deployments', Rocket], ['/monitoring', 'Infrastructure Monitoring', Activity], ['/ai', 'AI Security Assistant', Bot], ['/reports', 'Reports & Analytics', FileText],
  ['/notifications', 'Notifications', Bell], ['/audit', 'Audit Logs', ScrollText, 'admin'], ['/team', 'Team & Access Management', Users, 'admin'], ['/integrations', 'Integrations', Plug], ['/settings', 'Settings', Settings]];
const SECT = { '/': 'Delivery', '/quality': 'Security & Quality', '/monitoring': 'Operations', '/reports': 'Insights', '/audit': 'Administration' };
export default function Layout() {
  const { user, logout, project, pick, can } = useAuth(); const nav = useNavigate(); const outlet = useOutlet(); const loc = useLocation(); const calm = useReducedMotion();
  const [collapsed, setCollapsed] = useState(false); const [mobile, setMobile] = useState(false); const [toast, setToast] = useState(null);
  const [theme, setTheme] = useState(localStorage.getItem('theme') || 'dark'); const [q, setQ] = useState(''); const [hits, setHits] = useState([]); const [bell, setBell] = useState(false); const [quick, setQuick] = useState(false);
  const projects = useFetch('/projects'); const health = useFetch('/dashboard/health'); const notes = useFetch('/notifications', { limit: 8 });
  useEffect(() => { document.documentElement.dataset.theme = theme; localStorage.setItem('theme', theme); }, [theme]);
  useEffect(() => { // live updates over Server-Sent Events
    const es = new EventSource('/api/events?token=' + localStorage.getItem('token'));
    es.addEventListener('notification', e => { const n = JSON.parse(e.data); setToast(n); notes.reload(); setTimeout(() => setToast(null), 6000); }); return () => es.close(); }, []); // eslint-disable-line
  useEffect(() => { if (q.trim().length < 2) return setHits([]); const t = setTimeout(() => api.get('/dashboard/search', { params: { q } }).then(r => setHits(r.data)).catch(() => {}), 250); return () => clearTimeout(t); }, [q]);
  const unread = notes.data?.unread || 0;
  return <div className="flex h-full">
    <aside className={`${mobile ? 'fixed z-40 inset-y-0 left-0' : 'hidden lg:flex'} ${collapsed ? 'w-[68px]' : 'w-64'} flex-col bg-panel border-r border-line transition-all`}>
      <div className="h-14 flex items-center gap-2 px-4 border-b border-line"><ShieldCheck className="text-brand shrink-0" />{!collapsed && <span className="font-semibold bg-gradient-to-r from-brand to-violet bg-clip-text text-transparent">DevSecOps Hub</span>}</div>
      <nav className="flex-1 overflow-y-auto p-2 space-y-0.5" aria-label="Main">
        {NAV.filter(n => !n[3] || can(n[3])).map(([to, label, Icon]) => <div key={to}>{SECT[to] && !collapsed && <div className="px-3 pt-4 pb-1 text-[10px] uppercase tracking-widest text-muted/70">{SECT[to]}</div>}<NavLink key={to} to={to} end={to === '/'} onClick={() => setMobile(false)} title={label}
          className={({ isActive }) => `flex items-center gap-3 px-3 py-2 rounded-lg text-sm relative ${isActive ? 'nav-active text-txt font-medium' : 'text-muted hover:bg-panel2 hover:text-txt'}`}>
          <Icon size={18} className="shrink-0" />{!collapsed && <span className="truncate">{label}</span>}
          {to === '/notifications' && unread > 0 && <span className="ml-auto bg-red-500 text-white text-[10px] rounded-full px-1.5">{unread}</span>}</NavLink></div>)}
      </nav>
      <button className="m-2 btn justify-center hidden lg:flex" onClick={() => setCollapsed(!collapsed)} aria-label="Collapse sidebar"><ChevronsLeft size={16} className={collapsed ? 'rotate-180' : ''} /></button>
    </aside>
    {mobile && <div className="fixed inset-0 bg-black/50 z-30 lg:hidden" onClick={() => setMobile(false)} />}
    <div className="flex-1 min-w-0 flex flex-col">
      <header className="h-14 border-b border-line bg-panel/80 backdrop-blur flex items-center gap-3 px-4 relative z-20">
        <button className="lg:hidden" onClick={() => setMobile(true)} aria-label="Open menu"><Menu /></button>
        <div className="relative flex-1 max-w-md"><Search size={15} className="absolute left-3 top-2.5 text-muted" /><input className="input pl-9" placeholder="Search projects, CVEs, builds…" value={q} onChange={e => setQ(e.target.value)} aria-label="Global search" />
          {hits.length > 0 && <div className="absolute mt-1 w-full card p-1 z-30">{hits.map((h, i) => <button key={i} className="w-full text-left px-3 py-2 text-sm rounded-lg hover:bg-panel2" onClick={() => { nav(h.to); setQ(''); }}><span className="text-muted text-xs mr-2">{h.kind}</span>{h.label}</button>)}</div>}</div>
        <button className="btn hidden md:inline-flex" onClick={() => window.dispatchEvent(new Event('open-palette'))} aria-label="Open command palette">Ctrl K</button>
        <select className="input w-44 hidden md:block" value={project} onChange={e => pick(e.target.value)} aria-label="Project filter"><option value="">All projects</option>{projects.data?.map(p => <option key={p._id} value={p._id}>{p.name}</option>)}</select>
        <span className="hidden md:flex items-center gap-2 text-xs" title="Integration health"><span className="dot-live" /><Badge v={health.data?.state || 'unknown'}>{health.data?.state || '…'}</Badge></span>
        {can('admin', 'devops') && <div className="relative"><button className="btn btn-primary" onClick={() => setQuick(!quick)}><Zap size={14} />Quick action</button>
          {quick && <div className="absolute right-0 mt-1 w-52 card p-1 z-30">{[['/projects?new=1', 'New project'], ['/pipelines', 'Run a pipeline'], ['/deployments', 'Request deployment'], ['/security', 'Import scan results']].map(([to, l]) => <Link key={to} to={to} onClick={() => setQuick(false)} className="block px-3 py-2 text-sm rounded-lg hover:bg-panel2">{l}</Link>)}</div>}</div>}
        <div className="relative"><button onClick={() => setBell(!bell)} className="relative" aria-label="Notifications"><Bell size={19} />{unread > 0 && <span className="absolute -top-1.5 -right-1.5 bg-red-500 text-white text-[10px] rounded-full px-1">{unread}</span>}</button>
          {bell && <div className="absolute right-0 mt-2 w-80 card p-2 z-30 max-h-96 overflow-auto">{notes.data?.items?.length ? notes.data.items.map(n => <Link key={n._id} to="/notifications" onClick={() => setBell(false)} className="block p-2 rounded-lg hover:bg-panel2 text-sm"><Badge v={n.severity} /> <span className={n.read ? 'text-muted' : ''}>{n.title}</span></Link>) : <p className="p-3 text-sm text-muted">No notifications</p>}</div>}</div>
        <button onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} aria-label="Toggle theme">{theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}</button>
        <div className="flex items-center gap-2"><div className="text-right hidden sm:block leading-tight"><div className="text-sm">{user.name}</div><div className="text-[11px] text-muted capitalize">{user.role} · Default workspace</div></div>
          <button onClick={logout} className="btn" aria-label="Log out"><LogOut size={14} /></button></div>
      </header>
      <main className="flex-1 overflow-auto"><AnimatePresence mode="wait" initial={false}><motion.div key={loc.pathname} initial={calm ? false : { opacity: 0, y: 14, filter: 'blur(6px)' }} animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }} exit={calm ? { opacity: 0 } : { opacity: 0, y: -10, filter: 'blur(4px)' }} transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}>{outlet}</motion.div></AnimatePresence></main>
    </div>
    <CommandPalette nav={NAV.filter(n => !n[3] || can(n[3]))} canCreate={can('admin', 'devops')} onTheme={() => setTheme(theme === 'dark' ? 'light' : 'dark')} onLogout={logout} />
    {toast && <div className="fixed bottom-4 right-4 card p-4 z-50 max-w-sm shadow-xl"><Badge v={toast.severity} /><div className="font-medium text-sm mt-1">{toast.title}</div><div className="text-xs text-muted">{toast.message}</div></div>}
  </div>;
}
