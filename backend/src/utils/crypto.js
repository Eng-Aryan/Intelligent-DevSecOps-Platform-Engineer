import crypto from 'crypto';
import { cfg } from '../config.js';
const key = () => Buffer.from(cfg.encKey, 'hex');
export function encrypt(text) {
  const iv = crypto.randomBytes(12); const c = crypto.createCipheriv('aes-256-gcm', key(), iv);
  const enc = Buffer.concat([c.update(text, 'utf8'), c.final()]);
  return [iv, c.getAuthTag(), enc].map(b => b.toString('base64')).join(':');
}
export function decrypt(payload) {
  const [iv, tag, enc] = payload.split(':').map(s => Buffer.from(s, 'base64'));
  const d = crypto.createDecipheriv('aes-256-gcm', key(), iv); d.setAuthTag(tag);
  return Buffer.concat([d.update(enc), d.final()]).toString('utf8');
}
export const sha256 = s => crypto.createHash('sha256').update(s).digest('hex');
