import { useState } from 'react';
import { Download, Minus, Plus, Terminal, Usb } from 'lucide-react';
import type { RegisterWriteLog } from '../types';
import type { PmicProfile } from '../utils/pmicCatalog';
import { buildI2cLogCsvFilename, formatI2cLogCsv } from '../utils/i2cCsvExport';
import {
  calculateRailPowerMw,
  formatHexByte,
  millivoltsToDacCode,
  type RailRuntimeState,
} from '../utils/pmicProtocol';

interface RailsAndI2CStageProps {
  activeProfile: PmicProfile | null;
  railStates: RailRuntimeState[];
  registerOverrides: Record<string, string>;
  i2cLog: RegisterWriteLog[];
  onUpdateRailVoltage: (railId: string, nextMv: number) => void;
  onToggleRailEnable: (railId: string) => void;
  onManualI2cCommand: (operation: 'READ' | 'WRITE', regAddr: string, valueHex?: string) => void;
  onConnectUsb: () => void;
  onPlugBenchProfile: (partNumber: string) => void;
}

export function RailsAndI2CStage({
  activeProfile,
  railStates,
  registerOverrides,
  i2cLog,
  onUpdateRailVoltage,
  onToggleRailEnable,
  onManualI2cCommand,
  onConnectUsb,
  onPlugBenchProfile,
}: RailsAndI2CStageProps) {
  const [regInput, setRegInput] = useState('0x0A3');
  const [valInput, setValInput] = useState('0x50');
  const [i2cError, setI2cError] = useState<string | null>(null);

  if (!activeProfile) {
    return (
      <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 sm:p-8 text-center space-y-4">
        <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">No Device or PMIC Connected</h1>
        <p className="text-sm text-slate-600 dark:text-slate-300 max-w-md mx-auto">
          Plug in a consumer USB-C device, gamepad, or Dialog PMIC evaluation board via USB-C OTG—or choose a quick target below—to inspect live power domains and controller registers.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
          <button
            type="button"
            onClick={onConnectUsb}
            className="min-h-[44px] px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors flex items-center gap-2"
          >
            <Usb className="w-4 h-4" aria-hidden="true" />
            <span>Connect USB / OTG</span>
          </button>
          <button
            type="button"
            onClick={() => onPlugBenchProfile('DUALSENSE')}
            className="min-h-[44px] px-4 py-2 text-sm font-medium text-slate-800 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg transition-colors"
          >
            Test DualSense Pad
          </button>
          <button
            type="button"
            onClick={() => onPlugBenchProfile('GALAXY-USBC')}
            className="min-h-[44px] px-4 py-2 text-sm font-medium text-slate-800 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg transition-colors"
          >
            Test Galaxy USB-C
          </button>
          <button
            type="button"
            onClick={() => onPlugBenchProfile('DA9063')}
            className="min-h-[44px] px-4 py-2 text-sm font-medium text-slate-800 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg transition-colors"
          >
            Plug In DA9063 EVK
          </button>
        </div>
      </section>
    );
  }

  const isConsumer = Boolean(activeProfile.deviceCategory && activeProfile.deviceCategory !== 'pmic');

  const handleSubmitI2c = (op: 'READ' | 'WRITE') => {
    const cleanReg = regInput.trim().toUpperCase();
    if (!/^0X[0-9A-F]{1,4}$/i.test(cleanReg)) {
      setI2cError('Enter a valid hex register address (e.g., 0x0A3).');
      return;
    }
    if (op === 'WRITE') {
      const cleanVal = valInput.trim().toUpperCase();
      if (!/^0X[0-9A-F]{1,2}$/i.test(cleanVal)) {
        setI2cError('Enter a valid 8-bit hex byte value (e.g., 0x52).');
        return;
      }
      setI2cError(null);
      onManualI2cCommand('WRITE', `0x${cleanReg.slice(2).padStart(3, '0')}`, `0x${cleanVal.slice(2).padStart(2, '0')}`);
      return;
    }
    setI2cError(null);
    onManualI2cCommand('READ', `0x${cleanReg.slice(2).padStart(3, '0')}`);
  };

  const handleExportI2cCsv = () => {
    if (i2cLog.length === 0) return;
    const csv = formatI2cLogCsv(i2cLog, activeProfile.partNumber);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = buildI2cLogCsvFilename(activeProfile.partNumber);
    link.rel = 'noopener';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return (
    <section className="space-y-6">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 sm:p-6 space-y-5">
        <div>
          <div className="text-xs text-slate-500 dark:text-slate-400">
            {activeProfile.displayName ?? activeProfile.partNumber} · {activeProfile.busProtocol ?? `Primary I2C ${activeProfile.primaryI2cAddr}`}
          </div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100 mt-0.5">
            {isConsumer ? 'Power Domains & Bus Inspector' : 'Power Rail Tuning & Sequencer'}
          </h1>
        </div>

        <div className="divide-y divide-slate-200 dark:divide-slate-800">
          {activeProfile.rails.map((rail) => {
            const st = railStates.find((s) => s.id === rail.id);
            if (!st) return null;
            const dacCode = millivoltsToDacCode(st.voltageMv, rail.minMv, rail.stepMv, rail.maxMv);
            const dacHex = formatHexByte(dacCode);
            const powerMw = calculateRailPowerMw(st.voltageMv, st.currentMa, st.enabled);

            return (
              <div key={rail.id} className="py-4 first:pt-0 last:pb-0 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-sm font-semibold text-slate-900 dark:text-slate-100">{rail.id}</span>
                      <span className="text-xs text-slate-500 dark:text-slate-400">
                        {rail.type} · Reg {rail.regAddr} · Seq #{rail.seqSlot}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{rail.description}</p>
                  </div>

                  <div className="flex items-center gap-4">
                    <div className="text-right font-mono tabular-nums">
                      <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                        {st.enabled ? `${st.voltageMv} mV` : 'OFF'}
                      </div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400">
                        DAC {dacHex} · {powerMw} mW
                      </div>
                    </div>

                    <button
                      type="button"
                      role="switch"
                      aria-checked={st.enabled}
                      aria-label={`Toggle ${rail.id} rail`}
                      onClick={() => onToggleRailEnable(rail.id)}
                      className={`min-h-[44px] px-3.5 py-2 text-xs font-medium rounded-lg border transition-colors ${
                        st.enabled
                          ? 'bg-emerald-50 dark:bg-emerald-950/60 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-900/60'
                          : 'bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'
                      }`}
                    >
                      {st.enabled ? 'Enabled' : 'Disabled'}
                    </button>
                  </div>
                </div>

                {/* Slider + Touch Steppers */}
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    aria-label={`Decrease ${rail.id} voltage`}
                    disabled={!st.enabled || st.voltageMv <= rail.minMv}
                    onClick={() => onUpdateRailVoltage(rail.id, Math.max(rail.minMv, st.voltageMv - rail.stepMv))}
                    className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-40 text-slate-800 dark:text-slate-200"
                  >
                    <Minus className="w-4 h-4" aria-hidden="true" />
                  </button>

                  <div className="flex-1">
                    <input
                      type="range"
                      aria-label={`${rail.id} voltage target in millivolts`}
                      min={rail.minMv}
                      max={rail.maxMv}
                      step={rail.stepMv}
                      value={st.voltageMv}
                      disabled={!st.enabled}
                      onChange={(e) => onUpdateRailVoltage(rail.id, Number(e.target.value))}
                      className="w-full accent-blue-600 cursor-pointer h-2 bg-slate-200 dark:bg-slate-700 rounded-lg"
                    />
                    <div className="flex justify-between text-[11px] font-mono text-slate-400 dark:text-slate-500 tabular-nums mt-1">
                      <span>{rail.minMv} mV</span>
                      <span>Step {rail.stepMv} mV</span>
                      <span>{rail.maxMv} mV</span>
                    </div>
                  </div>

                  <button
                    type="button"
                    aria-label={`Increase ${rail.id} voltage`}
                    disabled={!st.enabled || st.voltageMv >= rail.maxMv}
                    onClick={() => onUpdateRailVoltage(rail.id, Math.min(rail.maxMv, st.voltageMv + rail.stepMv))}
                    className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-40 text-slate-800 dark:text-slate-200"
                  >
                    <Plus className="w-4 h-4" aria-hidden="true" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Register Map & Manual Bus / I2C Read/Write Probe */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
        <div className="xl:col-span-7 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            {isConsumer ? `Controller & Telemetry Registers (${activeProfile.partNumber})` : `Live Register Map (${activeProfile.partNumber})`}
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400">
                  <th className="pb-2 font-medium">Addr</th>
                  <th className="pb-2 font-medium">Register</th>
                  <th className="pb-2 font-medium">Value</th>
                  <th className="pb-2 font-medium">Access</th>
                  <th className="pb-2 font-medium">Description</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {activeProfile.registers.map((reg) => {
                  const normalizedKey = `0x${reg.addr.replace(/^0x/i, '').padStart(3, '0').toUpperCase()}`;
                  const currentVal = registerOverrides[normalizedKey] ?? reg.defaultVal;
                  const modified = currentVal !== reg.defaultVal;
                  return (
                    <tr key={reg.addr} className="hover:bg-slate-50 dark:hover:bg-slate-800/60">
                      <td className="py-2 pr-2 font-mono text-slate-600 dark:text-slate-400 tabular-nums">{reg.addr}</td>
                      <td className="py-2 pr-2 font-mono font-medium text-slate-900 dark:text-slate-100">{reg.name}</td>
                      <td className={`py-2 pr-2 font-mono font-semibold tabular-nums ${modified ? 'text-blue-700 dark:text-blue-400' : 'text-slate-800 dark:text-slate-200'}`}>
                        {currentVal}
                      </td>
                      <td className="py-2 pr-2 font-mono text-slate-500 dark:text-slate-400">{reg.access}</td>
                      <td className="py-2 text-slate-600 dark:text-slate-300">{reg.description}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        <div className="xl:col-span-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <Terminal className="w-4 h-4 text-slate-500 dark:text-slate-400" aria-hidden="true" />
            <span>{isConsumer ? 'Bus / I2C Register Read / Write' : 'I2C Register Read / Write'}</span>
          </h2>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="i2c-reg-addr" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Register (Hex)
              </label>
              <input
                id="i2c-reg-addr"
                type="text"
                value={regInput}
                onChange={(e) => setRegInput(e.target.value)}
                placeholder="0x0A3"
                className="w-full min-h-[44px] px-3 py-2 text-sm font-mono bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-lg focus:outline-2 focus:outline-blue-600"
              />
            </div>
            <div>
              <label htmlFor="i2c-reg-val" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Byte Value (Hex)
              </label>
              <input
                id="i2c-reg-val"
                type="text"
                value={valInput}
                onChange={(e) => setValInput(e.target.value)}
                placeholder="0x50"
                className="w-full min-h-[44px] px-3 py-2 text-sm font-mono bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-lg focus:outline-2 focus:outline-blue-600"
              />
            </div>
          </div>

          {i2cError && <p className="text-xs text-rose-700 dark:text-rose-400">{i2cError}</p>}

          <div className="grid grid-cols-2 gap-2.5">
            <button
              type="button"
              onClick={() => handleSubmitI2c('READ')}
              className="min-h-[44px] px-3 py-2 text-xs font-medium text-slate-800 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg transition-colors"
            >
              Read Register
            </button>
            <button
              type="button"
              onClick={() => handleSubmitI2c('WRITE')}
              className="min-h-[44px] px-3 py-2 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
            >
              Write Register
            </button>
          </div>

          <div className="pt-3 border-t border-slate-100 dark:border-slate-800 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-xs font-medium text-slate-500 dark:text-slate-400">
                Recent Bus Transactions{i2cLog.length > 0 ? ` (${i2cLog.length})` : ''}
              </h3>
              <button
                type="button"
                onClick={handleExportI2cCsv}
                disabled={i2cLog.length === 0}
                aria-label="Export I2C log history as CSV"
                className="min-h-[32px] px-2.5 py-1 text-xs font-medium text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed rounded-md border border-slate-200 dark:border-slate-700 transition-colors flex items-center gap-1.5 shrink-0"
              >
                <Download className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Export CSV</span>
              </button>
            </div>
            {i2cLog.length === 0 ? (
              <p className="text-xs text-slate-400 dark:text-slate-500">Adjust a rail or run a register read/write to log I2C frames.</p>
            ) : (
              <ul className="space-y-1.5 max-h-48 overflow-y-auto text-xs font-mono">
                {i2cLog.slice(0, 8).map((entry) => (
                  <li key={entry.id} className="text-slate-700 dark:text-slate-300 flex items-center justify-between gap-2 py-1 border-b border-slate-50 dark:border-slate-800/60">
                    <span className="truncate">
                      {entry.operation} {entry.i2cAddr} [{entry.regAddr}] = {entry.value}
                    </span>
                    <span className="text-[11px] text-slate-400 dark:text-slate-500 shrink-0">{entry.timestamp}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
