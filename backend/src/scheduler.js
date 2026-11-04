import { cfg } from './config.js';
import { syncAll } from './services/jenkins.js';
import { syncAllQuality } from './services/sonar.js';
import { Integration } from './models.js';
import { testIntegration } from './services/integrations.js';
import { notify } from './services/audit.js';

export function startJobs() {
  const guard = (fn) => { let busy = false; return async () => { if (busy) return; busy = true; try { await fn(); } catch (e) { console.warn('[job]', e.message); } finally { busy = false; } }; };
  setInterval(guard(syncAll), cfg.jenkinsSync * 1000);
  setInterval(guard(syncAllQuality), cfg.sonarSync * 1000);
  setInterval(guard(async () => {
    for (const i of await Integration.find({ enabled: true, type: { $in: ['prometheus', 'jenkins', 'sonarqube', 'github', 'docker'] } })) {
      const was = i.status; try { await testIntegration(i.type); i.status = 'connected'; i.lastError = ''; } catch (e) { i.status = 'error'; i.lastError = e.message; }
      i.lastCheckAt = new Date(); await i.save();
      if (was === 'connected' && i.status === 'error') await notify({ type: 'infra_alert', severity: 'warning', title: `Integration unreachable: ${i.type}`, message: i.lastError });
    }
  }), 300000);
}
