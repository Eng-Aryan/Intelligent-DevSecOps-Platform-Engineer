import { Router } from 'express'; import { z } from 'zod';
import { Integration } from '../models.js';
import { auth, requireRole } from '../middleware/auth.js';
import { ah, HttpError } from '../utils/http.js';
import { audit } from '../services/audit.js';
import { encrypt } from '../utils/crypto.js';
import { testIntegration } from '../services/integrations.js';

const TYPES = ['github', 'jenkins', 'sonarqube', 'trivy', 'gitleaks', 'docker', 'prometheus', 'grafana', 'ai'];
const view = i => ({ type: i.type, baseUrl: i.baseUrl, username: i.username, extra: i.extra, enabled: i.enabled, status: i.status, lastCheckAt: i.lastCheckAt, lastError: i.lastError, hasSecret: !!i.secretEnc });
const r = Router(); r.use(auth);
r.get('/', requireRole('admin', 'devops'), ah(async (_req, res) => {
  const docs = await Integration.find(); res.json(TYPES.map(t => { const d = docs.find(x => x.type === t); return d ? view(d) : { type: t, enabled: false, status: 'not_configured', hasSecret: false }; }));
}));
const body = z.object({ baseUrl: z.string().url().or(z.literal('')).or(z.string().regex(/^tcp:\/\//)).optional(), username: z.string().optional(), secret: z.string().min(1).optional(), extra: z.record(z.any()).optional(), enabled: z.boolean().optional() });
r.put('/:type', requireRole('admin'), ah(async (req, res) => {
  const { type } = req.params; if (!TYPES.includes(type)) throw new HttpError(404, 'Unknown integration');
  const b = body.parse(req.body); const upd = { baseUrl: b.baseUrl, username: b.username, extra: b.extra, enabled: b.enabled ?? true };
  Object.keys(upd).forEach(k => upd[k] === undefined && delete upd[k]); if (b.secret) upd.secretEnc = encrypt(b.secret);
  const i = await Integration.findOneAndUpdate({ type }, { $set: upd }, { upsert: true, new: true });
  await audit(req, 'integration.configure', type, 'success', { fields: Object.keys(b).filter(k => k !== 'secret'), secretChanged: !!b.secret }); res.json(view(i));
}));
r.post('/:type/rotate', requireRole('admin'), ah(async (req, res) => {
  const { secret } = z.object({ secret: z.string().min(1) }).parse(req.body);
  const i = await Integration.findOne({ type: req.params.type }); if (!i) throw new HttpError(404, 'Integration not configured');
  i.secretEnc = encrypt(secret); await i.save(); await audit(req, 'integration.rotate_credentials', i.type); res.json(view(i));
}));
r.post('/:type/test', requireRole('admin', 'devops'), ah(async (req, res) => {
  const i = await Integration.findOne({ type: req.params.type }); if (!i) throw new HttpError(404, 'Integration not configured');
  try { const msg = await testIntegration(i.type); i.status = 'connected'; i.lastError = ''; i.lastCheckAt = new Date(); await i.save(); res.json({ ok: true, message: msg }); }
  catch (e) { i.status = 'error'; i.lastError = (e.response ? `HTTP ${e.response.status}: ` : '') + e.message; i.lastCheckAt = new Date(); await i.save(); res.status(200).json({ ok: false, message: i.lastError }); }
  await audit(req, 'integration.test', i.type, i.status === 'connected' ? 'success' : 'failure');
}));
r.delete('/:type', requireRole('admin'), ah(async (req, res) => { await Integration.deleteOne({ type: req.params.type }); await audit(req, 'integration.remove', req.params.type); res.json({ ok: true }); }));
export default r;
