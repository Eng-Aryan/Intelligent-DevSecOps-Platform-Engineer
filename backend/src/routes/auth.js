import { Router } from 'express';
import bcrypt from 'bcryptjs'; import jwt from 'jsonwebtoken'; import crypto from 'crypto'; import { z } from 'zod';
import { User } from '../models.js';
import { cfg } from '../config.js';
import { auth, requireRole } from '../middleware/auth.js';
import { ah, HttpError } from '../utils/http.js';
import { audit } from '../services/audit.js';
import { sha256 } from '../utils/crypto.js';

const pub = u => ({ id: u._id, name: u.name, email: u.email, role: u.role, status: u.status, prefs: u.prefs, lastLoginAt: u.lastLoginAt });
const sign = u => jwt.sign({ sub: String(u._id), role: u.role }, cfg.jwtSecret, { expiresIn: cfg.jwtExpires });
const pw = z.string().min(10, 'must be at least 10 characters');

export const authRouter = Router();
authRouter.post('/register', ah(async (req, res) => {
  const total = await User.countDocuments();
  if (!cfg.allowRegistration && total > 0) throw new HttpError(403, 'Self-registration is disabled');
  const b = z.object({ name: z.string().min(2), email: z.string().email(), password: pw }).parse(req.body);
  if (await User.exists({ email: b.email.toLowerCase() })) throw new HttpError(409, 'Email is already registered');
  const u = await User.create({ name: b.name, email: b.email, role: total === 0 ? 'admin' : 'developer', passwordHash: await bcrypt.hash(b.password, 12) });
  await audit(req, 'user.register', u.email, 'success', {}, u);
  res.status(201).json({ token: sign(u), user: pub(u) });
}));
authRouter.post('/login', ah(async (req, res) => {
  const b = z.object({ email: z.string().email(), password: z.string() }).parse(req.body);
  const u = await User.findOne({ email: b.email.toLowerCase() });
  if (u?.lockUntil && u.lockUntil > new Date()) { await audit(req, 'auth.login', b.email, 'denied', { reason: 'locked' }, u); throw new HttpError(423, 'Account temporarily locked after repeated failures. Try again later.'); }
  if (!u || !u.passwordHash || !(await bcrypt.compare(b.password, u.passwordHash))) {
    if (u) { u.failedLogins += 1; if (u.failedLogins >= 5) { u.lockUntil = new Date(Date.now() + 15 * 60000); u.failedLogins = 0; } await u.save(); }
    await audit(req, 'auth.login', b.email, 'failure', { email: b.email }, u || null);
    throw new HttpError(401, 'Invalid email or password');
  }
  if (u.status !== 'active') { await audit(req, 'auth.login', b.email, 'denied', { reason: u.status }, u); throw new HttpError(403, 'Account is not active'); }
  u.failedLogins = 0; u.lockUntil = undefined; u.lastLoginAt = new Date(); await u.save();
  await audit(req, 'auth.login', u.email, 'success', {}, u);
  res.json({ token: sign(u), user: pub(u) });
}));
authRouter.post('/logout', auth, ah(async (req, res) => { await audit(req, 'auth.logout', req.user.email); res.json({ ok: true }); }));
authRouter.post('/forgot', ah(async (req, res) => {
  const { email } = z.object({ email: z.string().email() }).parse(req.body);
  const u = await User.findOne({ email: email.toLowerCase() });
  if (u && u.status !== 'suspended') {
    const t = crypto.randomBytes(32).toString('hex'); u.resetTokenHash = sha256(t); u.resetExpires = new Date(Date.now() + 3600e3); await u.save();
    // No SMTP is bundled: the link is printed on the server console. Plug nodemailer here for production.
    console.log(`[password-reset] ${u.email}: ${cfg.clientUrl}/login?reset=${t}`);
    await audit(req, 'auth.password_reset_requested', u.email, 'success', {}, u);
  }
  res.json({ ok: true, message: 'If the account exists, a reset link has been issued.' });
}));
authRouter.post('/reset', ah(async (req, res) => {
  const b = z.object({ token: z.string(), password: pw }).parse(req.body);
  const u = await User.findOne({ resetTokenHash: sha256(b.token), resetExpires: { $gt: new Date() } });
  if (!u) throw new HttpError(400, 'Reset link is invalid or expired');
  u.passwordHash = await bcrypt.hash(b.password, 12); u.resetTokenHash = undefined; u.resetExpires = undefined; if (u.status === 'invited') u.status = 'active'; await u.save();
  await audit(req, 'auth.password_reset', u.email, 'success', {}, u); res.json({ ok: true });
}));
authRouter.get('/me', auth, (req, res) => res.json(pub(req.user)));
authRouter.patch('/me', auth, ah(async (req, res) => {
  const b = z.object({ name: z.string().min(2).optional(), prefs: z.object({ muted: z.array(z.string()).optional(), email: z.boolean().optional() }).optional() }).parse(req.body);
  if (b.name) req.user.name = b.name; if (b.prefs) req.user.prefs = { ...req.user.prefs.toObject?.() , ...b.prefs };
  await req.user.save(); res.json(pub(req.user));
}));
authRouter.post('/password', auth, ah(async (req, res) => {
  const b = z.object({ current: z.string(), password: pw }).parse(req.body);
  if (!(await bcrypt.compare(b.current, req.user.passwordHash))) throw new HttpError(400, 'Current password is incorrect');
  req.user.passwordHash = await bcrypt.hash(b.password, 12); await req.user.save(); await audit(req, 'user.password_change', req.user.email); res.json({ ok: true });
}));

export const usersRouter = Router();
usersRouter.use(auth);
usersRouter.get('/lookup', requireRole('admin', 'devops'), ah(async (_req, res) => res.json(await User.find({ status: 'active' }).select('name role email'))));
usersRouter.use(requireRole('admin'));
usersRouter.get('/', ah(async (_req, res) => res.json((await User.find().sort({ createdAt: -1 })).map(pub))));
usersRouter.post('/invite', ah(async (req, res) => {
  const b = z.object({ name: z.string().min(2), email: z.string().email(), role: z.enum(['admin', 'devops', 'developer']) }).parse(req.body);
  if (await User.exists({ email: b.email.toLowerCase() })) throw new HttpError(409, 'User already exists');
  const t = crypto.randomBytes(32).toString('hex');
  const u = await User.create({ ...b, status: 'invited', resetTokenHash: sha256(t), resetExpires: new Date(Date.now() + 7 * 86400e3) });
  await audit(req, 'user.invite', u.email, 'success', { role: u.role });
  res.status(201).json({ user: pub(u), inviteLink: `${cfg.clientUrl}/login?reset=${t}` });
}));
usersRouter.patch('/:id', ah(async (req, res) => {
  const b = z.object({ role: z.enum(['admin', 'devops', 'developer']).optional(), status: z.enum(['active', 'suspended']).optional(), name: z.string().optional() }).parse(req.body);
  const u = await User.findById(req.params.id); if (!u) throw new HttpError(404, 'User not found');
  if (String(u._id) === String(req.user._id) && (b.role || b.status)) throw new HttpError(400, 'You cannot change your own role or status');
  const before = { role: u.role, status: u.status }; Object.assign(u, b); await u.save();
  await audit(req, 'user.update', u.email, 'success', { before, after: b }); res.json(pub(u));
}));
