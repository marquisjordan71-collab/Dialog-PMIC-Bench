import { computeCrc32Hex } from './pmicProtocol';

export type ImageContainerFormat =
  | 'MBR / FAT Bootable Image'
  | 'GPT Partitioned Disk Image'
  | 'ISO-9660 Optical Image'
  | 'UF2 Bootloader Image'
  | 'Intel HEX Firmware'
  | 'ARM / MCU Binary Image'
  | 'Raw Flash / Block Image';

export interface PartitionEntryInfo {
  index: number;
  bootable: boolean;
  typeHex: string;
  typeName: string;
  startLba: number;
  sectorCount: number;
  sizeLabel: string;
}

export interface AnalyzedDiskImage {
  fileName: string;
  byteLength: number;
  sectorCount: number;
  format: ImageContainerFormat;
  crc32: string;
  sha256: string;
  uf2Blocks?: number;
  uf2TargetAddrHex?: string;
  partitions: PartitionEntryInfo[];
  hexPreviewLines: string[];
  bytes: Uint8Array;
}

export interface ImageWriteStats {
  bytesWritten: number;
  totalBytes: number;
  blocksWritten: number;
  totalBlocks: number;
  speedMbPerSec: number;
  verifiedSha256Match: boolean;
}

const MBR_PART_TYPES: Record<number, string> = {
  0x01: 'FAT12',
  0x04: 'FAT16 (<32MB)',
  0x06: 'FAT16B',
  0x07: 'NTFS / exFAT',
  0x0b: 'FAT32 (CHS)',
  0x0c: 'FAT32 (LBA)',
  0x0e: 'FAT16B (LBA)',
  0x82: 'Linux Swap',
  0x83: 'Linux Native (ext4)',
  0xee: 'EFI Protective GPT',
  0xef: 'EFI System Partition',
};

export function formatByteSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export function buildHexPreviewLines(bytes: Uint8Array, maxBytes = 128): string[] {
  const limit = Math.min(bytes.length, maxBytes);
  const lines: string[] = [];
  for (let offset = 0; offset < limit; offset += 16) {
    const slice = bytes.subarray(offset, Math.min(limit, offset + 16));
    const addr = offset.toString(16).toUpperCase().padStart(4, '0');
    const hexCols: string[] = [];
    let ascii = '';
    for (let i = 0; i < 16; i++) {
      if (i < slice.length) {
        const b = slice[i];
        hexCols.push(b.toString(16).toUpperCase().padStart(2, '0'));
        ascii += b >= 32 && b <= 126 ? String.fromCharCode(b) : '.';
      } else {
        hexCols.push('  ');
        ascii += ' ';
      }
    }
    lines.push(`0x${addr}  ${hexCols.slice(0, 8).join(' ')}  ${hexCols.slice(8).join(' ')}  |${ascii}|`);
  }
  return lines;
}

export function parseMbrPartitions(bytes: Uint8Array): PartitionEntryInfo[] {
  if (bytes.length < 512) return [];
  if (bytes[510] !== 0x55 || bytes[511] !== 0xaa) return [];

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const entries: PartitionEntryInfo[] = [];
  for (let i = 0; i < 4; i++) {
    const base = 446 + i * 16;
    const status = bytes[base];
    const type = bytes[base + 4];
    const startLba = view.getUint32(base + 8, true);
    const sectorCount = view.getUint32(base + 12, true);
    if (type === 0 || sectorCount === 0) continue;
    entries.push({
      index: i + 1,
      bootable: status === 0x80,
      typeHex: `0x${type.toString(16).toUpperCase().padStart(2, '0')}`,
      typeName: MBR_PART_TYPES[type] ?? `Partition Type 0x${type.toString(16).toUpperCase()}`,
      startLba,
      sectorCount,
      sizeLabel: formatByteSize(sectorCount * 512),
    });
  }
  return entries;
}

const SHA256_K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

function rotr32(val: number, bits: number): number {
  return (val >>> bits) | (val << (32 - bits));
}

