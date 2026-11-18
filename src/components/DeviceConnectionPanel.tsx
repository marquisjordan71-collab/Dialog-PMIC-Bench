import { useState } from 'react';
import { AlertTriangle, Bluetooth, CheckCircle2, RefreshCw, Smartphone, Usb } from 'lucide-react';
import type { PmicProfile } from '../utils/pmicCatalog';
import type { ConnectedHardwareInfo, HardwareCapabilityReport } from '../utils/webHardwareBridge';
import type { ThemeMode } from '../utils/workspaceSync';
import { PWAInstallButton } from './PWAInstallButton';

interface DeviceConnectionPanelProps {
  capabilities: HardwareCapabilityReport;
  connectedHardware: ConnectedHardwareInfo | null;
  activeProfile: PmicProfile | null;
  activeFirmwareVersion: string;
  probing: boolean;
  probeMessage: string | null;
  hardwareError: string | null;
  autoDownloadEnabled: boolean;
  autoSyncEnabled: boolean;
  lastSyncedAt: string | null;
  themeMode: ThemeMode;
  onChangeThemeMode: (mode: ThemeMode) => void;
  onToggleAutoDownload: () => void;
  onToggleAutoSync: () => void;
  onSyncNow: () => void;
  onConnectUsb: () => void;
  onConnectBluetooth: () => void;
  onConnectSerialOrHid: () => void;
  onRescan: () => void;
  onPlugBenchProfile: (partNumber: string) => void;
  onDisconnect: () => void;
}

type ConsumerFilter = 'all' | 'gamepad' | 'mobile' | 'gaming' | 'pd-storage';

interface BenchPresetTile {
  part: string;
  label: string;
  spec: string;
  filter: ConsumerFilter;
}

const CONSUMER_PRESETS: BenchPresetTile[] = [
  // Gamepads (New & Old)
  { part: 'DUALSENSE', label: 'PS5 DualSense', spec: 'USB-C HID · Haptics', filter: 'gamepad' },
  { part: 'DUALSHOCK4', label: 'PS4 DualShock 4', spec: 'Micro-USB · BDM', filter: 'gamepad' },
  { part: 'PS3-SIXAXIS', label: 'PS3 DualShock 3', spec: 'Mini-USB · Sixaxis', filter: 'gamepad' },
  { part: 'XBOX-CTRL', label: 'Xbox Series / One', spec: 'USB-C GIP · 0x045E', filter: 'gamepad' },
  { part: 'XBOX-360', label: 'Xbox 360 Classic', spec: 'XInput Wired · 5V', filter: 'gamepad' },
  { part: 'SWITCH-PRO', label: 'Switch Pro / Joy-Con', spec: 'USB-C HID · HD Rumble', filter: 'gamepad' },
  { part: 'NINTENDO-RETRO', label: 'NES/SNES/N64/GC', spec: 'Retro HID & Arcade', filter: 'gamepad' },
  { part: '8BITDO-PAD', label: '8BitDo / Hall-Effect', spec: 'TMR Sticks · Multi-Mode', filter: 'gamepad' },
  { part: 'LOGITECH-PAD', label: 'Logitech F310/F710', spec: 'XInput / DirectInput', filter: 'gamepad' },
  // Phones
  { part: 'GALAXY-USBC', label: 'Galaxy / Android', spec: 'USB-C PD 3.0 PPS', filter: 'mobile' },
  { part: 'PIXEL-PD', label: 'Google Pixel', spec: 'TCPCI 2.0 · 20V PD', filter: 'mobile' },
  { part: 'IPHONE-USBC', label: 'iPhone / iPad USB-C', spec: 'ACE3 PD + DP Alt', filter: 'mobile' },
  // Handhelds
  { part: 'SWITCH-OLED', label: 'Switch / OLED', spec: 'M92T36 PD + BQ24193', filter: 'gaming' },
  { part: 'STEAM-DECK', label: 'Valve Steam Deck', spec: '45W PD + HID Pad', filter: 'gaming' },
  // Chargers, Docks & Storage/Audio
  { part: 'GAN-PD-100W', label: '100W GaN PD Charger', spec: 'USB-PD 3.1 EPR · 28V', filter: 'pd-storage' },
  { part: 'USBC-DOCK', label: 'USB-C Hub & Dock', spec: 'PD Pass-Through · HDMI', filter: 'pd-storage' },
  { part: 'NVME-USBC', label: 'USB-C NVMe SSD', spec: 'RTL9210B · 10Gbps', filter: 'pd-storage' },
  { part: 'USBC-DAC', label: 'USB-C Audio DAC', spec: 'UAC 2.0 · Low-Noise', filter: 'pd-storage' },
];

