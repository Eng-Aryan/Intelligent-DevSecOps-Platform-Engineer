const patterns = [
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g, '[REDACTED PRIVATE KEY]'],
  [/\b(AKIA|ASIA)[0-9A-Z]{16}\b/g, '[REDACTED AWS KEY]'],
  [/\bgh[pousr]_[A-Za-z0-9]{20,}\b/g, '[REDACTED GITHUB TOKEN]'],
  [/\bglpat-[A-Za-z0-9_-]{20,}\b/g, '[REDACTED GITLAB TOKEN]'],
  [/\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g, '[REDACTED SLACK TOKEN]'],
  [/(Bearer\s+)[A-Za-z0-9._-]{10,}/gi, '$1[REDACTED]'],
  [/((?:password|passwd|pwd|secret|token|api[_-]?key|apikey|access[_-]?key)\s*[:=]\s*)["']?[^\s"']{4,}["']?/gi, '$1[REDACTED]'],
  [/(\/\/[^/\s:@]+:)[^@\s/]+(@)/g, '$1[REDACTED]$2'],
];
export const redact = t => (typeof t === 'string' ? patterns.reduce((s, [r, x]) => s.replace(r, x), t) : t);
export const maskSecret = s => (!s ? '' : s.length <= 12 ? '********' : s.slice(0, 2) + '*'.repeat(8) + s.slice(-2));
const SENSITIVE = /pass|token|secret|authorization|cookie|key/i;
export function cleanMeta(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  return Object.fromEntries(Object.entries(obj).filter(([k]) => !SENSITIVE.test(k)).map(([k, v]) => [k, typeof v === 'string' ? redact(v).slice(0, 500) : v]));
}
