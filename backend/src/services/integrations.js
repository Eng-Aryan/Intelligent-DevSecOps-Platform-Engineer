import axios from 'axios';
import Docker from 'dockerode';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { Integration } from '../models.js';
import { decrypt } from '../utils/crypto.js';
import { HttpError } from '../utils/http.js';
const run = promisify(execFile);

export async function getCfg(type, { required = true } = {}) {
  const i = await Integration.findOne({ type });
  if (!i || !i.enabled) { if (required) throw new HttpError(409, `The ${type} integration is not configured or is disabled. Configure it under Integrations.`); return null; }
  return { baseUrl: (i.baseUrl || '').replace(/\/+$/, ''), username: i.username, secret: i.secretEnc ? decrypt(i.secretEnc) : '', extra: i.extra || {}, doc: i };
}
export async function http(type) {
  const c = await getCfg(type); const headers = {}; let auth;
  if (type === 'jenkins') auth = { username: c.username, password: c.secret };
  else if (type === 'sonarqube') auth = { username: c.secret, password: '' };
  else if (c.secret) headers.Authorization = `Bearer ${c.secret}`;
  if (type === 'github') headers.Accept = 'application/vnd.github+json';
  const baseURL = c.baseUrl || (type === 'github' ? 'https://api.github.com' : '');
  if (!baseURL) throw new HttpError(409, `${type} base URL is not set`);
  return { client: axios.create({ baseURL, headers, auth, timeout: 20000, maxContentLength: 50e6 }), cfg: c };
}
export async function dockerClient() {
  const c = await getCfg('docker');
  if (c.baseUrl && /^(tcp|https?):\/\//.test(c.baseUrl)) { const u = new URL(c.baseUrl.replace(/^tcp/, 'http')); return new Docker({ host: u.hostname, port: +u.port || 2375 }); }
  return process.platform === 'win32' ? new Docker({ socketPath: '//./pipe/docker_engine' }) : new Docker({ socketPath: '/var/run/docker.sock' });
}

export async function testIntegration(type) {
  switch (type) {
    case 'github': { const { client } = await http(type); const r = await client.get('/user'); return `Authenticated as ${r.data.login}`; }
    case 'jenkins': { const { client } = await http(type); const r = await client.get('/api/json?tree=nodeDescription,jobs[name]'); return `Connected, ${r.data.jobs?.length ?? 0} jobs visible`; }
    case 'sonarqube': { const { client } = await http(type); const r = await client.get('/api/system/status'); return `SonarQube ${r.data.version} (${r.data.status})`; }
    case 'prometheus': { const { client } = await http(type); const r = await client.get('/-/healthy'); return String(r.data).trim() || 'Healthy'; }
    case 'grafana': { const { client } = await http(type); const r = await client.get('/api/health'); return `Grafana ${r.data.version || ''} database ${r.data.database}`; }
    case 'docker': { const d = await dockerClient(); await d.ping(); const v = await d.version(); return `Docker Engine ${v.Version}`; }
    case 'ai': { const { client, cfg } = await http(type); await client.get('/models').catch(() => null); return `Provider reachable, model: ${cfg.extra.model || 'not set'}`; }
    case 'trivy': case 'gitleaks': { const { stdout } = await run(type, ['version'], { timeout: 10000 }); return stdout.split('\n')[0]; }
    default: throw new HttpError(400, 'Unknown integration');
  }
}
export { run };
