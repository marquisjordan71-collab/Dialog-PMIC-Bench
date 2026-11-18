import { useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Play,
  ShoppingCart,
  Usb,
  Wrench,
  Zap,
} from 'lucide-react';
import type { PmicProfile } from '../utils/pmicCatalog';
import type {
  DiagnosticFaultScenario,
  DiagnosticFinding,
  DiagnosticReport,
} from '../utils/pmicDiagnostics';
import type { ConnectedHardwareInfo, HardwareCapabilityReport } from '../utils/webHardwareBridge';
import { HardwareRepairGraphic } from './HardwareRepairGraphic';
import { TransportDebuggerPanel } from './TransportDebuggerPanel';

interface DiagnosticsStageProps {
  capabilities: HardwareCapabilityReport;
  connectedHardware: ConnectedHardwareInfo | null;
  activeProfile: PmicProfile | null;
  vinMv: number;
  report: DiagnosticReport | null;
  running: boolean;
  faultScenario: DiagnosticFaultScenario;
  onChangeScenario: (scenario: DiagnosticFaultScenario) => void;
  onRunDiagnostics: (overrideScenario?: DiagnosticFaultScenario) => void;
  onOneTouchRepair: (finding: DiagnosticFinding) => void;
  onRepairAllSoftware: () => void;
  onConnectUsb: () => void;
  onConnectBluetooth: () => void;
  onPlugBenchProfile: (partNumber: string) => void;
}

const SCENARIO_OPTIONS: Array<{ id: DiagnosticFaultScenario; label: string }> = [
  { id: 'auto', label: 'Live Bus Scan' },
  { id: 'usbc-port-hw', label: 'USB-C Port / PD IC (HW)' },
  { id: 'i2c-pullup-hw', label: 'I2C Pull-Up NACK (HW)' },
  { id: 'buck-inductor-hw', label: 'Buck Inductor Fault (HW)' },
  { id: 'vbus-cable-hw', label: 'USB-C VBUS Drop (HW)' },
  { id: 'thermal-pad-hw', label: 'Die Thermal Pad (HW)' },
];

