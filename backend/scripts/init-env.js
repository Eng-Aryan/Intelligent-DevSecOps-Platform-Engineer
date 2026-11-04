import fs from 'fs'; import crypto from 'crypto';
if (fs.existsSync('.env')) { console.log('.env already exists - keeping it.'); process.exit(0); }
const pw = crypto.randomBytes(12).toString('base64url');
const out = fs.readFileSync('.env.example', 'utf8')
  .replace('__JWT_SECRET__', crypto.randomBytes(48).toString('base64url'))
  .replace('__ENCRYPTION_KEY__', crypto.randomBytes(32).toString('hex'))
  .replace('__WEBHOOK_SECRET__', crypto.randomBytes(24).toString('hex'))
  .replace('__ADMIN_PASSWORD__', pw);
fs.writeFileSync('.env', out);
console.log('\n  Created backend/.env with freshly generated secrets.');
console.log('  Admin login   : admin@devsecops.local');
console.log('  Admin password: ' + pw + '   (also stored in backend/.env)\n');
