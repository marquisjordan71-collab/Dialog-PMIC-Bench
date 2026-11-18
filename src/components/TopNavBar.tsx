import { Activity, Cpu, Download, FileText, Gamepad2, Lock, ShieldCheck, Sliders, Usb, Zap } from 'lucide-react';
import type { ActiveTab } from '../types';

interface TopNavBarProps {
  activeTab: ActiveTab;
  onSelectTab: (tab: ActiveTab) => void;
  isConnected: boolean;
  probing: boolean;
  securityLocked: boolean;
  lockArmed: boolean;
  onConnectUsb: () => void;
  onDisconnect: () => void;
  onOpenSecurity: () => void;
}

const NAV_ITEMS: Array<{ id: ActiveTab; label: string; mobileLabel: string; icon: typeof Zap }> = [
  { id: 'overview', label: 'Overview', mobileLabel: 'Overview', icon: Cpu },
  { id: 'rails', label: 'Power & Bus', mobileLabel: 'Power', icon: Sliders },
  { id: 'diagnostics', label: 'Diagnostics', mobileLabel: 'Diag', icon: Activity },
  { id: 'gamepad', label: 'Gamepad', mobileLabel: 'Gamepad', icon: Gamepad2 },
  { id: 'firmware', label: 'Firmware', mobileLabel: 'Firmware', icon: Zap },
  { id: 'manuals', label: 'Manuals', mobileLabel: 'Manuals', icon: FileText },
];

export function TopNavBar({
  activeTab,
  onSelectTab,
  isConnected,
  probing,
  securityLocked,
  lockArmed,
  onConnectUsb,
  onDisconnect,
  onOpenSecurity,
}: TopNavBarProps) {
  return (
    <>
      <header className="sticky top-0 z-30 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-b border-slate-200 dark:border-slate-800">
        <div className="max-w-7xl mx-auto px-3 sm:px-4 lg:px-6 h-12 lg:h-14 flex items-center justify-between gap-2 sm:gap-4 lg:gap-8">
          {/* Zone 1: Single text element wordmark */}
          <button
            type="button"
            onClick={() => onSelectTab('overview')}
            className="text-sm sm:text-base lg:text-lg font-bold tracking-tight text-slate-900 dark:text-slate-100 whitespace-nowrap shrink min-w-0 truncate text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 rounded"
          >
            Dialog PMIC Bench
          </button>

          {/* Zone 2: Desktop single-line nav links */}
          <nav aria-label="Primary navigation" className="hidden lg:flex items-center gap-6">
            {NAV_ITEMS.map((item) => {
              const active = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onSelectTab(item.id)}
                  aria-current={active ? 'page' : undefined}
                  className={`min-h-[44px] px-1 text-sm font-medium whitespace-nowrap shrink-0 border-b-2 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 ${
                    active
                      ? 'border-blue-600 dark:border-blue-400 text-slate-900 dark:text-white'
                      : 'border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:border-slate-300 dark:hover:border-slate-700'
                  }`}
                >
                  {item.label}
                </button>
              );
            })}
          </nav>

          {/* Zone 3: Security Shield & Single primary action */}
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            <button
              type="button"
              onClick={onOpenSecurity}
              aria-label="Ownership & Anti-Theft Protection"
              title="Ownership & Anti-Theft Protection"
              className={`min-h-[40px] lg:min-h-[44px] px-2 sm:px-2.5 lg:px-3 py-2 text-xs font-medium rounded-lg border transition-colors whitespace-nowrap shrink-0 flex items-center gap-1.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 ${
                securityLocked || lockArmed
                  ? 'text-emerald-800 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/60 border-emerald-300 dark:border-emerald-800 hover:bg-emerald-100 dark:hover:bg-emerald-900/60'
                  : 'text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700 hover:bg-slate-200 dark:hover:bg-slate-700'
              }`}
            >
              {securityLocked ? (
                <Lock className="w-4 h-4 shrink-0" aria-hidden="true" />
              ) : (
                <ShieldCheck className="w-4 h-4 shrink-0" aria-hidden="true" />
              )}
              <span className="hidden sm:inline">{lockArmed ? 'Armed' : 'Protect'}</span>
            </button>

            {isConnected ? (
              <button
                type="button"
                onClick={onDisconnect}
                className="min-h-[40px] lg:min-h-[44px] px-2.5 sm:px-3.5 lg:px-4 py-2 text-xs lg:text-sm font-medium text-slate-900 dark:text-slate-100 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 border border-slate-300 dark:border-slate-700 rounded-lg transition-colors whitespace-nowrap shrink-0 flex items-center gap-1.5 sm:gap-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
              >
                <Usb className="w-4 h-4 text-slate-700 dark:text-slate-300" aria-hidden="true" />
                <span>Disconnect</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={onConnectUsb}
                disabled={probing}
                className="min-h-[40px] lg:min-h-[44px] px-2.5 sm:px-3.5 lg:px-4 py-2 text-xs lg:text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-60 rounded-lg transition-colors whitespace-nowrap shrink-0 flex items-center gap-1.5 sm:gap-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
              >
                <Usb className="w-4 h-4" aria-hidden="true" />
                <span>{probing ? 'Scanning...' : 'Connect USB'}</span>
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Mobile Bottom Thumb Navigation (56px height + 48px header = 104px <= 15% of 844px) */}
      <nav
        aria-label="Mobile navigation"
        className="lg:hidden fixed bottom-0 left-0 right-0 z-40 h-14 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-t border-slate-200 dark:border-slate-800 grid grid-cols-6 items-center"
      >
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const active = activeTab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelectTab(item.id)}
              aria-current={active ? 'page' : undefined}
              className={`min-h-[44px] h-full flex flex-col items-center justify-center gap-0.5 transition-colors focus-visible:outline-2 focus-visible:outline-inset focus-visible:outline-blue-600 ${
                active
                  ? 'text-blue-600 dark:text-blue-400 font-semibold'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
              }`}
            >
              <Icon className="w-5 h-5" aria-hidden="true" />
              <span className="text-[11px] leading-none whitespace-nowrap">{item.mobileLabel}</span>
            </button>
          );
        })}
      </nav>
    </>
  );
}

export { Download };
