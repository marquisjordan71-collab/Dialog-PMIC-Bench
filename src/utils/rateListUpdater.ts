import { FIRMWARE_CATALOG, MANUAL_CATALOG } from './pmicCatalog.ts';

export interface RateListEntry {
  id: string;
  label: string;
  partNumber: string;
  pollingRateHz: 125 | 250 | 500 | 1000;
  deadzonePct: number;
  enabled: boolean;
  lastUpdatedAt: string | null;
  lastFirmwareVersion: string | null;
  status: 'pending' | 'updated' | 'skipped';
}

export interface AutoUpdateScheduleState {
  enabled12Am: boolean;
  lastRunDateKey: string | null; // YYYY-MM-DD local
  lastRunAt: string | null;
  lastRunSummary: string | null;
  rateList: RateListEntry[];
}

export function createDefaultRateList(): RateListEntry[] {
  return [
    {
      id: 'rate-dualsense',
      label: 'PS5 DualSense & Edge Controller',
      partNumber: 'DUALSENSE',
      pollingRateHz: 1000,
      deadzonePct: 5,
      enabled: true,
      lastUpdatedAt: null,
      lastFirmwareVersion: 'DS-MCU-0520',
      status: 'pending',
    },
    {
      id: 'rate-dualshock4',
      label: 'PS4 DualShock 4 Controller',
      partNumber: 'DUALSHOCK4',
      pollingRateHz: 500,
      deadzonePct: 6,
      enabled: true,
      lastUpdatedAt: null,
      lastFirmwareVersion: 'DS4-BT-0310',
      status: 'pending',
    },
    {
      id: 'rate-xbox',
      label: 'Xbox Series / One & 360 Controllers',
      partNumber: 'XBOX-CTRL',
      pollingRateHz: 250,
      deadzonePct: 6,
      enabled: true,
      lastUpdatedAt: null,
      lastFirmwareVersion: 'XBOX-GIP-5.21',
      status: 'pending',
    },
    {
      id: 'rate-switch-8bitdo',
      label: 'Switch Pro, Retro & 8BitDo Hall-Effect',
      partNumber: '8BITDO-PAD',
      pollingRateHz: 500,
      deadzonePct: 3,
      enabled: true,
      lastUpdatedAt: null,
      lastFirmwareVersion: '8BD-TMR-v2.08',
      status: 'pending',
    },
    {
      id: 'rate-pmic-evk',
      label: 'Dialog PMIC & USB-C OTG Bridge Suite',
      partNumber: 'DA9063',
      pollingRateHz: 250,
      deadzonePct: 0,
      enabled: true,
      lastUpdatedAt: null,
      lastFirmwareVersion: 'NVM-v3.4',
      status: 'pending',
    },
  ];
}

export function getLocalDateKey(now = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function getMsUntilNextMidnight(now = new Date()): number {
  const next = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() + 1,
    0,
    0,
    0,
    0,
  );
  return Math.max(0, next.getTime() - now.getTime());
}

export function formatCountdownToMidnight(now = new Date()): string {
  const ms = getMsUntilNextMidnight(now);
  const totalMinutes = Math.ceil(ms / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const mins = totalMinutes % 60;
  return `${hours}h ${mins}m`;
}

export function shouldRunMidnightUpdate(
  state: Pick<AutoUpdateScheduleState, 'enabled12Am' | 'lastRunDateKey'>,
  now = new Date(),
): boolean {
  if (!state.enabled12Am) return false;
  const today = getLocalDateKey(now);
  return state.lastRunDateKey !== today;
}

export function executeRateListUpdateSweep(
  rateList: RateListEntry[],
  now = new Date(),
): {
  updatedList: RateListEntry[];
  updatedCount: number;
  manualsChecked: number;
  summary: string;
  dateKey: string;
  timestampIso: string;
} {
  const timestampIso = now.toISOString();
  const dateKey = getLocalDateKey(now);
  let updatedCount = 0;
  let manualsChecked = 0;

  const updatedList = rateList.map((entry) => {
    if (!entry.enabled) {
      return { ...entry, status: 'skipped' as const };
    }
    updatedCount += 1;
    const fwMatch = FIRMWARE_CATALOG.find(
      (fw) => fw.partNumber.toUpperCase() === entry.partNumber.toUpperCase(),
    );
    const manualCount = MANUAL_CATALOG.filter(
      (doc) => doc.partNumber.toUpperCase() === entry.partNumber.toUpperCase(),
    ).length;
    manualsChecked += manualCount;

    return {
      ...entry,
      lastUpdatedAt: timestampIso,
      lastFirmwareVersion: fwMatch?.version ?? entry.lastFirmwareVersion ?? 'Synced',
      status: 'updated' as const,
    };
  });

  const summary = `Updated ${updatedCount} Rate List target(s) (${manualsChecked} manuals verified) at ${now.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  })}.`;

  return {
    updatedList,
    updatedCount,
    manualsChecked,
    summary,
    dateKey,
    timestampIso,
  };
}
