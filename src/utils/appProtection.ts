export type SecurityEventType =
  | 'unlock_ok'
  | 'unlock_fail'
  | 'scraper_blocked'
  | 'domain_blocked'
  | 'source_probe_blocked'
  | 'sessions_revoked'
  | 'config_updated'
  | 'rate_limited';

export interface SecurityAuditEvent {
  id: string;
  timestamp: string;
  eventType: SecurityEventType;
  detail: string;
}

export interface SecurityStatusSummary {
  lockEnabled: boolean;
  isLocked: boolean;
  authenticated: boolean;
  ownerLabel: string;
  allowedHosts: string[];
  antiCopyEnabled: boolean;
  blockScrapers: boolean;
  buildFingerprint: string;
  lockoutRemainingSec: number;
  failedAttempts: number;
  auditEvents: SecurityAuditEvent[];
}

export const DEFAULT_ALLOWED_HOSTS = [
  'localhost',
  '127.0.0.1',
  '*.ai.studio',
  'ai.studio',
  '*.run.app',
  '*.aistudio.google.com',
  'aistudio.google.com',
  '*.googleusercontent.com',
];

const SCRAPER_UA_PATTERNS = [
  'httrack',
  'webcopier',
  'sitesucker',
  'teleport pro',
  'offline explorer',
  'blackwidow',
  'webzip',
  'wget/',
  'scrapy',
  'archive.org_bot',
  'heritrix',
  'nutch',
  'curl/',
];

const BLOCKED_SOURCE_EXACT = new Set([
  '/server.ts',
  '/package.json',
  '/package-lock.json',
  '/bun.lock',
  '/tsconfig.json',
  '/vite.config.ts',
  '/metadata.json',
  '/.env',
  '/.env.local',
  '/.env.production',
  '/.bench-security.json',
]);

export function normalizeHostname(hostHeaderOrName: string): string {
  const cleaned = hostHeaderOrName.trim().toLowerCase();
  if (!cleaned) return '';
  if (cleaned.startsWith('[')) {
    const endBracket = cleaned.indexOf(']');
    return endBracket > 0 ? cleaned.slice(0, endBracket + 1) : cleaned;
  }
  return cleaned.split(':')[0] ?? '';
}

export function isPrivateLanHost(host: string): boolean {
  if (!host) return false;
  if (
    host === 'localhost' ||
    host === '127.0.0.1' ||
    host === '0.0.0.0' ||
    host === '[::1]' ||
    host === '::1' ||
    host.endsWith('.local')
  ) {
    return true;
  }

  const ipv4Match = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!ipv4Match) return false;

  const octets = ipv4Match.slice(1).map((n) => Number(n));
  if (octets.some((n) => n < 0 || n > 255)) return false;

  const [a, b] = octets;
  if (a === 10) return true; // 10.0.0.0/8
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
  if (a === 192 && b === 168) return true; // 192.168.0.0/16
  if (a === 169 && b === 254) return true; // Link-local USB-C Ethernet / RNDIS
  return false;
}

export function parseAllowedHostsInput(raw: string): string[] {
  const items = raw
    .split(/[\n,]+/)
    .map((entry) => normalizeHostname(entry))
    .filter((entry) => entry.length > 0 && /^[a-z0-9.*-]+$/.test(entry));
  return Array.from(new Set(items));
}

export function isHostAllowed(hostnameOrHeader: string, allowedHosts: string[]): boolean {
  const host = normalizeHostname(hostnameOrHeader);
  if (!host) return false;
  if (isPrivateLanHost(host)) {
    return true;
  }
  if (allowedHosts.length === 0) return true;

  for (const pattern of allowedHosts) {
    const norm = pattern.trim().toLowerCase();
    if (!norm) continue;
    if (norm === '*') return true;
    if (norm.startsWith('*.')) {
      const suffix = norm.slice(1); // includes leading dot
      const bare = norm.slice(2);
      if (host === bare || host.endsWith(suffix)) {
        return true;
      }
    } else if (host === norm) {
      return true;
    }
  }
  return false;
}

export function isKnownScraperUserAgent(userAgent: string): boolean {
  const ua = (userAgent || '').toLowerCase();
  if (!ua) return false;
  return SCRAPER_UA_PATTERNS.some((sig) => ua.includes(sig));
}

export function isBlockedSourcePath(pathname: string, isProduction = false): boolean {
  const clean = (pathname || '').split('?')[0].toLowerCase();
  if (!clean) return false;
  if (clean.includes('..')) return true;
  if (clean.startsWith('/.git') || clean.startsWith('/.env') || clean.startsWith('/.aistudio')) {
    return true;
  }
  if (BLOCKED_SOURCE_EXACT.has(clean)) return true;
  if (clean.endsWith('.map')) return true;
  if (isProduction && (clean.endsWith('.ts') || clean.endsWith('.tsx'))) {
    return true;
  }
  return false;
}

export function computeOwnerSealText(ownerLabel: string, buildFingerprint: string): string {
  const owner = ownerLabel.trim() || 'Authorized Bench Owner';
  const seal = buildFingerprint.trim() || 'UNVERIFIED';
  return `Owner: ${owner} | Seal: ${seal}`;
}

export function formatLockoutRemaining(seconds: number): string {
  if (seconds <= 0) return '0s';
  const mins = Math.floor(seconds / 60);
  const rem = seconds % 60;
  return mins > 0 ? `${mins}m ${String(rem).padStart(2, '0')}s` : `${rem}s`;
}
