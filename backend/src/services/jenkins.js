import { Build, Project } from '../models.js';
import { http } from './integrations.js';
import { notify, activity } from './audit.js';
import { redact } from '../utils/redact.js';

export const jobPath = name => name.split('/').filter(Boolean).map(p => `job/${encodeURIComponent(p)}`).join('/');
const mapStatus = (b) => b.building ? 'running' : ({ SUCCESS: 'success', FAILURE: 'failed', ABORTED: 'aborted', UNSTABLE: 'unstable', NOT_BUILT: 'aborted' }[b.result] || 'queued');

export async function syncProject(project, limit = 25) {
  if (!project.jenkinsJob) return 0;
  const { client } = await http('jenkins');
  const tree = 'builds[number,result,building,timestamp,duration,url,actions[lastBuiltRevision[SHA1,branch[name]]]]{0,' + limit + '}';
  const { data } = await client.get(`/${jobPath(project.jenkinsJob)}/api/json`, { params: { tree } });
  let n = 0;
  for (const b of data.builds || []) {
    const rev = (b.actions || []).find(a => a.lastBuiltRevision)?.lastBuiltRevision;
    const status = mapStatus(b);
    const prev = await Build.findOne({ project: project._id, number: b.number });
    let stages = prev?.stages || [];
    if (!b.building || !prev) {
      try {
        const w = await client.get(`/${jobPath(project.jenkinsJob)}/${b.number}/wfapi/describe`);
        stages = (w.data.stages || []).map(s => ({ name: s.name, status: String(s.status || '').toLowerCase(), startedAt: s.startTimeMillis ? new Date(s.startTimeMillis) : null,
          duration: s.durationMillis, error: s.error?.message ? redact(s.error.message) : undefined }));
      } catch { /* not a Pipeline job: no stage data available */ }
    }
    await Build.updateOne({ project: project._id, number: b.number }, { $set: { job: project.jenkinsJob, status, branch: rev?.branch?.[0]?.name?.replace('refs/remotes/origin/', ''),
      commit: rev?.SHA1, startedAt: new Date(b.timestamp), duration: b.duration, url: b.url, stages } }, { upsert: true });
    if ((!prev || prev.status === 'running') && status !== 'running') {
      n++;
      await activity({ type: 'pipeline', status, title: `${project.name} build #${b.number} ${status}`, project: project._id, link: '/pipelines' });
      if (status === 'failed') await notify({ type: 'pipeline_failed', severity: 'critical', title: `Pipeline failed: ${project.name} #${b.number}`, message: 'Open the build to review failing stages and ask the AI assistant for an explanation.', project: project._id, link: '/pipelines' });
    }
  }
  return n;
}
export async function trigger(project, params) {
  const { client } = await http('jenkins');
  const p = jobPath(project.jenkinsJob);
  if (params && Object.keys(params).length) await client.post(`/${p}/buildWithParameters`, null, { params });
  else await client.post(`/${p}/build`);
}
export async function cancel(build) { const { client } = await http('jenkins'); await client.post(`/${jobPath(build.job)}/${build.number}/stop`); }
export async function consoleLog(build, tail = 60000) {
  const { client } = await http('jenkins');
  const { data } = await client.get(`/${jobPath(build.job)}/${build.number}/consoleText`, { responseType: 'text', transformResponse: r => r });
  return redact(String(data).slice(-tail));
}
export async function syncAll() { for (const p of await Project.find({ status: 'active', jenkinsJob: { $ne: null } })) { try { await syncProject(p); } catch (e) { console.warn('jenkins sync', p.key, e.message); } } }
