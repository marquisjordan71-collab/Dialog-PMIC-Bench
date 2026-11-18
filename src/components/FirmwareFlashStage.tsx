import { useRef, useState } from 'react';
import { CheckCircle2, Download, ShieldCheck, Upload, Usb, Zap } from 'lucide-react';
import type { FlashHistoryEntry } from '../types';
import type { FirmwarePackage, PmicProfile } from '../utils/pmicCatalog';
import type { ParsedFirmwareImage } from '../utils/pmicProtocol';
import type { AutoUpdateScheduleState, RateListEntry } from '../utils/rateListUpdater';
import { ImageWriterPanel } from './ImageWriterPanel';
import { RateListAutoUpdaterPanel } from './RateListAutoUpdaterPanel';

interface FirmwareFlashStageProps {
  activeProfile: PmicProfile | null;
  activeFirmwareVersion: string;
  vinMv: number;
  registerOverrides: Record<string, string>;
  firmwarePackages: FirmwarePackage[];
  uploadedFirmware: ParsedFirmwareImage | null;
  flashHistory: FlashHistoryEntry[];
  autoUpdateState: AutoUpdateScheduleState;
  runningRateUpdate: boolean;
  onToggleEnabled12Am: () => void;
  onUpdateRateList: (nextList: RateListEntry[]) => void;
  onRunRateListUpdateNow: () => Promise<void>;
  onUploadFirmwareFile: (file: File) => void;
  onClearUploadedFirmware: () => void;
  onFlashFirmware: (pkg: FirmwarePackage | ParsedFirmwareImage) => Promise<void>;
  onImageWriteCompleted: (entry: {
    fileName: string;
    format: string;
    crc32: string;
    targetName: string;
  }) => void;
  onBackupCurrentNvm: () => void;
  onConnectUsb: () => void;
  onPlugBenchProfile: (partNumber: string) => void;
}

