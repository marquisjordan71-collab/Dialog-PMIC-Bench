import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { DeviceConnectionPanel } from './components/DeviceConnectionPanel';
import { DiagnosticsStage } from './components/DiagnosticsStage';
import { FirmwareFlashStage } from './components/FirmwareFlashStage';
import { GamepadCalibrationStage } from './components/GamepadCalibrationStage';
import { ManualReaderModal } from './components/ManualReaderModal';
import { ManualsStage } from './components/ManualsStage';
import { OverviewStage } from './components/OverviewStage';
import { OfflineIndicator } from './components/PWAInstallButton';
import { RailsAndI2CStage } from './components/RailsAndI2CStage';
import {
  OwnerLockScreen,
  SecurityGuardModal,
  UnauthorizedCloneScreen,
} from './components/SecurityGuardModal';
import { TopNavBar } from './components/TopNavBar';
import type { ActiveTab, DiscoveredManual, FlashHistoryEntry, RegisterWriteLog } from './types';
import type { FirmwarePackage, PmicProfile } from './utils/pmicCatalog';
import {
  runPmicDiagnostics,
  type DiagnosticFaultScenario,
  type DiagnosticFinding,
  type DiagnosticReport,
} from './utils/pmicDiagnostics';
import {
  createInitialRailStates,
  formatHexByte,
  matchFirmwareForPart,
  matchManualsForPart,
  millivoltsToDacCode,
  parseFirmwareUpload,
  type ParsedFirmwareImage,
  type RailRuntimeState,
} from './utils/pmicProtocol';
import {
  createBenchHardwareAttach,
  getHardwareCapabilities,
  requestInteractiveBluetoothConnection,
  requestInteractiveSerialOrHidConnection,
  requestInteractiveUsbOrOtgConnection,
  scanAuthorizedHardware,
  subscribePlugEvents,
  type ConnectedHardwareInfo,
} from './utils/webHardwareBridge';
import {
  createDefaultRateList,
  executeRateListUpdateSweep,
  shouldRunMidnightUpdate,
  type AutoUpdateScheduleState,
  type RateListEntry,
} from './utils/rateListUpdater';
import {
  applyTelemetrySyncTick,
  deserializeBenchSnapshot,
  resolveIsDark,
  serializeBenchSnapshot,
  type BenchPreferences,
  type BenchSyncSnapshot,
  type ThemeMode,
} from './utils/workspaceSync';
import {
  computeOwnerSealText,
  DEFAULT_ALLOWED_HOSTS,
  isHostAllowed,
  type SecurityStatusSummary,
} from './utils/appProtection';

const PREFS_STORAGE_KEY = 'dialog-pmic-bench-prefs';
const STATE_STORAGE_KEY = 'dialog-pmic-bench-state';
const RATE_LIST_STORAGE_KEY = 'dialog-pmic-bench-rate-list';
const SESSION_TOKEN_KEY = 'dialog-pmic-bench-session';
const SYNC_CHANNEL_NAME = 'dialog-pmic-bench-sync';

function getStoredSessionToken(): string | null {
  try {
    return sessionStorage.getItem(SESSION_TOKEN_KEY);
  } catch {
    return null;
  }
}

function setStoredSessionToken(token: string | null): void {
  try {
    if (token) {
      sessionStorage.setItem(SESSION_TOKEN_KEY, token);
    } else {
      sessionStorage.removeItem(SESSION_TOKEN_KEY);
    }
  } catch {
    // Ignore sessionStorage errors
  }
}

function withSessionHeaders(headersInit?: HeadersInit): Headers {
  const headers = new Headers(headersInit);
  const token = getStoredSessionToken();
  if (token && !headers.has('X-App-Session')) {
    headers.set('X-App-Session', token);
  }
  return headers;
}

const DEFAULT_SECURITY_STATUS: SecurityStatusSummary = {
  lockEnabled: false,
  isLocked: false,
  authenticated: true,
  ownerLabel: 'Dialog PMIC Bench Owner',
  allowedHosts: [...DEFAULT_ALLOWED_HOSTS],
  antiCopyEnabled: true,
  blockScrapers: true,
  buildFingerprint: 'LOCAL-INIT',
  lockoutRemainingSec: 0,
  failedAttempts: 0,
  auditEvents: [],
};

function loadStoredAutoUpdateState(): AutoUpdateScheduleState {
  try {
    const raw = localStorage.getItem(RATE_LIST_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<AutoUpdateScheduleState>;
      if (Array.isArray(parsed.rateList)) {
        return {
          enabled12Am: typeof parsed.enabled12Am === 'boolean' ? parsed.enabled12Am : true,
          lastRunDateKey: typeof parsed.lastRunDateKey === 'string' ? parsed.lastRunDateKey : null,
          lastRunAt: typeof parsed.lastRunAt === 'string' ? parsed.lastRunAt : null,
          lastRunSummary: typeof parsed.lastRunSummary === 'string' ? parsed.lastRunSummary : null,
          rateList: parsed.rateList,
        };
      }
    }
  } catch {
    // Ignore storage read errors
  }
  return {
    enabled12Am: true,
    lastRunDateKey: null,
    lastRunAt: null,
    lastRunSummary: null,
    rateList: createDefaultRateList(),
  };
}

function loadStoredPreferences(): BenchPreferences {
  try {
    const raw = localStorage.getItem(PREFS_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<BenchPreferences>;
      const theme: ThemeMode =
        parsed.theme === 'light' || parsed.theme === 'dark' || parsed.theme === 'system'
          ? parsed.theme
          : 'system';
      return {
        theme,
        autoSync: typeof parsed.autoSync === 'boolean' ? parsed.autoSync : true,
        autoDownload: typeof parsed.autoDownload === 'boolean' ? parsed.autoDownload : true,
      };
    }
  } catch {
    // Ignore storage read errors
  }
  return { theme: 'system', autoSync: true, autoDownload: true };
}

