import express from 'express'; import cors from 'cors'; import helmet from 'helmet'; import morgan from 'morgan'; import rateLimit from 'express-rate-limit';
import mongoose from 'mongoose'; import bcrypt from 'bcryptjs'; import path from 'path'; import fs from 'fs'; import { fileURLToPath } from 'url';
import { cfg } from './config.js'; import { User } from './models.js'; import { errorHandler } from './utils/http.js';
import { authRouter, usersRouter } from './routes/auth.js'; import projects from './routes/projects.js'; import integrations from './routes/integrations.js';
import github, { webhook } from './routes/github.js'; import cicd from './routes/cicd.js'; import security from './routes/security.js'; import docker from './routes/docker.js';
import deployments from './routes/deployments.js'; import dashboard from './routes/dashboard.js'; import ops from './routes/ops.js'; import reports from './routes/reports.js';
import { eventsRouter, notificationsRouter, auditRouter } from './routes/misc.js'; import { startJobs } from './scheduler.js';

const app = express(); app.set('trust proxy', 1);
app.use(helmet()); app.use(cors({ origin: cfg.clientUrl })); app.use(morgan('dev'));
app.post('/api/github/webhook', express.raw({ type: '*/*', limit: '5mb' }), webhook);   // raw body needed for HMAC verification
app.use(express.json({ limit: '25mb' }));
app.use('/api', rateLimit({ windowMs: 60000, limit: 600, standardHeaders: true, legacyHeaders: false }));
app.use('/api/auth', rateLimit({ windowMs: 15 * 60000, limit: 60 }), authRouter);
app.use('/api/users', usersRouter); app.use('/api/projects', projects); app.use('/api/integrations', integrations); app.use('/api/github', github);
app.use('/api/cicd', cicd); app.use('/api/security', security); app.use('/api/docker', docker); app.use('/api/deployments', deployments);
app.use('/api/dashboard', dashboard); app.use('/api', ops); app.use('/api/reports', reports); app.use('/api/events', eventsRouter);
app.use('/api/notifications', notificationsRouter); app.use('/api/audit', auditRouter);
app.get('/api/healthz', (_q, r) => r.json({ ok: true, db: mongoose.connection.readyState === 1 }));
const dist = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../frontend/dist');
if (fs.existsSync(dist)) { app.use(express.static(dist)); app.get(/^\/(?!api).*/, (_q, r) => r.sendFile(path.join(dist, 'index.html'))); }
app.use('/api', (_q, r) => r.status(404).json({ error: 'Not found' }));
app.use(errorHandler);

try { await mongoose.connect(cfg.mongo, { serverSelectionTimeoutMS: 8000 }); }
catch (e) { console.error(`\n[ERROR] Cannot connect to MongoDB at ${cfg.mongo}\n        Start MongoDB (e.g. "docker compose up -d" in the project root) and retry.\n`); process.exit(1); }
if (!(await User.countDocuments()) && cfg.admin.email && cfg.admin.password) {
  await User.create({ name: cfg.admin.name, email: cfg.admin.email, role: 'admin', passwordHash: await bcrypt.hash(cfg.admin.password, 12) }); console.log(`Seeded administrator ${cfg.admin.email}`);
}
startJobs(); app.listen(cfg.port, () => console.log(`API listening on http://localhost:${cfg.port}`));
