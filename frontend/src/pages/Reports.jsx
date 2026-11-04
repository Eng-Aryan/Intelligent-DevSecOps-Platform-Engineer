import { useState } from 'react'; import { FileDown, FilePlus2 } from 'lucide-react'; import { api, errMsg } from '../api'; import { useAuth } from '../auth';
import { Page, Card, Table, useFetch, Async, Field, Input, Select, useAction, Msg, fmtDate, fmtBytes } from '../components/ui';
const iso = d => d.toISOString().slice(0, 10);
export default function Reports() {
  const { project } = useAuth(); const projects = useFetch('/projects'); const q = useFetch('/reports'); const { msg, run, busy, setMsg } = useAction();
  const [f, setF] = useState({ projectId: project || '', from: iso(new Date(Date.now() - 30 * 864e5)), to: iso(new Date()), severity: [] });
  const gen = () => run(async () => { await api.post('/reports', { ...f, to: new Date(f.to + 'T23:59:59'), from: new Date(f.from), severity: f.severity.length ? f.severity : undefined }); q.reload(); }, 'Report generated');
  const dl = async r => { try { const res = await api.get(`/reports/${r._id}/download`, { responseType: 'blob' }); const a = document.createElement('a'); a.href = URL.createObjectURL(res.data); a.download = r.title + '.pdf'; a.click(); URL.revokeObjectURL(a.href); } catch (e) { setMsg({ err: 1, text: errMsg(e) }); } };
  return <Page title="Reports & Analytics" subtitle="PDF security and operations reports built from stored findings (secrets are masked)">
    <Card title="Generate report"><div className="grid md:grid-cols-5 gap-3 items-end"><Field label="Project"><Select value={f.projectId} onChange={e => setF({ ...f, projectId: e.target.value })}><option value="">Select…</option>{projects.data?.map(p => <option key={p._id} value={p._id}>{p.name}</option>)}</Select></Field>
      <Field label="From"><Input type="date" value={f.from} onChange={e => setF({ ...f, from: e.target.value })} /></Field><Field label="To"><Input type="date" value={f.to} onChange={e => setF({ ...f, to: e.target.value })} /></Field>
      <Field label="Severity filter"><Select value={f.severity[0] || ''} onChange={e => setF({ ...f, severity: e.target.value ? [e.target.value] : [] })}><option value="">All</option>{['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'].map(s => <option key={s}>{s}</option>)}</Select></Field>
      <button className="btn btn-primary justify-center" disabled={!f.projectId || busy} onClick={gen}><FilePlus2 size={14} />{busy ? 'Generating…' : 'Generate PDF'}</button></div><div className="mt-2"><Msg m={msg} /></div></Card>
    <Card title="Report history"><Async q={q}>{rows => <Table rows={rows} empty="No reports generated yet." cols={[{ h: 'Title', r: r => r.title }, { h: 'Project', r: r => r.project?.name }, { h: 'By', r: r => r.createdBy?.name }, { h: 'Generated', r: r => fmtDate(r.createdAt) }, { h: 'Size', r: r => fmtBytes(r.size) }, { h: '', r: r => <button className="btn" onClick={() => dl(r)}><FileDown size={14} />Download</button> }]} />}</Async></Card></Page>;
}
