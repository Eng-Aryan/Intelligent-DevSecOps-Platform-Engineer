import { Router } from 'express';
import { auth, requireRole } from '../middleware/auth.js';
import { ah, HttpError } from '../utils/http.js';
import { dockerClient } from '../services/integrations.js';
import { audit, activity } from '../services/audit.js';
import { redact } from '../utils/redact.js';
import { cfg } from '../config.js';
import { Finding } from '../models.js';

const r = Router(); r.use(auth);
const idOk = id => /^[a-f0-9]{12,64}$/i.test(id) || /^[\w.-]{1,128}$/.test(id);
const cname = c => (c.Names?.[0] || '').replace(/^\//, '');
r.get('/containers', ah(async (_req, res) => {
  const d = await dockerClient(); const list = await d.listContainers({ all: true });
  res.json(list.map(c => ({ id: c.Id.slice(0, 12), name: cname(c), image: c.Image, state: c.State, status: c.Status, ports: c.Ports.filter(p => p.PublicPort).map(p => `${p.PublicPort}->${p.PrivatePort}/${p.Type}`), created: c.Created * 1000, protected: cfg.protectedContainers.includes(cname(c)) })));
}));
r.get('/images', ah(async (_req, res) => {
  const d = await dockerClient(); const imgs = await d.listImages();
  const refs = imgs.flatMap(i => i.RepoTags || []);
  const sc = await Finding.aggregate([{ $match: { source: 'trivy', status: 'open' } }, { $group: { _id: { t: '$target', s: '$severity' }, n: { $sum: 1 } } }]);
  res.json(imgs.map(i => ({ id: i.Id.replace('sha256:', '').slice(0, 12), tags: i.RepoTags || [], size: i.Size, created: i.Created * 1000,
    scan: Object.fromEntries(sc.filter(x => (i.RepoTags || []).some(t => x._id.t?.startsWith(t))).map(x => [x._id.s, x.n])) })).filter(i => refs.length || true));
}));
r.get('/containers/:id', ah(async (req, res) => {
  if (!idOk(req.params.id)) throw new HttpError(400, 'Bad container id'); const c = (await dockerClient()).getContainer(req.params.id);
  const i = await c.inspect(); let stats = null;
  if (i.State.Running) { const s = await c.stats({ stream: false }); const cpuD = s.cpu_stats.cpu_usage.total_usage - s.precpu_stats.cpu_usage.total_usage; const sysD = s.cpu_stats.system_cpu_usage - s.precpu_stats.system_cpu_usage;
    stats = { cpuPercent: sysD > 0 ? +((cpuD / sysD) * (s.cpu_stats.online_cpus || 1) * 100).toFixed(2) : 0, memUsage: s.memory_stats.usage, memLimit: s.memory_stats.limit }; }
  const logs = await c.logs({ stdout: true, stderr: true, tail: 200, timestamps: true });
  res.json({ id: i.Id.slice(0, 12), name: i.Name.replace(/^\//, ''), image: i.Config.Image, status: i.State.Status, health: i.State.Health?.Status || 'none', createdAt: i.Created, startedAt: i.State.StartedAt,
    ports: Object.entries(i.NetworkSettings.Ports || {}).map(([k, v]) => `${k} ${v ? '-> ' + v.map(x => x.HostPort).join(',') : '(unpublished)'}`), restartCount: i.RestartCount, stats,
    logs: redact(logs.toString('utf8').replace(/[\x00-\x08\x0e-\x1f]/g, '')) });
}));
r.post('/containers/:id/:action(start|stop|restart)', requireRole('admin', 'devops'), ah(async (req, res) => {
  if (!idOk(req.params.id)) throw new HttpError(400, 'Bad container id');
  const c = (await dockerClient()).getContainer(req.params.id); const i = await c.inspect(); const name = i.Name.replace(/^\//, '');
  if (cfg.protectedContainers.includes(name) && req.params.action !== 'start') { await audit(req, `docker.${req.params.action}`, name, 'denied', { reason: 'protected' }); throw new HttpError(403, `${name} is a protected container`); }
  await c[req.params.action](); await audit(req, `docker.${req.params.action}`, name);
  await activity({ type: 'container', status: req.params.action, title: `${req.user.name} ${req.params.action}ed container ${name}`, link: '/docker' }); res.json({ ok: true });
}));
export default r;
