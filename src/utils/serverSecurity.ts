import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {
  DEFAULT_ALLOWED_HOSTS,
  isHostAllowed,
  isKnownScraperUserAgent,
  parseAllowedHostsInput,
  type SecurityAuditEvent,
  type SecurityEventType,
  type SecurityStatusSummary,
} from './appProtection.ts';

interface PersistedSecurityConfig {
  ownerLabel: string;
  lockEnabled: boolean;
  antiCopyEnabled: boolean;
  blockScrapers: boolean;
  allowedHosts: string[];
  pinSalt: string | null;
  pinHash: string | null;
  signingSecret: string;
  sessionEpoch: number;
}

interface VerifiedSessionPayload {
  exp: number;
  epoch: number;
  role: 'owner';
  nonce: string;
}

interface RateBucket {
  count: number;
  resetAt: number;
}

interface FailAttemptRecord {
  failures: number;
  lockedUntil: number;
}

export interface ConfigureSecurityInput {
  ownerLabel?: string;
  lockEnabled?: boolean;
  newPassphrase?: string;
  allowedHosts?: string[] | string;
  antiCopyEnabled?: boolean;
  blockScrapers?: boolean;
}

const TOKEN_TTL_MS = 1000 * 60 * 60 * 12; // 12 hours
const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_MS = 1000 * 60 * 5; // 5 minutes
const RATE_WINDOW_MS = 60_000;
const RATE_MAX_REQUESTS = 180;

function hashPassphrase(passphrase: string, saltHex: string): string {
  return crypto.scryptSync(passphrase, saltHex, 64).toString('hex');
}