export function pureSha256Hex(bytes: Uint8Array): string {
  const bitLenHi = Math.floor((bytes.length * 8) / 0x100000000);
  const bitLenLo = (bytes.length * 8) >>> 0;
  const paddedLen = Math.ceil((bytes.length + 9) / 64) * 64;
  const padded = new Uint8Array(paddedLen);
  padded.set(bytes);
  padded[bytes.length] = 0x80;
  const dv = new DataView(padded.buffer);
  dv.setUint32(paddedLen - 8, bitLenHi, false);
  dv.setUint32(paddedLen - 4, bitLenLo, false);

  const h = new Uint32Array([
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
    0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
  ]);
  const w = new Uint32Array(64);

  for (let offset = 0; offset < paddedLen; offset += 64) {
    for (let i = 0; i < 16; i++) {
      w[i] = dv.getUint32(offset + i * 4, false);
    }
    for (let i = 16; i < 64; i++) {
      const s0 = rotr32(w[i - 15], 7) ^ rotr32(w[i - 15], 18) ^ (w[i - 15] >>> 3);
      const s1 = rotr32(w[i - 2], 17) ^ rotr32(w[i - 2], 19) ^ (w[i - 2] >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
    }

    let [a, b, c, d, e, f, g, hh] = h;
    for (let i = 0; i < 64; i++) {
      const S1 = rotr32(e, 6) ^ rotr32(e, 11) ^ rotr32(e, 25);
      const ch = (e & f) ^ (~e & g);
      const temp1 = (hh + S1 + ch + SHA256_K[i] + w[i]) >>> 0;
      const S0 = rotr32(a, 2) ^ rotr32(a, 13) ^ rotr32(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (S0 + maj) >>> 0;

      hh = g;
      g = f;
      f = e;
      e = (d + temp1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) >>> 0;
    }

    h[0] = (h[0] + a) >>> 0;
    h[1] = (h[1] + b) >>> 0;
    h[2] = (h[2] + c) >>> 0;
    h[3] = (h[3] + d) >>> 0;
    h[4] = (h[4] + e) >>> 0;
    h[5] = (h[5] + f) >>> 0;
    h[6] = (h[6] + g) >>> 0;
    h[7] = (h[7] + hh) >>> 0;
  }

  return Array.from(h)
    .map((word) => word.toString(16).padStart(8, '0'))
    .join('');
}

export async function computeSha256Hex(bytes: Uint8Array): Promise<string> {
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    try {
      const copy = new Uint8Array(bytes.byteLength);
      copy.set(bytes);
      const digest = await crypto.subtle.digest('SHA-256', copy.buffer);
      return Array.from(new Uint8Array(digest))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
    } catch {
      // Fallback below for restricted / non-HTTPS LAN origins
    }
  }
  return pureSha256Hex(bytes);
}

export async function analyzeRawImageBuffer(
  fileName: string,
  bytes: Uint8Array,
): Promise<AnalyzedDiskImage> {
  const lower = fileName.toLowerCase();
  const crc32 = computeCrc32Hex(bytes);
  const sha256 = await computeSha256Hex(bytes);
  const sectorCount = Math.ceil(bytes.length / 512);
  const hexPreviewLines = buildHexPreviewLines(bytes, 128);

  let format: ImageContainerFormat = 'Raw Flash / Block Image';
  let uf2Blocks: number | undefined;
  let uf2TargetAddrHex: string | undefined;
  let partitions: PartitionEntryInfo[] = [];

  // Check UF2 header magic: 0x0A324655 ("UF2\n") & 0x9E5D5157
  if (bytes.length >= 512) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const magic0 = view.getUint32(0, true);
    const magic1 = view.getUint32(4, true);
    if (magic0 === 0x0a324655 && magic1 === 0x9e5d5157) {
      format = 'UF2 Bootloader Image';
      const targetAddr = view.getUint32(12, true);
      uf2TargetAddrHex = `0x${targetAddr.toString(16).toUpperCase().padStart(8, '0')}`;
      uf2Blocks = view.getUint32(24, true) || Math.floor(bytes.length / 512);
    }
  }

  // Check ISO-9660 signature "CD001" at 0x8001
  if (format === 'Raw Flash / Block Image' && bytes.length > 0x8006) {
    const sig = String.fromCharCode(
      bytes[0x8001],
      bytes[0x8002],
      bytes[0x8003],
      bytes[0x8004],
      bytes[0x8005],
    );
    if (sig === 'CD001') {
      format = 'ISO-9660 Optical Image';
    }
  }

  // Check GPT ("EFI PART" at offset 512) or MBR (0x55 0xAA at 510..511)
  if (format === 'Raw Flash / Block Image' && bytes.length >= 1024) {
    const gptSig = String.fromCharCode(...bytes.subarray(512, 520));
    if (gptSig === 'EFI PART') {
      format = 'GPT Partitioned Disk Image';
    }
  }

  if (bytes.length >= 512 && bytes[510] === 0x55 && bytes[511] === 0xaa) {
    partitions = parseMbrPartitions(bytes);
    if (format === 'Raw Flash / Block Image') {
      format = 'MBR / FAT Bootable Image';
    }
  }

  if (format === 'Raw Flash / Block Image') {
    if (lower.endsWith('.hex')) {
      format = 'Intel HEX Firmware';
    } else if (bytes.length >= 8 && (lower.endsWith('.bin') || lower.endsWith('.dfu') || lower.endsWith('.otp'))) {
      const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
      const sp = view.getUint32(0, true);
      if (sp >= 0x20000000 && sp <= 0x20100000) {
        format = 'ARM / MCU Binary Image';
      }
    }
  }

  return {
    fileName,
    byteLength: bytes.length,
    sectorCount,
    format,
    crc32,
    sha256,
    uf2Blocks,
    uf2TargetAddrHex,
    partitions,
    hexPreviewLines,
    bytes,
  };
}

