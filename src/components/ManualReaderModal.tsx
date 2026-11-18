import { useEffect, useState } from 'react';
import { Download, ExternalLink, X } from 'lucide-react';
import type { DiscoveredManual } from '../types';
import { ALL_DEVICE_PROFILES, type PmicProfile } from '../utils/pmicCatalog';

interface ManualReaderModalProps {
  doc: DiscoveredManual | null;
  onClose: () => void;
  onDownloadPdf: (doc: DiscoveredManual) => void;
}

export function ManualReaderModal({ doc, onClose, onDownloadPdf }: ManualReaderModalProps) {
  const [profile, setProfile] = useState<PmicProfile | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!doc) return;
    let active = true;
    const localFallback = ALL_DEVICE_PROFILES[doc.partNumber.toUpperCase()] ?? null;
    setLoading(true);
    const token = (() => {
      try {
        return sessionStorage.getItem('dialog-pmic-bench-session');
      } catch {
        return null;
      }
    })();
    fetch(doc.previewUrl, {
      headers: token ? { 'X-App-Session': token } : undefined,
    })
      .then((r) => {
        if (!r.ok) throw new Error('Preview fetch failed');
        return r.json();
      })
      .then((data: { profile?: PmicProfile | null }) => {
        if (active) {
          setProfile(data.profile ?? localFallback);
        }
      })
      .catch(() => {
        if (active) setProfile(localFallback);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [doc]);

  if (!doc) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="manual-reader-title"
      className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-6"
    >
      <div className="bg-white dark:bg-slate-900 w-full max-w-3xl max-h-[88vh] rounded-t-2xl sm:rounded-xl border border-slate-200 dark:border-slate-800 flex flex-col overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-start justify-between gap-4">
          <div>
            <div className="text-xs text-slate-500 dark:text-slate-400">
              {doc.partNumber} · {doc.docType} · {doc.revision}
            </div>
            <h2 id="manual-reader-title" className="text-lg font-bold text-slate-900 dark:text-slate-100 mt-0.5">
              {doc.title}
            </h2>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close manual reader"
            className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <X className="w-5 h-5" aria-hidden="true" />
          </button>
        </div>

        <div className="p-5 sm:p-6 overflow-y-auto space-y-6 text-sm text-slate-700 dark:text-slate-300">
          <div className="space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Summary</h3>
            <p className="leading-relaxed">{doc.summary}</p>
            <ul className="space-y-1 text-xs text-slate-600 dark:text-slate-400 pt-1">
              {doc.highlights.map((h) => (
                <li key={h}>• {h}</li>
              ))}
            </ul>
          </div>

          {loading ? (
            <p className="text-xs text-slate-500 dark:text-slate-400">Loading silicon reference specifications...</p>
          ) : profile ? (
            <>
              <div className="space-y-2">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Hardware &amp; Pinout Reference
                </h3>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs border border-slate-200 dark:border-slate-800 rounded-lg p-3.5">
                  <div>
                    <div className="text-slate-500 dark:text-slate-400">Package</div>
                    <div className="font-mono font-medium text-slate-900 dark:text-slate-100">{profile.packageType}</div>
                  </div>
                  <div>
                    <div className="text-slate-500 dark:text-slate-400">I2C Addr</div>
                    <div className="font-mono font-medium text-slate-900 dark:text-slate-100">{profile.i2cAddresses.join(', ')}</div>
                  </div>
                  <div>
                    <div className="text-slate-500 dark:text-slate-400">Device ID</div>
                    <div className="font-mono font-medium text-slate-900 dark:text-slate-100">
                      0x{profile.deviceIdValue.toString(16).toUpperCase().padStart(2, '0')} ({profile.deviceIdReg})
                    </div>
                  </div>
                  <div>
                    <div className="text-slate-500 dark:text-slate-400">VIN Range</div>
                    <div className="font-mono font-medium text-slate-900 dark:text-slate-100">
                      {(profile.vinMinMv / 1000).toFixed(1)}V - {(profile.vinMaxMv / 1000).toFixed(1)}V
                    </div>
                  </div>
                </div>

                <div className="overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-lg">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400">
                      <tr>
                        <th className="py-2 px-3 font-medium">Pin</th>
                        <th className="py-2 px-3 font-medium">Signal</th>
                        <th className="py-2 px-3 font-medium">Function</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {profile.pinoutHighlights.map((pin) => (
                        <tr key={pin.name}>
                          <td className="py-2 px-3 font-mono text-slate-700 dark:text-slate-300">{pin.pin}</td>
                          <td className="py-2 px-3 font-mono font-medium text-slate-900 dark:text-slate-100">{pin.name}</td>
                          <td className="py-2 px-3 text-slate-600 dark:text-slate-300">{pin.function}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="space-y-2">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Register Map Reference
                </h3>
                <div className="overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-lg">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400">
                      <tr>
                        <th className="py-2 px-3 font-medium">Addr</th>
                        <th className="py-2 px-3 font-medium">Name</th>
                        <th className="py-2 px-3 font-medium">Default</th>
                        <th className="py-2 px-3 font-medium">Description</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {profile.registers.map((r) => (
                        <tr key={r.addr}>
                          <td className="py-2 px-3 font-mono text-slate-700 dark:text-slate-300">{r.addr}</td>
                          <td className="py-2 px-3 font-mono font-medium text-slate-900 dark:text-slate-100">{r.name}</td>
                          <td className="py-2 px-3 font-mono text-slate-700 dark:text-slate-300">{r.defaultVal}</td>
                          <td className="py-2 px-3 text-slate-600 dark:text-slate-300">{r.description}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          ) : null}
        </div>

        <div className="px-5 py-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 flex flex-wrap items-center justify-between gap-3">
          <a
            href={doc.officialUrl}
            target="_blank"
            rel="noreferrer"
            className="min-h-[44px] px-3 py-2 text-xs font-medium text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white inline-flex items-center gap-1.5"
          >
            <span>
              {profile?.deviceCategory && profile.deviceCategory !== 'pmic'
                ? 'Open Manufacturer / Repair Source'
                : 'Open Renesas / Dialog Source'}
            </span>
            <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
          </a>

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="min-h-[44px] px-4 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg"
            >
              Close
            </button>
            <button
              type="button"
              onClick={() => onDownloadPdf(doc)}
              className="min-h-[44px] px-4 py-2 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg inline-flex items-center gap-1.5"
            >
              <Download className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Download PDF Manual</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
