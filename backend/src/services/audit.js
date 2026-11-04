import { AuditLog, Notification, Activity } from '../models.js';
import { cleanMeta } from '../utils/redact.js';
import { broadcast } from './sse.js';

export async function audit(req, action, target = '', outcome = 'success', meta = {}, actor = req?.user) {
  try {
    await AuditLog.create({ actor: actor?._id, actorLabel: actor?.email || meta?.email || 'anonymous', action, target: String(target), outcome,
      ip: req?.ip, meta: cleanMeta(meta) });
  } catch (e) { console.error('audit failed', e.message); }
}
export async function notify({ type, severity = 'info', title, message = '', project, link = '' }) {
  const n = await Notification.create({ type, severity, title, message, project, link });
  broadcast('notification', { id: n._id, type, severity, title, message, project: project ? String(project) : null, link });
  return n;
}
export async function activity({ type, status = '', title, project, link = '' }) {
  try { await Activity.create({ type, status, title, project, link }); broadcast('activity', { type, title }); } catch (e) { console.error(e.message); }
}
