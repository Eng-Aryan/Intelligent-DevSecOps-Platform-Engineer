// Usage: node scripts/make-admin.js you@example.com [admin|devops|developer]
import mongoose from 'mongoose'; import { cfg } from '../src/config.js'; import { User } from '../src/models.js';
const [email, role = 'admin'] = process.argv.slice(2);
if (!email || !['admin', 'devops', 'developer'].includes(role)) { console.log('Usage: node scripts/make-admin.js <email> [admin|devops|developer]'); process.exit(1); }
await mongoose.connect(cfg.mongo, { serverSelectionTimeoutMS: 8000 });
const u = await User.findOneAndUpdate({ email: email.toLowerCase() }, { role, status: 'active' }, { new: true });
console.log(u ? `${u.email} is now ${u.role}. Log out and log in again.` : `No user with email ${email}`); await mongoose.disconnect();
