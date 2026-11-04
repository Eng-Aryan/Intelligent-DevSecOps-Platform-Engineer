export class HttpError extends Error { constructor(status, message) { super(message); this.status = status; } }
export const ah = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
export function errorHandler(err, req, res, _next) {
  if (err?.name === 'ZodError') return res.status(400).json({ error: 'Validation failed: ' + err.issues.map(i => `${i.path.join('.')} ${i.message}`).join('; ') });
  if (err?.name === 'CastError') return res.status(400).json({ error: 'Invalid identifier' });
  if (err?.code === 11000) return res.status(409).json({ error: 'Duplicate value: ' + Object.keys(err.keyPattern || {}).join(',') });
  const status = err.status || 500;
  if (status >= 500) console.error(err.stack || err);
  const upstream = err.response ? ` (upstream HTTP ${err.response.status})` : '';
  res.status(status).json({ error: status >= 500 ? `${err.message}${upstream}` : err.message });
}
