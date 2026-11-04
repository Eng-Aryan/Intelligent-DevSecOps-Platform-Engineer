import { Router } from 'express'; import { z } from 'zod'; import crypto from 'crypto';
import { Finding, Project } from '../models.js';
import { auth, requireRole, projectIds, getProject } from '../middleware/auth.js';
import { ah, HttpError } from '../utils/http.js';
import { normalizeTrivy, normalizeGitleaks } from '../services/scanners.js';
import { audit, notify, activity } from '../services/audit.js';
import { run } from '../services/integrations.js';
import { getCfg } from '../services/integrations.js';

const r = Router(); r.use(auth);

async function ingest(project, source, items, req) {
  const scanId = crypto.randomUUID(); const now = new Date(); let created = 0, reopened = 0;
  for (const it of items) {
    const ex = await Finding.findOne({ project: project._id, fingerprint: it.fingerprint });
    if (!ex) { await Finding.create({ ...it, project: project._id, firstSeen: now, lastSeen: now, scanId }); created++; }
    else { ex.lastSeen = now; ex.scanId = scanId; Object.assign(ex, { installedVersion: it.installedVersion ?? ex.installedVersion, fixedVersion: it.fixedVersion ?? ex.fixedVersion, severity: it.severity });
      if (ex.status === 'resolved' && ex.resolvedBy === 'scan') { ex.status = 'open'; reopened++; } await ex.save(); }
  }
  // Findings absent from a newer validated scan of the same targets are marked resolved by that scan (never by assumption).
  const targets = [...new Set(items.map(i => i.target))];
  const gone = await Finding.updateMany({ project: project._id, source, target: { $in: targets }, status: 'open', scanId: { $ne: scanId } }, { $set: { status: 'resolved', resolvedBy: 'scan', resolvedAt: now, resolvedNote: 'Not present in subsequent scan' } });
  const crit = items.filter(i => i.severity === 'CRITICAL').length;
  await activity({ type: 'security', status: 'completed', title: `${source} scan for ${project.name}: ${items.length} finding(s), ${created} new`, project: project._id, link: '/security' });
  if (source === 'gitleaks' && items.length) await notify({ type: 'secret_exposed', severity: 'critical', title: `Exposed secrets detected in ${project.name}`, message: `${items.length} potential secret(s). Rotate the credentials - removing them from code is not enough.`, project: project._id, link: '/security' });
  else if (crit) await notify({ type: 'critical_vuln', severity: 'critical', title: `${crit} critical vulnerabilities in ${project.name}`, message: 'Review the Security Center and apply the available fixes.', project: project._id, link: '/security' });
  await audit(req, `security.import.${source}`, project.key, 'success', { total: items.length, created, reopened, resolved: gone.modifiedCount });
  return { total: items.length, created, reopened, resolved: gone.modifiedCount };
}
const imp = (source, norm) => ah(async (req, res) => {
  const { projectId, report } = z.object({ projectId: z.string(), report: z.any() }).parse(req.body);
  const p = await getProject(req.user, projectId); if (req.user.role === 'developer' && source === 'gitleaks') throw new HttpError(403, 'Not permitted');
  const items = norm(report); if (source === 'trivy' && !report?.Results && !report?.SchemaVersion) throw new HttpError(400, 'Not a Trivy JSON report');
  res.json(await ingest(p, source, items, req));
});
r.post('/import/trivy', imp('trivy', normalizeTrivy));
r.post('/import/gitleaks', requireRole('admin', 'devops'), imp('gitleaks', normalizeGitleaks));

// Run Trivy locally against a container image (no shell; strict argument validation).
r.post('/scan/trivy', requireRole('admin', 'devops'), ah(async (req, res) => {
  const { projectId, image } = z.object({ projectId: z.string(), image: z.string().regex(/^[a-zA-Z0-9][\w./:@-]{1,200}$/, 'Invalid image reference') }).parse(req.body);
  const p = await getProject(req.user, projectId); await getCfg('trivy');
  let out; try { out = (await run('trivy', ['image', '--quiet', '--format', 'json', image], { maxBuffer: 200e6, timeout: 600000 })).stdout; }
  catch (e) { await audit(req, 'security.scan.trivy', image, 'failure', { error: e.message }); throw new HttpError(502, `Trivy failed: ${e.message.slice(0, 300)}`); }
  res.json(await ingest(p, 'trivy', normalizeTrivy(JSON.parse(out)), req));
}));

r.get('/findings', ah(async (req, res) => {
  const q = z.object({ project: z.string().optional(), severity: z.string().optional(), source: z.string().optional(), status: z.string().optional(), search: z.string().optional(), limit: z.coerce.number().max(500).default(100), skip: z.coerce.number().default(0) }).parse(req.query);
  const f = { project: { $in: await projectIds(req.user, q.project) } };
  if (req.user.role === 'developer') f.source = 'trivy';
  for (const k of ['severity', 'source', 'status']) if (q[k]) f[k] = q[k];
  if (q.search) { const s = new RegExp(q.search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'); f.$or = [{ vulnId: s }, { pkg: s }, { title: s }]; }
  const [items, total] = await Promise.all([Finding.find(f).populate('project', 'name key').sort({ severity: 1, lastSeen: -1 }).skip(q.skip).limit(q.limit), Finding.countDocuments(f)]);
  res.json({ items, total });
}));
r.patch('/findings/:id', ah(async (req, res) => {
  const b = z.object({ status: z.enum(['open', 'acknowledged', 'resolved', 'ignored']), note: z.string().max(500).optional() }).parse(req.body);
  const f = await Finding.findById(req.params.id); if (!f) throw new HttpError(404, 'Finding not found'); await getProject(req.user, f.project);
  if (req.user.role === 'developer' && !['acknowledged', 'open'].includes(b.status)) throw new HttpError(403, 'Only DevOps engineers or administrators can resolve or ignore findings');
  if (['resolved', 'ignored'].includes(b.status) && !b.note) throw new HttpError(400, 'A note is required to resolve or ignore a finding');
  f.status = b.status; f.resolvedBy = ['resolved', 'ignored'].includes(b.status) ? req.user.email : undefined; f.resolvedNote = b.note; f.resolvedAt = new Date(); await f.save();
  await audit(req, 'finding.status', `${f.source}:${f.vulnId}`, 'success', { status: b.status }); res.json(f);
}));
export default r;
