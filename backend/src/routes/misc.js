import { Router } from 'express';
import { Notification, AuditLog } from '../models.js';
import { auth, requireRole, projectIds } from '../middleware/auth.js';
import { ah } from '../utils/http.js';
import { addClient } from '../services/sse.js';

export const eventsRouter = Router();
eventsRouter.get('/', auth, (req, res) => addClient(req, res));

export const notificationsRouter = Router(); notificationsRouter.use(auth);
const scope = async u => ({ $or: [{ project: null }, { project: { $in: await projectIds(u) } }], type: { $nin: u.prefs?.muted || [] } });
notificationsRouter.get('/', ah(async (req, res) => {
  const f = await scope(req.user); if (req.query.severity) f.severity = String(req.query.severity); if (req.query.unread === 'true') f.readBy = { $ne: req.user._id };
  const items = await Notification.find(f).populate('project', 'name').sort({ createdAt: -1 }).limit(100);
  res.json({ items: items.map(n => ({ ...n.toObject(), read: n.readBy.some(x => String(x) === String(req.user._id)), readBy: undefined })), unread: await Notification.countDocuments({ ...(await scope(req.user)), readBy: { $ne: req.user._id } }) });
}));
notificationsRouter.post('/read-all', ah(async (req, res) => { await Notification.updateMany({ ...(await scope(req.user)), readBy: { $ne: req.user._id } }, { $addToSet: { readBy: req.user._id } }); res.json({ ok: true }); }));
notificationsRouter.post('/:id/read', ah(async (req, res) => { await Notification.updateOne({ _id: req.params.id }, { $addToSet: { readBy: req.user._id } }); res.json({ ok: true }); }));

export const auditRouter = Router(); auditRouter.use(auth, requireRole('admin'));
auditRouter.get('/', ah(async (req, res) => {
  const f = {}; for (const k of ['action', 'outcome']) if (req.query[k]) f[k] = req.query[k] === 'action' ? req.query[k] : String(req.query[k]);
  if (req.query.action) f.action = new RegExp('^' + String(req.query.action).replace(/[^\w.]/g, ''));
  if (req.query.actor) f.actorLabel = new RegExp(String(req.query.actor).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
  const limit = Math.min(+req.query.limit || 100, 500), skip = +req.query.skip || 0;
  const [items, total] = await Promise.all([AuditLog.find(f).sort({ at: -1 }).skip(skip).limit(limit), AuditLog.countDocuments(f)]); res.json({ items, total });
}));