function nowTimeStr(): string {
  return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function triggerFileDownload(url: string, filename?: string): void {
  const link = document.createElement('a');
  link.href = url;
  if (filename) {
    link.download = filename;
  }
  link.rel = 'noopener';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

export default function App() {
  const capabilities = useMemo(() => getHardwareCapabilities(), []);
  const initialPrefs = useMemo(() => loadStoredPreferences(), []);

  const [themeMode, setThemeMode] = useState<ThemeMode>(initialPrefs.theme);
  const [autoSyncEnabled, setAutoSyncEnabled] = useState(initialPrefs.autoSync);
  const [autoDownloadEnabled, setAutoDownloadEnabled] = useState(initialPrefs.autoDownload);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState<ActiveTab>('overview');
  const [connectedHardware, setConnectedHardware] = useState<ConnectedHardwareInfo | null>(null);
  const [activeProfile, setActiveProfile] = useState<PmicProfile | null>(null);
  const [railStates, setRailStates] = useState<RailRuntimeState[]>([]);
  const [registerOverrides, setRegisterOverrides] = useState<Record<string, string>>({});
  const [activeFirmwareVersion, setActiveFirmwareVersion] = useState('');
  const [vinMv, setVinMv] = useState(5000);

  const [probing, setProbing] = useState(false);
  const [probeMessage, setProbeMessage] = useState<string | null>(null);
  const [hardwareError, setHardwareError] = useState<string | null>(null);

  const [deviceManuals, setDeviceManuals] = useState<DiscoveredManual[]>([]);
  const [manuals, setManuals] = useState<DiscoveredManual[]>([]);
  const [manualsLoading, setManualsLoading] = useState(false);
  const [previewDoc, setPreviewDoc] = useState<DiscoveredManual | null>(null);

  const [firmwarePackages, setFirmwarePackages] = useState<FirmwarePackage[]>([]);
  const [uploadedFirmware, setUploadedFirmware] = useState<ParsedFirmwareImage | null>(null);
  const [flashHistory, setFlashHistory] = useState<FlashHistoryEntry[]>([]);
  const [i2cLog, setI2cLog] = useState<RegisterWriteLog[]>([]);

  const [faultScenario, setFaultScenario] = useState<DiagnosticFaultScenario>('auto');
  const [bootFaultCleared, setBootFaultCleared] = useState(false);
  const [diagnosticRunning, setDiagnosticRunning] = useState(false);
  const [diagnosticReport, setDiagnosticReport] = useState<DiagnosticReport | null>(null);

  const [autoUpdateState, setAutoUpdateState] = useState<AutoUpdateScheduleState>(() =>
    loadStoredAutoUpdateState(),
  );
  const [runningRateUpdate, setRunningRateUpdate] = useState(false);

  const [securityStatus, setSecurityStatus] = useState<SecurityStatusSummary>(DEFAULT_SECURITY_STATUS);
  const [securityReady, setSecurityReady] = useState(false);
  const [securityModalOpen, setSecurityModalOpen] = useState(false);
  const [securityBusy, setSecurityBusy] = useState(false);
  const [securityError, setSecurityError] = useState<string | null>(null);

  const hydratedRef = useRef(false);
  const suppressNextSyncRef = useRef(false);
  const telemetryTickRef = useRef(0);
  const broadcastRef = useRef<BroadcastChannel | null>(null);
  const autoUpdateRef = useRef(autoUpdateState);
  autoUpdateRef.current = autoUpdateState;

  const refreshSecurityStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/security/status', {
        headers: withSessionHeaders(),
      });
      if (res.ok) {
        const data = (await res.json()) as { security?: SecurityStatusSummary };
        if (data.security) {
          setSecurityStatus(data.security);
          return data.security;
        }
      }
    } catch {
      // Offline / dev fallback keeps default security state
    } finally {
      setSecurityReady(true);
    }
    return null;
  }, []);

  const fetchManuals = useCallback(
    async (partQuery: string, shouldAutoDownload: boolean, forDetectedDevice = false) => {
      setManualsLoading(true);
      try {
        const res = await fetch(`/api/manuals/discover?part=${encodeURIComponent(partQuery)}`, {
          headers: withSessionHeaders(),
        });
        if (res.status === 401) {
          void refreshSecurityStatus();
        }
        if (!res.ok) throw new Error('Manual discovery failed.');
        const data = (await res.json()) as { manuals?: DiscoveredManual[] };
        const list = data.manuals ?? [];

        const stamp = nowTimeStr();
        const marked = list.map((doc, idx) => {
          const triggerDownload = shouldAutoDownload && idx === 0;
          if (triggerDownload) {
            triggerFileDownload(
              doc.downloadUrl,
              `${doc.partNumber}_${doc.docType.replace(/\s+/g, '_')}.pdf`,
            );
          }
          return triggerDownload
            ? { ...doc, autoDownloaded: true, downloadedAt: stamp }
            : doc;
        });

        setManuals(marked);
        if (forDetectedDevice) {
          setDeviceManuals(marked);
        }
      } catch {
        const offlineList: DiscoveredManual[] = matchManualsForPart(partQuery).map((doc) => ({
          ...doc,
          sourceStatus: 'local-archive',
          downloadUrl: `/api/manuals/download/${encodeURIComponent(doc.id)}?part=${encodeURIComponent(doc.partNumber)}`,
          markdownUrl: `/api/manuals/download/${encodeURIComponent(doc.id)}?part=${encodeURIComponent(doc.partNumber)}&format=md`,
          previewUrl: `/api/manuals/preview/${encodeURIComponent(doc.id)}?part=${encodeURIComponent(doc.partNumber)}`,
        }));
        setManuals(offlineList);
        if (forDetectedDevice) {
          setDeviceManuals(offlineList);
        }
      } finally {
        setManualsLoading(false);
      }
    },
    [],
  );

  const fetchFirmwareCatalog = useCallback(async (partNumber: string) => {
    try {
      const res = await fetch(`/api/firmware/catalog?part=${encodeURIComponent(partNumber)}`, {
        headers: withSessionHeaders(),
      });
      if (res.ok) {
        const data = (await res.json()) as { packages?: FirmwarePackage[] };
        setFirmwarePackages(data.packages ?? matchFirmwareForPart(partNumber));
        return;
      }
    } catch {
      // Fallback to local catalog
    }
    setFirmwarePackages(matchFirmwareForPart(partNumber));
  }, []);

  const activateDetectedHardware = useCallback(
    async (hardware: ConnectedHardwareInfo, triggerAutoManuals: boolean) => {
      const profile = hardware.identified.profile;
      const initialRails = createInitialRailStates(profile);
      setConnectedHardware(hardware);
      setActiveProfile(profile);
      setRailStates(initialRails);
      setRegisterOverrides({});
      setActiveFirmwareVersion(profile.firmwareVersion);
      setVinMv(profile.nominalVinMv);
      setUploadedFirmware(null);
      setHardwareError(null);
      setBootFaultCleared(false);
      setFaultScenario('auto');
      setDiagnosticReport(
        runPmicDiagnostics({
          profile,
          railStates: initialRails,
          registerOverrides: {},
          activeFirmwareVersion: profile.firmwareVersion,
          vinMv: profile.nominalVinMv,
          faultScenario: 'auto',
          bootFaultCleared: false,
        }),
      );

      setI2cLog((prev) => [
        {
          id: `${Date.now()}-id`,
          timestamp: nowTimeStr(),
          i2cAddr: hardware.identified.i2cAddr,
          regAddr: profile.deviceIdReg,
          value: hardware.identified.deviceIdHex,
          operation: 'READ',
          note: `Identified ${profile.partNumber} (${hardware.transport})`,
        },
        ...prev,
      ]);

      const isConsumer = Boolean(profile.deviceCategory && profile.deviceCategory !== 'pmic');
      const displayLabel = profile.displayName ?? profile.partNumber;

      setProbeMessage(
        isConsumer
          ? `Detected ${displayLabel} (${profile.busProtocol ?? hardware.transport}).${
              triggerAutoManuals ? ' Fetching & downloading manuals...' : ''
            }`
          : `Detected ${profile.partNumber} at I2C ${hardware.identified.i2cAddr} via ${hardware.transport}.${
              triggerAutoManuals ? ' Fetching & downloading manuals...' : ''
            }`,
      );

      await Promise.all([
        fetchManuals(profile.partNumber, triggerAutoManuals, true),
        fetchFirmwareCatalog(profile.partNumber),
      ]);

      setProbeMessage(
        isConsumer
          ? `Detected ${displayLabel} (${hardware.vendorIdHex}:${hardware.productIdHex})${
              triggerAutoManuals ? ' · Service manual PDF auto-downloaded.' : '.'
            }`
          : `Detected ${profile.partNumber} (${hardware.identified.i2cAddr})${
              triggerAutoManuals ? ' · Datasheet PDF auto-downloaded.' : '.'
            }`,
      );
    },
    [fetchFirmwareCatalog, fetchManuals],
  );

  const buildCurrentSnapshot = useCallback((): BenchSyncSnapshot => {
    return {
      partNumber: activeProfile?.partNumber ?? null,
      transport: connectedHardware?.transport ?? null,
      railStates,
      registerOverrides,
      activeFirmwareVersion,
      vinMv,
      bootFaultCleared,
      flashHistory,
      i2cLog,
      deviceManuals,
      updatedAt: new Date().toISOString(),
    };
  }, [
    activeFirmwareVersion,
    activeProfile,
    bootFaultCleared,
    connectedHardware,
    deviceManuals,
    flashHistory,
    i2cLog,
    railStates,
    registerOverrides,
    vinMv,
  ]);

  const pushBenchSync = useCallback(
    async (explicitSnapshot?: BenchSyncSnapshot) => {
      const snapshot = explicitSnapshot ?? buildCurrentSnapshot();
      try {
        localStorage.setItem(STATE_STORAGE_KEY, serializeBenchSnapshot(snapshot));
      } catch {
        // Ignore storage quota errors
      }
      try {
        broadcastRef.current?.postMessage({ type: 'state', snapshot });
      } catch {
        // Ignore channel errors
      }
      try {
        const res = await fetch('/api/sync/state', {
          method: 'POST',
          headers: withSessionHeaders({ 'Content-Type': 'application/json' }),
          body: JSON.stringify({ state: snapshot }),
        });
        if (res.ok) {
          setLastSyncedAt(nowTimeStr());
          return;
        }
      } catch {
        // Fallback to local sync timestamp
      }
      setLastSyncedAt(nowTimeStr());
    },
    [buildCurrentSnapshot],
  );

  const hydrateFromSnapshot = useCallback(
    async (snapshot: BenchSyncSnapshot) => {
      suppressNextSyncRef.current = true;
      if (!snapshot.partNumber) {
        setConnectedHardware(null);
        setActiveProfile(null);
        setRailStates([]);
        setRegisterOverrides({});
        setActiveFirmwareVersion('');
        setDeviceManuals([]);
        setDiagnosticReport(null);
        setBootFaultCleared(false);
        setProbeMessage(null);
        return;
      }

      const benchHw = createBenchHardwareAttach(snapshot.partNumber);
      const profile = benchHw.identified.profile;
      const restoredRails =
        snapshot.railStates.length > 0 ? snapshot.railStates : createInitialRailStates(profile);
      const restoredFw = snapshot.activeFirmwareVersion || profile.firmwareVersion;
      const restoredVin = snapshot.vinMv || profile.nominalVinMv;

      setConnectedHardware(benchHw);
      setActiveProfile(profile);
      setRailStates(restoredRails);
      setRegisterOverrides(snapshot.registerOverrides);
      setActiveFirmwareVersion(restoredFw);
      setVinMv(restoredVin);
      setBootFaultCleared(snapshot.bootFaultCleared);
      setFlashHistory(snapshot.flashHistory);
      setI2cLog(snapshot.i2cLog);
      setUploadedFirmware(null);
      setHardwareError(null);
      setDiagnosticReport(
        runPmicDiagnostics({
          profile,
          railStates: restoredRails,
          registerOverrides: snapshot.registerOverrides,
          activeFirmwareVersion: restoredFw,
          vinMv: restoredVin,
          faultScenario: 'auto',
          bootFaultCleared: snapshot.bootFaultCleared,
        }),
      );
      setProbeMessage(`Restored synced ${profile.displayName ?? profile.partNumber} (${benchHw.identified.i2cAddr}) bench state.`);
      setLastSyncedAt(nowTimeStr());

      await fetchFirmwareCatalog(profile.partNumber);
      if (snapshot.deviceManuals.length > 0) {
        setDeviceManuals(snapshot.deviceManuals);
        setManuals(snapshot.deviceManuals);
      } else {
        await fetchManuals(profile.partNumber, false, true);
      }
    },
    [fetchFirmwareCatalog, fetchManuals],
  );

  // Apply Dark / Light / System class to <html> and persist preferences
  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const applyThemeClass = () => {
      const dark = resolveIsDark(themeMode, media.matches);
      document.documentElement.classList.toggle('dark', dark);
    };
    applyThemeClass();

    const onMediaChange = () => {
      if (themeMode === 'system') applyThemeClass();
    };
    media.addEventListener('change', onMediaChange);

    const prefs: BenchPreferences = {
      theme: themeMode,
      autoSync: autoSyncEnabled,
      autoDownload: autoDownloadEnabled,
    };
    try {
      localStorage.setItem(PREFS_STORAGE_KEY, JSON.stringify(prefs));
    } catch {
      // Ignore storage errors
    }
    try {
      broadcastRef.current?.postMessage({ type: 'prefs', prefs });
    } catch {
      // Ignore channel errors
    }

    return () => {
      media.removeEventListener('change', onMediaChange);
    };
  }, [autoDownloadEnabled, autoSyncEnabled, themeMode]);

  // Initial load: manuals index, authorized USB scan, and synced bench hydration
  useEffect(() => {
    let active = true;

    async function bootstrap() {
      const sec = await refreshSecurityStatus();
      if (!active) return;
      if (sec?.isLocked) {
        hydratedRef.current = true;
        return;
      }

      const physicalHw = await scanAuthorizedHardware();
      if (!active) return;

      if (physicalHw) {
        hydratedRef.current = true;
        await activateDetectedHardware(physicalHw, autoDownloadEnabled);
        return;
      }

      if (autoSyncEnabled) {
        const localSnap = deserializeBenchSnapshot(localStorage.getItem(STATE_STORAGE_KEY));
        let serverSnap: BenchSyncSnapshot | null = null;
        try {
          const res = await fetch('/api/sync/state', {
            headers: withSessionHeaders(),
          });
          if (res.ok) {
            const data = (await res.json()) as { state?: unknown };
            if (data.state) {
              serverSnap = deserializeBenchSnapshot(JSON.stringify(data.state));
            }
          }
        } catch {
          // Use local snapshot when offline
        }

        if (!active) return;
        const chosenSnap =
          localSnap && serverSnap
            ? new Date(serverSnap.updatedAt).getTime() > new Date(localSnap.updatedAt).getTime()
              ? serverSnap
              : localSnap
            : serverSnap ?? localSnap;

        if (chosenSnap && chosenSnap.partNumber) {
          await hydrateFromSnapshot(chosenSnap);
          hydratedRef.current = true;
          return;
        }
      }

      await fetchManuals('', false);
      if (active) {
        hydratedRef.current = true;
      }
    }

    void bootstrap();
    return () => {
      active = false;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Cross-tab BroadcastChannel + storage event listener
  useEffect(() => {
    const channel =
      typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel(SYNC_CHANNEL_NAME) : null;
    broadcastRef.current = channel;

    const handleChannelMessage = (ev: MessageEvent) => {
      const data = ev.data as
        | { type: 'prefs'; prefs?: BenchPreferences }
        | { type: 'state'; snapshot?: BenchSyncSnapshot }
        | undefined;
      if (!data) return;
      if (data.type === 'prefs' && data.prefs) {
        setThemeMode(data.prefs.theme);
        setAutoSyncEnabled(data.prefs.autoSync);
        setAutoDownloadEnabled(data.prefs.autoDownload);
      } else if (data.type === 'state' && data.snapshot && autoSyncEnabled) {
        void hydrateFromSnapshot(data.snapshot);
      }
    };

    channel?.addEventListener('message', handleChannelMessage);

    const handleStorage = (ev: StorageEvent) => {
      if (ev.key === PREFS_STORAGE_KEY && ev.newValue) {
        try {
          const parsed = JSON.parse(ev.newValue) as Partial<BenchPreferences>;
          if (parsed.theme === 'light' || parsed.theme === 'dark' || parsed.theme === 'system') {
            setThemeMode(parsed.theme);
          }
          if (typeof parsed.autoSync === 'boolean') setAutoSyncEnabled(parsed.autoSync);
          if (typeof parsed.autoDownload === 'boolean') setAutoDownloadEnabled(parsed.autoDownload);
        } catch {
          // Ignore malformed storage payload
        }
      } else if (ev.key === STATE_STORAGE_KEY && ev.newValue && autoSyncEnabled) {
        const snap = deserializeBenchSnapshot(ev.newValue);
        if (snap) {
          void hydrateFromSnapshot(snap);
        }
      }
    };

    window.addEventListener('storage', handleStorage);
    return () => {
      channel?.removeEventListener('message', handleChannelMessage);
      channel?.close();
      broadcastRef.current = null;
      window.removeEventListener('storage', handleStorage);
    };
  }, [autoSyncEnabled, hydrateFromSnapshot]);

  // Auto-sync live telemetry polling every 1.5s while connected
  useEffect(() => {
    if (!autoSyncEnabled || !connectedHardware || !activeProfile) return;
    const timer = window.setInterval(() => {
      telemetryTickRef.current += 1;
      setRailStates((prev) => applyTelemetrySyncTick(prev, telemetryTickRef.current));
    }, 1500);
    return () => window.clearInterval(timer);
  }, [activeProfile, autoSyncEnabled, connectedHardware]);

  // Persist & sync bench snapshot when state changes while auto-sync is enabled
  useEffect(() => {
    if (!hydratedRef.current || !autoSyncEnabled) return;
    if (suppressNextSyncRef.current) {
      suppressNextSyncRef.current = false;
      return;
    }
    const timer = window.setTimeout(() => {
      void pushBenchSync();
    }, 180);
    return () => window.clearTimeout(timer);
  }, [
    autoSyncEnabled,
    activeFirmwareVersion,
    activeProfile,
    bootFaultCleared,
    connectedHardware,
    deviceManuals,
    flashHistory,
    i2cLog,
    pushBenchSync,
    railStates,
    registerOverrides,
    vinMv,
  ]);

  // Subscribe to physical USB-C OTG plug/unplug events
  useEffect(() => {
    const unsubscribe = subscribePlugEvents(
      (hw) => {
        void activateDetectedHardware(hw, autoDownloadEnabled);
      },
      () => {
        setConnectedHardware(null);
        setActiveProfile(null);
        setRailStates([]);
        setRegisterOverrides({});
        setDeviceManuals([]);
        setDiagnosticReport(null);
        setProbeMessage('USB-C OTG device unplugged.');
      },
    );
    return unsubscribe;
  }, [activateDetectedHardware, autoDownloadEnabled]);

  const persistAutoUpdateState = useCallback((next: AutoUpdateScheduleState) => {
    setAutoUpdateState(next);
    try {
      localStorage.setItem(RATE_LIST_STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Ignore storage write errors
    }
    void fetch('/api/updates/rate-list', {
      method: 'POST',
      headers: withSessionHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({
        enabled12Am: next.enabled12Am,
        rateList: next.rateList,
      }),
    }).catch(() => {});
  }, []);

  const handleRunRateListUpdateNow = useCallback(
    async (triggeredByMidnight = false) => {
      setRunningRateUpdate(true);
      const current = autoUpdateRef.current;
      let nextState: AutoUpdateScheduleState | null = null;

      try {
        const res = await fetch('/api/updates/run', {
          method: 'POST',
          headers: withSessionHeaders({ 'Content-Type': 'application/json' }),
          body: JSON.stringify({ rateList: current.rateList }),
        });
        if (res.ok) {
          const data = (await res.json()) as { schedule?: AutoUpdateScheduleState };
          if (data.schedule) {
            nextState = {
              ...data.schedule,
              enabled12Am: current.enabled12Am,
              lastRunSummary: triggeredByMidnight
                ? `12:00 AM Auto-Run: ${data.schedule.lastRunSummary ?? 'Update sweep complete.'}`
                : data.schedule.lastRunSummary,
            };
          }
        }
      } catch {
        // Offline fallback below
      }

      if (!nextState) {
        const res = executeRateListUpdateSweep(current.rateList, new Date());
        nextState = {
          ...current,
          lastRunDateKey: res.dateKey,
          lastRunAt: res.timestampIso,
          lastRunSummary: triggeredByMidnight ? `12:00 AM Auto-Run: ${res.summary}` : res.summary,
          rateList: res.updatedList,
        };
      }

      setAutoUpdateState(nextState);
      try {
        localStorage.setItem(RATE_LIST_STORAGE_KEY, JSON.stringify(nextState));
      } catch {
        // Ignore storage write errors
      }

      if (activeProfile) {
        await Promise.all([
          fetchManuals(activeProfile.partNumber, false, true),
          fetchFirmwareCatalog(activeProfile.partNumber),
        ]);
      } else {
        await fetchManuals('', false);
      }

      setRunningRateUpdate(false);
    },
    [activeProfile, fetchFirmwareCatalog, fetchManuals],
  );

  // Hydrate 12:00 AM Rate List schedule from backend & check midnight trigger every 60s
  useEffect(() => {
    if (!securityReady || securityStatus.isLocked) return;
    let active = true;
    fetch('/api/updates/rate-list', { headers: withSessionHeaders() })
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { schedule?: AutoUpdateScheduleState } | null) => {
        if (!active || !data?.schedule) return;
        const localStored = loadStoredAutoUpdateState();
        // Prefer local user edits if localStorage had a custom rate list; otherwise take backend schedule
        const hasLocal = Boolean(localStorage.getItem(RATE_LIST_STORAGE_KEY));
        if (!hasLocal) {
          setAutoUpdateState(data.schedule);
          try {
            localStorage.setItem(RATE_LIST_STORAGE_KEY, JSON.stringify(data.schedule));
          } catch {
            // Ignore
          }
        } else if (data.schedule.lastRunAt && (!localStored.lastRunAt || data.schedule.lastRunAt > localStored.lastRunAt)) {
          setAutoUpdateState({
            ...localStored,
            lastRunDateKey: data.schedule.lastRunDateKey,
            lastRunAt: data.schedule.lastRunAt,
            lastRunSummary: data.schedule.lastRunSummary,
            rateList: localStored.rateList.map((entry) => {
              const serverMatch = data.schedule?.rateList.find((s) => s.id === entry.id);
              return serverMatch ? { ...entry, lastUpdatedAt: serverMatch.lastUpdatedAt, status: serverMatch.status } : entry;
            }),
          });
        }
      })
      .catch(() => {});

    const checkMidnight = () => {
      const now = new Date();
      if (now.getHours() === 0 && now.getMinutes() <= 5 && shouldRunMidnightUpdate(autoUpdateRef.current, now)) {
        void handleRunRateListUpdateNow(true);
      }
    };
    checkMidnight();
    const timer = window.setInterval(checkMidnight, 60_000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [handleRunRateListUpdateNow, securityReady, securityStatus.isLocked]);

  const handleConnectUsb = async () => {
    setProbing(true);
    setHardwareError(null);
    const { hardware, error } = await requestInteractiveUsbOrOtgConnection();
    if (hardware) {
      await activateDetectedHardware(hardware, autoDownloadEnabled);
    } else if (error) {
      setHardwareError(error);
    }
    setProbing(false);
  };

  const handleConnectSerialOrHid = async () => {
    setProbing(true);
    setHardwareError(null);
    const { hardware, error } = await requestInteractiveSerialOrHidConnection();
    if (hardware) {
      await activateDetectedHardware(hardware, autoDownloadEnabled);
    } else if (error) {
      setHardwareError(error);
    }
    setProbing(false);
  };

  const handleConnectBluetooth = async () => {
    setProbing(true);
    setHardwareError(null);
    const { hardware, error } = await requestInteractiveBluetoothConnection();
    if (hardware) {
      await activateDetectedHardware(hardware, autoDownloadEnabled);
    } else if (error) {
      setHardwareError(error);
    }
    setProbing(false);
  };

  const handlePlugBenchProfile = async (partNumber: string) => {
    setProbing(true);
    setHardwareError(null);
    setProbeMessage(`Scanning USB-C OTG / HID bus for ${partNumber}...`);
    await new Promise((r) => setTimeout(r, 240));
    const benchHw = createBenchHardwareAttach(partNumber);
    await activateDetectedHardware(benchHw, autoDownloadEnabled);
    setProbing(false);
  };

  const handleRescan = async () => {
    if (!activeProfile) return;
    setProbing(true);
    await new Promise((r) => setTimeout(r, 200));
    const benchHw = createBenchHardwareAttach(activeProfile.partNumber);
    await activateDetectedHardware(benchHw, autoDownloadEnabled);
    setProbing(false);
  };

  const handleDisconnect = () => {
    setConnectedHardware(null);
    setActiveProfile(null);
    setRailStates([]);
    setRegisterOverrides({});
    setProbeMessage(null);
    setHardwareError(null);
    setDeviceManuals([]);
    setDiagnosticReport(null);
    setBootFaultCleared(false);
    setFaultScenario('auto');
    void fetchManuals('', false);
    if (autoSyncEnabled) {
      void pushBenchSync({
        partNumber: null,
        transport: null,
        railStates: [],
        registerOverrides: {},
        activeFirmwareVersion: '',
        vinMv: 5000,
        bootFaultCleared: false,
        flashHistory: [],
        i2cLog: [],
        deviceManuals: [],
        updatedAt: new Date().toISOString(),
      });
    }
  };

  const handleUpdateRailVoltage = (railId: string, nextMv: number) => {
    if (!activeProfile || !connectedHardware) return;
    const railDef = activeProfile.rails.find((r) => r.id === railId);
    if (!railDef) return;

    const clamped = Math.min(railDef.maxMv, Math.max(railDef.minMv, nextMv));
    const nextRails = railStates.map((r) => (r.id === railId ? { ...r, voltageMv: clamped } : r));
    setRailStates(nextRails);

    const code = millivoltsToDacCode(clamped, railDef.minMv, railDef.stepMv, railDef.maxMv);
    const hexVal = formatHexByte(code);
    const normReg = `0x${railDef.regAddr.replace(/^0x/i, '').padStart(3, '0').toUpperCase()}`;
    const nextOverrides = { ...registerOverrides, [normReg]: hexVal };

    setRegisterOverrides(nextOverrides);
    setI2cLog((prev) => [
      {
        id: `${Date.now()}-${railId}`,
        timestamp: nowTimeStr(),
        i2cAddr: connectedHardware.identified.i2cAddr,
        regAddr: normReg,
        value: hexVal,
        operation: 'WRITE',
        note: `${railId} -> ${clamped} mV`,
      },
      ...prev.slice(0, 29),
    ]);

    if (diagnosticReport) {
      setDiagnosticReport(
        runPmicDiagnostics({
          profile: activeProfile,
          railStates: nextRails,
          registerOverrides: nextOverrides,
          activeFirmwareVersion,
          vinMv,
          faultScenario,
          bootFaultCleared,
        }),
      );
    }
  };

  const handleToggleRailEnable = (railId: string) => {
    if (!activeProfile || !connectedHardware) return;
    const railDef = activeProfile.rails.find((r) => r.id === railId);
    if (!railDef) return;

    let nextEnabled = true;
    const nextRails = railStates.map((r) => {
      if (r.id === railId) {
        nextEnabled = !r.enabled;
        return { ...r, enabled: nextEnabled };
      }
      return r;
    });
    setRailStates(nextRails);

    const normReg = `0x${railDef.enableReg.replace(/^0x/i, '').padStart(3, '0').toUpperCase()}`;
    const hexVal = nextEnabled ? '0x01' : '0x00';
    const nextOverrides = { ...registerOverrides, [normReg]: hexVal };
    setRegisterOverrides(nextOverrides);
    setI2cLog((prev) => [
      {
        id: `${Date.now()}-en-${railId}`,
        timestamp: nowTimeStr(),
        i2cAddr: connectedHardware.identified.i2cAddr,
        regAddr: normReg,
        value: hexVal,
        operation: 'WRITE',
        note: `${railId} ${nextEnabled ? 'Enabled' : 'Disabled'}`,
      },
      ...prev.slice(0, 29),
    ]);

    if (diagnosticReport) {
      setDiagnosticReport(
        runPmicDiagnostics({
          profile: activeProfile,
          railStates: nextRails,
          registerOverrides: nextOverrides,
          activeFirmwareVersion,
          vinMv,
          faultScenario,
          bootFaultCleared,
        }),
      );
    }
  };

  const handleManualI2cCommand = (operation: 'READ' | 'WRITE', regAddr: string, valueHex?: string) => {
    if (!activeProfile || !connectedHardware) return;
    const regDef = activeProfile.registers.find(
      (r) => `0x${r.addr.replace(/^0x/i, '').padStart(3, '0').toUpperCase()}` === regAddr,
    );

    if (operation === 'WRITE' && valueHex) {
      const nextOverrides = { ...registerOverrides, [regAddr]: valueHex };
      setRegisterOverrides(nextOverrides);
      setI2cLog((prev) => [
        {
          id: `${Date.now()}-wr`,
          timestamp: nowTimeStr(),
          i2cAddr: connectedHardware.identified.i2cAddr,
          regAddr,
          value: valueHex,
          operation: 'WRITE',
          note: regDef ? regDef.name : 'Direct I2C write',
        },
        ...prev.slice(0, 29),
      ]);
      if (diagnosticReport) {
        setDiagnosticReport(
          runPmicDiagnostics({
            profile: activeProfile,
            railStates,
            registerOverrides: nextOverrides,
            activeFirmwareVersion,
            vinMv,
            faultScenario,
            bootFaultCleared,
          }),
        );
      }
      return;
    }

    const currentVal = registerOverrides[regAddr] ?? regDef?.defaultVal ?? '0x00';
    setI2cLog((prev) => [
      {
        id: `${Date.now()}-rd`,
        timestamp: nowTimeStr(),
        i2cAddr: connectedHardware.identified.i2cAddr,
        regAddr,
        value: currentVal,
        operation: 'READ',
        note: regDef ? regDef.name : 'Direct I2C read',
      },
      ...prev.slice(0, 29),
    ]);
  };

  const handleUploadFirmwareFile = async (file: File) => {
    const buffer = await file.arrayBuffer();
    const parsed = parseFirmwareUpload(file.name, new Uint8Array(buffer));
    setUploadedFirmware(parsed);
  };

  const handleFlashFirmware = async (target: FirmwarePackage | ParsedFirmwareImage) => {
    if (!activeProfile || !connectedHardware) return;

    const isPackage = 'patchRegisters' in target;
    const patches = isPackage ? target.patchRegisters : target.registerPatches;
    const newVersion = isPackage ? target.version : `CUSTOM-${target.crc32.slice(2, 8)}`;
    const imageName = isPackage ? target.name : target.fileName;
    const crc32 = target.crc32;

    const nextOverrides: Record<string, string> = { ...registerOverrides };
    const newLogs: RegisterWriteLog[] = [];
    const stamp = nowTimeStr();

    for (const patch of patches) {
      const normReg = `0x${patch.addr.replace(/^0x/i, '').padStart(3, '0').toUpperCase()}`;
      nextOverrides[normReg] = patch.value;
      newLogs.push({
        id: `${Date.now()}-fw-${normReg}`,
        timestamp: stamp,
        i2cAddr: connectedHardware.identified.i2cAddr,
        regAddr: normReg,
        value: patch.value,
        operation: 'FLASH',
        note: patch.note,
      });
    }

    const nextRails =
      isPackage && target.railOverrides
        ? railStates.map((rail) => {
            const ov = target.railOverrides?.[rail.id];
            if (!ov) return rail;
            return {
              ...rail,
              voltageMv: ov.mv ?? rail.voltageMv,
              enabled: ov.enabled ?? rail.enabled,
            };
          })
        : railStates;

    setRegisterOverrides(nextOverrides);
    setActiveFirmwareVersion(newVersion);
    setI2cLog((prev) => [...newLogs, ...prev].slice(0, 30));
    if (isPackage && target.railOverrides) {
      setRailStates(nextRails);
    }

    if (diagnosticReport) {
      setDiagnosticReport(
        runPmicDiagnostics({
          profile: activeProfile,
          railStates: nextRails,
          registerOverrides: nextOverrides,
          activeFirmwareVersion: newVersion,
          vinMv,
          faultScenario,
          bootFaultCleared,
        }),
      );
    }

    setFlashHistory((prev) => [
      {
        id: `${Date.now()}-flash`,
        timestamp: stamp,
        targetPart: isPackage && target.target === 'USB-C OTG Bridge' ? 'OTG Bridge' : activeProfile.partNumber,
        imageName,
        version: newVersion,
        crc32,
        status: 'verified',
      },
      ...prev,
    ]);
  };

  const handleBackupCurrentNvm = () => {
    if (!activeProfile) return;
    const lines: string[] = [];
    for (const reg of activeProfile.registers) {
      const normKey = `0x${reg.addr.replace(/^0x/i, '').padStart(3, '0').toUpperCase()}`;
      const valHex = registerOverrides[normKey] ?? reg.defaultVal;
      const addr = parseInt(normKey, 16) & 0xffff;
      const val = parseInt(valHex, 16) & 0xff;
      const hi = (addr >> 8) & 0xff;
      const lo = addr & 0xff;
      const sum = (0x01 + hi + lo + val) & 0xff;
      const cksum = ((~sum + 1) & 0xff).toString(16).toUpperCase().padStart(2, '0');
      lines.push(
        `:01${addr.toString(16).toUpperCase().padStart(4, '0')}00${val.toString(16).toUpperCase().padStart(2, '0')}${cksum}`,
      );
    }
    lines.push(':00000001FF');

    const blob = new Blob([lines.join('\n') + '\n'], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    triggerFileDownload(url, `${activeProfile.partNumber}_NVM_Backup.hex`);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const handleDownloadManual = (doc: DiscoveredManual, format: 'pdf' | 'md' = 'pdf') => {
    const url = format === 'md' ? doc.markdownUrl : doc.downloadUrl;
    const ext = format === 'md' ? 'md' : 'pdf';
    triggerFileDownload(url, `${doc.partNumber}_${doc.docType.replace(/\s+/g, '_')}.${ext}`);

    const stamp = nowTimeStr();
    setManuals((prev) =>
      prev.map((m) => (m.id === doc.id ? { ...m, autoDownloaded: true, downloadedAt: stamp } : m)),
    );
    setDeviceManuals((prev) =>
      prev.map((m) => (m.id === doc.id ? { ...m, autoDownloaded: true, downloadedAt: stamp } : m)),
    );
  };

  const handleRunDiagnostics = useCallback(
    async (overrideScenario?: DiagnosticFaultScenario) => {
      if (!activeProfile) return;
      const scenarioToRun = overrideScenario ?? faultScenario;
      setDiagnosticRunning(true);
      await new Promise((r) => setTimeout(r, 220));
      setDiagnosticReport(
        runPmicDiagnostics({
          profile: activeProfile,
          railStates,
          registerOverrides,
          activeFirmwareVersion,
          vinMv,
          faultScenario: scenarioToRun,
          bootFaultCleared,
        }),
      );
      setDiagnosticRunning(false);
    },
    [
      activeFirmwareVersion,
      activeProfile,
      bootFaultCleared,
      faultScenario,
      railStates,
      registerOverrides,
      vinMv,
    ],
  );

  const applySoftwareFixes = (findingsToFix: DiagnosticFinding[]) => {
    if (!activeProfile || !connectedHardware) return;

    const nextOverrides: Record<string, string> = { ...registerOverrides };
    let nextRails = [...railStates];
    let nextBootCleared = bootFaultCleared;
    const newLogs: RegisterWriteLog[] = [];
    const stamp = nowTimeStr();

    for (const finding of findingsToFix) {
      if (finding.repairType !== 'software') continue;
      if (finding.id === 'diag-fault-log') {
        nextBootCleared = true;
      }
      for (const wr of finding.repairRegisterWrites ?? []) {
        const normReg = `0x${wr.addr.replace(/^0x/i, '').padStart(3, '0').toUpperCase()}`;
        nextOverrides[normReg] = wr.value;
        newLogs.push({
          id: `${Date.now()}-fix-${normReg}-${Math.random().toString(36).slice(2, 6)}`,
          timestamp: stamp,
          i2cAddr: connectedHardware.identified.i2cAddr,
          regAddr: normReg,
          value: wr.value,
          operation: 'WRITE',
          note: `1-Touch Repair: ${wr.note}`,
        });
      }
      for (const ru of finding.repairRailUpdates ?? []) {
        nextRails = nextRails.map((r) =>
          r.id === ru.railId
            ? {
                ...r,
                voltageMv: ru.voltageMv ?? r.voltageMv,
                enabled: ru.enabled ?? r.enabled,
              }
            : r,
        );
      }
    }

    setRegisterOverrides(nextOverrides);
    setRailStates(nextRails);
    setBootFaultCleared(nextBootCleared);
    if (newLogs.length > 0) {
      setI2cLog((prev) => [...newLogs, ...prev].slice(0, 30));
    }

    setDiagnosticReport(
      runPmicDiagnostics({
        profile: activeProfile,
        railStates: nextRails,
        registerOverrides: nextOverrides,
        activeFirmwareVersion,
        vinMv,
        faultScenario,
        bootFaultCleared: nextBootCleared,
      }),
    );
  };

  const handleOneTouchRepair = (finding: DiagnosticFinding) => {
    applySoftwareFixes([finding]);
  };

  const handleRepairAllSoftware = () => {
    if (!diagnosticReport) return;
    const softwareList = diagnosticReport.findings.filter((f) => f.repairType === 'software');
    applySoftwareFixes(softwareList);
  };

  const handleSaveGamepadCalibration = (summary: {
    lxByte: string;
    lyByte: string;
    rxByte: string;
    ryByte: string;
    dzByte: string;
    leftDeadzonePct: number;
    rightDeadzonePct: number;
  }) => {
    const stamp = nowTimeStr();
    const addr = connectedHardware?.identified.i2cAddr ?? '0x4A';
    setRegisterOverrides((prev) => ({
      ...prev,
      '0x024': summary.lxByte,
      '0x025': summary.lyByte,
      '0x026': summary.rxByte,
      '0x027': summary.ryByte,
      '0x028': summary.dzByte,
    }));
    setI2cLog((prev) =>
      [
        {
          id: `${Date.now()}-cal`,
          timestamp: stamp,
          i2cAddr: addr,
          regAddr: '0x024..0x028',
          value: summary.dzByte,
          operation: 'WRITE' as const,
          note: `Saved Stick Center Trims & Deadzone (L ${summary.leftDeadzonePct}% / R ${summary.rightDeadzonePct}%)`,
        },
        ...prev,
      ].slice(0, 30),
    );
  };

  // Anti-Copy & Source Inspection Deterrent
  useEffect(() => {
    if (!securityStatus.antiCopyEnabled) return;

    const handleContextMenu = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) {
        return;
      }
      e.preventDefault();
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      if ((e.ctrlKey || e.metaKey) && (key === 'u' || key === 's')) {
        e.preventDefault();
      } else if (
        e.key === 'F12' ||
        ((e.ctrlKey || e.metaKey) && e.shiftKey && (key === 'i' || key === 'j' || key === 'c'))
      ) {
        e.preventDefault();
      }
    };

    window.addEventListener('contextmenu', handleContextMenu);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('contextmenu', handleContextMenu);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [securityStatus.antiCopyEnabled]);

  const handleUnlockApp = async (passphrase: string) => {
    setSecurityBusy(true);
    setSecurityError(null);
    try {
      const res = await fetch('/api/security/unlock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ passphrase }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        token?: string;
        error?: string;
        security?: SecurityStatusSummary;
      };
      if (data.security) setSecurityStatus(data.security);
      if (res.ok && data.ok) {
        if (data.token) setStoredSessionToken(data.token);
        setSecurityError(null);
        void fetchManuals(activeProfile?.partNumber ?? '', false, Boolean(activeProfile));
      } else {
        setSecurityError(data.error ?? 'Incorrect passphrase.');
      }
    } catch {
      setSecurityError('Unable to reach local security verification endpoint.');
    } finally {
      setSecurityBusy(false);
    }
  };

  const handleSaveSecurityConfig = async (payload: {
    ownerLabel: string;
    lockEnabled: boolean;
    newPassphrase?: string;
    allowedHosts: string;
    antiCopyEnabled: boolean;
    blockScrapers: boolean;
  }): Promise<boolean> => {
    setSecurityBusy(true);
    setSecurityError(null);
    try {
      const res = await fetch('/api/security/configure', {
        method: 'POST',
        headers: withSessionHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify(payload),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        token?: string;
        error?: string;
        security?: SecurityStatusSummary;
      };
      if (!res.ok || !data.ok) {
        setSecurityError(data.error ?? 'Failed to save security policy.');
        if (res.status === 401) void refreshSecurityStatus();
        return false;
      }
      if (data.token) setStoredSessionToken(data.token);
      if (data.security) setSecurityStatus(data.security);
      return true;
    } catch {
      setSecurityError('Network error while saving protection rules.');
      return false;
    } finally {
      setSecurityBusy(false);
    }
  };

  const handleLockNow = async () => {
    setSecurityBusy(true);
    setSecurityError(null);
    setStoredSessionToken(null);
    try {
      const res = await fetch('/api/security/lock', {
        method: 'POST',
        headers: withSessionHeaders(),
      });
      if (res.ok) {
        const data = (await res.json()) as { security?: SecurityStatusSummary };
        if (data.security) setSecurityStatus(data.security);
      }
      setSecurityModalOpen(false);
    } finally {
      setSecurityBusy(false);
    }
  };

  const handleRevokeAllSessions = async () => {
    setSecurityBusy(true);
    setSecurityError(null);
    setStoredSessionToken(null);
    try {
      const res = await fetch('/api/security/revoke-all', {
        method: 'POST',
        headers: withSessionHeaders(),
      });
      if (res.ok) {
        const data = (await res.json()) as { security?: SecurityStatusSummary };
        if (data.security) setSecurityStatus(data.security);
      }
      setSecurityModalOpen(false);
    } finally {
      setSecurityBusy(false);
    }
  };

  const runtimeHostname = typeof window !== 'undefined' ? window.location.hostname : 'localhost';
  if (!isHostAllowed(runtimeHostname, securityStatus.allowedHosts)) {
    return (
      <UnauthorizedCloneScreen
        hostname={runtimeHostname}
        ownerLabel={securityStatus.ownerLabel}
        buildFingerprint={securityStatus.buildFingerprint}
      />
    );
  }

  if (securityStatus.isLocked) {
    return (
      <OwnerLockScreen
        ownerLabel={securityStatus.ownerLabel}
        buildFingerprint={securityStatus.buildFingerprint}
        lockoutRemainingSec={securityStatus.lockoutRemainingSec}
        error={securityError}
        busy={securityBusy}
        onUnlock={handleUnlockApp}
      />
    );
  }

  return (
    <div
      className={`min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 pb-20 lg:pb-10 transition-colors ${
        securityStatus.antiCopyEnabled ? 'select-none' : ''
      }`}
    >
      <TopNavBar
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        isConnected={Boolean(connectedHardware)}
        probing={probing}
        securityLocked={securityStatus.isLocked}
        lockArmed={securityStatus.lockEnabled}
        onConnectUsb={handleConnectUsb}
        onDisconnect={handleDisconnect}
        onOpenSecurity={() => {
          setSecurityError(null);
          void refreshSecurityStatus();
          setSecurityModalOpen(true);
        }}
      />

      <main className="max-w-7xl mx-auto px-4 lg:px-6 py-5 lg:py-6">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left Control Column (on mobile, visible only on Overview and ordered below active PMIC stage when connected) */}
          <div
            className={`lg:col-span-4 ${
              activeTab === 'overview'
                ? connectedHardware
                  ? 'order-2 lg:order-1'
                  : 'order-1'
                : 'hidden lg:block lg:order-1'
            }`}
          >
            <DeviceConnectionPanel
              capabilities={capabilities}
              connectedHardware={connectedHardware}
              activeProfile={activeProfile}
              activeFirmwareVersion={activeFirmwareVersion}
              probing={probing}
              probeMessage={probeMessage}
              hardwareError={hardwareError}
              autoDownloadEnabled={autoDownloadEnabled}
              autoSyncEnabled={autoSyncEnabled}
              lastSyncedAt={lastSyncedAt}
              themeMode={themeMode}
              onChangeThemeMode={setThemeMode}
              onToggleAutoDownload={() => setAutoDownloadEnabled((v) => !v)}
              onToggleAutoSync={() => setAutoSyncEnabled((v) => !v)}
              onSyncNow={() => void pushBenchSync()}
              onConnectUsb={handleConnectUsb}
              onConnectBluetooth={() => void handleConnectBluetooth()}
              onConnectSerialOrHid={handleConnectSerialOrHid}
              onRescan={handleRescan}
              onPlugBenchProfile={handlePlugBenchProfile}
              onDisconnect={handleDisconnect}
            />
          </div>

          {/* Right Main Stage */}
          <div
            className={`lg:col-span-8 ${
              activeTab === 'overview' && connectedHardware ? 'order-1 lg:order-2' : 'order-2 lg:order-2'
            }`}
          >
            {activeTab === 'overview' && (
              <OverviewStage
                connectedHardware={connectedHardware}
                activeProfile={activeProfile}
                railStates={railStates}
                vinMv={vinMv}
                activeFirmwareVersion={activeFirmwareVersion}
                manuals={deviceManuals.length > 0 ? deviceManuals : manuals}
                manualsLoading={manualsLoading}
                probing={probing}
                onConnectUsb={handleConnectUsb}
                onPlugBenchProfile={handlePlugBenchProfile}
                onNavigateTab={setActiveTab}
                onPreviewManual={setPreviewDoc}
              />
            )}

            {activeTab === 'rails' && (
              <RailsAndI2CStage
                activeProfile={activeProfile}
                railStates={railStates}
                registerOverrides={registerOverrides}
                i2cLog={i2cLog}
                onUpdateRailVoltage={handleUpdateRailVoltage}
                onToggleRailEnable={handleToggleRailEnable}
                onManualI2cCommand={handleManualI2cCommand}
                onConnectUsb={handleConnectUsb}
                onPlugBenchProfile={handlePlugBenchProfile}
              />
            )}

            {activeTab === 'diagnostics' && (
              <DiagnosticsStage
                capabilities={capabilities}
                connectedHardware={connectedHardware}
                activeProfile={activeProfile}
                vinMv={vinMv}
                report={diagnosticReport}
                running={diagnosticRunning}
                faultScenario={faultScenario}
                onChangeScenario={setFaultScenario}
                onRunDiagnostics={(sc) => void handleRunDiagnostics(sc)}
                onOneTouchRepair={handleOneTouchRepair}
                onRepairAllSoftware={handleRepairAllSoftware}
                onConnectUsb={handleConnectUsb}
                onConnectBluetooth={() => void handleConnectBluetooth()}
                onPlugBenchProfile={handlePlugBenchProfile}
              />
            )}

            {activeTab === 'gamepad' && (
              <GamepadCalibrationStage
                activeProfile={activeProfile}
                onSaveCalibration={handleSaveGamepadCalibration}
                onScanGamepad={() => void handleConnectSerialOrHid()}
                onPlugBenchProfile={handlePlugBenchProfile}
                onOpenRepair={() => {
                  setActiveTab('diagnostics');
                  void handleRunDiagnostics('usbc-port-hw');
                }}
              />
            )}

            {activeTab === 'firmware' && (
              <FirmwareFlashStage
                activeProfile={activeProfile}
                activeFirmwareVersion={activeFirmwareVersion}
                vinMv={vinMv}
                registerOverrides={registerOverrides}
                firmwarePackages={firmwarePackages}
                uploadedFirmware={uploadedFirmware}
                flashHistory={flashHistory}
                autoUpdateState={autoUpdateState}
                runningRateUpdate={runningRateUpdate}
                onToggleEnabled12Am={() =>
                  persistAutoUpdateState({
                    ...autoUpdateState,
                    enabled12Am: !autoUpdateState.enabled12Am,
                  })
                }
                onUpdateRateList={(nextList) =>
                  persistAutoUpdateState({
                    ...autoUpdateState,
                    rateList: nextList,
                  })
                }
                onRunRateListUpdateNow={() => handleRunRateListUpdateNow(false)}
                onUploadFirmwareFile={handleUploadFirmwareFile}
                onClearUploadedFirmware={() => setUploadedFirmware(null)}
                onFlashFirmware={handleFlashFirmware}
                onImageWriteCompleted={(entry) => {
                  const stamp = nowTimeStr();
                  setFlashHistory((prev) => [
                    {
                      id: `${Date.now()}-img`,
                      timestamp: stamp,
                      targetPart: entry.targetName,
                      imageName: entry.fileName,
                      version: entry.format,
                      crc32: entry.crc32,
                      status: 'verified',
                    },
                    ...prev,
                  ]);
                  setI2cLog((prev) =>
                    [
                      {
                        id: `${Date.now()}-img-log`,
                        timestamp: stamp,
                        i2cAddr: connectedHardware?.identified.i2cAddr ?? 'USB',
                        regAddr: 'BLOCK',
                        value: entry.crc32,
                        operation: 'FLASH' as const,
                        note: `Image Write Verified: ${entry.fileName} -> ${entry.targetName}`,
                      },
                      ...prev,
                    ].slice(0, 30),
                  );
                }}
                onBackupCurrentNvm={handleBackupCurrentNvm}
                onConnectUsb={handleConnectUsb}
                onPlugBenchProfile={handlePlugBenchProfile}
              />
            )}

            {activeTab === 'manuals' && (
              <ManualsStage
                detectedPart={activeProfile?.partNumber ?? null}
                manuals={manuals}
                loading={manualsLoading}
                onSearchManuals={(q) => void fetchManuals(q, false)}
                onPreviewManual={setPreviewDoc}
                onDownloadManual={handleDownloadManual}
              />
            )}
          </div>
        </div>
      </main>

      <footer className="max-w-7xl mx-auto px-4 lg:px-6 pt-3 text-[11px] font-mono text-slate-500 dark:text-slate-400 flex flex-wrap items-center justify-between gap-2">
        <span>{computeOwnerSealText(securityStatus.ownerLabel, securityStatus.buildFingerprint)}</span>
        <span>
          {securityStatus.lockEnabled ? 'Passphrase Lock Armed' : 'Host & Anti-Scraper Guard Active'}
        </span>
      </footer>

      <ManualReaderModal
        doc={previewDoc}
        onClose={() => setPreviewDoc(null)}
        onDownloadPdf={(doc) => handleDownloadManual(doc, 'pdf')}
      />

      <SecurityGuardModal
        open={securityModalOpen}
        security={securityStatus}
        busy={securityBusy}
        error={securityError}
        onClose={() => setSecurityModalOpen(false)}
        onSaveConfig={handleSaveSecurityConfig}
        onLockNow={handleLockNow}
        onRevokeAll={handleRevokeAllSessions}
      />

      <OfflineIndicator />
    </div>
  );
}