export function DiagnosticsStage({
  capabilities,
  connectedHardware,
  activeProfile,
  vinMv,
  report,
  running,
  faultScenario,
  onChangeScenario,
  onRunDiagnostics,
  onOneTouchRepair,
  onRepairAllSoftware,
  onConnectUsb,
  onConnectBluetooth,
  onPlugBenchProfile,
}: DiagnosticsStageProps) {
  const [diagView, setDiagView] = useState<'faults' | 'debugger'>('faults');
  const [stepByFinding, setStepByFinding] = useState<Record<string, number>>({});
  const [checkedTools, setCheckedTools] = useState<Record<string, boolean>>({});

  if (!activeProfile) {
    return (
      <section className="space-y-6">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">
              Diagnostics &amp; Wireless / USB / Bluetooth Debugger
            </h1>
            <p className="text-xs text-slate-600 dark:text-slate-300 mt-1">
              Debug Wireless RF, USB-C OTG, and Bluetooth BLE packets immediately, or connect a device for fault checks and hardware repair guides.
            </p>
          </div>
          <div className="inline-flex p-1 bg-slate-100 dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 shrink-0">
            <button
              type="button"
              onClick={() => setDiagView('debugger')}
              className={`min-h-[36px] px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                diagView === 'debugger'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
              }`}
            >
              USB / Wireless / BT Debugger
            </button>
            <button
              type="button"
              onClick={() => setDiagView('faults')}
              className={`min-h-[36px] px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                diagView === 'faults'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
              }`}
            >
              Fault &amp; Repair Checks
            </button>
          </div>
        </div>

        {diagView === 'debugger' ? (
          <TransportDebuggerPanel
            capabilities={capabilities}
            connectedHardware={null}
            activeProfile={null}
            vinMv={vinMv}
            onConnectUsb={onConnectUsb}
            onConnectBluetooth={onConnectBluetooth}
          />
        ) : (
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 sm:p-8 text-center space-y-4">
            <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">
              Connect a Device or Open the Transport Debugger
            </h2>
            <p className="text-sm text-slate-600 dark:text-slate-300 max-w-md mx-auto">
              Plug in a gamepad, smartphone, Bluetooth peripheral, or Dialog PMIC—or open the Wireless / USB / Bluetooth Debugger right away.
            </p>
            <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
              <button
                type="button"
                onClick={() => setDiagView('debugger')}
                className="min-h-[44px] px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors whitespace-nowrap"
              >
                Open USB / Wireless / BT Debugger
              </button>
              <button
                type="button"
                onClick={onConnectBluetooth}
                className="min-h-[44px] px-4 py-2 text-sm font-medium text-slate-800 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg transition-colors whitespace-nowrap"
              >
                Pair Bluetooth (BLE)
              </button>
              <button
                type="button"
                onClick={() => onPlugBenchProfile('DUALSENSE')}
                className="min-h-[44px] px-4 py-2 text-sm font-medium text-slate-800 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg transition-colors whitespace-nowrap"
              >
                Test DualSense Pad
              </button>
              <button
                type="button"
                onClick={() => onPlugBenchProfile('DA9063')}
                className="min-h-[44px] px-4 py-2 text-sm font-medium text-slate-800 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg transition-colors whitespace-nowrap"
              >
                Plug In DA9063 EVK
              </button>
            </div>
          </div>
        )}
      </section>
    );
  }

  const isConsumer = Boolean(activeProfile.deviceCategory && activeProfile.deviceCategory !== 'pmic');
  const softwareFindings = report?.findings.filter((f) => f.repairType === 'software') ?? [];
  const hardwareFindings = report?.findings.filter((f) => f.repairType === 'hardware') ?? [];

  const getActiveStepIdx = (findingId: string) => stepByFinding[findingId] ?? 0;
  const setStepIdx = (findingId: string, idx: number) =>
    setStepByFinding((prev) => ({ ...prev, [findingId]: idx }));

  return (
    <section className="space-y-6">
      {/* Header & Controls */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 sm:p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="text-xs text-slate-500 dark:text-slate-400">
              {activeProfile.displayName ?? activeProfile.partNumber} · {activeProfile.busProtocol ?? `I2C ${activeProfile.primaryI2cAddr}`} · Self-Test &amp; Repair
            </div>
            <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100 mt-0.5">
              {isConsumer ? 'Device & Power Diagnostics' : 'PMIC Diagnostics & Repair'}
            </h1>
            <p className="text-xs text-slate-600 dark:text-slate-300 mt-1">
              Scans USB-C / I2C bus integrity, rail regulation, and fault latches. Repairs software issues in 1 touch and provides visual repair steps plus DigiKey, Mouser &amp; iFixit parts sourcing for hardware faults.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            <div className="inline-flex p-1 bg-slate-100 dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700">
              <button
                type="button"
                onClick={() => setDiagView('faults')}
                className={`min-h-[36px] px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                  diagView === 'faults'
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
                }`}
              >
                Fault &amp; Repair Checks
              </button>
              <button
                type="button"
                onClick={() => setDiagView('debugger')}
                className={`min-h-[36px] px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                  diagView === 'debugger'
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
                }`}
              >
                USB / Wireless / BT Debugger
              </button>
            </div>

            {diagView === 'faults' && softwareFindings.length > 0 && (
              <button
                type="button"
                onClick={onRepairAllSoftware}
                disabled={running}
                className="min-h-[44px] px-4 py-2 text-xs sm:text-sm font-medium text-emerald-900 dark:text-emerald-200 bg-emerald-100 dark:bg-emerald-950/70 hover:bg-emerald-200 dark:hover:bg-emerald-900/70 border border-emerald-300 dark:border-emerald-800 rounded-lg transition-colors inline-flex items-center gap-2 whitespace-nowrap shrink-0"
              >
                <Zap className="w-4 h-4 text-emerald-700 dark:text-emerald-400 shrink-0" aria-hidden="true" />
                <span>1-Touch Repair All ({softwareFindings.length})</span>
              </button>
            )}

            {diagView === 'faults' && (
              <button
                type="button"
                onClick={() => onRunDiagnostics()}
                disabled={running}
                className="min-h-[44px] px-4 py-2 text-xs sm:text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-60 rounded-lg transition-colors inline-flex items-center gap-2 whitespace-nowrap shrink-0"
              >
                <Play className="w-4 h-4 shrink-0" aria-hidden="true" />
                <span>{running ? 'Running Checks...' : 'Run Diagnostics'}</span>
              </button>
            )}
          </div>
        </div>

        {/* Bench Inspection / Hardware Fault Mode Selector */}
        {diagView === 'faults' && (
        <div className="pt-3 border-t border-slate-100 dark:border-slate-800 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-medium text-slate-700 dark:text-slate-300">Diagnostic Mode / Hardware Fault Check</span>
            <span className="text-[11px] text-slate-500 dark:text-slate-400">Select a fault check to inspect repair workflow</span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {SCENARIO_OPTIONS.map((opt) => {
              const active = faultScenario === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => {
                    onChangeScenario(opt.id);
                    onRunDiagnostics(opt.id);
                  }}
                  className={`min-h-[40px] px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors whitespace-nowrap shrink-0 ${
                    active
                      ? 'bg-slate-900 dark:bg-blue-600 text-white border-slate-900 dark:border-blue-600'
                      : 'bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700'
                  }`}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
        </div>
        )}
      </div>

      {diagView === 'debugger' ? (
        <TransportDebuggerPanel
          capabilities={capabilities}
          connectedHardware={connectedHardware}
          activeProfile={activeProfile}
          vinMv={vinMv}
          onConnectUsb={onConnectUsb}
          onConnectBluetooth={onConnectBluetooth}
        />
      ) : (
      <>

      {/* Diagnostic Summary Strip */}
      {report && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl grid grid-cols-2 lg:grid-cols-4 divide-y lg:divide-y-0 divide-x divide-slate-200 dark:divide-slate-800">
          <div className="p-4 sm:p-5">
            <div className="text-xs font-medium text-slate-500 dark:text-slate-400">Overall Health</div>
            <div className="mt-1 flex items-center gap-2">
              {report.overallStatus === 'healthy' ? (
                <>
                  <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0" aria-hidden="true" />
                  <span className="text-lg font-bold text-emerald-700 dark:text-emerald-400">Healthy</span>
                </>
              ) : (
                <>
                  <AlertTriangle
                    className={`w-5 h-5 shrink-0 ${
                      report.overallStatus === 'critical' ? 'text-rose-600 dark:text-rose-400' : 'text-amber-600 dark:text-amber-400'
                    }`}
                    aria-hidden="true"
                  />
                  <span
                    className={`text-lg font-bold ${
                      report.overallStatus === 'critical' ? 'text-rose-700 dark:text-rose-400' : 'text-amber-700 dark:text-amber-400'
                    }`}
                  >
                    {report.overallStatus === 'critical' ? 'Critical Faults' : 'Warnings Found'}
                  </span>
                </>
              )}
            </div>
            <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">Last run {report.ranAt}</div>
          </div>

          <div className="p-4 sm:p-5">
            <div className="text-xs font-medium text-slate-500 dark:text-slate-400">Checks Passed</div>
            <div className="mt-1 flex items-baseline">
              <span className="text-2xl font-mono font-semibold text-slate-900 dark:text-slate-100 tabular-nums">
                {report.passedChecks}
              </span>
              <span className="text-xs font-mono text-slate-500 dark:text-slate-400 ml-1.5">/ {report.totalChecks}</span>
            </div>
            <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">{report.findings.length} active findings</div>
          </div>

          <div className="p-4 sm:p-5">
            <div className="text-xs font-medium text-slate-500 dark:text-slate-400">1-Touch Software Fixes</div>
            <div className="mt-1 text-2xl font-mono font-semibold text-slate-900 dark:text-slate-100 tabular-nums">
              {softwareFindings.length}
            </div>
            <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">Fixable via Software</div>
          </div>

          <div className="p-4 sm:p-5">
            <div className="text-xs font-medium text-slate-500 dark:text-slate-400">Hardware Repair Guides</div>
            <div className="mt-1 text-2xl font-mono font-semibold text-slate-900 dark:text-slate-100 tabular-nums">
              {hardwareFindings.length}
            </div>
            <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">Bench rework &amp; parts</div>
          </div>
        </div>
      )}

      {/* Healthy Empty State */}
      {report && report.findings.length === 0 && (
        <div className="bg-emerald-50/60 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 rounded-xl p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="w-6 h-6 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" aria-hidden="true" />
            <div>
              <h2 className="text-base font-semibold text-emerald-950 dark:text-emerald-200">
                All {report.totalChecks} Diagnostic Checks Passed
              </h2>
              <p className="text-xs text-emerald-800 dark:text-emerald-300 mt-1">
                {activeProfile.displayName ?? activeProfile.partNumber} bus communication, power regulation, input VBUS, and fault latches are nominal.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => onRunDiagnostics()}
            className="min-h-[44px] px-4 py-2 text-xs font-medium text-emerald-900 dark:text-emerald-100 bg-white dark:bg-slate-900 border border-emerald-300 dark:border-emerald-700 hover:bg-emerald-100 dark:hover:bg-emerald-900/60 rounded-lg whitespace-nowrap shrink-0"
          >
            Re-run Sweep
          </button>
        </div>
      )}

      {/* Findings List */}
      {report && report.findings.length > 0 && (
        <div className="space-y-5">
          {report.findings.map((finding) => {
            const isHardware = finding.repairType === 'hardware';
            const steps = finding.repairSteps ?? [];
            const activeStepIdx = Math.min(getActiveStepIdx(finding.id), Math.max(0, steps.length - 1));
            const currentStep = steps[activeStepIdx];

            return (
              <article
                key={finding.id}
                className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 sm:p-6 space-y-5"
              >
                {/* Finding Header */}
                <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
                  <div className="space-y-1.5">
                    <div className="text-xs text-slate-500 dark:text-slate-400 flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span
                        className={`font-semibold ${
                          finding.severity === 'critical' ? 'text-rose-700 dark:text-rose-400' : 'text-amber-700 dark:text-amber-400'
                        }`}
                      >
                        {finding.severity === 'critical' ? 'Critical' : 'Warning'}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span className="font-mono text-slate-700 dark:text-slate-300">{finding.code}</span>
                      <span aria-hidden="true">·</span>
                      <span>{finding.subsystem}</span>
                      <span aria-hidden="true">·</span>
                      <span className="font-medium text-slate-800 dark:text-slate-200">
                        {isHardware ? 'Hardware Repair Required' : 'Software Fix Available'}
                      </span>
                    </div>

                    <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-slate-100">{finding.title}</h2>
                    <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed max-w-3xl">{finding.summary}</p>

                    <div className="pt-1 flex flex-wrap gap-x-6 gap-y-1 text-xs font-mono tabular-nums">
                      <span className="text-rose-700 dark:text-rose-400">Measured: {finding.measuredValue}</span>
                      <span className="text-emerald-700 dark:text-emerald-400">Expected: {finding.expectedValue}</span>
                    </div>
                  </div>

                  {!isHardware ? (
                    <button
                      type="button"
                      onClick={() => onOneTouchRepair(finding)}
                      className="min-h-[44px] px-4 py-2.5 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors inline-flex items-center justify-center gap-2 whitespace-nowrap shrink-0"
                    >
                      <Zap className="w-4 h-4 shrink-0" aria-hidden="true" />
                      <span>{finding.repairActionLabel ?? '1-Touch Repair'}</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        onChangeScenario('auto');
                        onRunDiagnostics('auto');
                      }}
                      className="min-h-[44px] px-4 py-2 text-xs font-medium text-slate-800 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 rounded-lg transition-colors whitespace-nowrap shrink-0"
                    >
                      Re-test After Physical Repair
                    </button>
                  )}
                </div>

                {/* Hardware Step-by-Step Guide, Graphics, Tools & Parts Sourcing */}
                {isHardware && steps.length > 0 && currentStep && (
                  <div className="pt-5 border-t border-slate-200 dark:border-slate-800 space-y-6">
                    {/* Interactive Step-by-Step Walkthrough + SVG Graphic */}
                    <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
                      <div className="xl:col-span-6 space-y-4">
                        <div className="flex items-center justify-between gap-2">
                          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                            <Wrench className="w-4 h-4 text-slate-500 dark:text-slate-400" aria-hidden="true" />
                            <span>Step-by-Step Repair Guide</span>
                          </h3>
                          <span className="text-xs font-mono text-slate-500 dark:text-slate-400 tabular-nums">
                            Step {activeStepIdx + 1} of {steps.length}
                          </span>
                        </div>

                        {/* Step Selector Tabs */}
                        <div className="grid grid-cols-4 gap-1.5">
                          {steps.map((s, idx) => (
                            <button
                              key={s.stepNumber}
                              type="button"
                              onClick={() => setStepIdx(finding.id, idx)}
                              className={`min-h-[44px] px-2 py-1.5 text-xs font-mono font-medium rounded-lg border transition-colors ${
                                activeStepIdx === idx
                                  ? 'bg-blue-600 text-white border-blue-600'
                                  : 'bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700'
                              }`}
                            >
                              Step {s.stepNumber}
                            </button>
                          ))}
                        </div>

                        {/* Active Step Details */}
                        <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/70 space-y-2.5">
                          <h4 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                            {currentStep.stepNumber}. {currentStep.title}
                          </h4>
                          <p className="text-xs sm:text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
                            {currentStep.instruction}
                          </p>
                          <div className="text-xs font-mono text-emerald-800 dark:text-emerald-400 pt-1">
                            Expected: {currentStep.expectedReading}
                          </div>
                          {currentStep.caution && (
                            <div className="text-xs text-amber-900 dark:text-amber-200 bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-800 rounded-lg px-3 py-2">
                              Caution: {currentStep.caution}
                            </div>
                          )}
                        </div>

                        <div className="flex items-center justify-between gap-3">
                          <button
                            type="button"
                            disabled={activeStepIdx === 0}
                            onClick={() => setStepIdx(finding.id, Math.max(0, activeStepIdx - 1))}
                            className="min-h-[44px] px-3.5 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-40 rounded-lg inline-flex items-center gap-1.5 whitespace-nowrap"
                          >
                            <ChevronLeft className="w-4 h-4" aria-hidden="true" />
                            <span>Previous Step</span>
                          </button>
                          <button
                            type="button"
                            disabled={activeStepIdx >= steps.length - 1}
                            onClick={() => setStepIdx(finding.id, Math.min(steps.length - 1, activeStepIdx + 1))}
                            className="min-h-[44px] px-3.5 py-2 text-xs font-medium text-white bg-slate-900 dark:bg-blue-600 hover:bg-slate-800 dark:hover:bg-blue-700 disabled:opacity-40 rounded-lg inline-flex items-center gap-1.5 whitespace-nowrap"
                          >
                            <span>Next Step</span>
                            <ChevronRight className="w-4 h-4" aria-hidden="true" />
                          </button>
                        </div>
                      </div>

                      <div className="xl:col-span-6">
                        {finding.graphicKind && (
                          <HardwareRepairGraphic
                            kind={finding.graphicKind}
                            activeStep={currentStep}
                            partNumber={activeProfile.partNumber}
                          />
                        )}
                      </div>
                    </div>

                    {/* What You'll Need + Where to Source Parts */}
                    <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 pt-4 border-t border-slate-100 dark:border-slate-800">
                      {/* Tools Checklist */}
                      <div className="xl:col-span-5 space-y-2.5">
                        <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">What You&apos;ll Need (Tools)</h3>
                        <ul className="divide-y divide-slate-100 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded-lg">
                          {(finding.toolsNeeded ?? []).map((tool) => {
                            const key = `${finding.id}-${tool}`;
                            const checked = Boolean(checkedTools[key]);
                            return (
                              <li key={tool}>
                                <label className="min-h-[44px] px-3.5 py-2 flex items-center gap-3 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/60 text-xs text-slate-700 dark:text-slate-300">
                                  <input
                                    type="checkbox"
                                    checked={checked}
                                    onChange={() =>
                                      setCheckedTools((prev) => ({ ...prev, [key]: !checked }))
                                    }
                                    className="w-4 h-4 accent-blue-600 rounded shrink-0"
                                  />
                                  <span className={checked ? 'line-through text-slate-400 dark:text-slate-500' : ''}>{tool}</span>
                                </label>
                              </li>
                            );
                          })}
                        </ul>
                      </div>

                      {/* Replacement Parts & Distributor Sourcing */}
                      <div className="xl:col-span-7 space-y-2.5">
                        <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                          <ShoppingCart className="w-4 h-4 text-slate-500 dark:text-slate-400" aria-hidden="true" />
                          <span>Parts &amp; Where to Source</span>
                        </h3>
                        <div className="divide-y divide-slate-200 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded-lg">
                          {(finding.partsToSource ?? []).map((part) => (
                            <div key={part.name} className="p-3.5 space-y-2">
                              <div className="flex flex-wrap items-baseline justify-between gap-2">
                                <span className="text-xs font-semibold text-slate-900 dark:text-slate-100">{part.name}</span>
                                <span className="text-xs font-mono text-slate-600 dark:text-slate-400 tabular-nums">
                                  {part.packageSize} · {part.estPriceUsd}
                                </span>
                              </div>
                              <p className="text-xs text-slate-600 dark:text-slate-300">{part.spec}</p>
                              <div className="flex flex-wrap items-center gap-2 pt-0.5">
                                {part.suppliers.map((sup) => (
                                  <a
                                    key={sup.name}
                                    href={sup.url}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="min-h-[36px] px-2.5 py-1 text-xs font-medium text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-950/60 hover:bg-blue-100 dark:hover:bg-blue-900/60 rounded-md inline-flex items-center gap-1 whitespace-nowrap transition-colors"
                                  >
                                    <span>{sup.name}</span>
                                    <ExternalLink className="w-3 h-3" aria-hidden="true" />
                                  </a>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}
      </>
      )}
    </section>
  );
}
