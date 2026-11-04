import 'dotenv/config';
const need = (k, d) => { const v = process.env[k] ?? d; if (v === undefined) throw new Error(`Missing env var ${k}. Run setup.bat first.`); return v; };
export const cfg = {
  port: +(process.env.PORT || 5000),
  mongo: need('MONGO_URI', 'mongodb://127.0.0.1:27017/devsecops'),
  jwtSecret: need('JWT_SECRET'),
  jwtExpires: process.env.JWT_EXPIRES || '8h',
  encKey: need('ENCRYPTION_KEY'),
  clientUrl: process.env.CLIENT_URL || 'http://localhost:5173',
  githubWebhookSecret: process.env.GITHUB_WEBHOOK_SECRET || '',
  allowRegistration: process.env.ALLOW_REGISTRATION !== 'false',
  protectedContainers: (process.env.PROTECTED_CONTAINERS || '').split(',').map(s => s.trim()).filter(Boolean),
  admin: { name: process.env.ADMIN_NAME || 'Platform Admin', email: process.env.ADMIN_EMAIL, password: process.env.ADMIN_PASSWORD },
  jenkinsSync: +(process.env.JENKINS_SYNC_SECONDS || 60),
  sonarSync: +(process.env.SONAR_SYNC_SECONDS || 300),
};
