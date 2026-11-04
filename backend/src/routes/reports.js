import { Router } from 'express'; import PDFDocument from 'pdfkit'; import fs from 'fs'; import path from 'path'; import { fileURLToPath } from 'url'; import { z } from 'zod';
import { Report, Finding, QualityReport, Build, Deployment } from '../models.js';
import { auth, getProject } from '../middleware/auth.js';
import { ah, HttpError } from '../utils/http.js';
import { audit } from '../services/audit.js';

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../storage/reports'); fs.mkdirSync(dir, { recursive: true });
const r = Router(); r.use(auth);
const ORDER = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'UNKNOWN'];

async function build(p, user, { from, to, severity }) {
  const range = { $gte: from, $lte: to }; const canSeeSecrets = user.role !== 'developer';
  const fq = { project: p._id, lastSeen: range }; if (severity?.length) fq.severity = { $in: severity }; if (!canSeeSecrets) fq.source = 'trivy';
  const [findings, quality, builds, deps] = await Promise.all([Finding.find(fq).sort({ severity: 1 }).limit(400), QualityReport.findOne({ project: p._id, createdAt: { $lte: to } }).sort({ createdAt: -1 }),
    Build.find({ project: p._id, startedAt: range }), Deployment.find({ project: p._id, createdAt: range }).sort({ createdAt: -1 }).limit(15)]);
  return { findings, quality, builds, deps, canSeeSecrets };
}
function render(p, user, params, d, stream) {
  const doc = new PDFDocument({ margin: 50, size: 'A4' }); doc.pipe(stream); const h = (t) => { doc.moveDown(0.8).fontSize(14).fillColor('#1d4ed8').text(t).fillColor('#000').fontSize(10).moveDown(0.3); };
  doc.fontSize(22).text('Security & Operations Report'); doc.fontSize(10).fillColor('#555').text(`Project: ${p.name} (${p.key})${p.githubRepo ? ' - ' + p.githubRepo : ''}`).text(`Period: ${params.from.toISOString().slice(0, 10)} to ${params.to.toISOString().slice(0, 10)}`).text(`Generated: ${new Date().toISOString()} by ${user.email}`).fillColor('#000');
  const sev = Object.fromEntries(ORDER.map(s => [s, d.findings.filter(f => f.severity === s && f.status === 'open').length])); const open = d.findings.filter(f => f.status === 'open').length;
  const fin = d.builds.filter(b => ['success', 'failed', 'unstable'].includes(b.status)); const ok = fin.filter(b => b.status === 'success').length;
  h('1. Executive summary');
  doc.text(`${open} open finding(s) in the period (${sev.CRITICAL} critical, ${sev.HIGH} high, ${sev.MEDIUM} medium, ${sev.LOW} low). Quality gate: ${d.quality?.gate || 'no data'}. ${d.builds.length} pipeline run(s), success rate ${fin.length ? Math.round(ok / fin.length * 100) + '%' : 'n/a'}. ${d.deps.length} deployment record(s).`);
  h('2. Vulnerability severity distribution'); ORDER.forEach(s => doc.text(`${s}: ${sev[s]}`));
  h('3. SonarQube analysis'); if (d.quality) { const m = d.quality.metrics || {}; doc.text(`Gate ${d.quality.gate} | bugs ${m.bugs ?? '-'} | vulnerabilities ${m.vulnerabilities ?? '-'} | code smells ${m.codeSmells ?? '-'} | coverage ${m.coverage ?? '-'}% | duplication ${m.duplication ?? '-'}%`); } else doc.text('No SonarQube data recorded.');
  h('4. Trivy findings'); const t = d.findings.filter(f => f.source === 'trivy').slice(0, 40); if (!t.length) doc.text('None in period.'); t.forEach(f => doc.text(`[${f.severity}] ${f.vulnId} ${f.pkg} ${f.installedVersion || ''} -> ${f.fixedVersion || 'no fix listed'} (${f.status})`));
  h('5. Gitleaks findings'); if (!d.canSeeSecrets) doc.text('Restricted to DevOps engineers and administrators.'); else { const g = d.findings.filter(f => f.source === 'gitleaks').slice(0, 40); if (!g.length) doc.text('None in period.'); g.forEach(f => doc.text(`${f.vulnId} in ${f.target} (${f.pkg}) value ${f.maskedSecret} (${f.status})`)); }
  h('6. Remediation recommendations');
  doc.text('- Upgrade vulnerable packages to the listed fixed versions and rebuild images.\n- Rotate every exposed credential immediately; deleting it from code does not revoke it.\n- Fix failing quality-gate conditions before the next release.\n- Re-run scans to validate remediation; status changes to resolved only from a later scan or an authorised workflow.');
  h('7. Pipelines and deployments'); d.deps.forEach(x => doc.text(`${x.createdAt.toISOString().slice(0, 16)}  ${x.environment}  ${x.version}  ${x.status}`)); if (!d.deps.length) doc.text('No deployments in period.');
  doc.end();
}
r.post('/', ah(async (req, res) => {
  const b = z.object({ projectId: z.string(), from: z.coerce.date(), to: z.coerce.date(), severity: z.array(z.string()).optional() }).parse(req.body);
  const p = await getProject(req.user, b.projectId); const d = await build(p, req.user, b);
  const rep = await Report.create({ title: `${p.name} report ${b.from.toISOString().slice(0, 10)} - ${b.to.toISOString().slice(0, 10)}`, project: p._id, createdBy: req.user._id, params: { from: b.from, to: b.to, severity: b.severity } });
  const file = `${rep._id}.pdf`; const ws = fs.createWriteStream(path.join(dir, file)); render(p, req.user, b, d, ws);
  await new Promise(ok => ws.on('finish', ok)); rep.file = file; rep.size = fs.statSync(path.join(dir, file)).size; await rep.save();
  await audit(req, 'report.generate', p.key); res.status(201).json(rep);
}));
r.get('/', ah(async (req, res) => {
  const { projectIds } = await import('../middleware/auth.js'); const ids = await projectIds(req.user);
  res.json(await Report.find({ project: { $in: ids } }).populate('project createdBy', 'name').sort({ createdAt: -1 }).limit(100));
}));
r.get('/:id/download', ah(async (req, res) => {
  const rep = await Report.findById(req.params.id); if (!rep) throw new HttpError(404, 'Report not found'); await getProject(req.user, rep.project);
  await audit(req, 'report.download', rep.title); res.download(path.join(dir, path.basename(rep.file)), `${rep.title.replace(/[^\w.-]+/g, '_')}.pdf`);
}));
export default r;
