import test from 'node:test'; import assert from 'node:assert/strict';
process.env.JWT_SECRET = 't'; process.env.ENCRYPTION_KEY = 'ab'.repeat(32);
const { encrypt, decrypt } = await import('../src/utils/crypto.js');
const { redact, maskSecret, cleanMeta } = await import('../src/utils/redact.js');
const { evaluateGate } = await import('../src/services/gates.js');
const { normalizeTrivy, normalizeGitleaks } = await import('../src/services/scanners.js');

test('encryption round-trips and is non-deterministic', () => { const a = encrypt('s3cret'); assert.equal(decrypt(a), 's3cret'); assert.notEqual(a, encrypt('s3cret')); });
test('tampered ciphertext is rejected', () => { const p = encrypt('x').split(':'); p[2] = Buffer.from('zz').toString('base64'); assert.throws(() => decrypt(p.join(':'))); });
test('redaction hides tokens and passwords', () => {
  const t = redact('ghp_' + 'a'.repeat(30) + ' password=hunter22 Authorization: Bearer abcdefghij1234'); assert.ok(!t.includes('hunter22')); assert.ok(!t.includes('ghp_a')); assert.ok(!t.includes('abcdefghij1234'));
});
test('maskSecret never returns the full value', () => { assert.ok(!maskSecret('AKIAABCDEFGHIJKLMNOP').includes('ABCDEFGH')); assert.equal(maskSecret('short'), '********'); });
test('audit metadata drops sensitive keys', () => assert.deepEqual(cleanMeta({ password: 'x', apiToken: 'y', note: 'ok' }), { note: 'ok' }));
test('gate blocks on failed quality gate / critical / secrets', () => {
  const project = { policy: { blockOnQualityGate: true, blockOnCritical: true, blockOnSecrets: true } };
  assert.equal(evaluateGate({ project, quality: { gate: 'ERROR' }, openCritical: 2, openSecrets: 1 }).reasons.length, 3);
  assert.equal(evaluateGate({ project, quality: { gate: 'OK' } }).allowed, true);
  assert.equal(evaluateGate({ project, quality: null }).allowed, false);
});
test('trivy keeps scanner severity; gitleaks never stores raw secret', () => {
  const t = normalizeTrivy({ Results: [{ Target: 'app', Vulnerabilities: [{ VulnerabilityID: 'CVE-1', PkgName: 'x', InstalledVersion: '1', FixedVersion: '2', Severity: 'CRITICAL' }] }] });
  assert.equal(t[0].severity, 'CRITICAL');
  const g = normalizeGitleaks([{ RuleID: 'aws', File: 'a.js', Secret: 'AKIAABCDEFGHIJKLMNOP', StartLine: 3 }]); assert.ok(!JSON.stringify(g).includes('AKIAABCDEFGHIJKLMNOP'));
});
