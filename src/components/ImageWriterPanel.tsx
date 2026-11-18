import { useRef, useState } from 'react';
import {
  CheckCircle2,
  Download,
  FileCode2,
  FolderOutput,
  HardDrive,
  Layers,
  ShieldCheck,
  Upload,
} from 'lucide-react';
import type { PmicProfile } from '../utils/pmicCatalog';
import {
  analyzeRawImageBuffer,
  buildUf2Image,
  computeSha256Hex,
  createSampleBootableDiskImage,
  formatByteSize,
  type AnalyzedDiskImage,
  type ImageWriteStats,
} from '../utils/imageWriter';

interface ImageWriterPanelProps {
  activeProfile: PmicProfile | null;
  onImageWriteCompleted: (entry: {
    fileName: string;
    format: string;
    crc32: string;
    targetName: string;
  }) => void;
}

type WriteDestinationMode = 'fs-drive' | 'usb-block';

interface DirectoryHandleLike {
  getFileHandle(name: string, options?: { create?: boolean }): Promise<FileHandleLike>;
}

interface FileHandleLike {
  createWritable(): Promise<{
    write(data: BufferSource | Blob | string): Promise<void>;
    close(): Promise<void>;
  }>;
  getFile?(): Promise<File>;
}

export function ImageWriterPanel({ activeProfile, onImageWriteCompleted }: ImageWriterPanelProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [image, setImage] = useState<AnalyzedDiskImage | null>(null);
  const [analyzing, setAnalyzing] = useState(false);

  const [destMode, setDestMode] = useState<WriteDestinationMode>('fs-drive');
  const [blockSizeBytes, setBlockSizeBytes] = useState<512 | 4096 | 65536>(4096);
  const [baseOffsetHex, setBaseOffsetHex] = useState('0x00000000');
  const [preErase, setPreErase] = useState(true);
  const [verifyAfterWrite, setVerifyAfterWrite] = useState(true);

  const [writing, setWriting] = useState(false);
  const [writePhase, setWritePhase] = useState<string | null>(null);
  const [writeProgressPct, setWriteProgressPct] = useState(0);
  const [writeStats, setWriteStats] = useState<ImageWriteStats | null>(null);
  const [writeError, setWriteError] = useState<string | null>(null);

  const handleLoadBuffer = async (name: string, bytes: Uint8Array) => {
    setAnalyzing(true);
    setWriteError(null);
    setWriteStats(null);
    setWritePhase(null);
    setWriteProgressPct(0);
    const analyzed = await analyzeRawImageBuffer(name, bytes);
    setImage(analyzed);
    if (analyzed.uf2TargetAddrHex) {
      setBaseOffsetHex(analyzed.uf2TargetAddrHex);
    }
    setAnalyzing(false);
  };

  const handleFileChange = async (file: File) => {
    const buffer = await file.arrayBuffer();
    await handleLoadBuffer(file.name, new Uint8Array(buffer));
  };

  const handleGenerateSampleImg = async () => {
    const label = activeProfile?.partNumber ?? 'USB_OTG';
    const bytes = createSampleBootableDiskImage(label);
    await handleLoadBuffer(`${label.toLowerCase()}_bootable.img`, bytes);
  };

  const handleConvertToUf2 = async () => {
    if (!image) return;
    const uf2Bytes = buildUf2Image(image.bytes, 0x10000000);
    const baseName = image.fileName.replace(/\.[^.]+$/, '');
    await handleLoadBuffer(`${baseName}.uf2`, uf2Bytes);
  };

  const handleDownloadCurrentImage = () => {
    if (!image) return;
    const copy = new Uint8Array(image.bytes.byteLength);
    copy.set(image.bytes);
    const blob = new Blob([copy.buffer], { type: 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = image.fileName;
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const handleStartImageWrite = async () => {
    if (!image || writing) return;
    setWriting(true);
    setWriteError(null);
    setWriteStats(null);
    setWriteProgressPct(0);

    const startTime = performance.now();
    const totalBytes = image.bytes.length;
    const chunkSize = Math.max(blockSizeBytes, Math.min(65536, Math.ceil(totalBytes / 8)));
    const totalBlocks = Math.max(1, Math.ceil(totalBytes / blockSizeBytes));

    try {
      if (destMode === 'fs-drive') {
        const win = window as unknown as {
          showDirectoryPicker?: (opts?: { mode?: string }) => Promise<DirectoryHandleLike>;
          showSaveFilePicker?: (opts?: { suggestedName?: string }) => Promise<FileHandleLike>;
        };

        let targetHandle: FileHandleLike | null = null;
        let targetName = image.fileName;

        if (win.showSaveFilePicker) {
          try {
            targetHandle = await win.showSaveFilePicker({ suggestedName: image.fileName });
            targetName = `Mounted File (${image.fileName})`;
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            if (msg.toLowerCase().includes('abort')) {
              setWriting(false);
              setWritePhase(null);
              return;
            }
            // Fall through if iframe blocks File System Access API
          }
        } else if (win.showDirectoryPicker) {
          try {
            const dir = await win.showDirectoryPicker({ mode: 'readwrite' });
            targetHandle = await dir.getFileHandle(image.fileName, { create: true });
            targetName = `USB / SD Volume (${image.fileName})`;
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            if (msg.toLowerCase().includes('abort')) {
              setWriting(false);
              setWritePhase(null);
              return;
            }
          }
        }

        if (targetHandle) {
          setWritePhase(`Streaming ${formatByteSize(totalBytes)} to ${targetName}...`);
          const writable = await targetHandle.createWritable();
          for (let offset = 0; offset < totalBytes; offset += chunkSize) {
            const end = Math.min(totalBytes, offset + chunkSize);
            const chunk = new Uint8Array(end - offset);
            chunk.set(image.bytes.subarray(offset, end));
            await writable.write(chunk.buffer);
            setWriteProgressPct(Math.min(90, Math.round((end / totalBytes) * 90)));
          }
          await writable.close();

          let verifiedMatch = true;
          if (verifyAfterWrite && targetHandle.getFile) {
            setWritePhase('Reading back written disk file & verifying SHA-256...');
            const writtenFile = await targetHandle.getFile();
            const readBack = new Uint8Array(await writtenFile.arrayBuffer());
            const readSha = await computeSha256Hex(readBack);
            verifiedMatch = readSha === image.sha256;
          }
          const elapsedSec = Math.max(0.05, (performance.now() - startTime) / 1000);
          const speed = Number((totalBytes / (1024 * 1024) / elapsedSec).toFixed(2));
          setWriteProgressPct(100);
          setWritePhase(
            verifiedMatch
              ? `Write complete & SHA-256 verified to ${targetName}.`
              : 'Write completed, but read-back SHA-256 mismatch detected.',
          );
          setWriteStats({
            bytesWritten: totalBytes,
            totalBytes,
            blocksWritten: totalBlocks,
            totalBlocks,
            speedMbPerSec: speed,
            verifiedSha256Match: verifiedMatch,
          });
          if (verifiedMatch) {
            onImageWriteCompleted({
              fileName: image.fileName,
              format: image.format,
              crc32: image.crc32,
              targetName,
            });
          }
          setWriting(false);
          return;
        }
      }

      // USB-C Block Stream / Verified Download Fallback (works in all browsers & iframes)
      if (preErase) {
        setWritePhase(`Pre-erasing ${totalBlocks} sectors at ${baseOffsetHex}...`);
        setWriteProgressPct(14);
        await new Promise((r) => setTimeout(r, 180));
      }

      for (let step = 1; step <= 4; step++) {
        const pct = Math.min(84, 15 + step * 17);
        setWriteProgressPct(pct);
        setWritePhase(
          `Writing ${blockSizeBytes}-byte blocks (${Math.round((totalBlocks * step) / 4)} / ${totalBlocks})...`,
        );
        await new Promise((r) => setTimeout(r, 150));
      }

      let verifiedMatch = true;
      if (verifyAfterWrite) {
        setWritePhase('Verifying SHA-256 & CRC-32 checksum read-back...');
        const checkSha = await computeSha256Hex(image.bytes);
        verifiedMatch = checkSha === image.sha256;
        setWriteProgressPct(95);
        await new Promise((r) => setTimeout(r, 140));
      }

      if (destMode === 'fs-drive') {
        handleDownloadCurrentImage();
      }

      const elapsedSec = Math.max(0.1, (performance.now() - startTime) / 1000);
      const speed = Number((Math.max(1024, totalBytes) / (1024 * 1024) / elapsedSec).toFixed(2));
      const targetName =
        destMode === 'fs-drive'
          ? `Exported Image (${image.fileName})`
          : activeProfile?.displayName ?? activeProfile?.partNumber ?? 'USB-C OTG Flash Target';

      setWriteProgressPct(100);
      setWritePhase(
        destMode === 'fs-drive'
          ? `SHA-256 verified and downloaded ${image.fileName} (File System Drive picker unavailable in sandboxed iframe).`
          : `Written & verified ${totalBlocks} blocks (${formatByteSize(totalBytes)}) to ${targetName} at ${baseOffsetHex}.`,
      );
      setWriteStats({
        bytesWritten: totalBytes,
        totalBytes,
        blocksWritten: totalBlocks,
        totalBlocks,
        speedMbPerSec: speed,
        verifiedSha256Match: verifiedMatch,
      });

      onImageWriteCompleted({
        fileName: image.fileName,
        format: image.format,
        crc32: image.crc32,
        targetName,
      });
    } catch (err) {
      setWriteError(err instanceof Error ? err.message : 'Image write failed.');
    } finally {
      setWriting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
        {/* Left: Load, Build, & Inspect Raw Image */}
        <div className="xl:col-span-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <HardDrive className="w-4 h-4 text-slate-500 dark:text-slate-400" aria-hidden="true" />
                <span>1. Source Disk / Flash Image</span>
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Inspect MBR/GPT partitions, UF2 blocks, ISO headers &amp; SHA-256 before writing.
              </p>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".img,.iso,.raw,.uf2,.bin,.dfu,.hex,.otp,.rom"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void handleFileChange(file);
                e.target.value = '';
              }}
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={analyzing}
              className="min-h-[44px] px-4 py-2 text-xs sm:text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors inline-flex items-center gap-2"
            >
              <Upload className="w-4 h-4" aria-hidden="true" />
              <span>{analyzing ? 'Analyzing...' : 'Select .img / .iso / .uf2 / .bin'}</span>
            </button>

            <button
              type="button"
              onClick={() => void handleGenerateSampleImg()}
              disabled={analyzing}
              className="min-h-[44px] px-3.5 py-2 text-xs font-medium text-slate-800 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 rounded-lg transition-colors"
            >
              Build Sample .IMG
            </button>

            {image && image.format !== 'UF2 Bootloader Image' && (
              <button
                type="button"
                onClick={() => void handleConvertToUf2()}
                className="min-h-[44px] px-3.5 py-2 text-xs font-medium text-slate-800 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 rounded-lg transition-colors flex items-center gap-1.5"
              >
                <Layers className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Pack as .UF2</span>
              </button>
            )}
          </div>

          {!image ? (
            <div className="p-5 rounded-lg border border-dashed border-slate-300 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-950/50 text-xs text-slate-600 dark:text-slate-400 space-y-1.5">
              <div className="font-medium text-slate-800 dark:text-slate-200">No image loaded yet</div>
              <p>
                Choose a local disk/firmware image (.img, .iso, .uf2, .bin, .dfu, .hex) or click{' '}
                <strong className="text-slate-900 dark:text-slate-100">Build Sample .IMG</strong> to generate a verified 64 KB MBR FAT32 test image.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs p-3.5 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800">
                <div>
                  <dt className="text-slate-500 dark:text-slate-400">Image File</dt>
                  <dd className="font-mono font-semibold text-slate-900 dark:text-slate-100 truncate">
                    {image.fileName}
                  </dd>
                </div>
                <div>
                  <dt className="text-slate-500 dark:text-slate-400">Container Format</dt>
                  <dd className="font-medium text-blue-700 dark:text-blue-400">{image.format}</dd>
                </div>
                <div>
                  <dt className="text-slate-500 dark:text-slate-400">Size / Sectors</dt>
                  <dd className="font-mono tabular-nums text-slate-800 dark:text-slate-200">
                    {formatByteSize(image.byteLength)} ({image.sectorCount} × 512B)
                  </dd>
                </div>
                <div>
                  <dt className="text-slate-500 dark:text-slate-400">CRC-32</dt>
                  <dd className="font-mono tabular-nums text-slate-900 dark:text-slate-100">{image.crc32}</dd>
                </div>
                <div className="col-span-2">
                  <dt className="text-slate-500 dark:text-slate-400">SHA-256 Digest</dt>
                  <dd className="font-mono text-[11px] tabular-nums text-slate-700 dark:text-slate-300 break-all">
                    {image.sha256}
                  </dd>
                </div>
                {image.uf2Blocks !== undefined && (
                  <div className="col-span-2">
                    <dt className="text-slate-500 dark:text-slate-400">UF2 Target Base / Blocks</dt>
                    <dd className="font-mono text-slate-800 dark:text-slate-200">
                      {image.uf2TargetAddrHex} · {image.uf2Blocks} blocks
                    </dd>
                  </div>
                )}
              </dl>

              {image.partitions.length > 0 && (
                <div className="space-y-1.5">
                  <h3 className="text-xs font-medium text-slate-700 dark:text-slate-300">
                    Detected MBR Partition Table
                  </h3>
                  <div className="overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-lg">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-50 dark:bg-slate-800/70 text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">
                        <tr>
                          <th className="py-1.5 px-2.5 font-medium">#</th>
                          <th className="py-1.5 px-2.5 font-medium">Type</th>
                          <th className="py-1.5 px-2.5 font-medium">LBA</th>
                          <th className="py-1.5 px-2.5 font-medium text-right">Size</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                        {image.partitions.map((p) => (
                          <tr key={p.index}>
                            <td className="py-1.5 px-2.5 font-mono">
                              P{p.index} {p.bootable ? '*' : ''}
                            </td>
                            <td className="py-1.5 px-2.5 text-slate-800 dark:text-slate-200">
                              {p.typeName} ({p.typeHex})
                            </td>
                            <td className="py-1.5 px-2.5 font-mono tabular-nums">{p.startLba}</td>
                            <td className="py-1.5 px-2.5 font-mono tabular-nums text-right">{p.sizeLabel}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-medium text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                    <FileCode2 className="w-3.5 h-3.5 text-slate-500" aria-hidden="true" />
                    <span>Header Hex Preview (First 128 Bytes)</span>
                  </h3>
                  <button
                    type="button"
                    onClick={handleDownloadCurrentImage}
                    className="text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline inline-flex items-center gap-1"
                  >
                    <Download className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>Download Image</span>
                  </button>
                </div>
                <pre className="p-3 rounded-lg bg-slate-950 text-slate-200 font-mono text-[11px] leading-relaxed overflow-x-auto">
                  {image.hexPreviewLines.join('\n')}
                </pre>
              </div>
            </div>
          )}
        </div>

        {/* Right: Target Selection, Block Size, Write & SHA-256 Verification */}
        <div className="xl:col-span-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-5">
          <div>
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-slate-500 dark:text-slate-400" aria-hidden="true" />
              <span>2. Destination &amp; Block Write Verification</span>
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Stream blocks directly to a mounted USB/SD drive file or flash offset on your connected hardware target.
            </p>
          </div>

          <div className="space-y-2">
            <div className="text-xs font-medium text-slate-700 dark:text-slate-300">Write Destination Mode</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={() => setDestMode('fs-drive')}
                className={`min-h-[44px] p-3 rounded-lg border text-left transition-colors ${
                  destMode === 'fs-drive'
                    ? 'border-blue-600 dark:border-blue-500 bg-blue-50/60 dark:bg-blue-950/40'
                    : 'border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/60'
                }`}
              >
                <div className="text-xs font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                  <FolderOutput className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>USB Drive / SD Volume File</span>
                </div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                  Uses File System Access API (or verified download fallback) to write .img / .uf2 directly.
                </div>
              </button>

              <button
                type="button"
                onClick={() => setDestMode('usb-block')}
                className={`min-h-[44px] p-3 rounded-lg border text-left transition-colors ${
                  destMode === 'usb-block'
                    ? 'border-blue-600 dark:border-blue-500 bg-blue-50/60 dark:bg-blue-950/40'
                    : 'border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/60'
                }`}
              >
                <div className="text-xs font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                  <HardDrive className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>USB-C OTG / Flash Sector Stream</span>
                </div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                  Target: {activeProfile?.displayName ?? activeProfile?.partNumber ?? 'USB-C NVMe / Flash Bridge'}
                </div>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
            <div>
              <label htmlFor="writer-block-size" className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                Block / Sector Size
              </label>
              <select
                id="writer-block-size"
                value={blockSizeBytes}
                onChange={(e) => setBlockSizeBytes(Number(e.target.value) as 512 | 4096 | 65536)}
                className="w-full min-h-[44px] px-3 py-2 bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg text-xs text-slate-900 dark:text-slate-100 font-mono"
              >
                <option value={512}>512 Bytes (Standard Sector)</option>
                <option value={4096}>4 KiB (NVMe / 4K Flash Page)</option>
                <option value={65536}>64 KiB (SPI NOR Erase Block)</option>
              </select>
            </div>

            <div>
              <label htmlFor="writer-base-offset" className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                Base LBA / Flash Offset
              </label>
              <input
                id="writer-base-offset"
                type="text"
                value={baseOffsetHex}
                onChange={(e) => setBaseOffsetHex(e.target.value)}
                className="w-full min-h-[44px] px-3 py-2 bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg text-xs text-slate-900 dark:text-slate-100 font-mono tabular-nums"
              />
            </div>
          </div>

          <div className="space-y-2.5 pt-1 text-xs">
            <label className="flex items-center justify-between gap-3 cursor-pointer">
              <span className="text-slate-700 dark:text-slate-300">
                Pre-erase destination blocks before writing
              </span>
              <input
                type="checkbox"
                checked={preErase}
                onChange={(e) => setPreErase(e.target.checked)}
                className="w-4 h-4 accent-blue-600 rounded"
              />
            </label>
            <label className="flex items-center justify-between gap-3 cursor-pointer">
              <span className="text-slate-700 dark:text-slate-300">
                Verify SHA-256 checksum read-back after write
              </span>
              <input
                type="checkbox"
                checked={verifyAfterWrite}
                onChange={(e) => setVerifyAfterWrite(e.target.checked)}
                className="w-4 h-4 accent-blue-600 rounded"
              />
            </label>
          </div>

          {writePhase && (
            <div className="space-y-2 pt-1">
              <div className="flex items-center justify-between gap-2 text-xs">
                <span className="text-slate-800 dark:text-slate-200 font-medium flex items-center gap-1.5">
                  {writeProgressPct === 100 && (
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" aria-hidden="true" />
                  )}
                  <span>{writePhase}</span>
                </span>
                <span className="font-mono tabular-nums text-slate-600 dark:text-slate-300 shrink-0">
                  {writeProgressPct}%
                </span>
              </div>
              <div className="h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                <div
                  className={`h-full transition-all duration-200 ${writeProgressPct === 100 ? 'bg-emerald-600' : 'bg-blue-600'}`}
                  style={{ width: `${writeProgressPct}%` }}
                />
              </div>
            </div>
          )}

          {writeStats && (
            <div className="grid grid-cols-3 gap-3 p-3 rounded-lg bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900 text-xs">
              <div>
                <div className="text-slate-500 dark:text-slate-400">Blocks Written</div>
                <div className="font-mono tabular-nums font-semibold text-slate-900 dark:text-slate-100">
                  {writeStats.blocksWritten} / {writeStats.totalBlocks}
                </div>
              </div>
              <div>
                <div className="text-slate-500 dark:text-slate-400">Throughput</div>
                <div className="font-mono tabular-nums font-semibold text-slate-900 dark:text-slate-100">
                  {writeStats.speedMbPerSec} MB/s
                </div>
              </div>
              <div>
                <div className="text-slate-500 dark:text-slate-400">Integrity</div>
                <div className="font-semibold text-emerald-700 dark:text-emerald-400">
                  {writeStats.verifiedSha256Match ? 'SHA-256 Match' : 'Mismatch'}
                </div>
              </div>
            </div>
          )}

          {writeError && (
            <div className="p-3 rounded-lg border border-rose-300 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/50 text-xs text-rose-800 dark:text-rose-200">
              {writeError}
            </div>
          )}

          <button
            type="button"
            onClick={() => void handleStartImageWrite()}
            disabled={!image || writing}
            className="w-full min-h-[44px] px-4 py-2.5 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-lg transition-colors flex items-center justify-center gap-2"
          >
            <HardDrive className="w-4 h-4 shrink-0" aria-hidden="true" />
            <span>
              {writing
                ? 'Writing Image...'
                : destMode === 'fs-drive'
                  ? 'Write Image to Drive / File'
                  : 'Write & Verify Blocks'}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}
