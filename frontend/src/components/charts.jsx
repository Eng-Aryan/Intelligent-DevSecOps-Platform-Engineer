import { Packets, Counter, Tilt } from './fx';
import { CheckCircle2, XCircle, Loader2, Circle, MinusCircle, ArrowRight } from 'lucide-react';

export function Donut({ data, size = 170, thickness = 18, center, sub }) {
  const total = data.reduce((a, d) => a + d.value, 0), r = (size - thickness) / 2, c = 2 * Math.PI * r; let off = 0;
  return <div className="relative inline-block" style={{ width: size, height: size }}>
    <svg width={size} height={size} className="-rotate-90"><circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--line)" strokeWidth={thickness} />
      {total > 0 && data.map((d, i) => { const len = (d.value / total) * c; const el = <circle key={i} cx={size / 2} cy={size / 2} r={r} fill="none" stroke={d.color} strokeWidth={thickness} strokeDasharray={`${Math.max(len - 2, 0)} ${c}`} strokeDashoffset={-off} strokeLinecap="round" style={{ transition: 'all .6s' }} />; off += len; return el; })}</svg>
    <div className="absolute inset-0 flex flex-col items-center justify-center"><div className="text-2xl font-bold">{center ?? total}</div><div className="text-[11px] text-muted">{sub}</div></div></div>;
}
export function Legend({ data }) { return <div className="space-y-1.5 text-sm">{data.map(d => <div key={d.label} className="flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full" style={{ background: d.color }} /><span className="flex-1 text-muted">{d.label}</span><b>{d.value}</b></div>)}</div>; }

export function Spark({ values = [], color = '#3b82f6', w = 90, h = 28 }) {
  const v = values.filter(x => x != null); if (v.length < 2) return <div style={{ width: w, height: h }} />;
  const mx = Math.max(...v), mn = Math.min(...v), rg = mx - mn || 1; const pts = v.map((x, i) => `${(i / (v.length - 1)) * w},${h - 3 - ((x - mn) / rg) * (h - 6)}`).join(' ');
  return <svg width={w} height={h}><defs><linearGradient id={'g' + color.slice(1)} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={color} stopOpacity=".35" /><stop offset="1" stopColor={color} stopOpacity="0" /></linearGradient></defs>
    <polygon points={`0,${h} ${pts} ${w},${h}`} fill={`url(#g${color.slice(1)})`} /><polyline points={pts} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" /></svg>;
}
export function Ring({ value, max = 100, color = '#10b981', size = 84, label, unit = '%' }) {
  const r = 34, c = 2 * Math.PI * r, p = value == null ? 0 : Math.min(value / max, 1);
  return <div className="flex flex-col items-center"><div className="relative" style={{ width: size, height: size }}><svg viewBox="0 0 80 80" width={size} height={size} className="-rotate-90"><circle cx="40" cy="40" r={r} fill="none" stroke="var(--line)" strokeWidth="7" /><circle cx="40" cy="40" r={r} fill="none" stroke={color} strokeWidth="7" strokeLinecap="round" strokeDasharray={`${p * c} ${c}`} style={{ transition: 'all .7s' }} /></svg>
    <div className="absolute inset-0 flex items-center justify-center text-sm font-semibold">{value == null ? '—' : Math.round(value) + unit}</div></div>{label && <div className="text-[11px] text-muted mt-1">{label}</div>}</div>;
}

