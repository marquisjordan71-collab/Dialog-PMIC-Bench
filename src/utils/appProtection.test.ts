import test from 'node:test';
import assert from 'node:assert/strict';
import {
  computeOwnerSealText,
  DEFAULT_ALLOWED_HOSTS,
  isBlockedSourcePath,
  isHostAllowed,
  isKnownScraperUserAgent,
  parseAllowedHostsInput,
} from './appProtection.ts';
import { createSecurityManager } from './serverSecurity.ts';

test('host allowlist validates exact, wildcard, AI Studio, and local/LAN hosts while rejecting clones', () => {
  assert.equal(isHostAllowed('dialog-pmic-bench.ai.studio', DEFAULT_ALLOWED_HOSTS), true);
  assert.equal(isHostAllowed('ais-pre-abc.us-east1.run.app', DEFAULT_ALLOWED_HOSTS), true);
  assert.equal(isHostAllowed('ais-dev-abc.us-east1.run.app', DEFAULT_ALLOWED_HOSTS), true);
  assert.equal(isHostAllowed('aistudio.google.com', DEFAULT_ALLOWED_HOSTS), true);
  assert.equal(isHostAllowed('stolen-mirror.evil.org', DEFAULT_ALLOWED_HOSTS), false);

  const hosts = parseAllowedHostsInput('dialog-pmic.example.com, *.us-east1.run.app, BAD HOST!');
  assert.deepEqual(hosts, ['dialog-pmic.example.com', '*.us-east1.run.app']);

  assert.equal(isHostAllowed('localhost:3000', hosts), true);
  assert.equal(isHostAllowed('127.0.0.1:3000', hosts), true);
  assert.equal(isHostAllowed('192.168.1.42:3000', hosts), true);
  assert.equal(isHostAllowed('10.0.0.15:3000', hosts), true);
  assert.equal(isHostAllowed('172.16.5.20:3000', hosts), true);
  assert.equal(isHostAllowed('bench-host.local:3000', hosts), true);
  assert.equal(isHostAllowed('dialog-pmic.example.com', hosts), true);
  assert.equal(isHostAllowed('app-123.us-east1.run.app', hosts), true);
  assert.equal(isHostAllowed('172.32.0.1:3000', hosts), false);
  assert.equal(isHostAllowed('stolen-mirror.evil.org', hosts), false);
});

test('scraper UA and raw source path detectors block site cloners and secret files', () => {
  assert.equal(isKnownScraperUserAgent('HTTrack 3.0x Website Copier'), true);
  assert.equal(isKnownScraperUserAgent('Wget/1.21.3 (linux-gnu)'), true);
  assert.equal(
    isKnownScraperUserAgent(
      'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/130.0 Mobile Safari/537.36',
    ),
    false,
  );

  assert.equal(isBlockedSourcePath('/.env'), true);
  assert.equal(isBlockedSourcePath('/server.ts'), true);
  assert.equal(isBlockedSourcePath('/assets/index-abc.js.map'), true);
  assert.equal(isBlockedSourcePath('/src/App.tsx', true), true);
  assert.equal(isBlockedSourcePath('/assets/index-abc.js', true), false);
});

test('serverSecurity hashes passphrases, enforces brute-force lockout, and revokes tokens via epoch kill switch', () => {
  const sec = createSecurityManager({
    configPath: null,
    envSigningSecret: '0123456789abcdef0123456789abcdef',
    envOwnerLabel: 'Bench Owner',
  });

  // Initially unlocked when no passphrase is configured
  const initStatus = sec.getPublicStatus(null, '10.0.0.1');
  assert.equal(initStatus.lockEnabled, false);
  assert.equal(initStatus.isLocked, false);
  assert.match(computeOwnerSealText(initStatus.ownerLabel, initStatus.buildFingerprint), /Bench Owner/);

  // Configure passphrase lock
  const cfgFail = sec.configureSecurity({ newPassphrase: '123' });
  assert.equal(cfgFail.ok, false);

  const cfgOk = sec.configureSecurity({
    newPassphrase: 'MySecretPin!2026',
    ownerLabel: 'Alex Bench',
    allowedHosts: 'localhost, *.run.app',
  });
  assert.equal(cfgOk.ok, true);
  assert.ok(cfgOk.token);

  const lockedStatus = sec.getPublicStatus(null, '10.0.0.2');
  assert.equal(lockedStatus.lockEnabled, true);
  assert.equal(lockedStatus.isLocked, true);

  // Wrong attempts trigger 5-attempt lockout
  for (let i = 0; i < 4; i++) {
    const attempt = sec.unlockWithPassphrase('wrong-pass', '10.0.0.2', 10_000 + i);
    assert.equal(attempt.ok, false);
    assert.equal(attempt.lockoutRemainingSec, 0);
  }
  const fifthFail = sec.unlockWithPassphrase('wrong-pass', '10.0.0.2', 10_005);
  assert.equal(fifthFail.ok, false);
  assert.ok(fifthFail.lockoutRemainingSec > 0);

  // Valid passphrase from clean IP works and issues HMAC session token
  const unlocked = sec.unlockWithPassphrase('MySecretPin!2026', '10.0.0.3', 20_000);
  assert.equal(unlocked.ok, true);
  assert.ok(unlocked.token);
  assert.equal(sec.verifyToken(unlocked.token, 25_000), true);

  // Kill switch immediately invalidates previously signed token
  sec.revokeAllSessions();
  assert.equal(sec.verifyToken(unlocked.token, 26_000), false);

  // Host & scraper inspection blocks unauthorized clones and HTTrack
  const cloneCheck = sec.inspectIncomingRequest({
    hostHeader: 'thief-clone.xyz',
    userAgent: 'Mozilla/5.0 Chrome/130.0',
    clientKey: '10.0.0.3',
    token: unlocked.token,
  });
  assert.equal(cloneCheck.allowed, false);
  assert.equal(cloneCheck.status, 403);

  const scraperCheck = sec.inspectIncomingRequest({
    hostHeader: 'localhost:3000',
    userAgent: 'HTTrack 3.0x',
    clientKey: '10.0.0.3',
    token: unlocked.token,
  });
  assert.equal(scraperCheck.allowed, false);
  assert.equal(scraperCheck.status, 403);
});
