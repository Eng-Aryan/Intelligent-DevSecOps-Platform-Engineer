import { Router } from 'express'; import crypto from 'crypto'; import { z } from 'zod';
import { Project, Build, QualityReport, Finding, Deployment, WebhookDelivery } from '../models.js';
import { auth, getProject, projectIds } from '../middleware/auth.js';
import { ah, HttpError } from '../utils/http.js';
import { http, getCfg } from '../services/integrations.js';
import { activity, audit, notify } from '../services/audit.js';
import { cfg } from '../config.js';
import { trigger, syncProject } from '../services/jenkins.js';

const r = Router(); r.use(auth);
const slug = z.string().regex(/^[\w.-]+$/);
r.get('/repos', ah(async (req, res) => {
  const { client } = await http('github'); const org = req.query.org ? slug.parse(req.query.org) : null;
  const { data } = await client.get(org ? `/orgs/${org}/repos` : '/user/repos', { params: { per_page: 100, sort: 'updated' } });
  const linked = await Project.find({ githubRepo: { $in: data.map(d => d.full_name) } }).select('githubRepo name');
  res.json(data.map(d => ({ fullName: d.full_name, description: d.description, private: d.private, defaultBranch: d.default_branch, updatedAt: d.pushed_at, language: d.language, url: d.html_url,
    project: linked.find(p => p.githubRepo === d.full_name)?.name || null })));
}));
r.get('/repos/:owner/:repo', ah(async (req, res) => {
  const owner = slug.parse(req.params.owner), repo = slug.parse(req.params.repo); const { client } = await http('github'); const base = `/repos/${owner}/${repo}`;
  const [meta, commits, prs, branches] = await Promise.all([client.get(base), client.get(`${base}/commits`, { params: { per_page: 15 } }), client.get(`${base}/pulls`, { params: { state: 'open', per_page: 15 } }), client.get(`${base}/branches`, { params: { per_page: 30 } })]);
  const project = await Project.findOne({ githubRepo: `${owner}/${repo}` });
  let linked = null;
  if (project && (await projectIds(req.user, project._id)).length) {
    const [build, scan, dep] = await Promise.all([Build.findOne({ project: project._id }).sort({ startedAt: -1 }), Finding.findOne({ project: project._id }).sort({ lastSeen: -1 }).select('lastSeen source'), Deployment.findOne({ project: project._id, status: 'succeeded' }).sort({ createdAt: -1 })]);
    linked = { project: { id: project._id, name: project.name }, latestBuild: build, latestScan: scan, lastDeployment: dep, quality: await QualityReport.findOne({ project: project._id }).sort({ createdAt: -1 }) };
  }
  res.json({ name: meta.data.full_name, description: meta.data.description, defaultBranch: meta.data.default_branch, url: meta.data.html_url,
    commits: commits.data.map(c => ({ sha: c.sha.slice(0, 7), message: c.commit.message.split('\n')[0], author: c.commit.author.name, date: c.commit.author.date, url: c.html_url })),
    pulls: prs.data.map(p => ({ number: p.number, title: p.title, author: p.user.login, state: p.state, draft: p.draft, url: p.html_url, updatedAt: p.updated_at })),
    branches: branches.data.map(b => b.name), linked });
}));
export default r;

// ---- Webhook: mounted BEFORE express.json with a raw body parser so the HMAC can be verified. ----
export const webhook = ah(async (req, res) => {
  const secret = cfg.githubWebhookSecret || (await getCfg('github', { required: false }))?.extra?.webhookSecret;
  if (!secret) throw new HttpError(503, 'Webhook secret not configured');
  const sig = req.headers['x-hub-signature-256'] || '';
  const expected = 'sha256=' + crypto.createHmac('sha256', secret).update(req.body).digest('hex');
  const ok = sig.length === expected.length && crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
  if (!ok) { await audit(req, 'github.webhook', 'invalid-signature', 'denied', {}, null); throw new HttpError(401, 'Invalid signature'); }
  const id = req.headers['x-github-delivery']; const event = req.headers['x-github-event'];
  if (id) { try { await WebhookDelivery.create({ deliveryId: id, event }); } catch (e) { if (e.code === 11000) return res.json({ ok: true, duplicate: true }); throw e; } }
  const p = JSON.parse(req.body.toString('utf8')); const repo = p.repository?.full_name;
  const project = repo ? await Project.findOne({ githubRepo: repo, status: 'active' }) : null;
  if (event === 'ping') return res.json({ ok: true });
  if (project) {
    if (event === 'push') {
      const branch = (p.ref || '').replace('refs/heads/', '');
      await activity({ type: 'commit', status: 'info', title: `${p.pusher?.name || 'someone'} pushed ${p.commits?.length || 0} commit(s) to ${repo}@${branch}`, project: project._id, link: '/repos' });
      if (project.policy?.autoTriggerOnPush && project.jenkinsJob && p.head_commit) {
        try { await trigger(project, {}); await activity({ type: 'pipeline', status: 'queued', title: `Pipeline triggered for ${project.name}`, project: project._id, link: '/pipelines' }); setTimeout(() => syncProject(project).catch(() => {}), 8000); }
        catch (e) { await notify({ type: 'pipeline_failed', severity: 'warning', title: `Could not trigger Jenkins for ${project.name}`, message: e.message, project: project._id }); }
      }
    } else if (event === 'pull_request') {
      await activity({ type: 'pull_request', status: p.action, title: `PR #${p.number} ${p.action}: ${p.pull_request?.title}`, project: project._id, link: '/repos' });
    }
  }
  res.json({ ok: true });
});
