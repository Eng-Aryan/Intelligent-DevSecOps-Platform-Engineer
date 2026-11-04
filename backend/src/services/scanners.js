import crypto from 'crypto';
import { maskSecret } from '../utils/redact.js';
const SEV = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'UNKNOWN'];
const fp = (...p) => crypto.createHash('sha1').update(p.join('|')).digest('hex');

// Trivy JSON (--format json). Severity is taken verbatim from Trivy.
export function normalizeTrivy(report) {
  const out = [];
  for (const r of report?.Results || []) {
    for (const v of r.Vulnerabilities || []) {
      out.push({ source: 'trivy', target: r.Target, vulnId: v.VulnerabilityID, title: v.Title || v.VulnerabilityID,
        severity: SEV.includes(v.Severity) ? v.Severity : 'UNKNOWN', pkg: v.PkgName, installedVersion: v.InstalledVersion,
        fixedVersion: v.FixedVersion || '', url: v.PrimaryURL || '', fingerprint: fp('trivy', r.Target, v.VulnerabilityID, v.PkgName) });
    }
    for (const m of r.Misconfigurations || []) {
      out.push({ source: 'trivy', target: r.Target, vulnId: m.ID, title: m.Title, severity: SEV.includes(m.Severity) ? m.Severity : 'UNKNOWN',
        pkg: 'misconfiguration', fixedVersion: m.Resolution || '', url: m.PrimaryURL || '', fingerprint: fp('trivy-misconf', r.Target, m.ID) });
    }
  }
  return out;
}
// Gitleaks JSON array. Gitleaks has no severity: documented policy => every secret is HIGH. Raw secret is NEVER stored.
export function normalizeGitleaks(report) {
  return (Array.isArray(report) ? report : []).map(f => ({ source: 'gitleaks', target: f.File, vulnId: f.RuleID,
    title: f.Description || f.RuleID, severity: 'HIGH', pkg: `line ${f.StartLine ?? '?'}`, maskedSecret: maskSecret(f.Secret || ''),
    commit: f.Commit, author: f.Author, fingerprint: f.Fingerprint || fp('gitleaks', f.File, f.RuleID, f.StartLine, f.Commit) }));
}