export function buildUf2Image(
  payload: Uint8Array,
  baseAddress = 0x10000000,
  familyId = 0xe48bff56,
): Uint8Array {
  const chunkSize = 256;
  const numBlocks = Math.max(1, Math.ceil(payload.length / chunkSize));
  const out = new Uint8Array(numBlocks * 512);
  const view = new DataView(out.buffer);

  for (let i = 0; i < numBlocks; i++) {
    const blockOff = i * 512;
    const srcStart = i * chunkSize;
    const slice = payload.subarray(srcStart, Math.min(payload.length, srcStart + chunkSize));

    view.setUint32(blockOff + 0, 0x0a324655, true); // MagicStart0
    view.setUint32(blockOff + 4, 0x9e5d5157, true); // MagicStart1
    view.setUint32(blockOff + 8, 0x00002000, true); // familyID present flag
    view.setUint32(blockOff + 12, baseAddress + srcStart, true);
    view.setUint32(blockOff + 16, chunkSize, true);
    view.setUint32(blockOff + 20, i, true);
    view.setUint32(blockOff + 24, numBlocks, true);
    view.setUint32(blockOff + 28, familyId, true);
    out.set(slice, blockOff + 32);
    view.setUint32(blockOff + 508, 0x0ab16f30, true); // MagicEnd
  }

  return out;
}

export function createSampleBootableDiskImage(label = 'BENCH_OTG'): Uint8Array {
  // Creates a valid 64 KB MBR-partitioned FAT32 + OEM header image
  const img = new Uint8Array(65536);
  const view = new DataView(img.buffer);

  const banner = new TextEncoder().encode(`DIALOG_BENCH_${label.toUpperCase()}_IMG`);
  img.set(banner.subarray(0, 64), 0);

  // Partition 1: Bootable FAT32 LBA starting at LBA 2048 (16 MB simulated header)
  const p1 = 446;
  img[p1 + 0] = 0x80; // Bootable
  img[p1 + 4] = 0x0c; // FAT32 LBA
  view.setUint32(p1 + 8, 2048, true);
  view.setUint32(p1 + 12, 32768, true);

  // MBR boot signature
  img[510] = 0x55;
  img[511] = 0xaa;

  // Deterministic pattern in sector 1..4 for checksum verification
  for (let i = 512; i < img.length; i++) {
    img[i] = (i * 13 + 7) & 0xff;
  }

  return img;
}
