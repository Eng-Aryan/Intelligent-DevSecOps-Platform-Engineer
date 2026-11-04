import { Router } from 'express';
import { Build, Deployment, Finding, QualityReport, Project, Activity, Notification } from '../models.js';
import { auth, projectIds } from '../middleware/auth.js';
import { ah } from '../utils/http.js';
import { getCfg, http, dockerClient } from '../services/integrations.js';

const r = Router(); r.use(auth);
const DAY = 86400e3;
async function buildWin(ids, from, to) {
  const [g] = await Build.aggregate([{ $match: { project: { $in: ids }, startedAt: { $gte: from, $lt: to } } }, { $group: { _id: null, total: { $sum: 1 },
    success: { $sum: { $cond: [{ $eq: ['$status', 'success'] }, 1, 0] } }, failed: { $sum: { $cond: [{ $in: ['$status', ['failed', 'unstable']] }, 1, 0] } },
    avg: { $avg: { $cond: [{ $gt: ['$duration', 0] }, '$duration', null] } } } }]);
  const x = g || { total: 0, success: 0, failed: 0, avg: null }; const fin = x.success + x.failed;
  return { total: x.total, success: x.success, failed: x.failed, avgDuration: x.avg, successRate: fin ? +(x.success / fin * 100).toFixed(1) : null };
}
async function depWin(ids, from, to) {
  const g = await Deployment.aggregate([{ $match: { project: { $in: ids }, createdAt: { $gte: from, $lt: to } } }, { $group: { _id: '$status', n: { $sum: 1 } } }]);
  const by = Object.fromEntries(g.map(x => [x._id, x.n])); return { succeeded: by.succeeded || 0, failed: (by.failed || 0) + (by.rolled_back || 0) };
}
async function infraHealth() {
  try { if (!(await getCfg('prometheus', { required: false }))) return 'not_configured'; const { client } = await http('prometheus');
    const { data } = await client.get('/api/v1/query', { params: { query: 'up' } }); const res = data.data.result; if (!res.length) return 'no_data';
    const down = res.filter(x => x.value[1] === '0').length; return down === 0 ? 'healthy' : down === res.length ? 'unavailable' : 'degraded'; } catch { return 'unavailable'; }
}
r.get('/summary', ah(async (req, res) => {
  const days = Math.min(+req.query.days || 30, 365); const ids = await projectIds(req.user, req.query.project); const now = new Date(); const from = new Date(+now - days * DAY), prevFrom = new Date(+from - days * DAY);
  const [cur, prev, dCur, dPrev, sev, q, health, unread] = await Promise.all([buildWin(ids, from, now), buildWin(ids, prevFrom, from), depWin(ids, from, now), depWin(ids, prevFrom, from),
    Finding.aggregate([{ $match: { project: { $in: ids }, status: 'open' } }, { $group: { _id: '$severity', n: { $sum: 1 } } }]),
    QualityReport.aggregate([{ $match: { project: { $in: ids }, branch: null } }, { $sort: { createdAt: -1 } }, { $group: { _id: '$project', gate: { $first: '$gate' } } }]),
    infraHealth(), Notification.countDocuments({ type: { $in: ['critical_vuln', 'secret_exposed', 'quality_gate_failed'] }, readBy: { $ne: req.user._id }, $or: [{ project: null }, { project: { $in: ids } }] })]);
  let containers = null; try { containers = (await (await dockerClient()).listContainers()).length; } catch { /* docker not configured */ }
  const s = Object.fromEntries(sev.map(x => [x._id, x.n]));
  res.json({ days, projects: ids.length, repos: await Project.countDocuments({ _id: { $in: ids }, githubRepo: { $nin: [null, ''] } }),
    builds: cur, prevBuilds: prev, deployments: dCur, prevDeployments: dPrev, critical: s.CRITICAL || 0, high: s.HIGH || 0,
    quality: { ok: q.filter(x => x.gate === 'OK').length, failing: q.filter(x => x.gate !== 'OK').length, total: q.length }, containers, infraHealth: health, pendingAlerts: unread });
}));
r.get('/series', ah(async (req, res) => {
  const days = Math.min(+req.query.days || 30, 365); const ids = await projectIds(req.user, req.query.project); const from = new Date(Date.now() - days * DAY);
  const m = { project: { $in: ids }, startedAt: { $gte: from } }; if (req.query.branch) m.branch = String(req.query.branch);
  const [daily, byProject, deploys] = await Promise.all([
    Build.aggregate([{ $match: m }, { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$startedAt' } }, total: { $sum: 1 }, success: { $sum: { $cond: [{ $eq: ['$status', 'success'] }, 1, 0] } }, failed: { $sum: { $cond: [{ $in: ['$status', ['failed', 'unstable']] }, 1, 0] } }, avg: { $avg: { $cond: [{ $gt: ['$duration', 0] }, '$duration', null] } } } }, { $sort: { _id: 1 } }]),
    Build.aggregate([{ $match: m }, { $group: { _id: '$project', avg: { $avg: { $cond: [{ $gt: ['$duration', 0] }, '$duration', null] } }, n: { $sum: 1 } } }, { $lookup: { from: 'projects', localField: '_id', foreignField: '_id', as: 'p' } }, { $project: { name: { $arrayElemAt: ['$p.name', 0] }, avg: 1, n: 1 } }]),
    Deployment.aggregate([{ $match: { project: { $in: ids }, createdAt: { $gte: from }, status: 'succeeded' } }, { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }, n: { $sum: 1 } } }, { $sort: { _id: 1 } }])]);
  res.json({ daily: daily.map(d => ({ date: d._id, total: d.total, success: d.success, failed: d.failed, avgSec: d.avg ? Math.round(d.avg / 1000) : null })),
    byProject: byProject.map(b => ({ name: b.name, avgSec: b.avg ? Math.round(b.avg / 1000) : 0, builds: b.n })), deployFrequency: deploys.map(d => ({ date: d._id, deployments: d.n })) });
}));
r.get('/security', ah(async (req, res) => {
  const ids = await projectIds(req.user, req.query.project); const m = { project: { $in: ids } }; if (req.user.role === 'developer') m.source = 'trivy';
  const [bySev, byStatus, trend, risk, secrets, scanned] = await Promise.all([
    Finding.aggregate([{ $match: { ...m, status: 'open' } }, { $group: { _id: '$severity', n: { $sum: 1 } } }]), Finding.aggregate([{ $match: m }, { $group: { _id: '$status', n: { $sum: 1 } } }]),
    Finding.aggregate([{ $match: { ...m, firstSeen: { $gte: new Date(Date.now() - 30 * DAY) } } }, { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$firstSeen' } }, n: { $sum: 1 } } }, { $sort: { _id: 1 } }]),
    Finding.aggregate([{ $match: { ...m, status: 'open' } }, { $group: { _id: '$project', score: { $sum: { $switch: { branches: [{ case: { $eq: ['$severity', 'CRITICAL'] }, then: 10 }, { case: { $eq: ['$severity', 'HIGH'] }, then: 5 }, { case: { $eq: ['$severity', 'MEDIUM'] }, then: 2 }], default: 1 } } }, open: { $sum: 1 } } }, { $sort: { score: -1 } }, { $limit: 5 }, { $lookup: { from: 'projects', localField: '_id', foreignField: '_id', as: 'p' } }, { $project: { name: { $arrayElemAt: ['$p.name', 0] }, score: 1, open: 1 } }]),
    req.user.role === 'developer' ? 0 : Finding.countDocuments({ project: { $in: ids }, source: 'gitleaks', status: 'open' }),
    Finding.distinct('project', { project: { $in: ids }, lastSeen: { $gte: new Date(Date.now() - 7 * DAY) } })]);
  const quality = await QualityReport.aggregate([{ $match: { project: { $in: ids }, branch: null } }, { $sort: { createdAt: -1 } }, { $group: { _id: '$project', m: { $first: '$metrics' } } }]);
  res.json({ severity: Object.fromEntries(bySev.map(x => [x._id, x.n])), status: Object.fromEntries(byStatus.map(x => [x._id, x.n])), trend: trend.map(t => ({ date: t._id, new: t.n })), topRisk: risk, openSecrets: secrets,
    codeQualityIssues: quality.reduce((a, x) => a + (x.m?.bugs || 0) + (x.m?.vulnerabilities || 0) + (x.m?.codeSmells || 0), 0), scanCompletion: { scannedLast7d: scanned.length, projects: ids.length } });
}));
r.get('/activity', ah(async (req, res) => {
  const ids = await projectIds(req.user); res.json(await Activity.find({ $or: [{ project: null }, { project: { $in: ids } }] }).populate('project', 'name').sort({ at: -1 }).limit(+req.query.limit || 30));
}));
r.get('/health', ah(async (_req, res) => {
  const { Integration } = await import('../models.js'); const i = await Integration.find().select('type status enabled');
  const bad = i.filter(x => x.enabled && x.status === 'error').length; res.json({ state: bad ? 'degraded' : 'healthy', integrations: i.map(x => ({ type: x.type, status: x.status })) });
}));
r.get('/search', ah(async (req, res) => {
  const q = String(req.query.q || '').trim().slice(0, 60); if (q.length < 2) return res.json([]); const re = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'); const ids = await projectIds(req.user);
  const [p, f, b] = await Promise.all([Project.find({ _id: { $in: ids }, $or: [{ name: re }, { key: re }, { githubRepo: re }] }).limit(5), Finding.find({ project: { $in: ids }, $or: [{ vulnId: re }, { pkg: re }] }).limit(5), Build.find({ project: { $in: ids }, job: re }).limit(5)]);
  res.json([...p.map(x => ({ kind: 'Project', label: `${x.name} (${x.key})`, to: '/projects' })), ...f.map(x => ({ kind: 'Finding', label: `${x.vulnId} - ${x.pkg}`, to: '/security' })), ...b.map(x => ({ kind: 'Build', label: `${x.job} #${x.number}`, to: '/pipelines' }))]);
}));
export default r;
