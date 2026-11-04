import { Router } from 'express'; import { z } from 'zod';
import { Deployment, Finding, QualityReport, Build } from '../models.js';
import { auth, requireRole, projectIds, getProject } from '../middleware/auth.js';
import { ah, HttpError } from '../utils/http.js';
import { evaluateGate } from '../services/gates.js';
import { audit, notify, activity } from '../services/audit.js';
import { trigger } from '../services/jenkins.js';

const r = Router(); r.use(auth);
r.get('/', ah(async (req, res) => {
  const f = { project: { $in: await projectIds(req.user, req.query.project) } }; if (req.query.environment) f.environment = String(req.query.environment);
  res.json(await Deployment.find(f).populate('project', 'name key environments').populate('requestedBy approvedBy', 'name').sort({ createdAt: -1 }).limit(100));
}));
async function execute(d, p, req) {
  d.status = 'deploying'; await d.save();
  if (p.deployJob) { try { const { jobPath } = await import('../services/jenkins.js'); const { http } = await import('../services/integrations.js'); const { client } = await http('jenkins');
      await client.post(`/${jobPath(p.deployJob)}/buildWithParameters`, null, { params: { VERSION: d.version, ENVIRONMENT: d.environment, COMMIT: d.commit || '' } }); }
    catch (e) { d.status = 'failed'; d.notes = `Could not start deployment job: ${e.message}`; d.finishedAt = new Date(); await d.save(); await notify({ type: 'deploy_failed', severity: 'critical', title: `Deployment failed to start: ${p.name} → ${d.environment}`, message: d.notes, project: p._id, link: '/deployments' }); return; } }
  await activity({ type: 'deployment', status: 'deploying', title: `Deploying ${p.name} ${d.version} to ${d.environment}`, project: p._id, link: '/deployments' });
}
r.post('/', ah(async (req, res) => {
  const b = z.object({ projectId: z.string(), environment: z.string(), version: z.string().min(1).max(100), commit: z.string().optional(), buildId: z.string().optional() }).parse(req.body);
  const p = await getProject(req.user, b.projectId); const env = p.environments.find(e => e.name === b.environment); if (!env) throw new HttpError(400, 'Unknown environment');
  if (env.type === 'production' && !['admin', 'devops'].includes(req.user.role)) { await audit(req, 'deployment.request', `${p.key}:${env.name}`, 'denied'); throw new HttpError(403, 'Production deployments are restricted to DevOps engineers and administrators'); }
  if (req.user.role === 'developer' && !p.policy.developerCanTrigger) throw new HttpError(403, 'Developers may not request deployments for this project');
  const [quality, openCritical, openSecrets] = await Promise.all([QualityReport.findOne({ project: p._id, branch: null }).sort({ createdAt: -1 }),
    Finding.countDocuments({ project: p._id, source: 'trivy', severity: 'CRITICAL', status: 'open' }), Finding.countDocuments({ project: p._id, source: 'gitleaks', status: 'open' })]);
  const gate = evaluateGate({ project: p, quality, openCritical, openSecrets });
  const d = await Deployment.create({ project: p._id, environment: env.name, envType: env.type, version: b.version, commit: b.commit, build: b.buildId || undefined, requestedBy: req.user._id,
    status: gate.allowed ? 'pending_approval' : 'blocked', blockedReasons: gate.reasons });
  if (!gate.allowed) { await audit(req, 'deployment.request', `${p.key}:${env.name}`, 'denied', { reasons: gate.reasons }); await notify({ type: 'deploy_blocked', severity: 'warning', title: `Deployment blocked: ${p.name} → ${env.name}`, message: gate.reasons.join('; '), project: p._id, link: '/deployments' }); return res.status(422).json({ error: 'Deployment blocked by policy', reasons: gate.reasons, deployment: d }); }
  await audit(req, 'deployment.request', `${p.key}:${env.name}`, 'success', { version: b.version });
  if (env.type === 'production' && p.policy.requireApprovalProd) { await notify({ type: 'approval_required', severity: 'warning', title: `Approval required: ${p.name} ${b.version} → ${env.name}`, message: `Requested by ${req.user.name}`, project: p._id, link: '/deployments' }); return res.status(201).json(d); }
  d.status = 'approved'; await d.save(); await execute(d, p, req); res.status(201).json(d);
}));
r.post('/:id/approve', requireRole('admin', 'devops'), ah(async (req, res) => {
  const d = await Deployment.findById(req.params.id); if (!d) throw new HttpError(404, 'Not found'); const p = await getProject(req.user, d.project);
  if (d.status !== 'pending_approval') throw new HttpError(409, `Deployment is ${d.status}`);
  if (String(d.requestedBy) === String(req.user._id) && req.user.role !== 'admin') throw new HttpError(403, 'You cannot approve your own deployment request');
  d.approvedBy = req.user._id; d.status = 'approved'; await d.save(); await audit(req, 'deployment.approve', `${p.key}:${d.environment}`, 'success', { version: d.version }); await execute(d, p, req); res.json(d);
}));
r.post('/:id/reject', requireRole('admin', 'devops'), ah(async (req, res) => {
  const d = await Deployment.findById(req.params.id); if (!d) throw new HttpError(404, 'Not found'); const p = await getProject(req.user, d.project);
  if (d.status !== 'pending_approval') throw new HttpError(409, `Deployment is ${d.status}`); d.status = 'rejected'; d.notes = req.body?.note; d.finishedAt = new Date(); await d.save(); await audit(req, 'deployment.reject', `${p.key}:${d.environment}`); res.json(d);
}));
// Record the outcome reported by the deployment system (or by an operator).
r.post('/:id/result', requireRole('admin', 'devops'), ah(async (req, res) => {
  const b = z.object({ status: z.enum(['succeeded', 'failed']), notes: z.string().optional() }).parse(req.body);
  const d = await Deployment.findById(req.params.id); if (!d) throw new HttpError(404, 'Not found'); const p = await getProject(req.user, d.project);
  if (d.status !== 'deploying') throw new HttpError(409, `Deployment is ${d.status}`); d.status = b.status; d.notes = b.notes; d.finishedAt = new Date(); await d.save();
  await audit(req, 'deployment.result', `${p.key}:${d.environment}`, b.status === 'succeeded' ? 'success' : 'failure');
  await notify({ type: b.status === 'succeeded' ? 'deploy_succeeded' : 'deploy_failed', severity: b.status === 'succeeded' ? 'success' : 'critical', title: `Deployment ${b.status}: ${p.name} ${d.version} → ${d.environment}`, project: p._id, link: '/deployments' });
  await activity({ type: 'deployment', status: b.status, title: `${p.name} ${d.version} → ${d.environment} ${b.status}`, project: p._id, link: '/deployments' }); res.json(d);
}));
r.post('/:id/rollback', requireRole('admin', 'devops'), ah(async (req, res) => {
  const cur = await Deployment.findById(req.params.id); if (!cur) throw new HttpError(404, 'Not found'); const p = await getProject(req.user, cur.project);
  const prev = await Deployment.findOne({ project: p._id, environment: cur.environment, status: 'succeeded', createdAt: { $lt: cur.createdAt } }).sort({ createdAt: -1 });
  if (!prev) throw new HttpError(409, 'No earlier successful deployment to roll back to');
  const d = await Deployment.create({ project: p._id, environment: cur.environment, envType: cur.envType, version: prev.version, commit: prev.commit, requestedBy: req.user._id, approvedBy: req.user._id, status: 'approved', rollbackOf: cur._id, notes: `Rollback from ${cur.version}` });
  if (cur.status === 'succeeded') { cur.status = 'rolled_back'; await cur.save(); }
  await audit(req, 'deployment.rollback', `${p.key}:${cur.environment}`, 'success', { to: prev.version }); await execute(d, p, req); res.status(201).json(d);
}));
export default r;
