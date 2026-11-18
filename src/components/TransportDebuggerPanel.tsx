import { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  Bluetooth,
  CheckCircle2,
  Download,
  Radio,
  Send,
  Trash2,
  Usb,
  Wifi,
} from 'lucide-react';
import type { PmicProfile } from '../utils/pmicCatalog';
import type { ConnectedHardwareInfo, HardwareCapabilityReport } from '../utils/webHardwareBridge';
import {
  analyzeTransportHealth,
  buildBluetoothProbeFrames,
  buildDefaultDebugMetrics,
  buildUsbProbeFrames,
  buildWirelessRfProbeFrames,
  formatDebugTraceExport,
  parseCustomHexCommand,
  type DebugPacketFrame,
  type DebugTransportChannel,
  type TransportDebugMetrics,
} from '../utils/bluetoothDebug';

interface TransportDebuggerPanelProps {
  capabilities: HardwareCapabilityReport;
  connectedHardware: ConnectedHardwareInfo | null;
  activeProfile: PmicProfile | null;
  vinMv: number;
  onConnectUsb: () => void;
  onConnectBluetooth: () => void;
}

interface NavigatorConnectionLike {
  effectiveType?: string;
  rtt?: number;
  downlink?: number;
  type?: string;
}

function readBrowserConnection(): NavigatorConnectionLike | undefined {
  if (typeof navigator === 'undefined') return undefined;
  const conn = (navigator as unknown as { connection?: NavigatorConnectionLike }).connection;
  if (!conn) return undefined;
  return {
    effectiveType: conn.effectiveType,
    rtt: conn.rtt,
    downlink: conn.downlink,
    type: conn.type,
  };
}

