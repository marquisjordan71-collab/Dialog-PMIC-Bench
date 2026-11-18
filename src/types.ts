import type { FirmwarePackage, ManualDocument, PmicProfile } from './utils/pmicCatalog';
import type { ParsedFirmwareImage, RailRuntimeState } from './utils/pmicProtocol';
import type { ConnectedHardwareInfo } from './utils/webHardwareBridge';

export type ActiveTab = 'overview' | 'rails' | 'diagnostics' | 'gamepad' | 'firmware' | 'manuals';

export interface DiscoveredManual extends ManualDocument {
  sourceStatus: 'verified' | 'local-archive';
  downloadUrl: string;
  markdownUrl: string;
  previewUrl: string;
  autoDownloaded?: boolean;
  downloadedAt?: string;
}

export interface FlashHistoryEntry {
  id: string;
  timestamp: string;
  targetPart: string;
  imageName: string;
  version: string;
  crc32: string;
  status: 'verified' | 'failed';
}

export interface RegisterWriteLog {
  id: string;
  timestamp: string;
  i2cAddr: string;
  regAddr: string;
  value: string;
  operation: 'READ' | 'WRITE' | 'FLASH';
  note: string;
}

export interface AppWorkspaceState {
  connectedHardware: ConnectedHardwareInfo | null;
  activeProfile: PmicProfile | null;
  railStates: RailRuntimeState[];
  registerOverrides: Record<string, string>;
  activeFirmwareVersion: string;
  vinMv: number;
  probing: boolean;
  probeMessage: string | null;
  hardwareError: string | null;
  autoDownloadEnabled: boolean;
  manuals: DiscoveredManual[];
  manualsLoading: boolean;
  firmwarePackages: FirmwarePackage[];
  uploadedFirmware: ParsedFirmwareImage | null;
  flashHistory: FlashHistoryEntry[];
  i2cLog: RegisterWriteLog[];
}
