// Pure deployment-eligibility policy. Uses real scanner results passed in by the caller.
export function evaluateGate({ project, quality, openCritical = 0, openSecrets = 0 }) {
  const p = project.policy || {}; const reasons = [];
  if (p.blockOnQualityGate && (!quality || quality.gate !== 'OK')) reasons.push(quality ? `SonarQube quality gate is ${quality.gate}` : 'No SonarQube quality gate result available');
  if (p.blockOnCritical && openCritical > 0) reasons.push(`${openCritical} open CRITICAL vulnerabilit${openCritical > 1 ? 'ies' : 'y'}`);
  if (p.blockOnSecrets && openSecrets > 0) reasons.push(`${openSecrets} open exposed secret${openSecrets > 1 ? 's' : ''}`);
  return { allowed: reasons.length === 0, reasons };
}
