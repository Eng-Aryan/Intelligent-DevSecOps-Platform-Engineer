import { Router } from 'express'; import { z } from 'zod';
import { Project, Build, Deployment, Finding, QualityReport } from '../models.js';
import { auth, requireRole, projectIds, getProject } from '../middleware/auth.js';
import { ah, HttpError } from '../utils/http.js';
import { audit } from '../services/audit.js';

const r = Router(); r.use(auth);
const schema = z.object({
  name: z.string().min(2), key: z.string().regex(/^[A-Za-z0-9_-]{2,12}$/), description: z.string().optional(), githubRepo: z.string().regex(/^[\w.-]+\/[\w.-]+$/).or(z.literal('')).optional(),
  jenkinsJob: z.string().optional(), deployJob: z.string().optional(), sonarKey: z.string().optional(), imageName: z.string().optional(),
  members: z.array(z.string()).optional(), status: z.enum(['active', 'archived']).optional(),
  environments: z.array(z.object({ name: z.string().min(2), type: z.enum(['development', 'staging', 'production']) })).optional(),
  policy: z.object({ blockOnQualityGate: z.boolean(), blockOnCritical: z.boolean(), blockOnSecrets: z.boolean(), requireApprovalProd: z.boolean(), autoTriggerOnPush: z.boolean(), developerCanTrigger: z.boolean() }).partial().optional(),
});
r.get('/', ah(async (req, res) => {
  const ids = await projectIds(req.user);
  res.json(await Project.find({ _id: { $in: ids } }).populate('owner members', 'name email').sort({ name: 1 }));
}));
r.post('/', requireRole('admin', 'devops'), ah(async (req, res) => {
  const b = schema.parse(req.body); const p = await Project.create({ ...b, owner: req.user._id, members: b.members || [] });
  await audit(req, 'project.create', p.key); res.status(201).json(p);
}));
r.get('/:id', ah(async (req, res) => {
  const p = await getProject(req.user, req.params.id);
  const [builds, deployments, quality, sev] = await Promise.all([
    Build.find({ project: p._id }).sort({ startedAt: -1 }).limit(10), Deployment.find({ project: p._id }).sort({ createdAt: -1 }).limit(10),
    QualityReport.findOne({ project: p._id }).sort({ createdAt: -1 }),
    Finding.aggregate([{ $match: { project: p._id, status: 'open' } }, { $group: { _id: '$severity', n: { $sum: 1 } } }])]);
  res.json({ project: await p.populate('owner members', 'name email'), builds, deployments, quality, openFindings: Object.fromEntries(sev.map(s => [s._id, s.n])) });
}));
r.patch('/:id', requireRole('admin', 'devops'), ah(async (req, res) => {
  const p = await getProject(req.user, req.params.id);
  if (req.user.role !== 'admin' && String(p.owner) !== String(req.user._id)) throw new HttpError(403, 'Only the project owner or an administrator can change this project');
  const b = schema.partial().parse(req.body); const { policy, ...rest } = b;
  Object.assign(p, rest); if (policy) p.policy = { ...p.policy.toObject(), ...policy }; await p.save();
  await audit(req, b.status === 'archived' ? 'project.archive' : 'project.update', p.key, 'success', { fields: Object.keys(b) }); res.json(p);
}));
export default r;
