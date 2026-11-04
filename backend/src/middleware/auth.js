import jwt from 'jsonwebtoken';
import { cfg } from '../config.js';
import { User, Project } from '../models.js';
import { HttpError, ah } from '../utils/http.js';

export const auth = ah(async (req, _res, next) => {
  const h = req.headers.authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : (req.originalUrl.startsWith('/api/events') ? req.query.token : null);
  if (!token) throw new HttpError(401, 'Authentication required');
  let p; try { p = jwt.verify(token, cfg.jwtSecret); } catch { throw new HttpError(401, 'Session expired or invalid'); }
  const user = await User.findById(p.sub);
  if (!user || user.status !== 'active') throw new HttpError(401, 'Account unavailable');
  req.user = user; next();
});
export const requireRole = (...roles) => (req, _res, next) => roles.includes(req.user.role) ? next() : next(new HttpError(403, 'Insufficient permissions'));

// Least-privilege scoping: admins see everything, others only projects they own or are members of.
export async function projectIds(user, only) {
  const q = user.role === 'admin' ? {} : { $or: [{ owner: user._id }, { members: user._id }] };
  const ids = (await Project.find(q).select('_id')).map(p => p._id);
  return only ? ids.filter(i => String(i) === String(only)) : ids;
}
export async function getProject(user, id) {
  const p = await Project.findById(id);
  if (!p) throw new HttpError(404, 'Project not found');
  if (user.role !== 'admin' && !(String(p.owner) === String(user._id) || p.members.some(m => String(m) === String(user._id)))) throw new HttpError(403, 'You are not a member of this project');
  return p;
}
