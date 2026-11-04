const clients = new Set();
export function addClient(req, res) {
  res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
  res.write('retry: 5000\n\n'); const c = { res, user: req.user }; clients.add(c);
  const ping = setInterval(() => res.write(': ping\n\n'), 25000);
  req.on('close', () => { clearInterval(ping); clients.delete(c); });
}
export const broadcast = (event, data) => clients.forEach(c => c.res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