export function TransportDebuggerPanel({
  capabilities,
  connectedHardware,
  activeProfile,
  vinMv,
  onConnectUsb,
  onConnectBluetooth,
}: TransportDebuggerPanelProps) {
  const [channelFilter, setChannelFilter] = useState<'all' | DebugTransportChannel>('all');
  const [injectChannel, setInjectChannel] = useState<DebugTransportChannel>('bluetooth');
  const [hexInput, setHexInput] = useState('02 10 58 00');
  const [hexError, setHexError] = useState<string | null>(null);
  const [simulateInterference, setSimulateInterference] = useState(false);

  const baseMetrics = useMemo(
    () =>
      buildDefaultDebugMetrics(
        connectedHardware,
        activeProfile,
        vinMv,
        capabilities,
        readBrowserConnection(),
      ),
    [activeProfile, capabilities, connectedHardware, vinMv],
  );

  const activeMetrics: TransportDebugMetrics = useMemo(() => {
    if (!simulateInterference) return baseMetrics;
    return {
      ...baseMetrics,
      usbVbusMv: 2450,
      usbErrors: 2,
      bleAttMtu: 23,
      bleRssiDbm: -86,
      wirelessChannel: 6,
      wirelessPacketLossPct: 4.2,
      wirelessJitterMs: 11.4,
      wirelessRttMs: 32,
    };
  }, [baseMetrics, simulateInterference]);

  const [frames, setFrames] = useState<DebugPacketFrame[]>(() => [
    ...buildUsbProbeFrames(connectedHardware, activeProfile),
    ...buildBluetoothProbeFrames(connectedHardware, baseMetrics),
  ]);

  // Append an event frame automatically when hardware transport changes
  useEffect(() => {
    if (!connectedHardware) return;
    if (connectedHardware.transport === 'WebBluetooth') {
      setFrames((prev) => [...buildBluetoothProbeFrames(connectedHardware, baseMetrics), ...prev].slice(0, 60));
    } else {
      setFrames((prev) => [...buildUsbProbeFrames(connectedHardware, activeProfile), ...prev].slice(0, 60));
    }
  }, [activeProfile, baseMetrics, connectedHardware]);

  const healthFindings = useMemo(
    () => analyzeTransportHealth(activeMetrics, activeProfile?.vinMinMv ?? 2800),
    [activeMetrics, activeProfile?.vinMinMv],
  );

  const visibleFrames =
    channelFilter === 'all' ? frames : frames.filter((f) => f.channel === channelFilter);

  const handleProbeUsb = async () => {
    let liveUsbCount = 0;
    const navUsb = (navigator as unknown as { usb?: { getDevices: () => Promise<unknown[]> } }).usb;
    if (navUsb) {
      try {
        const list = await navUsb.getDevices();
        liveUsbCount = list.length;
      } catch {
        // Ignore restricted origin errors
      }
    }
    const newFrames = buildUsbProbeFrames(connectedHardware, activeProfile);
    if (liveUsbCount > 0) {
      newFrames[0] = {
        ...newFrames[0],
        decoded: `${newFrames[0].decoded} · ${liveUsbCount} authorized WebUSB node(s)`,
      };
    }
    setFrames((prev) => [...newFrames, ...prev].slice(0, 60));
  };

  const handleProbeBluetooth = () => {
    const newFrames = buildBluetoothProbeFrames(connectedHardware, activeMetrics);
    setFrames((prev) => [...newFrames, ...prev].slice(0, 60));
  };

  const handleSweepWireless = () => {
    const newFrames = buildWirelessRfProbeFrames(activeMetrics);
    setFrames((prev) => [...newFrames, ...prev].slice(0, 60));
  };

  const handleSendHexCommand = (e: React.FormEvent) => {
    e.preventDefault();
    const res = parseCustomHexCommand(injectChannel, hexInput);
    if (!res.ok) {
      setHexError(res.error);
      return;
    }
    setHexError(null);
    setFrames((prev) => [res.rxFrame, res.txFrame, ...prev].slice(0, 60));
  };

  const handleExportTrace = () => {
    const json = formatDebugTraceExport(frames, activeMetrics);
    const blob = new Blob([json], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `transport-debug-trace-${Date.now()}.json`;
    link.rel = 'noopener';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return (
    <div className="space-y-6">
      {/* Debugger Toolbar & Quick Probes */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="text-xs text-slate-500 dark:text-slate-400">
              {capabilities.webUsbSupported ? 'WebUSB Ready' : 'WebUSB Unavailable'} ·{' '}
              {capabilities.webBluetoothSupported ? 'WebBluetooth Ready' : 'WebBluetooth Fallback'} ·{' '}
              {capabilities.gamepadApiSupported ? 'Gamepad BT/USB Ready' : 'Host Ready'}
            </div>
            <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <Activity className="w-5 h-5 text-blue-600 dark:text-blue-400 shrink-0" aria-hidden="true" />
              <span>Wireless, USB &amp; Bluetooth Bus Debugger</span>
            </h2>
            <p className="text-xs text-slate-600 dark:text-slate-300">
              Inspect USB descriptors &amp; VBUS power, Bluetooth LE GATT services / ATT MTU / RSSI, and 2.4 GHz wireless RF jitter, or send raw hex test packets.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => void handleProbeUsb()}
              className="min-h-[40px] px-3 py-1.5 text-xs font-medium text-slate-800 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 rounded-lg transition-colors flex items-center gap-1.5"
            >
              <Usb className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Probe USB Bus</span>
            </button>
            <button
              type="button"
              onClick={handleProbeBluetooth}
              className="min-h-[40px] px-3 py-1.5 text-xs font-medium text-slate-800 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 rounded-lg transition-colors flex items-center gap-1.5"
            >
              <Bluetooth className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Probe BT GATT</span>
            </button>
            <button
              type="button"
              onClick={handleSweepWireless}
              className="min-h-[40px] px-3 py-1.5 text-xs font-medium text-slate-800 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 rounded-lg transition-colors flex items-center gap-1.5"
            >
              <Wifi className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Sweep Wireless RF</span>
            </button>
            <button
              type="button"
              onClick={() => setSimulateInterference((v) => !v)}
              aria-pressed={simulateInterference}
              className={`min-h-[40px] px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
                simulateInterference
                  ? 'bg-amber-50 dark:bg-amber-950/50 border-amber-400 text-amber-800 dark:text-amber-300'
                  : 'bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700'
              }`}
            >
              {simulateInterference ? 'Clear RF/Bus Fault' : 'Inject RF/Bus Drop'}
            </button>
          </div>
        </div>

        {/* Connect Physical Triggers */}
        <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2 text-xs">
          <span className="text-slate-500 dark:text-slate-400">
            Active Session:{' '}
            <strong className="text-slate-800 dark:text-slate-200">
              {connectedHardware
                ? `${connectedHardware.deviceName} (${connectedHardware.transport})`
                : 'Live Host Monitor (No USB/BLE Device Attached)'}
            </strong>
          </span>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={onConnectBluetooth}
              className="min-h-[36px] px-3 py-1 text-xs font-medium text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-950/60 hover:bg-blue-100 dark:hover:bg-blue-900/60 rounded-lg transition-colors inline-flex items-center gap-1.5"
            >
              <Bluetooth className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Pair BLE Device</span>
            </button>
            <button
              type="button"
              onClick={onConnectUsb}
              className="min-h-[36px] px-3 py-1 text-xs font-medium text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg transition-colors inline-flex items-center gap-1.5"
            >
              <Usb className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Open USB Picker</span>
            </button>
          </div>
        </div>
      </div>

      {/* 3-Channel Telemetry Cards: USB | Bluetooth | Wireless */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* USB Bus Card */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <Usb className="w-4 h-4 text-blue-600 dark:text-blue-400" aria-hidden="true" />
              <span>USB-C / OTG Link</span>
            </h3>
            <span className="text-xs font-mono text-slate-500 dark:text-slate-400">
              {connectedHardware?.vendorIdHex ?? '0x1680'}:{connectedHardware?.productIdHex ?? '0x9063'}
            </span>
          </div>
          <dl className="grid grid-cols-2 gap-2 text-xs">
            <div>
              <dt className="text-slate-500 dark:text-slate-400">Bus Speed</dt>
              <dd className="font-mono font-medium text-slate-900 dark:text-slate-100 truncate">
                {activeMetrics.usbSpeedLabel}
              </dd>
            </div>
            <div>
              <dt className="text-slate-500 dark:text-slate-400">VBUS Rail</dt>
              <dd className="font-mono tabular-nums font-semibold text-slate-900 dark:text-slate-100">
                {(activeMetrics.usbVbusMv / 1000).toFixed(2)} V
              </dd>
            </div>
            <div>
              <dt className="text-slate-500 dark:text-slate-400">CC Polarity</dt>
              <dd className="font-mono text-slate-800 dark:text-slate-200 truncate">{activeMetrics.usbCcState}</dd>
            </div>
            <div>
              <dt className="text-slate-500 dark:text-slate-400">CRC / Stall Errors</dt>
              <dd
                className={`font-mono tabular-nums font-semibold ${
                  activeMetrics.usbErrors > 0 ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-700 dark:text-emerald-400'
                }`}
              >
                {activeMetrics.usbErrors}
              </dd>
            </div>
          </dl>
        </div>

        {/* Bluetooth / BLE Card */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <Bluetooth className="w-4 h-4 text-blue-600 dark:text-blue-400" aria-hidden="true" />
              <span>Bluetooth / BLE GATT</span>
            </h3>
            <span className="text-xs font-mono text-slate-500 dark:text-slate-400 tabular-nums">
              {activeMetrics.bleConnected ? 'GATT Live' : 'Ready'}
            </span>
          </div>
          <dl className="grid grid-cols-2 gap-2 text-xs">
            <div>
              <dt className="text-slate-500 dark:text-slate-400">Profile / PHY</dt>
              <dd className="font-mono font-medium text-slate-900 dark:text-slate-100 truncate">
                {activeMetrics.bleProfile}
              </dd>
            </div>
            <div>
              <dt className="text-slate-500 dark:text-slate-400">Signal (RSSI)</dt>
              <dd className="font-mono tabular-nums font-semibold text-slate-900 dark:text-slate-100">
                {activeMetrics.bleRssiDbm} dBm
              </dd>
            </div>
            <div>
              <dt className="text-slate-500 dark:text-slate-400">ATT MTU / Interval</dt>
              <dd className="font-mono tabular-nums text-slate-800 dark:text-slate-200">
                {activeMetrics.bleAttMtu}B · {activeMetrics.bleIntervalMs} ms
              </dd>
            </div>
            <div>
              <dt className="text-slate-500 dark:text-slate-400">Services / Batt</dt>
              <dd className="font-mono tabular-nums text-slate-800 dark:text-slate-200">
                {activeMetrics.bleServicesCount} svc{activeMetrics.bleBatteryPct !== null ? ` · ${activeMetrics.bleBatteryPct}%` : ''}
              </dd>
            </div>
          </dl>
        </div>

        {/* Wireless 2.4 GHz / Wi-Fi Card */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <Radio className="w-4 h-4 text-blue-600 dark:text-blue-400" aria-hidden="true" />
              <span>Wireless RF &amp; Coexistence</span>
            </h3>
            <span className="text-xs font-mono text-slate-500 dark:text-slate-400 tabular-nums">
              Ch {activeMetrics.wirelessChannel}
            </span>
          </div>
          <dl className="grid grid-cols-2 gap-2 text-xs">
            <div>
              <dt className="text-slate-500 dark:text-slate-400">Band / Mode</dt>
              <dd className="font-mono font-medium text-slate-900 dark:text-slate-100 truncate">
                {activeMetrics.wirelessBand}
              </dd>
            </div>
            <div>
              <dt className="text-slate-500 dark:text-slate-400">Round-Trip RTT</dt>
              <dd className="font-mono tabular-nums font-semibold text-slate-900 dark:text-slate-100">
                {activeMetrics.wirelessRttMs} ms
              </dd>
            </div>
            <div>
              <dt className="text-slate-500 dark:text-slate-400">Jitter</dt>
              <dd className="font-mono tabular-nums text-slate-800 dark:text-slate-200">
                {activeMetrics.wirelessJitterMs} ms
              </dd>
            </div>
            <div>
              <dt className="text-slate-500 dark:text-slate-400">Packet Loss</dt>
              <dd
                className={`font-mono tabular-nums font-semibold ${
                  activeMetrics.wirelessPacketLossPct > 1.5
                    ? 'text-amber-600 dark:text-amber-400'
                    : 'text-emerald-700 dark:text-emerald-400'
                }`}
              >
                {activeMetrics.wirelessPacketLossPct}%
              </dd>
            </div>
          </dl>
        </div>
      </div>

      {/* Health Assessment Cards */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-3">
        <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
          Automated Transport &amp; RF Health Analysis
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {healthFindings.map((item) => (
            <div
              key={item.id}
              className={`p-3.5 rounded-lg border text-xs space-y-1.5 ${
                item.severity === 'error'
                  ? 'bg-rose-50/70 dark:bg-rose-950/40 border-rose-300 dark:border-rose-800'
                  : item.severity === 'warn'
                    ? 'bg-amber-50/70 dark:bg-amber-950/40 border-amber-300 dark:border-amber-800'
                    : 'bg-emerald-50/60 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-900'
              }`}
            >
              <div className="flex items-center gap-1.5 font-semibold text-slate-900 dark:text-slate-100">
                {item.severity === 'ok' ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" aria-hidden="true" />
                ) : (
                  <AlertTriangle
                    className={`w-4 h-4 shrink-0 ${
                      item.severity === 'error'
                        ? 'text-rose-600 dark:text-rose-400'
                        : 'text-amber-600 dark:text-amber-400'
                    }`}
                    aria-hidden="true"
                  />
                )}
                <span>{item.title}</span>
              </div>
              <p className="text-slate-700 dark:text-slate-300 font-mono text-[11px]">{item.detail}</p>
              <p className="text-slate-600 dark:text-slate-400 leading-relaxed">{item.recommendation}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Packet & Frame Capture + Raw Hex Command Console */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mr-2">
              Packet &amp; Frame Capture ({visibleFrames.length})
            </h3>
            {(['all', 'usb', 'bluetooth', 'wireless'] as const).map((ch) => {
              const active = channelFilter === ch;
              return (
                <button
                  key={ch}
                  type="button"
                  onClick={() => setChannelFilter(ch)}
                  className={`min-h-[32px] px-2.5 py-1 text-xs font-medium rounded-md border transition-colors uppercase ${
                    active
                      ? 'bg-slate-900 dark:bg-blue-600 text-white border-slate-900 dark:border-blue-600'
                      : 'bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700'
                  }`}
                >
                  {ch}
                </button>
              );
            })}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handleExportTrace}
              className="min-h-[36px] px-3 py-1 text-xs font-medium text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg transition-colors flex items-center gap-1.5"
            >
              <Download className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Export Trace (.json)</span>
            </button>
            <button
              type="button"
              onClick={() => setFrames([])}
              className="min-h-[36px] px-2.5 py-1 text-xs font-medium text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg transition-colors flex items-center gap-1"
            >
              <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Clear</span>
            </button>
          </div>
        </div>

        {/* Custom Hex Command Console */}
        <form onSubmit={handleSendHexCommand} className="grid grid-cols-1 sm:grid-cols-12 gap-2.5 items-end">
          <div className="sm:col-span-3">
            <label htmlFor="dbg-channel-select" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
              Target Pipe
            </label>
            <select
              id="dbg-channel-select"
              value={injectChannel}
              onChange={(e) => setInjectChannel(e.target.value as DebugTransportChannel)}
              className="w-full min-h-[44px] px-3 py-2 text-xs bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100"
            >
              <option value="bluetooth">Bluetooth (ATT 0xFFE1)</option>
              <option value="usb">USB-C (EP1 OUT/IN)</option>
              <option value="wireless">Wireless RF (Pipe 0)</option>
            </select>
          </div>

          <div className="sm:col-span-6">
            <label htmlFor="dbg-hex-input" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
              Raw Hex Command Bytes
            </label>
            <input
              id="dbg-hex-input"
              type="text"
              value={hexInput}
              onChange={(e) => setHexInput(e.target.value)}
              placeholder="e.g. 80 06 00 01 or 02 10 58"
              className="w-full min-h-[44px] px-3 py-2 text-xs font-mono bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100"
            />
          </div>

          <div className="sm:col-span-3">
            <button
              type="submit"
              className="w-full min-h-[44px] px-4 py-2 text-xs sm:text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors flex items-center justify-center gap-1.5"
            >
              <Send className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Send Packet</span>
            </button>
          </div>
        </form>

        {hexError && (
          <div className="px-3 py-2 rounded-lg bg-rose-50 dark:bg-rose-950/50 border border-rose-300 dark:border-rose-800 text-xs text-rose-800 dark:text-rose-200">
            {hexError}
          </div>
        )}

        {/* Frame Log Table */}
        <div className="overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-lg">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400">
              <tr>
                <th className="py-2 px-3 font-medium">Time</th>
                <th className="py-2 px-3 font-medium">Transport</th>
                <th className="py-2 px-3 font-medium">Dir</th>
                <th className="py-2 px-3 font-medium">Endpoint / UUID</th>
                <th className="py-2 px-3 font-medium">Payload Hex</th>
                <th className="py-2 px-3 font-medium">Decoded Frame</th>
                <th className="py-2 px-3 font-medium text-right">RTT</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {visibleFrames.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-6 px-3 text-center text-slate-500 dark:text-slate-400">
                    No frames captured for this filter. Click Probe USB Bus, Probe BT GATT, or Sweep Wireless RF above.
                  </td>
                </tr>
              ) : (
                visibleFrames.map((f) => (
                  <tr key={f.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                    <td className="py-2 px-3 font-mono tabular-nums text-slate-500 dark:text-slate-400 whitespace-nowrap">
                      {f.timestamp}
                    </td>
                    <td className="py-2 px-3 font-mono uppercase text-slate-800 dark:text-slate-200 whitespace-nowrap">
                      {f.channel} · {f.protocol}
                    </td>
                    <td className="py-2 px-3 font-mono font-semibold whitespace-nowrap">
                      <span
                        className={
                          f.direction === 'TX'
                            ? 'text-blue-700 dark:text-blue-400'
                            : f.direction === 'ERR'
                              ? 'text-rose-600 dark:text-rose-400'
                              : 'text-emerald-700 dark:text-emerald-400'
                        }
                      >
                        {f.direction}
                      </span>
                    </td>
                    <td className="py-2 px-3 font-mono text-slate-600 dark:text-slate-300 whitespace-nowrap">
                      {f.endpointOrUuid}
                    </td>
                    <td className="py-2 px-3 font-mono text-slate-900 dark:text-slate-100 whitespace-nowrap">
                      {f.payloadHex}
                    </td>
                    <td className="py-2 px-3 text-slate-700 dark:text-slate-300">{f.decoded}</td>
                    <td className="py-2 px-3 font-mono tabular-nums text-right text-slate-500 dark:text-slate-400 whitespace-nowrap">
                      {f.latencyMs} ms
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
