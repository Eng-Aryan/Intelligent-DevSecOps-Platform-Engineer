import { Router } from 'express'; import { z } from 'zod';
import { Build, QualityReport, Project } from '../models.js';
import { auth, requireRole, projectIds, getProject } from '../middleware/auth.js';
import { ah, HttpError } from '../utils/http.js';
import { http } from '../services/integrations.js';
import * as jenkins from '../services/jenkins.js';
import { syncQuality } from '../services/sonar.js';
import { audit, activity } from '../services/audit.js';

const r = Router(); r.use(auth);
// ---------- Jenkins ----------
r.get('/jenkins/jobs', requireRole('admin', 'devops'), ah(async (_req, res) => {
  const { client } = await http('jenkins'); const { data } = await client.get('/api/json', { params: { tree: 'jobs[name,url,color]' } }); res.json(data.jobs);
}));
r.post('/jenkins/projects/:id/sync', ah(async (req, res) => { const p = await getProject(req.user, req.params.id); res.json({ newlyFinished: await jenkins.syncProject(p) }); }));
r.post('/jenkins/projects/:id/trigger', ah(async (req, res) => {
  const p = await getProject(req.user, req.params.id);
  if (!p.jenkinsJob) throw new HttpError(400, 'No Jenkins job is associated with this project');
  if (req.user.role === 'developer' && !p.policy.developerCanTrigger) { await audit(req, 'pipeline.trigger', p.key, 'denied'); throw new HttpError(403, 'Developers are not permitted to trigger this pipeline'); }
  const params = z.record(z.string()).optional().parse(req.body?.params);
  await jenkins.trigger(p, params); await audit(req, 'pipeline.trigger', p.key, 'success', { params });
  await activity({ type: 'pipeline', status: 'queued', title: `${req.user.name} triggered ${p.name}`, project: p._id, link: '/pipelines' });
  setTimeout(() => jenkins.syncProject(p).catch(() => {}), 6000); res.json({ ok: true });
}));
r.get('/builds', ah(async (req, res) => {
  const q = z.object({ project: z.string().optional(), branch: z.string().optional(), status: z.string().optional(), search: z.string().optional(), limit: z.coerce.number().max(200).default(50), skip: z.coerce.number().default(0) }).parse(req.query);
  const f = { project: { $in: await projectIds(req.user, q.project) } }; if (q.branch) f.branch = q.branch; if (q.status) f.status = q.status;
  if (q.search) f.$or = [{ job: new RegExp(q.search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') }, { commit: new RegExp('^' + q.search.replace(/[^a-f0-9]/gi, '')) }];
  const [items, total] = await Promise.all([Build.find(f).populate('project', 'name key').sort({ startedAt: -1 }).skip(q.skip).limit(q.limit), Build.countDocuments(f)]);
  res.json({ items, total });
}));
r.get('/builds/:id', ah(async (req, res) => {
  const b = await Build.findById(req.params.id).populate('project', 'name key'); if (!b) throw new HttpError(404, 'Build not found');
  await getProject(req.user, b.project._id); res.json(b);
}));
r.get('/builds/:id/log', ah(async (req, res) => {
  const b = await Build.findById(req.params.id); if (!b) throw new HttpError(404, 'Build not found'); await getProject(req.user, b.project);
  res.json({ log: await jenkins.consoleLog(b) });
}));
r.post('/builds/:id/cancel', requireRole('admin', 'devops'), ah(async (req, res) => {
  const b = await Build.findById(req.params.id); if (!b) throw new HttpError(404, 'Build not found'); await getProject(req.user, b.project);
  if (b.status !== 'running') throw new HttpError(409, 'Build is not running'); await jenkins.cancel(b); await audit(req, 'pipeline.cancel', `${b.job}#${b.number}`); res.json({ ok: true });
}));
// ---------- SonarQube ----------
r.get('/quality', ah(async (req, res) => {
  const ids = await projectIds(req.user, req.query.project);
  const rows = await QualityReport.aggregate([{ $match: { project: { $in: ids }, branch: null } }, { $sort: { createdAt: -1 } }, { $group: { _id: '$project', doc: { $first: '$$ROOT' } } }]);
  const projects = await Project.find({ _id: { $in: ids } }).select('name key sonarKey');
  res.json(projects.map(p => ({ project: p, report: rows.find(x => String(x._id) === String(p._id))?.doc || null })));
}));
r.get('/quality/:projectId/history', ah(async (req, res) => { const p = await getProject(req.user, req.params.projectId); res.json(await QualityReport.find({ project: p._id }).sort({ createdAt: -1 }).limit(60)); }));
r.post('/quality/:projectId/sync', ah(async (req, res) => {
  const p = await getProject(req.user, req.params.projectId); if (!p.sonarKey) throw new HttpError(400, 'No SonarQube project key configured');
  const branch = z.string().optional().parse(req.body?.branch); res.json(await syncQuality(p, branch));
}));
export default r;