function constantTimeHexEqual(aHex: string, bHex: string): boolean {
  try {
    const a = Buffer.from(aHex, 'hex');
    const b = Buffer.from(bHex, 'hex');
    if (a.length === 0 || a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

export function createSecurityManager(options?: {
  configPath?: string | null;
  envPin?: string;
  envSigningSecret?: string;
  envAllowedHosts?: string;
  envOwnerLabel?: string;
}) {
  const configPath =
    options?.configPath === undefined
      ? path.resolve(process.cwd(), '.bench-security.json')
      : options.configPath;

  const initialEnvPin = (options?.envPin ?? process.env.APP_OWNER_PIN ?? '').trim();
  const envSecret = (options?.envSigningSecret ?? process.env.APP_SIGNING_SECRET ?? '').trim();
  const envHosts = (options?.envAllowedHosts ?? process.env.ALLOWED_APP_HOSTS ?? '').trim();
  const envOwner = (options?.envOwnerLabel ?? process.env.OWNER_LABEL ?? '').trim();

  let config: PersistedSecurityConfig = {
    ownerLabel: envOwner || 'Dialog PMIC Bench Owner',
    lockEnabled: initialEnvPin.length >= 4,
    antiCopyEnabled: true,
    blockScrapers: true,
    allowedHosts: envHosts ? parseAllowedHostsInput(envHosts) : [...DEFAULT_ALLOWED_HOSTS],
    pinSalt: null,
    pinHash: null,
    signingSecret: envSecret || crypto.randomBytes(32).toString('hex'),
    sessionEpoch: 1,
  };

  if (initialEnvPin.length >= 4) {
    const salt = crypto.randomBytes(16).toString('hex');
    config.pinSalt = salt;
    config.pinHash = hashPassphrase(initialEnvPin, salt);
  }

  if (configPath) {
    try {
      if (fs.existsSync(configPath)) {
        const raw = fs.readFileSync(configPath, 'utf8');
        const parsed = JSON.parse(raw) as Partial<PersistedSecurityConfig>;
        config = {
          ownerLabel:
            typeof parsed.ownerLabel === 'string' && parsed.ownerLabel.trim()
              ? parsed.ownerLabel.trim()
              : config.ownerLabel,
          lockEnabled:
            typeof parsed.lockEnabled === 'boolean' ? parsed.lockEnabled : config.lockEnabled,
          antiCopyEnabled:
            typeof parsed.antiCopyEnabled === 'boolean'
              ? parsed.antiCopyEnabled
              : config.antiCopyEnabled,
          blockScrapers:
            typeof parsed.blockScrapers === 'boolean'
              ? parsed.blockScrapers
              : config.blockScrapers,
          allowedHosts: Array.isArray(parsed.allowedHosts)
            ? parsed.allowedHosts.map(String)
            : config.allowedHosts,
          pinSalt: typeof parsed.pinSalt === 'string' ? parsed.pinSalt : config.pinSalt,
          pinHash: typeof parsed.pinHash === 'string' ? parsed.pinHash : config.pinHash,
          signingSecret:
            envSecret ||
            (typeof parsed.signingSecret === 'string' && parsed.signingSecret.length >= 32
              ? parsed.signingSecret
              : config.signingSecret),
          sessionEpoch:
            typeof parsed.sessionEpoch === 'number' && parsed.sessionEpoch > 0
              ? parsed.sessionEpoch
              : config.sessionEpoch,
        };
      }
    } catch {
      // Ignore corrupt file; continue with default memory config
    }
  }

  const persistConfig = () => {
    if (!configPath) return;
    try {
      fs.writeFileSync(configPath, JSON.stringify(config, null, 2), { mode: 0o600 });
    } catch {
      // Graceful fallback in read-only environments
    }
  };

  const buildFingerprint = crypto
    .createHash('sha256')
    .update(`${config.ownerLabel}:${config.signingSecret.slice(0, 12)}`)
    .digest('hex')
    .slice(0, 12)
    .toUpperCase();

  const auditEvents: SecurityAuditEvent[] = [];
  const rateBuckets = new Map<string, RateBucket>();
  const failTracker = new Map<string, FailAttemptRecord>();

  const recordAudit = (eventType: SecurityEventType, detail: string) => {
    auditEvents.unshift({
      id: `${Date.now()}-${crypto.randomBytes(3).toString('hex')}`,
      timestamp: new Date().toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      }),
      eventType,
      detail,
    });
    if (auditEvents.length > 30) {
      auditEvents.length = 30;
    }
  };

  const signToken = (nowMs = Date.now()): string => {
    const payload: VerifiedSessionPayload = {
      exp: nowMs + TOKEN_TTL_MS,
      epoch: config.sessionEpoch,
      role: 'owner',
      nonce: crypto.randomBytes(8).toString('hex'),
    };
    const encoded = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
    const sig = crypto
      .createHmac('sha256', config.signingSecret)
      .update(encoded)
      .digest('base64url');
    return `${encoded}.${sig}`;
  };

  const verifyToken = (token: string | undefined | null, nowMs = Date.now()): boolean => {
    if (!token || typeof token !== 'string') return false;
    const dotIdx = token.indexOf('.');
    if (dotIdx <= 0) return false;
    const encoded = token.slice(0, dotIdx);
    const providedSig = token.slice(dotIdx + 1);
    if (!encoded || !providedSig) return false;

    const expectedSig = crypto
      .createHmac('sha256', config.signingSecret)
      .update(encoded)
      .digest('base64url');

    const a = Buffer.from(providedSig, 'utf8');
    const b = Buffer.from(expectedSig, 'utf8');
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
      return false;
    }

    try {
      const payload = JSON.parse(
        Buffer.from(encoded, 'base64url').toString('utf8'),
      ) as Partial<VerifiedSessionPayload>;
      if (payload.role !== 'owner') return false;
      if (typeof payload.exp !== 'number' || payload.exp < nowMs) return false;
      if (payload.epoch !== config.sessionEpoch) return false;
      return true;
    } catch {
      return false;
    }
  };

  const getLockoutState = (clientKey: string, nowMs = Date.now()) => {
    const rec = failTracker.get(clientKey);
    if (!rec) return { lockoutRemainingSec: 0, failedAttempts: 0 };
    if (rec.lockedUntil > nowMs) {
      return {
        lockoutRemainingSec: Math.ceil((rec.lockedUntil - nowMs) / 1000),
        failedAttempts: rec.failures,
      };
    }
    return { lockoutRemainingSec: 0, failedAttempts: rec.failures };
  };

  const unlockWithPassphrase = (
    passphrase: string,
    clientKey: string,
    nowMs = Date.now(),
  ): { ok: boolean; token?: string; error?: string; lockoutRemainingSec: number } => {
    if (!config.lockEnabled || !config.pinHash || !config.pinSalt) {
      return { ok: true, token: signToken(nowMs), lockoutRemainingSec: 0 };
    }

    const lockout = getLockoutState(clientKey, nowMs);
    if (lockout.lockoutRemainingSec > 0) {
      return {
        ok: false,
        error: `Too many failed unlock attempts. Try again in ${lockout.lockoutRemainingSec}s.`,
        lockoutRemainingSec: lockout.lockoutRemainingSec,
      };
    }

    const candidate = hashPassphrase(passphrase, config.pinSalt);
    if (constantTimeHexEqual(candidate, config.pinHash)) {
      failTracker.delete(clientKey);
      recordAudit('unlock_ok', `Owner session unlocked from ${clientKey}`);
      return { ok: true, token: signToken(nowMs), lockoutRemainingSec: 0 };
    }

    const prev = failTracker.get(clientKey) ?? { failures: 0, lockedUntil: 0 };
    const nextFailures = prev.failures + 1;
    const lockedUntil = nextFailures >= MAX_FAILED_ATTEMPTS ? nowMs + LOCKOUT_MS : 0;
    failTracker.set(clientKey, { failures: nextFailures, lockedUntil });
    recordAudit(
      'unlock_fail',
      `Invalid passphrase attempt #${nextFailures} from ${clientKey}${lockedUntil ? ' (5m lockout triggered)' : ''}`,
    );

    const rem = lockedUntil > nowMs ? Math.ceil((lockedUntil - nowMs) / 1000) : 0;
    return {
      ok: false,
      error:
        rem > 0
          ? `Too many failed attempts. Locked for ${rem}s.`
          : `Incorrect owner passphrase (${nextFailures}/${MAX_FAILED_ATTEMPTS}).`,
      lockoutRemainingSec: rem,
    };
  };

  const configureSecurity = (
    input: ConfigureSecurityInput,
  ): { ok: boolean; error?: string; token?: string } => {
    if (typeof input.newPassphrase === 'string' && input.newPassphrase.trim().length > 0) {
      const trimmed = input.newPassphrase.trim();
      if (trimmed.length < 6) {
        return { ok: false, error: 'Owner passphrase must be at least 6 characters.' };
      }
      const salt = crypto.randomBytes(16).toString('hex');
      config.pinSalt = salt;
      config.pinHash = hashPassphrase(trimmed, salt);
      config.lockEnabled = true;
    }

    if (typeof input.lockEnabled === 'boolean') {
      if (input.lockEnabled && (!config.pinHash || !config.pinSalt)) {
        return {
          ok: false,
          error: 'Set an owner passphrase (min 6 chars) before enabling the app lock.',
        };
      }
      config.lockEnabled = input.lockEnabled;
    }

    if (typeof input.ownerLabel === 'string' && input.ownerLabel.trim()) {
      config.ownerLabel = input.ownerLabel.trim().slice(0, 64);
    }

    if (typeof input.antiCopyEnabled === 'boolean') {
      config.antiCopyEnabled = input.antiCopyEnabled;
    }

    if (typeof input.blockScrapers === 'boolean') {
      config.blockScrapers = input.blockScrapers;
    }

    if (typeof input.allowedHosts === 'string') {
      const parsed = parseAllowedHostsInput(input.allowedHosts);
      config.allowedHosts = parsed.length > 0 ? parsed : [...DEFAULT_ALLOWED_HOSTS];
    } else if (Array.isArray(input.allowedHosts)) {
      const parsed = parseAllowedHostsInput(input.allowedHosts.join(','));
      config.allowedHosts = parsed.length > 0 ? parsed : [...DEFAULT_ALLOWED_HOSTS];
    }

    persistConfig();
    recordAudit(
      'config_updated',
      `Security updated (Lock: ${config.lockEnabled ? 'ON' : 'OFF'}, Anti-Copy: ${config.antiCopyEnabled ? 'ON' : 'OFF'})`,
    );

    const token = signToken();
    return { ok: true, token };
  };

  const revokeAllSessions = (): void => {
    config.sessionEpoch += 1;
    persistConfig();
    recordAudit('sessions_revoked', `Kill switch triggered — rotated session epoch to v${config.sessionEpoch}`);
  };

  const checkRateLimit = (clientKey: string, nowMs = Date.now()): boolean => {
    const existing = rateBuckets.get(clientKey);
    if (!existing || existing.resetAt <= nowMs) {
      rateBuckets.set(clientKey, { count: 1, resetAt: nowMs + RATE_WINDOW_MS });
      return true;
    }
    if (existing.count >= RATE_MAX_REQUESTS) {
      return false;
    }
    existing.count += 1;
    return true;
  };

  const inspectIncomingRequest = (params: {
    hostHeader: string;
    userAgent: string;
    clientKey: string;
    token?: string | null;
    skipRateLimit?: boolean;
  }): { allowed: boolean; status: number; error?: string; authenticated: boolean } => {
    if (!isHostAllowed(params.hostHeader, config.allowedHosts)) {
      recordAudit('domain_blocked', `Blocked request for unauthorized host "${params.hostHeader}"`);
      return {
        allowed: false,
        status: 403,
        error: 'Unauthorized domain clone detected. Host is not on owner allowlist.',
        authenticated: false,
      };
    }

    if (config.blockScrapers && isKnownScraperUserAgent(params.userAgent)) {
      recordAudit('scraper_blocked', `Blocked automated scraper User-Agent from ${params.clientKey}`);
      return {
        allowed: false,
        status: 403,
        error: 'Automated site cloning or scraping tools are blocked by owner policy.',
        authenticated: false,
      };
    }

    if (!params.skipRateLimit && !checkRateLimit(params.clientKey)) {
      recordAudit('rate_limited', `Rate limit exceeded for ${params.clientKey}`);
      return {
        allowed: false,
        status: 429,
        error: 'API rate limit exceeded. Wait 60 seconds before retrying.',
        authenticated: false,
      };
    }

    const hasValidToken = verifyToken(params.token);
    const authenticated = !config.lockEnabled || hasValidToken;
    return { allowed: true, status: 200, authenticated };
  };

  const getPublicStatus = (token: string | undefined | null, clientKey: string): SecurityStatusSummary => {
    const authenticated = !config.lockEnabled || verifyToken(token);
    const lockout = getLockoutState(clientKey);
    return {
      lockEnabled: config.lockEnabled,
      isLocked: config.lockEnabled && !authenticated,
      authenticated,
      ownerLabel: config.ownerLabel,
      allowedHosts: [...config.allowedHosts],
      antiCopyEnabled: config.antiCopyEnabled,
      blockScrapers: config.blockScrapers,
      buildFingerprint,
      lockoutRemainingSec: lockout.lockoutRemainingSec,
      failedAttempts: lockout.failedAttempts,
      auditEvents: [...auditEvents],
    };
  };

  return {
    getPublicStatus,
    signToken,
    verifyToken,
    unlockWithPassphrase,
    configureSecurity,
    revokeAllSessions,
    inspectIncomingRequest,
    recordAudit,
    buildFingerprint,
  };
}
