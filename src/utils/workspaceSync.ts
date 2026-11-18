import type { DiscoveredManual, FlashHistoryEntry, RegisterWriteLog } from '../types';
import type { RailRuntimeState } from './pmicProtocol';

export type ThemeMode = 'light' | 'dark' | 'system';

export interface BenchSyncSnapshot {
  partNumber: string | null;
  transport: 'WebUSB' | 'WebBluetooth' | 'WebHID' | 'WebSerial' | 'GamepadAPI' | 'Bench-OTG' | null;
  railStates: RailRuntimeState[];
  registerOverrides: Record<string, string>;
  activeFirmwareVersion: string;
  vinMv: number;
  bootFaultCleared: boolean;
  flashHistory: FlashHistoryEntry[];
  i2cLog: RegisterWriteLog[];
  deviceManuals: DiscoveredManual[];
  updatedAt: string;
}

export interface BenchPreferences {
  theme: ThemeMode;
  autoSync: boolean;
  autoDownload: boolean;
}

export function resolveIsDark(mode: ThemeMode, systemPrefersDark: boolean): boolean {
  if (mode === 'dark') return true;
  if (mode === 'light') return false;
  return systemPrefersDark;
}

export function applyTelemetrySyncTick(
  rails: RailRuntimeState[],
  tickIndex: number,
): RailRuntimeState[] {
  return rails.map((rail, idx) => {
    if (!rail.enabled) {
      return { ...rail, currentMa: 0 };
    }
    const wave = Math.sin((tickIndex + idx * 1.3) * 0.8);
    const deltaMa = Math.round(wave * Math.max(2, rail.currentMa * 0.015));
    const nextMa = Math.max(5, rail.currentMa + deltaMa);
    const nextTemp = Number(Math.min(72, Math.max(29, rail.tempC + wave * 0.15)).toFixed(1));
    return {
      ...rail,
      currentMa: nextMa,
      tempC: nextTemp,
    };
  });
}

export function serializeBenchSnapshot(snapshot: BenchSyncSnapshot): string {
  return JSON.stringify(snapshot);
}

export function deserializeBenchSnapshot(raw: string | null): BenchSyncSnapshot | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<BenchSyncSnapshot>;
    if (!parsed || typeof parsed !== 'object') return null;
    if (!Array.isArray(parsed.railStates)) return null;
    return {
      partNumber: parsed.partNumber ?? null,
      transport: parsed.transport ?? null,
      railStates: parsed.railStates,
      registerOverrides: parsed.registerOverrides ?? {},
      activeFirmwareVersion: parsed.activeFirmwareVersion ?? '',
      vinMv: typeof parsed.vinMv === 'number' ? parsed.vinMv : 5000,
      bootFaultCleared: Boolean(parsed.bootFaultCleared),
      flashHistory: Array.isArray(parsed.flashHistory) ? parsed.flashHistory : [],
      i2cLog: Array.isArray(parsed.i2cLog) ? parsed.i2cLog : [],
      deviceManuals: Array.isArray(parsed.deviceManuals) ? parsed.deviceManuals : [],
      updatedAt: parsed.updatedAt ?? new Date().toISOString(),
    };
  } catch {
    return null;
  }
}