const ST = { success: ['#10b981', CheckCircle2], succeeded: ['#10b981', CheckCircle2], failed: ['#ef4444', XCircle], failure: ['#ef4444', XCircle], running: ['#3b82f6', Loader2], in_progress: ['#3b82f6', Loader2], unstable: ['#f59e0b', MinusCircle], aborted: ['#64748b', MinusCircle], not_executed: ['#64748b', Circle], paused_pending_input: ['#f59e0b', Circle] };
// Pipeline stage diagram: real stages from Jenkins, connected with status-coloured lines.
export function PipelineFlow({ stages }) {
  return <div className="flex items-stretch overflow-x-auto pb-2">{stages.map((s, i) => { const [col, Ic] = ST[s.status] || ['#64748b', Circle];
    return <div key={i} className="flex items-center shrink-0"><div className="rounded-xl p-3 w-36 border" style={{ borderColor: col + '88', background: col + '14', boxShadow: s.status === 'running' ? `0 0 18px ${col}55` : 'none' }}>
      <div className="flex items-center gap-1.5 mb-1"><Ic size={15} color={col} className={s.status === 'running' ? 'animate-spin' : ''} /><span className="text-[11px] uppercase tracking-wide" style={{ color: col }}>{s.status.replace(/_/g, ' ')}</span></div>
      <div className="text-sm font-medium leading-tight">{s.name}</div><div className="text-[11px] text-muted mt-1">{s.duration != null ? (s.duration >= 60000 ? Math.floor(s.duration / 60000) + 'm ' + Math.round((s.duration % 60000) / 1000) + 's' : Math.round(s.duration / 1000) + 's') : '-'}</div>{s.error && <div className="text-[11px] text-red-400 mt-1 line-clamp-2">{s.error}</div>}</div>
      {i < stages.length - 1 && <div className="w-6 h-0.5 mx-0.5" style={{ background: `linear-gradient(90deg,${col},${(ST[stages[i + 1].status] || ['#64748b'])[0]})` }} />}</div>; })}</div>;
}
// Horizontal flow diagram with live numbers (source -> build -> ... -> monitor)
export function FlowStrip({ items }) {
  return <div className="relative"><Packets colors={items.map(i => i.color)} count={Math.max(3, items.length)} /><div className="relative flex items-stretch gap-1 overflow-x-auto py-1">{items.map((it, i) => <div key={it.label} className="flex items-center shrink-0 flex-1 min-w-[132px]">
    <Tilt className="flex-1 rounded-2xl"><div className="h-full rounded-2xl p-3 border bg-panel/80 backdrop-blur" style={{ borderColor: it.color + '66' }}><div className="flex items-center gap-2"><span className="grid place-items-center w-8 h-8 rounded-lg" style={{ background: it.color + '22', color: it.color }}><it.icon size={16} /></span><span className="text-xs text-muted">{it.label}</span></div>
      <div className="text-xl font-bold mt-1"><Counter value={it.value} /></div><div className="text-[11px] text-muted">{it.sub}</div></div></Tilt>
    {i < items.length - 1 && <ArrowRight size={16} className="text-muted mx-1 shrink-0 flow-arrow" />}</div>)}</div></div>;
}
// Generic stepper for lifecycle explanations
export function Stepper({ steps, active = -1 }) {
  return <ol className="flex flex-wrap items-center gap-2 text-sm">{steps.map((s, i) => <li key={s} className="flex items-center gap-2"><span className={`w-6 h-6 rounded-full grid place-items-center text-xs font-semibold ${i <= active ? 'bg-gradient-to-br from-brand to-violet text-white' : 'bg-panel2 text-muted border border-line'}`}>{i + 1}</span><span className={i <= active ? '' : 'text-muted'}>{s}</span>{i < steps.length - 1 && <span className="w-6 h-px bg-line" />}</li>)}</ol>;
}
// Hub-and-spoke diagram of integrations coloured by health
const COL = { connected: '#10b981', error: '#ef4444', unknown: '#f59e0b', not_configured: '#64748b' };
export function IntegrationMap({ items }) {
  const W = 560, H = 360, cx = W / 2, cy = H / 2, R = 135;
  return <svg viewBox={`0 0 ${W} ${H}`} className="w-full max-h-[380px]"><defs><radialGradient id="hub"><stop offset="0" stopColor="#8b5cf6" /><stop offset="1" stopColor="#3b82f6" /></radialGradient></defs>
    {items.map((it, i) => { const a = (i / items.length) * 2 * Math.PI - Math.PI / 2, x = cx + R * 1.7 * Math.cos(a) * 0.95, y = cy + R * Math.sin(a), col = COL[it.status] || COL.unknown, on = it.status === 'connected';
      return <g key={it.type}><line x1={cx} y1={cy} x2={x} y2={y} stroke={col} strokeWidth="2" strokeDasharray={on ? '0' : '5 5'} opacity=".7">{on && <animate attributeName="stroke-opacity" values=".3;1;.3" dur="2.4s" repeatCount="indefinite" />}</line>
        <circle cx={x} cy={y} r="30" fill="var(--panel)" stroke={col} strokeWidth="2.5" /><text x={x} y={y + 4} textAnchor="middle" fontSize="10.5" fontWeight="600" fill="var(--text)">{it.label}</text>
        <text x={x} y={y + 46} textAnchor="middle" fontSize="10" fill={col}>{it.status.replace('_', ' ')}</text></g>; })}
    <circle cx={cx} cy={cy} r="46" fill="url(#hub)"><animate attributeName="r" values="44;48;44" dur="3s" repeatCount="indefinite" /></circle><text x={cx} y={cy - 2} textAnchor="middle" fontSize="12" fontWeight="700" fill="#fff">DevSecOps</text><text x={cx} y={cy + 13} textAnchor="middle" fontSize="12" fontWeight="700" fill="#fff">Hub</text></svg>;
}
