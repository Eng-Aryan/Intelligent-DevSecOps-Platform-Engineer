import { QualityReport, Project } from '../models.js';
import { http } from './integrations.js';
import { notify, activity } from './audit.js';

export async function syncQuality(project, branch) {
  if (!project.sonarKey) return null;
  const { client, cfg } = await http('sonarqube');
  const params = { projectKey: project.sonarKey, ...(branch ? { branch } : {}) };
  const gate = (await client.get('/api/qualitygates/project_status', { params })).data.projectStatus;
  const m = (await client.get('/api/measures/component', { params: { component: project.sonarKey, ...(branch ? { branch } : {}),
    metricKeys: 'bugs,vulnerabilities,code_smells,coverage,duplicated_lines_density,sqale_index,security_hotspots' } })).data.component.measures;
  const v = Object.fromEntries(m.map(x => [x.metric, parseFloat(x.value)]));
  const prev = await QualityReport.findOne({ project: project._id, branch: branch || null }).sort({ createdAt: -1 });
  const rep = await QualityReport.create({ project: project._id, branch: branch || null, gate: gate.status, conditions: gate.conditions,
    metrics: { bugs: v.bugs, vulnerabilities: v.vulnerabilities, codeSmells: v.code_smells, coverage: v.coverage, duplication: v.duplicated_lines_density, techDebtMin: v.sqale_index, hotspots: v.security_hotspots },
    url: `${cfg.baseUrl}/dashboard?id=${encodeURIComponent(project.sonarKey)}${branch ? '&branch=' + encodeURIComponent(branch) : ''}` });
  if (!prev || prev.gate !== rep.gate) {
    await activity({ type: 'quality', status: rep.gate, title: `${project.name} quality gate: ${rep.gate}`, project: project._id, link: '/quality' });
    if (rep.gate !== 'OK') await notify({ type: 'quality_gate_failed', severity: 'warning', title: `Quality gate ${rep.gate}: ${project.name}`, message: 'Deployments may be blocked by policy until the gate passes.', project: project._id, link: '/quality' });
  }
  return rep;
}
export async function syncAllQuality() { for (const p of await Project.find({ status: 'active', sonarKey: { $ne: null } })) { try { await syncQuality(p); } catch (e) { console.warn('sonar sync', p.key, e.message); } } }
