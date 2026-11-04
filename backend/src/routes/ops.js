import { Router } from 'express'; import { z } from 'zod'; import rateLimit from 'express-rate-limit';
import { Build, Finding, Project } from '../models.js';
import { auth, requireRole, getProject } from '../middleware/auth.js';
import { ah, HttpError } from '../utils/http.js';
import { http, getCfg } from '../services/integrations.js';
import { consoleLog } from '../services/jenkins.js';
import { redact } from '../utils/redact.js';
import { audit } from '../services/audit.js';

const r = Router(); r.use(auth);
// ---------- Monitoring (Prometheus presets only: the browser cannot run arbitrary PromQL) ----------
const PRESETS = {
  cpu: '100 - (avg(rate(node_cpu_seconds_total{mode="idle"}[5m])) * 100)',
  memory: '(1 - (sum(node_memory_MemAvailable_bytes) / sum(node_memory_MemTotal_bytes))) * 100',
  disk: '(1 - (sum(node_filesystem_avail_bytes{fstype!~"tmpfs|overlay"}) / sum(node_filesystem_size_bytes{fstype!~"tmpfs|overlay"}))) * 100',
  network: 'sum(rate(node_network_receive_bytes_total[5m]))',
  containerCpu: 'sum(rate(container_cpu_usage_seconds_total{name!=""}[5m])) by (name) * 100',
  availability: 'avg(up) * 100',
};
const secs = s => { const m = /^(\d+)([mhd])$/.exec(s || '1h'); if (!m) throw new HttpError(400, 'Invalid range'); return +m[1] * { m: 60, h: 3600, d: 86400 }[m[2]]; };
r.get('/monitoring/metrics/:name', ah(async (req, res) => {
  const query = PRESETS[req.params.name]; if (!query) throw new HttpError(404, 'Unknown metric'); const { client } = await http('prometheus');
  const range = secs(req.query.range), end = Math.floor(Date.now() / 1000), step = Math.max(15, Math.floor(range / 120));
  const { data } = await client.get('/api/v1/query_range', { params: { query, start: end - range, end, step } });
  const result = data.data.result; if (!result.length) return res.json({ state: 'no_data', series: [] });
  const series = result[0].values.map(([t, v]) => ({ t: t * 1000, v: +(+v).toFixed(2) })); const last = series.at(-1)?.v;
  const state = req.params.name === 'availability' ? (last >= 100 ? 'healthy' : last > 0 ? 'degraded' : 'unavailable') : (last >= 95 ? 'degraded' : 'healthy');
  res.json({ state, last, series, multi: result.length > 1 });
}));
r.get('/monitoring/targets', ah(async (_req, res) => {
  const { client } = await http('prometheus'); const { data } = await client.get('/api/v1/targets');
  res.json(data.data.activeTargets.map(t => ({ job: t.labels.job, instance: t.labels.instance, health: t.health === 'up' ? 'healthy' : 'unavailable', lastError: t.lastError, lastScrape: t.lastScrape })));
}));
r.get('/monitoring/alerts', ah(async (_req, res) => { const { client } = await http('prometheus'); const { data } = await client.get('/api/v1/alerts'); res.json(data.data.alerts.map(a => ({ name: a.labels.alertname, severity: a.labels.severity, state: a.state, summary: a.annotations?.summary, since: a.activeAt }))); }));
r.get('/monitoring/links', ah(async (_req, res) => { const g = await getCfg('grafana', { required: false }); res.json({ grafana: g?.baseUrl || null, dashboards: g?.extra?.dashboards || [] }); }));

// ---------- AI assistant: grounded in real logs/findings, secrets redacted before leaving the platform ----------
const SYSTEM = `You are the AI Security Assistant of a DevSecOps platform. Answer ONLY from the context supplied (build logs, stage results, findings, quality data).
Rules: 1) Clearly separate "Confirmed (from the evidence)" from "Hypotheses". 2) Never invent log lines, versions, CVE data or fixes you cannot support; say what is missing. 3) Never ask for or repeat credentials. 4) Do not instruct the user to run destructive commands or change production without explicit review and approval. 5) Be concise and actionable; prioritise by severity.`;
r.post('/ai/chat', rateLimit({ windowMs: 60000, limit: 20 }), ah(async (req, res) => {
  const b = z.object({ message: z.string().min(2).max(4000), buildId: z.string().optional(), findingId: z.string().optional(), projectId: z.string().optional(),
    history: z.array(z.object({ role: z.enum(['user', 'assistant']), content: z.string().max(6000) })).max(10).optional() }).parse(req.body);
  const ctx = [];
  if (b.buildId) { const bd = await Build.findById(b.buildId).populate('project', 'name'); if (!bd) throw new HttpError(404, 'Build not found'); await getProject(req.user, bd.project._id);
    ctx.push(`BUILD ${bd.job} #${bd.number} status=${bd.status} branch=${bd.branch} commit=${bd.commit}\nSTAGES:\n` + bd.stages.map(s => `- ${s.name}: ${s.status}${s.error ? ' ERROR: ' + s.error : ''}`).join('\n'));
    try { ctx.push('CONSOLE LOG (tail):\n' + (await consoleLog(bd, 12000))); } catch (e) { ctx.push('(console log unavailable: ' + e.message + ')'); } }
  if (b.findingId) { const f = await Finding.findById(b.findingId); if (!f) throw new HttpError(404, 'Finding not found'); await getProject(req.user, f.project);
    ctx.push(`FINDING source=${f.source} id=${f.vulnId} severity=${f.severity} package=${f.pkg} installed=${f.installedVersion || '-'} fixed=${f.fixedVersion || 'none listed'} target=${f.target} title=${f.title}`); }
  if (b.projectId) { const p = await getProject(req.user, b.projectId); const open = await Finding.find({ project: p._id, status: 'open' }).sort({ severity: 1 }).limit(25);
    ctx.push(`PROJECT ${p.name} OPEN FINDINGS (top 25):\n` + open.map(f => `${f.severity} ${f.source} ${f.vulnId} ${f.pkg} ${f.installedVersion || ''} -> ${f.fixedVersion || 'no fix listed'}`).join('\n')); }
  const { client, cfg } = await http('ai'); if (!cfg.extra.model) throw new HttpError(409, 'AI model name is not set in the AI integration (extra.model)');
  const messages = [{ role: 'system', content: SYSTEM }, ...(b.history || []).map(h => ({ role: h.role, content: redact(h.content) })),
    { role: 'user', content: redact(`${ctx.length ? 'CONTEXT:\n' + ctx.join('\n\n') + '\n\n' : 'No platform context attached.\n\n'}QUESTION: ${b.message}`) }];
  const { data } = await client.post('/chat/completions', { model: cfg.extra.model, messages, temperature: 0.2 });
  await audit(req, 'ai.query', b.buildId || b.findingId || b.projectId || 'general', 'success');
  res.json({ answer: data.choices?.[0]?.message?.content || '', grounded: ctx.length > 0 });
}));
export default r;
