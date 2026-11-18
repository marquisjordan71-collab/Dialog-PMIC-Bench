import { useEffect, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  KeyRound,
  Lock,
  ShieldAlert,
  ShieldCheck,
  Unlock,
  X,
} from 'lucide-react';
import {
  computeOwnerSealText,
  formatLockoutRemaining,
  type SecurityStatusSummary,
} from '../utils/appProtection';

interface SecurityGuardModalProps {
  open: boolean;
  security: SecurityStatusSummary;
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onSaveConfig: (payload: {
    ownerLabel: string;
    lockEnabled: boolean;
    newPassphrase?: string;
    allowedHosts: string;
    antiCopyEnabled: boolean;
    blockScrapers: boolean;
  }) => Promise<boolean>;
  onLockNow: () => Promise<void>;
  onRevokeAll: () => Promise<void>;
}

export function SecurityGuardModal({
  open,
  security,
  busy,
  error,
  onClose,
  onSaveConfig,
  onLockNow,
  onRevokeAll,
}: SecurityGuardModalProps) {
  const [ownerLabel, setOwnerLabel] = useState(security.ownerLabel);
  const [lockEnabled, setLockEnabled] = useState(security.lockEnabled);
  const [newPassphrase, setNewPassphrase] = useState('');
  const [allowedHosts, setAllowedHosts] = useState(security.allowedHosts.join(', '));
  const [antiCopyEnabled, setAntiCopyEnabled] = useState(security.antiCopyEnabled);
  const [blockScrapers, setBlockScrapers] = useState(security.blockScrapers);
  const [savedNotice, setSavedNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setOwnerLabel(security.ownerLabel);
    setLockEnabled(security.lockEnabled);
    setAllowedHosts(security.allowedHosts.join(', '));
    setAntiCopyEnabled(security.antiCopyEnabled);
    setBlockScrapers(security.blockScrapers);
    setNewPassphrase('');
    setSavedNotice(null);
  }, [open, security]);

  if (!open) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavedNotice(null);
    const ok = await onSaveConfig({
      ownerLabel,
      lockEnabled,
      newPassphrase: newPassphrase.trim() || undefined,
      allowedHosts,
      antiCopyEnabled,
      blockScrapers,
    });
    if (ok) {
      setNewPassphrase('');
      setSavedNotice('Protection rules updated and sealed on server.');
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="security-guard-title"
      className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-6"
    >
      <div className="bg-white dark:bg-slate-900 w-full max-w-2xl max-h-[90vh] rounded-t-2xl sm:rounded-xl border border-slate-200 dark:border-slate-800 flex flex-col overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-start justify-between gap-4">
          <div className="flex items-start gap-2.5">
            <ShieldCheck className="w-5 h-5 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" aria-hidden="true" />
            <div>
              <div className="text-xs font-mono text-slate-500 dark:text-slate-400">
                {computeOwnerSealText(security.ownerLabel, security.buildFingerprint)}
              </div>
              <h2 id="security-guard-title" className="text-lg font-bold text-slate-900 dark:text-slate-100 mt-0.5">
                Ownership &amp; Anti-Theft Protection
              </h2>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close security protection dialog"
            className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <X className="w-5 h-5" aria-hidden="true" />
          </button>
        </div>

        <form onSubmit={(e) => void handleSubmit(e)} className="p-5 sm:p-6 overflow-y-auto space-y-5 text-xs">
          {/* Active Protection Summary */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            <div className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950">
              <div className="text-slate-500 dark:text-slate-400">Owner Lock Gate</div>
              <div className="mt-1 font-semibold text-slate-900 dark:text-slate-100">
                {security.lockEnabled ? 'Passphrase Armed' : 'Unlocked (Open Bench)'}
              </div>
            </div>
            <div className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950">
              <div className="text-slate-500 dark:text-slate-400">Domain Clone Lock</div>
              <div className="mt-1 font-mono font-semibold text-slate-900 dark:text-slate-100 tabular-nums">
                {security.allowedHosts.length} Allowed Host(s)
              </div>
            </div>
            <div className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950">
              <div className="text-slate-500 dark:text-slate-400">Source &amp; Scraper Guard</div>
              <div className="mt-1 font-semibold text-emerald-700 dark:text-emerald-400">
                Maps Stripped · {security.blockScrapers ? 'Active' : 'Monitor'}
              </div>
            </div>
          </div>

          {error && (
            <div className="p-3 rounded-lg border border-rose-300 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/50 text-rose-800 dark:text-rose-200 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
              <span>{error}</span>
            </div>
          )}

          {savedNotice && (
            <div className="p-3 rounded-lg border border-emerald-300 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-900 dark:text-emerald-200 flex items-start gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
              <span>{savedNotice}</span>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="sec-owner-label" className="block font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                Owner Name / License Seal
              </label>
              <input
                id="sec-owner-label"
                type="text"
                value={ownerLabel}
                onChange={(e) => setOwnerLabel(e.target.value)}
                placeholder="Your Name or Lab"
                className="w-full min-h-[44px] px-3 py-2 bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100"
              />
            </div>

            <div>
              <label htmlFor="sec-new-pin" className="block font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                Set / Rotate Owner Passphrase (min 6 chars)
              </label>
              <input
                id="sec-new-pin"
                type="password"
                value={newPassphrase}
                onChange={(e) => {
                  setNewPassphrase(e.target.value);
                  if (e.target.value.trim().length >= 6) {
                    setLockEnabled(true);
                  }
                }}
                placeholder={security.lockEnabled ? 'Leave blank to keep existing PIN' : 'Enter passphrase to arm lock'}
                className="w-full min-h-[44px] px-3 py-2 font-mono bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100"
              />
            </div>
          </div>

          <div>
            <label htmlFor="sec-allowed-hosts" className="block font-medium text-slate-700 dark:text-slate-300 mb-1.5">
              Authorized Domains (Anti-Clone Host Lock, comma-separated)
            </label>
            <input
              id="sec-allowed-hosts"
              type="text"
              value={allowedHosts}
              onChange={(e) => setAllowedHosts(e.target.value)}
              placeholder="localhost, 127.0.0.1, *.ai.studio, *.run.app, mydomain.com"
              className="w-full min-h-[44px] px-3 py-2 font-mono bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100"
            />
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
              If someone clones or reverse-proxies this app onto an unlisted hostname, both the API and UI block execution immediately.
            </p>
          </div>

          <div className="space-y-2.5 pt-2 border-t border-slate-100 dark:border-slate-800">
            <label className="min-h-[44px] flex items-center justify-between gap-3 cursor-pointer">
              <div>
                <span className="font-medium text-slate-900 dark:text-slate-100 block">
                  Require Owner Passphrase on Every Session
                </span>
                <span className="text-[11px] text-slate-500 dark:text-slate-400">
                  Locks all API endpoints (/api/manuals, /api/firmware, /api/sync, /api/updates) behind HMAC-SHA256 cookies + scrypt verification.
                </span>
              </div>
              <input
                type="checkbox"
                checked={lockEnabled}
                onChange={(e) => setLockEnabled(e.target.checked)}
                className="w-5 h-5 accent-blue-600 rounded shrink-0"
              />
            </label>

            <label className="min-h-[44px] flex items-center justify-between gap-3 cursor-pointer">
              <div>
                <span className="font-medium text-slate-900 dark:text-slate-100 block">
                  Anti-Copy &amp; Source Inspection Deterrent
                </span>
                <span className="text-[11px] text-slate-500 dark:text-slate-400">
                  Disables context menu, Save Page (Ctrl+S), View Source (Ctrl+U), and stamps your Owner Seal into downloaded PDF manuals.
                </span>
              </div>
              <input
                type="checkbox"
                checked={antiCopyEnabled}
                onChange={(e) => setAntiCopyEnabled(e.target.checked)}
                className="w-5 h-5 accent-blue-600 rounded shrink-0"
              />
            </label>

            <label className="min-h-[44px] flex items-center justify-between gap-3 cursor-pointer">
              <div>
                <span className="font-medium text-slate-900 dark:text-slate-100 block">
                  Block Site-Cloning Bots &amp; Scrapers
                </span>
                <span className="text-[11px] text-slate-500 dark:text-slate-400">
                  Rejects HTTrack, Wget, SiteSucker, Scrapy, and raw .ts / .map / .env file probes with HTTP 403.
                </span>
              </div>
              <input
                type="checkbox"
                checked={blockScrapers}
                onChange={(e) => setBlockScrapers(e.target.checked)}
                className="w-5 h-5 accent-blue-600 rounded shrink-0"
              />
            </label>
          </div>

          {/* Audit Log */}
          <div className="pt-2 border-t border-slate-100 dark:border-slate-800 space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-slate-800 dark:text-slate-200">
                Security Audit Log ({security.auditEvents.length})
              </span>
              <span className="text-[11px] text-slate-500 dark:text-slate-400">Live server telemetry</span>
            </div>
            <div className="max-h-32 overflow-y-auto border border-slate-200 dark:border-slate-800 rounded-lg divide-y divide-slate-100 dark:divide-slate-800 bg-slate-50/70 dark:bg-slate-950/70">
              {security.auditEvents.length === 0 ? (
                <div className="p-3 text-slate-500 dark:text-slate-400 text-center">
                  No intrusion, scraper, or lock events recorded this session.
                </div>
              ) : (
                security.auditEvents.map((ev) => (
                  <div key={ev.id} className="px-3 py-2 flex items-start justify-between gap-3">
                    <span className="font-mono text-slate-700 dark:text-slate-300">{ev.detail}</span>
                    <span className="font-mono text-[11px] text-slate-500 dark:text-slate-400 whitespace-nowrap tabular-nums">
                      {ev.timestamp}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Actions */}
          <div className="pt-3 border-t border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2.5">
            <div className="flex flex-wrap items-center gap-2">
              {security.lockEnabled && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void onLockNow()}
                  className="min-h-[44px] px-3.5 py-2 font-medium text-slate-800 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg inline-flex items-center gap-1.5"
                >
                  <Lock className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Lock App Now</span>
                </button>
              )}
              <button
                type="button"
                disabled={busy}
                onClick={() => void onRevokeAll()}
                className="min-h-[44px] px-3.5 py-2 font-medium text-rose-800 dark:text-rose-200 bg-rose-50 dark:bg-rose-950/50 hover:bg-rose-100 dark:hover:bg-rose-900/60 border border-rose-200 dark:border-rose-800 rounded-lg inline-flex items-center gap-1.5"
              >
                <ShieldAlert className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Revoke All Sessions</span>
              </button>
            </div>

            <button
              type="submit"
              disabled={busy}
              className="min-h-[44px] px-5 py-2 font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-60 rounded-lg transition-colors"
            >
              {busy ? 'Saving Rules...' : 'Save Protection Rules'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

interface OwnerLockScreenProps {
  ownerLabel: string;
  buildFingerprint: string;
  lockoutRemainingSec: number;
  error: string | null;
  busy: boolean;
  onUnlock: (passphrase: string) => Promise<void>;
}

export function OwnerLockScreen({
  ownerLabel,
  buildFingerprint,
  lockoutRemainingSec,
  error,
  busy,
  onUnlock,
}: OwnerLockScreenProps) {
  const [passphrase, setPassphrase] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void onUnlock(passphrase);
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-5 shadow-sm">
        <div className="flex items-start gap-3">
          <div className="p-2.5 rounded-lg bg-blue-50 dark:bg-blue-950/60 border border-blue-200 dark:border-blue-800 text-blue-600 dark:text-blue-400">
            <Lock className="w-5 h-5" aria-hidden="true" />
          </div>
          <div>
            <div className="text-xs font-mono text-slate-500 dark:text-slate-400">
              {computeOwnerSealText(ownerLabel, buildFingerprint)}
            </div>
            <h1 className="text-lg font-bold text-slate-900 dark:text-slate-100 mt-0.5">
              Dialog PMIC Bench is Protected
            </h1>
          </div>
        </div>

        <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
          Owner passphrase verification is required to unlock hardware controls, firmware packages, and protected service manuals.
        </p>

        {error && (
          <div className="p-3 rounded-lg bg-rose-50 dark:bg-rose-950/50 border border-rose-300 dark:border-rose-800 text-xs text-rose-800 dark:text-rose-200 flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="owner-unlock-pin" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
              Owner Passphrase / PIN
            </label>
            <div className="relative">
              <KeyRound className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" aria-hidden="true" />
              <input
                id="owner-unlock-pin"
                type="password"
                autoFocus
                required
                value={passphrase}
                onChange={(e) => setPassphrase(e.target.value)}
                disabled={lockoutRemainingSec > 0 || busy}
                placeholder="Enter owner passphrase"
                className="w-full min-h-[44px] pl-9 pr-3 py-2 text-sm font-mono bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={busy || lockoutRemainingSec > 0 || !passphrase.trim()}
            className="w-full min-h-[44px] px-4 py-2.5 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-60 rounded-lg transition-colors inline-flex items-center justify-center gap-2"
          >
            <Unlock className="w-4 h-4" aria-hidden="true" />
            <span>
              {lockoutRemainingSec > 0
                ? `Locked (${formatLockoutRemaining(lockoutRemainingSec)})`
                : busy
                  ? 'Verifying...'
                  : 'Unlock Bench'}
            </span>
          </button>
        </form>
      </div>
    </div>
  );
}

interface UnauthorizedCloneScreenProps {
  hostname: string;
  ownerLabel: string;
  buildFingerprint: string;
}

export function UnauthorizedCloneScreen({
  hostname,
  ownerLabel,
  buildFingerprint,
}: UnauthorizedCloneScreenProps) {
  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white dark:bg-slate-900 border border-rose-300 dark:border-rose-800 rounded-xl p-6 space-y-4">
        <div className="flex items-start gap-3">
          <ShieldAlert className="w-6 h-6 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" aria-hidden="true" />
          <div>
            <div className="text-xs font-mono text-slate-500 dark:text-slate-400">
              {computeOwnerSealText(ownerLabel, buildFingerprint)}
            </div>
            <h1 className="text-lg font-bold text-slate-900 dark:text-slate-100 mt-0.5">
              Unauthorized Host Blocked
            </h1>
          </div>
        </div>
        <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
          This copy of Dialog PMIC Bench is domain-locked and cannot run on{' '}
          <span className="font-mono font-semibold text-rose-700 dark:text-rose-400">{hostname}</span>.
          Deployments outside the owner&apos;s authorized host allowlist are blocked automatically.
        </p>
      </div>
    </div>
  );
}