export function FirmwareFlashStage({
  activeProfile,
  activeFirmwareVersion,
  vinMv,
  registerOverrides,
  firmwarePackages,
  uploadedFirmware,
  flashHistory,
  autoUpdateState,
  runningRateUpdate,
  onToggleEnabled12Am,
  onUpdateRateList,
  onRunRateListUpdateNow,
  onUploadFirmwareFile,
  onClearUploadedFirmware,
  onFlashFirmware,
  onImageWriteCompleted,
  onBackupCurrentNvm,
  onConnectUsb,
  onPlugBenchProfile,
}: FirmwareFlashStageProps) {
  const [writerMode, setWriterMode] = useState<'firmware' | 'image-writer' | 'rate-list'>('firmware');
  const [selectedPkgId, setSelectedPkgId] = useState<string | null>(null);
  const [flashing, setFlashing] = useState(false);
  const [flashStep, setFlashStep] = useState<string | null>(null);
  const [flashProgress, setFlashProgress] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!activeProfile) {
    return (
      <section className="space-y-6">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">
              Firmware Updates &amp; Disk / Flash Image Writer
            </h1>
            <p className="text-xs text-slate-600 dark:text-slate-300 mt-1">
              Write raw .img, .iso, .uf2, or .bin images with SHA-256 verification right away, or plug in a device to reflash controller OTP/NVM patches.
            </p>
          </div>
          <div className="inline-flex p-1 bg-slate-100 dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 shrink-0">
            <button
              type="button"
              onClick={() => setWriterMode('image-writer')}
              className={`min-h-[36px] px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                writerMode === 'image-writer'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
              }`}
            >
              Raw Image Writer
            </button>
            <button
              type="button"
              onClick={() => setWriterMode('rate-list')}
              className={`min-h-[36px] px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                writerMode === 'rate-list'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
              }`}
            >
              12 AM Rate List
            </button>
            <button
              type="button"
              onClick={() => setWriterMode('firmware')}
              className={`min-h-[36px] px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                writerMode === 'firmware'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
              }`}
            >
              Controller OTP
            </button>
          </div>
        </div>

        {writerMode === 'image-writer' ? (
          <ImageWriterPanel activeProfile={null} onImageWriteCompleted={onImageWriteCompleted} />
        ) : writerMode === 'rate-list' ? (
          <RateListAutoUpdaterPanel
            scheduleState={autoUpdateState}
            runningUpdate={runningRateUpdate}
            onToggleEnabled12Am={onToggleEnabled12Am}
            onUpdateRateList={onUpdateRateList}
            onRunUpdateNow={onRunRateListUpdateNow}
          />
        ) : (
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 sm:p-8 text-center space-y-4">
            <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">
              Connect a Device or Switch to Raw Image Writer
            </h2>
            <p className="text-sm text-slate-600 dark:text-slate-300 max-w-lg mx-auto">
              Controller OTP/NVM patching requires an active USB-C / HID target for voltage checks, or open the Raw Image &amp; Disk Writer immediately to write .img / .iso / .uf2 files.
            </p>
            <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
              <button
                type="button"
                onClick={() => setWriterMode('image-writer')}
                className="min-h-[44px] px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
              >
                Open Raw Image Writer
              </button>
              <button
                type="button"
                onClick={onConnectUsb}
                className="min-h-[44px] px-4 py-2 text-sm font-medium text-slate-800 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg transition-colors flex items-center gap-2"
              >
                <Usb className="w-4 h-4" aria-hidden="true" />
                <span>Connect USB / OTG</span>
              </button>
              <button
                type="button"
                onClick={() => onPlugBenchProfile('NVME-USBC')}
                className="min-h-[44px] px-4 py-2 text-sm font-medium text-slate-800 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg transition-colors"
              >
                Mount USB-C NVMe SSD
              </button>
              <button
                type="button"
                onClick={() => onPlugBenchProfile('DA9063')}
                className="min-h-[44px] px-4 py-2 text-sm font-medium text-slate-800 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg transition-colors"
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
  const activeCatalogPkg =
    firmwarePackages.find((p) => p.id === selectedPkgId) ?? firmwarePackages[0] ?? null;

  const usingUpload = Boolean(uploadedFirmware && uploadedFirmware.valid);
  const selectedLabel = usingUpload
    ? uploadedFirmware!.fileName
    : activeCatalogPkg?.name ?? 'No package selected';
  const selectedCrc = usingUpload
    ? uploadedFirmware!.crc32
    : activeCatalogPkg?.crc32 ?? '0x00000000';
  const selectedPatches = usingUpload
    ? uploadedFirmware!.registerPatches
    : activeCatalogPkg?.patchRegisters ?? [];

  const vinSafe = vinMv >= activeProfile.vinMinMv;

  const handleStartFlash = async () => {
    const target = usingUpload ? uploadedFirmware : activeCatalogPkg;
    if (!target || flashing || !vinSafe) return;

    setFlashing(true);
    setFlashProgress(18);
    setFlashStep('1/4 Backing up shadow registers & unlocking MTP/OTP...');
    await new Promise((r) => setTimeout(r, 260));

    setFlashProgress(52);
    setFlashStep('2/4 Writing firmware pages over I2C / USB-C OTG...');
    await new Promise((r) => setTimeout(r, 320));

    setFlashProgress(84);
    setFlashStep(`3/4 Verifying CRC-32 readback (${selectedCrc})...`);
    await new Promise((r) => setTimeout(r, 260));

    await onFlashFirmware(target);
    setFlashProgress(100);
    setFlashStep('4/4 Reflash verified and soft reset complete.');
    setFlashing(false);
  };

  return (
    <section className="space-y-6">
      {/* Header + Mode Switch + Backup */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 sm:p-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="text-xs text-slate-500 dark:text-slate-400">
            {activeProfile.displayName ?? activeProfile.partNumber} · Running {activeFirmwareVersion} · VBUS {(vinMv / 1000).toFixed(2)}V
          </div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100 mt-0.5">
            {isConsumer ? 'Firmware, Controller & Image Writer' : 'Firmware, OTP & Image Writer'}
          </h1>
          <p className="text-xs text-slate-600 dark:text-slate-300 mt-1">
            Flash controller/PD updates or write raw .img, .iso, .uf2, and .bin images with SHA-256 &amp; CRC-32 verification.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          <div className="inline-flex p-1 bg-slate-100 dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700">
            <button
              type="button"
              onClick={() => setWriterMode('firmware')}
              className={`min-h-[36px] px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                writerMode === 'firmware'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
              }`}
            >
              Controller / OTP
            </button>
            <button
              type="button"
              onClick={() => setWriterMode('image-writer')}
              className={`min-h-[36px] px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                writerMode === 'image-writer'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
              }`}
            >
              Raw Image Writer
            </button>
            <button
              type="button"
              onClick={() => setWriterMode('rate-list')}
              className={`min-h-[36px] px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                writerMode === 'rate-list'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
              }`}
            >
              12 AM Rate List
            </button>
          </div>

          <button
            type="button"
            onClick={onBackupCurrentNvm}
            className="min-h-[44px] px-3.5 py-2 text-xs sm:text-sm font-medium text-slate-800 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 rounded-lg transition-colors flex items-center justify-center gap-2 shrink-0"
          >
            <Download className="w-4 h-4" aria-hidden="true" />
            <span>Backup Config (.hex)</span>
          </button>
        </div>
      </div>

      {writerMode === 'image-writer' ? (
        <ImageWriterPanel activeProfile={activeProfile} onImageWriteCompleted={onImageWriteCompleted} />
      ) : writerMode === 'rate-list' ? (
        <RateListAutoUpdaterPanel
          scheduleState={autoUpdateState}
          runningUpdate={runningRateUpdate}
          onToggleEnabled12Am={onToggleEnabled12Am}
          onUpdateRateList={onUpdateRateList}
          onRunUpdateNow={onRunRateListUpdateNow}
        />
      ) : (
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
        {/* Left: Firmware Packages & Custom Upload */}
        <div className="xl:col-span-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">1. Firmware or Image</h2>
            <input
              ref={fileInputRef}
              type="file"
              accept=".hex,.bin,.uf2,.otp,.dfu,.json"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) onUploadFirmwareFile(file);
                e.target.value = '';
              }}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="min-h-[40px] px-3 py-1.5 text-xs font-medium text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-950/60 hover:bg-blue-100 dark:hover:bg-blue-900/60 rounded-lg transition-colors inline-flex items-center gap-1.5 whitespace-nowrap shrink-0"
            >
              <Upload className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Upload Image</span>
            </button>
          </div>

          {uploadedFirmware && (
            <div
              className={`p-3.5 rounded-lg border text-xs space-y-1.5 ${
                uploadedFirmware.valid
                  ? 'border-blue-600 dark:border-blue-500 bg-blue-50/60 dark:bg-blue-950/40 text-slate-900 dark:text-slate-100'
                  : 'border-rose-300 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/50 text-rose-900 dark:text-rose-200'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono font-semibold">{uploadedFirmware.fileName}</span>
                <button
                  type="button"
                  onClick={onClearUploadedFirmware}
                  className="text-xs font-medium text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white underline"
                >
                  Clear
                </button>
              </div>
              {uploadedFirmware.valid ? (
                <div className="font-mono text-[11px] text-slate-600 dark:text-slate-300 tabular-nums">
                  Format: {uploadedFirmware.format} · {uploadedFirmware.byteLength} bytes · CRC-32 {uploadedFirmware.crc32}
                </div>
              ) : (
                <div>{uploadedFirmware.error}</div>
              )}
            </div>
          )}

          <div className="space-y-2.5">
            {firmwarePackages.map((pkg) => {
              const isSelected = !usingUpload && activeCatalogPkg?.id === pkg.id;
              return (
                <button
                  key={pkg.id}
                  type="button"
                  onClick={() => {
                    onClearUploadedFirmware();
                    setSelectedPkgId(pkg.id);
                    setFlashStep(null);
                    setFlashProgress(0);
                  }}
                  className={`w-full min-h-[44px] p-3.5 rounded-lg border text-left transition-colors ${
                    isSelected
                      ? 'border-blue-600 dark:border-blue-500 bg-blue-50/60 dark:bg-blue-950/40'
                      : 'border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/60'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">{pkg.name}</span>
                    <span className="font-mono text-xs text-slate-600 dark:text-slate-300 shrink-0">{pkg.version}</span>
                  </div>
                  <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                    {pkg.target} · {pkg.sizeBytes} bytes · CRC {pkg.crc32}
                  </div>
                  <p className="text-xs text-slate-600 dark:text-slate-300 mt-1.5 leading-relaxed">{pkg.notes}</p>
                </button>
              );
            })}
          </div>
        </div>

        {/* Right: Pre-Flash Safety Checks, Diff & Flash Action */}
        <div className="xl:col-span-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-5">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-slate-500 dark:text-slate-400" aria-hidden="true" />
            <span>2. Pre-Flash Verification &amp; Diff</span>
          </h2>

          <div className="space-y-2 text-xs border-b border-slate-100 dark:border-slate-800 pb-4">
            <div className="flex items-center justify-between">
              <span className="text-slate-600 dark:text-slate-400">Selected Image</span>
              <span className="font-mono font-medium text-slate-900 dark:text-slate-100 truncate max-w-[240px]">{selectedLabel}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-600 dark:text-slate-400">CRC-32 Checksum</span>
              <span className="font-mono font-medium text-slate-900 dark:text-slate-100 tabular-nums">{selectedCrc}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-600 dark:text-slate-400">Supply Voltage (VSYS &ge; {(activeProfile.vinMinMv / 1000).toFixed(1)}V)</span>
              <span className={vinSafe ? 'text-emerald-700 dark:text-emerald-400 font-medium' : 'text-rose-700 dark:text-rose-400 font-medium'}>
                {vinSafe ? `Nominal (${(vinMv / 1000).toFixed(2)}V)` : 'Under-voltage'}
              </span>
            </div>
          </div>

          {/* Register Diff Table */}
          <div className="space-y-2">
            <h3 className="text-xs font-medium text-slate-700 dark:text-slate-300">Register Changes to Write</h3>
            <div className="overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-lg">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400">
                  <tr>
                    <th className="py-2 px-3 font-medium">Addr</th>
                    <th className="py-2 px-3 font-medium">Current</th>
                    <th className="py-2 px-3 font-medium">New</th>
                    <th className="py-2 px-3 font-medium">Note</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {selectedPatches.map((patch, idx) => {
                    const normKey = `0x${patch.addr.replace(/^0x/i, '').padStart(3, '0').toUpperCase()}`;
                    const regDef = activeProfile.registers.find(
                      (r) => `0x${r.addr.replace(/^0x/i, '').padStart(3, '0').toUpperCase()}` === normKey,
                    );
                    const currentVal = registerOverrides[normKey] ?? regDef?.defaultVal ?? '0x00';
                    return (
                      <tr key={`${patch.addr}-${idx}`}>
                        <td className="py-2 px-3 font-mono text-slate-800 dark:text-slate-200">{normKey}</td>
                        <td className="py-2 px-3 font-mono text-slate-500 dark:text-slate-400 tabular-nums">{currentVal}</td>
                        <td className="py-2 px-3 font-mono font-semibold text-blue-700 dark:text-blue-400 tabular-nums">{patch.value}</td>
                        <td className="py-2 px-3 text-slate-600 dark:text-slate-300">{patch.note}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Progress Bar */}
          {flashStep && (
            <div className="space-y-2 pt-1">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-700 dark:text-slate-200 font-medium flex items-center gap-1.5">
                  {flashProgress === 100 && <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />}
                  <span>{flashStep}</span>
                </span>
                <span className="font-mono tabular-nums text-slate-600 dark:text-slate-300">{flashProgress}%</span>
              </div>
              <div className="h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                <div
                  className={`h-full transition-all duration-200 ${flashProgress === 100 ? 'bg-emerald-600' : 'bg-blue-600'}`}
                  style={{ width: `${flashProgress}%` }}
                />
              </div>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={handleStartFlash}
              disabled={flashing || !vinSafe || selectedPatches.length === 0}
              className="flex-1 min-h-[44px] px-4 py-2.5 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-lg transition-colors inline-flex items-center justify-center gap-2 whitespace-nowrap shrink-0"
            >
              <Zap className="w-4 h-4 shrink-0" aria-hidden="true" />
              <span>{flashing ? 'Reflashing...' : 'Flash & Verify'}</span>
            </button>

            {!usingUpload && activeCatalogPkg && (
              <a
                href={`/api/firmware/download/${encodeURIComponent(activeCatalogPkg.id)}?format=hex`}
                download
                className="min-h-[44px] px-3.5 py-2.5 text-xs font-medium text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg transition-colors inline-flex items-center gap-1.5 whitespace-nowrap shrink-0"
              >
                <Download className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                <span>Download .hex</span>
              </a>
            )}
          </div>

          {/* Flash History */}
          {flashHistory.length > 0 && (
            <div className="pt-4 border-t border-slate-100 dark:border-slate-800 space-y-2">
              <h3 className="text-xs font-medium text-slate-500 dark:text-slate-400">Reflash Audit Log</h3>
              <ul className="space-y-1.5 text-xs">
                {flashHistory.map((item) => (
                  <li key={item.id} className="flex items-center justify-between gap-2 py-1 border-b border-slate-50 dark:border-slate-800/60">
                    <span className="text-slate-800 dark:text-slate-200 truncate">
                      {item.targetPart} · {item.version} ({item.crc32})
                    </span>
                    <span className="text-emerald-700 dark:text-emerald-400 font-medium shrink-0">Verified · {item.timestamp}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
      )}
    </section>
  );
}
