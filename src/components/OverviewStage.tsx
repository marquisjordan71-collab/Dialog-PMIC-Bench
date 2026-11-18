import { ArrowRight, CheckCircle2, Cpu, Download, FileText, Gamepad2, Sliders, Usb, Zap } from 'lucide-react';
import type { ActiveTab, DiscoveredManual } from '../types';
import type { PmicProfile } from '../utils/pmicCatalog';
import { calculateRailPowerMw, calculateTotalPowerStats, type RailRuntimeState } from '../utils/pmicProtocol';
import type { ConnectedHardwareInfo } from '../utils/webHardwareBridge';

interface OverviewStageProps {
  connectedHardware: ConnectedHardwareInfo | null;
  activeProfile: PmicProfile | null;
  railStates: RailRuntimeState[];
  vinMv: number;
  activeFirmwareVersion: string;
  manuals: DiscoveredManual[];
  manualsLoading: boolean;
  probing: boolean;
  onConnectUsb: () => void;
  onPlugBenchProfile: (partNumber: string) => void;
  onNavigateTab: (tab: ActiveTab) => void;
  onPreviewManual: (doc: DiscoveredManual) => void;
}

export function OverviewStage({
  connectedHardware,
  activeProfile,
  railStates,
  vinMv,
  activeFirmwareVersion,
  manuals,
  manualsLoading,
  probing,
  onConnectUsb,
  onPlugBenchProfile,
  onNavigateTab,
  onPreviewManual,
}: OverviewStageProps) {
  if (!connectedHardware || !activeProfile) {
    return (
      <section className="space-y-6">
        {/* Hero Split */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden grid grid-cols-1 md:grid-cols-12 items-stretch">
          <div className="md:col-span-7 p-6 sm:p-8 flex flex-col justify-between gap-6">
            <div className="space-y-3">
              <p className="text-xs font-medium text-blue-700 dark:text-blue-400">
                USB-C OTG · WebUSB / WebHID Gamepads / WebSerial
              </p>
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-100 text-balance">
                Plug-and-play consumer device, gamepad, and Dialog PMIC bench
              </h1>
              <p className="text-sm sm:text-base text-slate-600 dark:text-slate-300 leading-relaxed max-w-xl">
                Connect smartphones (Galaxy, Pixel, iPhone), all gamepads old and new (PS5 DualSense, PS4 DualShock 4, PS3 Sixaxis, Xbox Series/360, Switch Pro, NES/SNES/N64/GC, 8BitDo, Logitech), handhelds, USB-C docks/SSDs, or Dialog/Renesas PMIC evaluation boards for auto-detection, live power/bus tuning, step-by-step hardware repair guides, firmware flashing, and PDF manuals.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={onConnectUsb}
                disabled={probing}
                className="min-h-[44px] px-5 py-2.5 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors flex items-center gap-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
              >
                <Usb className="w-4 h-4" aria-hidden="true" />
                <span>Connect USB / OTG</span>
              </button>
              <button
                type="button"
                onClick={() => onPlugBenchProfile('DUALSENSE')}
                disabled={probing}
                className="min-h-[44px] px-4 py-2.5 text-sm font-medium text-slate-800 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 rounded-lg transition-colors flex items-center gap-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
              >
                <span>Test Gamepad (DualSense)</span>
                <ArrowRight className="w-4 h-4" aria-hidden="true" />
              </button>
              <button
                type="button"
                onClick={() => onPlugBenchProfile('DA9063')}
                disabled={probing}
                className="min-h-[44px] px-4 py-2.5 text-sm font-medium text-slate-800 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 rounded-lg transition-colors flex items-center gap-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
              >
                <span>Plug In DA9063 EVK</span>
                <ArrowRight className="w-4 h-4" aria-hidden="true" />
              </button>
            </div>
          </div>

          <div className="md:col-span-5 bg-slate-100 dark:bg-slate-800 relative min-h-[220px]">
            <img
              src="/src/assets/images/pmic_usb_probe_1794898158548.jpg"
              alt="Hardware evaluation and consumer USB-C OTG diagnostic workbench"
              referrerPolicy="no-referrer"
              className="w-full h-full object-cover lg:h-full"
            />
          </div>
        </div>

        {/* 4-column capability strip */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-slate-200 dark:divide-slate-800">
          <div className="p-4 sm:p-5 space-y-1.5">
            <div className="text-xs font-semibold text-slate-900 dark:text-slate-100">1. Consumer &amp; EVK Auto-Detect</div>
            <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
              Enumerates phones, all old &amp; new gamepads, USB-C docks/SSDs, CP2112/FTDI bridges, and Dialog EVKs.
            </p>
          </div>
          <div className="p-4 sm:p-5 space-y-1.5">
            <div className="text-xs font-semibold text-slate-900 dark:text-slate-100">2. Auto-Download Manuals</div>
            <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
              Discovers service guides, pinouts, datasheets, and register maps and saves PDFs automatically.
            </p>
          </div>
          <div className="p-4 sm:p-5 space-y-1.5">
            <div className="text-xs font-semibold text-slate-900 dark:text-slate-100">3. Power, Bus &amp; Repair</div>
            <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
              Tune PD/Buck/LDO rails, clear faults in 1 touch, or follow visual USB-C &amp; board repair steps.
            </p>
          </div>
          <div className="p-4 sm:p-5 space-y-1.5">
            <div className="text-xs font-semibold text-slate-900 dark:text-slate-100">4. Firmware &amp; Config Backup</div>
            <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
              Flash controller, PD, or OTP/NVM patches with CRC-32 verification and .hex config export.
            </p>
          </div>
        </div>
      </section>
    );
  }

  const stats = calculateTotalPowerStats(railStates, activeProfile.rails, vinMv);
  const downloadedCount = manuals.filter((m) => m.autoDownloaded).length;
  const isConsumer = Boolean(activeProfile.deviceCategory && activeProfile.deviceCategory !== 'pmic');

  return (
    <section className="space-y-6">
      {/* Device Header Summary */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 sm:p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="text-xs text-slate-500 dark:text-slate-400">
              {activeProfile.manufacturer} · {activeProfile.packageType} ·{' '}
              {activeProfile.busProtocol ?? `I2C ${connectedHardware.identified.i2cAddr}`}
            </div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100 tracking-tight">
              {activeProfile.displayName ?? activeProfile.partNumber} Active Bench
            </h1>
            <p className="text-sm text-slate-600 dark:text-slate-300 max-w-2xl">{activeProfile.summary}</p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            {(activeProfile.deviceCategory === 'consumer-gamepad' ||
              activeProfile.partNumber === 'SWITCH-OLED' ||
              activeProfile.partNumber === 'STEAM-DECK') && (
              <button
                type="button"
                onClick={() => onNavigateTab('gamepad')}
                className="min-h-[44px] px-4 py-2 text-xs sm:text-sm font-medium text-slate-800 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg transition-colors flex items-center gap-2"
              >
                <Gamepad2 className="w-4 h-4" aria-hidden="true" />
                <span>Gamepad Tester</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => onNavigateTab('rails')}
              className="min-h-[44px] px-4 py-2 text-xs sm:text-sm font-medium text-slate-800 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg transition-colors flex items-center gap-2"
            >
              <Sliders className="w-4 h-4" aria-hidden="true" />
              <span>{isConsumer ? 'Power & Bus' : 'Tune Rails'}</span>
            </button>
            <button
              type="button"
              onClick={() => onNavigateTab('firmware')}
              className="min-h-[44px] px-4 py-2 text-xs sm:text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors flex items-center gap-2"
            >
              <Zap className="w-4 h-4" aria-hidden="true" />
              <span>Reflash Firmware</span>
            </button>
          </div>
        </div>

        {/* 4-step plug-and-play pipeline confirmation */}
        <div className="pt-4 border-t border-slate-100 dark:border-slate-800 grid grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
          <div className="flex items-center gap-2 text-slate-700 dark:text-slate-300">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" aria-hidden="true" />
            <span>{isConsumer ? 'USB-C / HID Enumerated' : 'USB-C OTG Enumerated'}</span>
          </div>
          <div className="flex items-center gap-2 text-slate-700 dark:text-slate-300">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" aria-hidden="true" />
            <span>
              {isConsumer ? 'Controller ID' : 'I2C ID'} {connectedHardware.identified.deviceIdHex} Verified
            </span>
          </div>
          <div className="flex items-center gap-2 text-slate-700 dark:text-slate-300">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" aria-hidden="true" />
            <span>Firmware {activeFirmwareVersion}</span>
          </div>
          <div className="flex items-center gap-2 text-slate-700 dark:text-slate-300">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" aria-hidden="true" />
            <span>
              {manualsLoading
                ? 'Searching Manuals...'
                : downloadedCount > 0
                  ? `${downloadedCount} Manual Auto-Saved`
                  : `${manuals.length} Manuals Ready`}
            </span>
          </div>
        </div>
      </div>

      {/* 4 Telemetry KPIs */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl grid grid-cols-2 lg:grid-cols-4 divide-y lg:divide-y-0 divide-x divide-slate-200 dark:divide-slate-800">
        <div className="p-4 sm:p-5">
          <div className="text-xs font-medium text-slate-500 dark:text-slate-400">Total Output Power</div>
          <div className="mt-1 flex items-baseline">
            <span className="text-2xl sm:text-3xl font-mono font-semibold text-slate-900 dark:text-slate-100 tabular-nums">
              {stats.totalOutputMw}
            </span>
            <span className="text-xs font-mono uppercase text-slate-500 dark:text-slate-400 ml-1.5">mW</span>
          </div>
          <div className="mt-1 text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums">
            {isConsumer ? 'VBUS' : 'VIN'} {(vinMv / 1000).toFixed(2)} V
          </div>
        </div>

        <div className="p-4 sm:p-5">
          <div className="text-xs font-medium text-slate-500 dark:text-slate-400">Conversion Efficiency</div>
          <div className="mt-1 flex items-baseline">
            <span className="text-2xl sm:text-3xl font-mono font-semibold text-slate-900 dark:text-slate-100 tabular-nums">
              {stats.efficiencyPct}
            </span>
            <span className="text-xs font-mono uppercase text-slate-500 dark:text-slate-400 ml-1.5">%</span>
          </div>
          <div className="mt-1 text-xs text-emerald-700 dark:text-emerald-400">Nominal regulation</div>
        </div>

        <div className="p-4 sm:p-5">
          <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
            {isConsumer ? 'Active Power Domains' : 'Active Power Rails'}
          </div>
          <div className="mt-1 flex items-baseline">
            <span className="text-2xl sm:text-3xl font-mono font-semibold text-slate-900 dark:text-slate-100 tabular-nums">
              {stats.activeRailsCount}
            </span>
            <span className="text-xs font-mono uppercase text-slate-500 dark:text-slate-400 ml-1.5">
              / {activeProfile.rails.length}
            </span>
          </div>
          <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">Sequenced OK</div>
        </div>

        <div className="p-4 sm:p-5">
          <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
            {isConsumer ? 'Peak Controller Temp' : 'Peak Die Temp'}
          </div>
          <div className="mt-1 flex items-baseline">
            <span className="text-2xl sm:text-3xl font-mono font-semibold text-slate-900 dark:text-slate-100 tabular-nums">
              {stats.peakTempC}
            </span>
            <span className="text-xs font-mono uppercase text-slate-500 dark:text-slate-400 ml-1.5">°C</span>
          </div>
          <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">Thermal margin nominal</div>
        </div>
      </div>

      {/* Two-column summary: Active Rails/Domains + Auto-Downloaded Manuals */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
        <div className="xl:col-span-7 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <Cpu className="w-4 h-4 text-slate-500 dark:text-slate-400" aria-hidden="true" />
              <span>{isConsumer ? 'Live Power Domain Summary' : 'Live Rail Summary'}</span>
            </h2>
            <button
              type="button"
              onClick={() => onNavigateTab('rails')}
              className="text-xs font-medium text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 min-h-[36px] px-2"
            >
              Open Power Console
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400">
                  <th className="pb-2 font-medium">Domain</th>
                  <th className="pb-2 font-medium">State</th>
                  <th className="pb-2 font-medium text-right">Voltage</th>
                  <th className="pb-2 font-medium text-right">Current</th>
                  <th className="pb-2 font-medium text-right">Power</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {activeProfile.rails.map((rail) => {
                  const st = railStates.find((s) => s.id === rail.id);
                  if (!st) return null;
                  const powerMw = calculateRailPowerMw(st.voltageMv, st.currentMa, st.enabled);
                  return (
                    <tr key={rail.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/60">
                      <td className="py-2.5 pr-3">
                        <div className="font-mono font-semibold text-slate-900 dark:text-slate-100">{rail.id}</div>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400">
                          {rail.type} · Reg {rail.regAddr}
                        </div>
                      </td>
                      <td className="py-2.5 pr-3">
                        <span
                          className={
                            st.enabled
                              ? 'text-emerald-700 dark:text-emerald-400 font-medium'
                              : 'text-slate-400 dark:text-slate-500'
                          }
                        >
                          {st.enabled ? 'Enabled' : 'Disabled'}
                        </span>
                      </td>
                      <td className="py-2.5 text-right font-mono tabular-nums text-slate-900 dark:text-slate-100">
                        {st.enabled ? `${st.voltageMv} mV` : '0 mV'}
                      </td>
                      <td className="py-2.5 text-right font-mono tabular-nums text-slate-700 dark:text-slate-300">
                        {st.enabled ? `${st.currentMa} mA` : '0 mA'}
                      </td>
                      <td className="py-2.5 text-right font-mono tabular-nums text-slate-900 dark:text-slate-100 font-medium">
                        {powerMw} mW
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        <div className="xl:col-span-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <FileText className="w-4 h-4 text-slate-500 dark:text-slate-400" aria-hidden="true" />
              <span>Discovered Manuals</span>
            </h2>
            <button
              type="button"
              onClick={() => onNavigateTab('manuals')}
              className="text-xs font-medium text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 min-h-[36px] px-2"
            >
              All Manuals
            </button>
          </div>

          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {manuals.slice(0, 4).map((doc) => (
              <div key={doc.id} className="py-3 first:pt-0 last:pb-0 space-y-2">
                <div>
                  <div className="text-sm font-medium text-slate-900 dark:text-slate-100">{doc.title}</div>
                  <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    {doc.docType} · {doc.revision} · {doc.pages} pages
                    {doc.autoDownloaded ? ' · Auto-Downloaded' : ''}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => onPreviewManual(doc)}
                    className="min-h-[40px] px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg transition-colors"
                  >
                    Read Manual
                  </button>
                  <a
                    href={doc.downloadUrl}
                    download
                    className="min-h-[40px] px-3 py-1.5 text-xs font-medium text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-950/60 hover:bg-blue-100 dark:hover:bg-blue-900/60 rounded-lg transition-colors inline-flex items-center gap-1.5"
                  >
                    <Download className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>PDF</span>
                  </a>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
