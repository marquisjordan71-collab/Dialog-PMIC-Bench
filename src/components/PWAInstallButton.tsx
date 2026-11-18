import { useState } from 'react';
import { Download, ExternalLink, Smartphone, WifiOff, X } from 'lucide-react';
import { useOnlineStatus, usePWAInstall } from '../hooks/usePWAInstall';

export function PWAInstallButton() {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showGuideModal, setShowGuideModal] = useState(false);

  if (isInstalled) {
    return null;
  }

  const inIframe = typeof window !== 'undefined' && window.self !== window.top;
  const standaloneHref = typeof window !== 'undefined' ? window.location.href : '/';

  const handleClick = async () => {
    if (isInstallable) {
      await install();
      return;
    }
    setShowGuideModal(true);
  };

  return (
    <>
      <button
        type="button"
        onClick={() => void handleClick()}
        className="w-full min-h-[44px] px-4 py-2 text-xs sm:text-sm font-medium text-slate-800 dark:text-slate-100 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 rounded-lg transition-colors flex items-center justify-center gap-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
      >
        <Download className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" aria-hidden="true" />
        <span>{isInstallable ? 'Install Bench App' : isIOS ? 'Install on iPhone / iPad' : 'Install as App'}</span>
      </button>

      {showGuideModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="pwa-install-guide-title"
          className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-6"
        >
          <div className="bg-white dark:bg-slate-900 w-full max-w-md rounded-t-2xl sm:rounded-xl border border-slate-200 dark:border-slate-800 p-5 sm:p-6 space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <Smartphone className="w-5 h-5 text-blue-600 dark:text-blue-400 shrink-0" aria-hidden="true" />
                <h2 id="pwa-install-guide-title" className="text-base font-bold text-slate-900 dark:text-slate-100">
                  Install Dialog PMIC Bench
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setShowGuideModal(false)}
                aria-label="Close install instructions"
                className="min-h-[44px] min-w-[44px] -mt-2 -mr-2 flex items-center justify-center rounded-lg text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="w-5 h-5" aria-hidden="true" />
              </button>
            </div>

            {inIframe && (
              <div className="p-3 rounded-lg bg-blue-50 dark:bg-blue-950/50 border border-blue-200 dark:border-blue-800 text-xs text-blue-900 dark:text-blue-200 space-y-2">
                <p>
                  Browsers block app installation inside an embedded preview frame. Open this private tab directly first:
                </p>
                <a
                  href={standaloneHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="min-h-[40px] px-3 py-2 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg inline-flex items-center gap-1.5"
                >
                  <span>Open Standalone Tab</span>
                  <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
                </a>
              </div>
            )}

            {isIOS ? (
              <ol className="space-y-2 text-xs sm:text-sm text-slate-700 dark:text-slate-300 list-decimal list-inside leading-relaxed">
                <li>
                  Open the app URL directly in <strong>Safari</strong> (outside any preview frame).
                </li>
                <li>
                  Tap the <strong>Share</strong> icon in Safari&apos;s toolbar.
                </li>
                <li>
                  Scroll down and tap <strong>Add to Home Screen</strong>, then tap <strong>Add</strong>.
                </li>
              </ol>
            ) : (
              <div className="space-y-3 text-xs sm:text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
                <p>
                  In a standalone <strong>Chrome</strong> or <strong>Edge</strong> tab (requires your private Google sign-in on dev URLs, or <code className="font-mono text-xs">localhost:3000</code> locally):
                </p>
                <ul className="space-y-1.5 list-disc list-inside">
                  <li>
                    <strong>Android (Chrome):</strong> Tap the <strong>&#8942;</strong> menu &rarr; <strong>Add to Home screen</strong> / <strong>Install app</strong>.
                  </li>
                  <li>
                    <strong>Desktop (Chrome / Edge):</strong> Click <strong>Install Bench App</strong> or the <strong>Install</strong> icon in the address bar.
                  </li>
                </ul>
              </div>
            )}

            <button
              type="button"
              onClick={() => setShowGuideModal(false)}
              className="w-full min-h-[44px] px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
            >
              Got It
            </button>
          </div>
        </div>
      )}
    </>
  );
}

export function OfflineIndicator() {
  const isOnline = useOnlineStatus();

  if (isOnline) return null;

  return (
    <div
      role="status"
      className="fixed bottom-16 lg:bottom-4 left-4 z-40 flex items-center gap-2 rounded-lg bg-amber-600 text-white px-3 py-2 text-xs font-medium shadow-lg"
    >
      <WifiOff className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
      <span>Offline Mode — Cached bench tools active</span>
    </div>
  );
}