const PMIC_PRESETS: Array<{ part: string; label: string; spec: string }> = [
  { part: 'DA9063', label: 'DA9063', spec: '6 Buck · 11 LDO' },
  { part: 'DA9062', label: 'DA9062', spec: '4 Buck · 4 LDO' },
  { part: 'DA9121', label: 'DA9121', spec: '10A Dual-Phase' },
  { part: 'DA9313', label: 'DA9313', spec: 'USB-C PD 2:1' },
  { part: 'SLG51000', label: 'SLG51000', spec: '7-LDO GreenPAK' },
  { part: 'DA7280', label: 'DA7280', spec: 'LRA Haptic' },
];

const CONSUMER_FILTERS: Array<{ id: ConsumerFilter; label: string }> = [
  { id: 'all', label: 'All (18)' },
  { id: 'gamepad', label: 'Gamepads' },
  { id: 'mobile', label: 'Phones' },
  { id: 'gaming', label: 'Handhelds' },
  { id: 'pd-storage', label: 'PD / SSD' },
];

const THEME_OPTIONS: Array<{ id: ThemeMode; label: string }> = [
  { id: 'light', label: 'Light' },
  { id: 'dark', label: 'Dark' },
  { id: 'system', label: 'System' },
];

export function DeviceConnectionPanel({
  capabilities,
  connectedHardware,
  activeProfile,
  activeFirmwareVersion,
  probing,
  probeMessage,
  hardwareError,
  autoDownloadEnabled,
  autoSyncEnabled,
  lastSyncedAt,
  themeMode,
  onChangeThemeMode,
  onToggleAutoDownload,
  onToggleAutoSync,
  onSyncNow,
  onConnectUsb,
  onConnectBluetooth,
  onConnectSerialOrHid,
  onRescan,
  onPlugBenchProfile,
  onDisconnect,
}: DeviceConnectionPanelProps) {
  const isActivePmic = activeProfile?.deviceCategory === 'pmic';
  const [familyTab, setFamilyTab] = useState<'consumer' | 'pmic'>(
    activeProfile && isActivePmic ? 'pmic' : 'consumer',
  );
  const [consumerFilter, setConsumerFilter] = useState<ConsumerFilter>('all');

  const readyTransports = [
    capabilities.webUsbSupported ? 'WebUSB' : null,
    capabilities.webBluetoothSupported ? 'BLE' : null,
    capabilities.webHidSupported ? 'WebHID' : null,
    capabilities.gamepadApiSupported ? 'GamepadAPI' : null,
    capabilities.webSerialSupported ? 'Serial' : null,
  ].filter(Boolean);
  const anyNativeTransport = readyTransports.length > 0;
  const showSeparateSerialHid =
    capabilities.webHidSupported || capabilities.gamepadApiSupported || capabilities.webSerialSupported;

  const visibleConsumerPresets =
    consumerFilter === 'all'
      ? CONSUMER_PRESETS
      : CONSUMER_PRESETS.filter((item) => item.filter === consumerFilter);

  const isConsumerActive = Boolean(
    activeProfile?.deviceCategory && activeProfile.deviceCategory !== 'pmic',
  );

  return (
    <aside className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 sm:p-5 space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
            USB-C OTG &amp; Device Probe
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            {capabilities.platformLabel} ·{' '}
            {anyNativeTransport ? readyTransports.join(' · ') : 'Bench OTG Mode'}
            {!capabilities.secureContext ? ' · HTTP LAN (HTTPS unlocks raw USB/BLE)' : ''}
          </p>
        </div>
        <Smartphone className="w-5 h-5 text-slate-400 dark:text-slate-500 shrink-0" aria-hidden="true" />
      </div>

      {/* Preferences: Theme, Auto-Sync, Auto-Download */}
      <div className="py-3 border-y border-slate-100 dark:border-slate-800 space-y-3.5">
        {/* Theme Selector */}
        <div className="flex items-center justify-between gap-3">
          <span className="text-sm font-medium text-slate-900 dark:text-slate-100">Appearance</span>
          <div
            role="group"
            aria-label="Theme mode"
            className="inline-flex items-center p-1 bg-slate-100 dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700"
          >
            {THEME_OPTIONS.map((opt) => {
              const active = themeMode === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => onChangeThemeMode(opt.id)}
                  aria-pressed={active}
                  className={`min-h-[36px] px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                    active
                      ? 'bg-white dark:bg-slate-950 text-slate-900 dark:text-white shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                  }`}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Auto-Sync Toggle */}
        <div className="flex items-center justify-between gap-3">
          <div>
            <span className="text-sm font-medium text-slate-900 dark:text-slate-100 block">Auto-sync bench</span>
            <span className="text-xs text-slate-500 dark:text-slate-400">
              {autoSyncEnabled
                ? lastSyncedAt
                  ? `Live telemetry & state synced ${lastSyncedAt}`
                  : 'Syncs telemetry, registers & tabs'
                : 'Manual sync only'}
            </span>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {!autoSyncEnabled && (
              <button
                type="button"
                onClick={onSyncNow}
                className="min-h-[36px] px-2.5 py-1 text-xs font-medium text-blue-700 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/60 hover:bg-blue-100 dark:hover:bg-blue-900/60 rounded-lg whitespace-nowrap"
              >
                Sync Now
              </button>
            )}
            <button
              type="button"
              role="switch"
              aria-checked={autoSyncEnabled}
              aria-label="Auto-sync telemetry and bench state"
              onClick={onToggleAutoSync}
              className="relative inline-flex h-7 w-12 min-w-[48px] min-h-[44px] items-center justify-center rounded-lg transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
            >
              <span
                className={`w-11 h-6 rounded-full transition-colors flex items-center px-0.5 ${
                  autoSyncEnabled ? 'bg-blue-600' : 'bg-slate-300 dark:bg-slate-700'
                }`}
              >
                <span
                  className={`w-5 h-5 rounded-full bg-white shadow-sm transition-transform ${
                    autoSyncEnabled ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </span>
            </button>
          </div>
        </div>

        {/* Auto-Download Toggle */}
        <div className="flex items-center justify-between gap-3">
          <div>
            <span className="text-sm font-medium text-slate-900 dark:text-slate-100 block">Auto-download manuals</span>
            <span className="text-xs text-slate-500 dark:text-slate-400">Fetch &amp; save PDF when device connects</span>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={autoDownloadEnabled}
            aria-label="Auto-download manuals on device detection"
            onClick={onToggleAutoDownload}
            className="relative inline-flex h-7 w-12 min-w-[48px] min-h-[44px] items-center justify-center rounded-lg transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
          >
            <span
              className={`w-11 h-6 rounded-full transition-colors flex items-center px-0.5 ${
                autoDownloadEnabled ? 'bg-blue-600' : 'bg-slate-300 dark:bg-slate-700'
              }`}
            >
              <span
                className={`w-5 h-5 rounded-full bg-white shadow-sm transition-transform ${
                  autoDownloadEnabled ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </span>
          </button>
        </div>
      </div>

      {/* Connection Actions */}
      <div className="space-y-2.5">
        <button
          type="button"
          onClick={onConnectUsb}
          disabled={probing}
          className="w-full min-h-[44px] px-4 py-2.5 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-60 rounded-lg transition-colors flex items-center justify-center gap-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
        >
          <Usb className="w-4 h-4" aria-hidden="true" />
          <span>{probing ? 'Probing USB / HID...' : 'Connect USB / OTG Device'}</span>
        </button>

        <button
          type="button"
          onClick={onConnectBluetooth}
          disabled={probing}
          className="w-full min-h-[44px] px-4 py-2 text-xs sm:text-sm font-medium text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-950/60 hover:bg-blue-100 dark:hover:bg-blue-900/60 disabled:opacity-60 border border-blue-200 dark:border-blue-800 rounded-lg transition-colors flex items-center justify-center gap-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
        >
          <Bluetooth className="w-4 h-4 shrink-0" aria-hidden="true" />
          <span>{probing ? 'Scanning Bluetooth...' : 'Connect Bluetooth (BLE / Wireless)'}</span>
        </button>

        {showSeparateSerialHid && (
          <button
            type="button"
            onClick={onConnectSerialOrHid}
            disabled={probing}
            className="w-full min-h-[44px] px-4 py-2 text-xs sm:text-sm font-medium text-slate-800 dark:text-slate-100 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-60 border border-slate-200 dark:border-slate-700 rounded-lg transition-colors flex items-center justify-center gap-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
          >
            <span>
              {capabilities.webHidSupported && capabilities.webSerialSupported
                ? 'Scan Gamepads / HID / Serial'
                : capabilities.gamepadApiSupported && capabilities.webSerialSupported
                  ? 'Scan Gamepads / Serial'
                  : capabilities.webHidSupported || capabilities.gamepadApiSupported
                    ? 'Scan Connected Gamepad / HID'
                    : 'Scan Serial / BT Bridge'}
            </span>
          </button>
        )}

        {connectedHardware && (
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={onRescan}
              disabled={probing}
              className="min-h-[44px] px-3 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg transition-colors flex items-center justify-center gap-1.5"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${probing ? 'animate-spin' : ''}`} aria-hidden="true" />
              <span>Re-scan Bus</span>
            </button>
            <button
              type="button"
              onClick={onDisconnect}
              className="min-h-[44px] px-3 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg transition-colors"
            >
              Unplug Device
            </button>
          </div>
        )}

        <PWAInstallButton />
      </div>

      {/* Live Status Readout */}
      {probeMessage && (
        <div className="text-xs text-slate-700 dark:text-slate-200 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg p-3 flex items-start gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" aria-hidden="true" />
          <span>{probeMessage}</span>
        </div>
      )}

      {hardwareError && (
        <div className="text-xs text-amber-900 dark:text-amber-200 bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-800 rounded-lg p-3 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" aria-hidden="true" />
          <span>{hardwareError}</span>
        </div>
      )}

      {/* Detected Hardware Details */}
      {connectedHardware && activeProfile ? (
        <div className="pt-2 border-t border-slate-100 dark:border-slate-800 space-y-2.5">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
              {isConsumerActive ? 'Detected Device' : 'Detected Silicon'}
            </span>
            <span className="text-xs font-medium text-emerald-700 dark:text-emerald-400">
              Connected · {connectedHardware.transport}
            </span>
          </div>

          <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
            <div>
              <dt className="text-slate-500 dark:text-slate-400">Device / Part</dt>
              <dd className="font-mono font-semibold text-slate-900 dark:text-slate-100 tabular-nums truncate">
                {activeProfile.partNumber}
              </dd>
            </div>
            <div>
              <dt className="text-slate-500 dark:text-slate-400">
                {isConsumerActive ? 'Bus Addr' : 'I2C Address'}
              </dt>
              <dd className="font-mono font-semibold text-slate-900 dark:text-slate-100 tabular-nums">
                {connectedHardware.identified.i2cAddr}
              </dd>
            </div>
            <div className="col-span-2">
              <dt className="text-slate-500 dark:text-slate-400">Controller / PMIC</dt>
              <dd className="font-mono text-slate-800 dark:text-slate-200 truncate">
                {activeProfile.controllerIc ?? activeProfile.partNumber}
              </dd>
            </div>
            <div>
              <dt className="text-slate-500 dark:text-slate-400">Device / Var ID</dt>
              <dd className="font-mono text-slate-800 dark:text-slate-200 tabular-nums">
                {connectedHardware.identified.deviceIdHex} / {connectedHardware.identified.variantIdHex}
              </dd>
            </div>
            <div>
              <dt className="text-slate-500 dark:text-slate-400">USB VID:PID</dt>
              <dd className="font-mono text-slate-800 dark:text-slate-200 tabular-nums">
                {connectedHardware.vendorIdHex}:{connectedHardware.productIdHex}
              </dd>
            </div>
            {connectedHardware.usbDescriptor?.product && (
              <div className="col-span-2">
                <dt className="text-slate-500 dark:text-slate-400">USB Descriptor</dt>
                <dd className="font-mono text-slate-800 dark:text-slate-200 truncate">
                  {connectedHardware.usbDescriptor.manufacturer
                    ? `${connectedHardware.usbDescriptor.manufacturer} · `
                    : ''}
                  {connectedHardware.usbDescriptor.product}
                </dd>
              </div>
            )}
            {connectedHardware.bluetoothMetadata && (
              <div className="col-span-2">
                <dt className="text-slate-500 dark:text-slate-400">Bluetooth GATT</dt>
                <dd className="font-mono text-slate-800 dark:text-slate-200 truncate">
                  {connectedHardware.bluetoothMetadata.gattConnected ? 'Connected' : 'Paired'} ·{' '}
                  {connectedHardware.bluetoothMetadata.services.length} svc · MTU{' '}
                  {connectedHardware.bluetoothMetadata.attMtuBytes}B
                  {connectedHardware.bluetoothMetadata.batteryPct !== undefined
                    ? ` · Batt ${connectedHardware.bluetoothMetadata.batteryPct}%`
                    : ''}
                </dd>
              </div>
            )}
            <div className="col-span-2">
              <dt className="text-slate-500 dark:text-slate-400">Active Firmware / OTP</dt>
              <dd className="font-mono text-slate-900 dark:text-slate-100 tabular-nums">{activeFirmwareVersion}</dd>
            </div>
          </dl>
        </div>
      ) : (
        <div className="pt-2 border-t border-slate-100 dark:border-slate-800 text-xs text-slate-500 dark:text-slate-400">
          {anyNativeTransport
            ? 'Plug in any smartphone, gamepad (PS3/PS4/PS5, Xbox 360/Series, Switch, Retro, 8BitDo, Logitech), USB-C dock/SSD, or Dialog EVK over USB-C OTG.'
            : 'Attach a USB-C / HID target or pick a Consumer Device or Dialog PMIC profile below.'}
        </div>
      )}

      {/* Plug-In Bench Presets: Consumer Devices & Dialog PMICs */}
      <div className="pt-3 border-t border-slate-100 dark:border-slate-800 space-y-2.5">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-xs font-semibold text-slate-700 dark:text-slate-300">Plug-In Target Profiles</h3>
          <span className="text-[11px] text-slate-500 dark:text-slate-400">Simulated OTG</span>
        </div>

        {/* Segmented Switcher: Consumer Devices | Dialog PMICs */}
        <div
          role="tablist"
          aria-label="Target device category"
          className="grid grid-cols-2 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 gap-1"
        >
          <button
            type="button"
            role="tab"
            aria-selected={familyTab === 'consumer'}
            onClick={() => setFamilyTab('consumer')}
            className={`min-h-[36px] px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
              familyTab === 'consumer'
                ? 'bg-white dark:bg-slate-950 text-slate-900 dark:text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            Consumer Devices
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={familyTab === 'pmic'}
            onClick={() => setFamilyTab('pmic')}
            className={`min-h-[36px] px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
              familyTab === 'pmic'
                ? 'bg-white dark:bg-slate-950 text-slate-900 dark:text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            Dialog PMICs
          </button>
        </div>

        {familyTab === 'consumer' ? (
          <div className="space-y-2.5">
            {/* Compact rectangular filter bar for Consumer Devices */}
            <div className="flex flex-wrap gap-1">
              {CONSUMER_FILTERS.map((f) => {
                const active = consumerFilter === f.id;
                return (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => setConsumerFilter(f.id)}
                    aria-pressed={active}
                    className={`min-h-[32px] px-2 py-1 text-[11px] font-medium rounded-md border transition-colors whitespace-nowrap ${
                      active
                        ? 'bg-slate-900 dark:bg-blue-600 text-white border-slate-900 dark:border-blue-600'
                        : 'bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700'
                    }`}
                  >
                    {f.label}
                  </button>
                );
              })}
            </div>

            <div className="grid grid-cols-2 gap-2 max-h-[280px] overflow-y-auto pr-0.5">
              {visibleConsumerPresets.map((item) => {
                const isSelected = activeProfile?.partNumber === item.part;
                return (
                  <button
                    key={item.part}
                    type="button"
                    onClick={() => onPlugBenchProfile(item.part)}
                    disabled={probing}
                    className={`min-h-[44px] px-2.5 py-2 rounded-lg border text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 ${
                      isSelected
                        ? 'border-blue-600 dark:border-blue-500 bg-blue-50/70 dark:bg-blue-950/50 text-slate-900 dark:text-white'
                        : 'border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-950/60 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-800 dark:text-slate-200'
                    }`}
                  >
                    <div className="font-mono text-xs font-semibold truncate">{item.label}</div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">{item.spec}</div>
                  </button>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {PMIC_PRESETS.map((item) => {
              const isSelected = activeProfile?.partNumber === item.part;
              return (
                <button
                  key={item.part}
                  type="button"
                  onClick={() => onPlugBenchProfile(item.part)}
                  disabled={probing}
                  className={`min-h-[44px] px-3 py-2 rounded-lg border text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 ${
                    isSelected
                      ? 'border-blue-600 dark:border-blue-500 bg-blue-50/70 dark:bg-blue-950/50 text-slate-900 dark:text-white'
                      : 'border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-950/60 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-800 dark:text-slate-200'
                  }`}
                >
                  <div className="font-mono text-xs font-semibold">{item.label}</div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">{item.spec}</div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </aside>
  );
}
