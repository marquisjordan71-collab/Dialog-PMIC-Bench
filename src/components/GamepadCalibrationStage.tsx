import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  CheckCircle2,
  Crosshair,
  Gamepad2,
  RotateCcw,
  Save,
  Sliders,
  Vibrate,
  Wrench,
} from 'lucide-react';
import type { PmicProfile } from '../utils/pmicCatalog';
import {
  CIRCULARITY_SECTORS,
  DEFAULT_STICK_CALIBRATION,
  analyzeStickDrift,
  applyStickCalibration,
  buildCalibrationBytePatch,
  calibrateTriggerValue,
  computeCircularityStats,
  computePollingStats,
  getCircularitySectorIndex,
  getControllerButtonLayout,
  type StickCalibrationConfig,
} from '../utils/gamepadCalibration';

interface GamepadCalibrationStageProps {
  activeProfile: PmicProfile | null;
  onSaveCalibration: (summary: {
    lxByte: string;
    lyByte: string;
    rxByte: string;
    ryByte: string;
    dzByte: string;
    leftDeadzonePct: number;
    rightDeadzonePct: number;
  }) => void;
  onScanGamepad: () => void;
  onPlugBenchProfile: (partNumber: string) => void;
  onOpenRepair: () => void;
}

interface StickRuntimeSnapshot {
  rawX: number;
  rawY: number;
  sectors: Array<number | null>;
  restSamples: Array<{ x: number; y: number }>;
}

function emptySectors(): Array<number | null> {
  return new Array<number | null>(CIRCULARITY_SECTORS).fill(null);
}

interface StickScopeCardProps {
  title: string;
  stickKey: 'left' | 'right';
  rawX: number;
  rawY: number;
  config: StickCalibrationConfig;
  sectors: Array<number | null>;
  restSamples: Array<{ x: number; y: number }>;
  onChangeConfig: (next: StickCalibrationConfig) => void;
  onManualPosition: (x: number, y: number) => void;
  onZeroCenter: () => void;
  onResetCircularity: () => void;
}

function StickScopeCard({
  title,
  stickKey,
  rawX,
  rawY,
  config,
  sectors,
  restSamples,
  onChangeConfig,
  onManualPosition,
  onZeroCenter,
  onResetCircularity,
}: StickScopeCardProps) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const draggingRef = useRef(false);

  const sample = useMemo(() => applyStickCalibration(rawX, rawY, config), [rawX, rawY, config]);
  const circularity = useMemo(() => computeCircularityStats(sectors), [sectors]);
  const drift = useMemo(() => analyzeStickDrift(restSamples), [restSamples]);

  const radiusPx = 82;
  const cx = 110;
  const cy = 110;

  const circularityPolygonPoints = useMemo(() => {
    const pts: string[] = [];
    for (let i = 0; i < CIRCULARITY_SECTORS; i++) {
      const mag = sectors[i];
      if (mag === null) continue;
      const angle = ((i + 0.5) / CIRCULARITY_SECTORS) * Math.PI * 2;
      const r = Math.min(1.22, mag) * radiusPx;
      pts.push(`${(cx + Math.cos(angle) * r).toFixed(1)},${(cy + Math.sin(angle) * r).toFixed(1)}`);
    }
    return pts.join(' ');
  }, [sectors]);

  const updateFromPointer = (clientX: number, clientY: number) => {
    const el = svgRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const normX = ((clientX - rect.left) / rect.width) * 220;
    const normY = ((clientY - rect.top) / rect.height) * 220;
    const dx = Math.max(-1, Math.min(1, (normX - cx) / radiusPx));
    const dy = Math.max(-1, Math.min(1, (normY - cy) / radiusPx));
    onManualPosition(Number(dx.toFixed(3)), Number(dy.toFixed(3)));
  };

  const rawDotX = cx + sample.rawX * radiusPx;
  const rawDotY = cy + sample.rawY * radiusPx;
  const calDotX = cx + sample.calX * radiusPx;
  const calDotY = cy + sample.calY * radiusPx;
  const deadzoneRadius = Math.max(2, config.deadzone * radiusPx);

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 sm:p-5 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{title}</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Drag crosshair to test axis response, deadzone &amp; 36-sector circularity
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onZeroCenter}
            className="min-h-[36px] px-2.5 py-1 text-xs font-medium text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg transition-colors"
          >
            Zero Center
          </button>
          <button
            type="button"
            onClick={onResetCircularity}
            aria-label={`Reset ${title} circularity trace`}
            className="min-h-[36px] px-2.5 py-1 text-xs font-medium text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg transition-colors"
          >
            Clear Trace
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-12 gap-4 items-center">
        <div className="sm:col-span-5 flex justify-center">
          <svg
            ref={svgRef}
            viewBox="0 0 220 220"
            role="img"
            aria-label={`${title} XY polar calibration scope`}
            onPointerDown={(e) => {
              draggingRef.current = true;
              e.currentTarget.setPointerCapture?.(e.pointerId);
              updateFromPointer(e.clientX, e.clientY);
            }}
            onPointerMove={(e) => {
              if (!draggingRef.current) return;
              updateFromPointer(e.clientX, e.clientY);
            }}
            onPointerUp={() => {
              draggingRef.current = false;
            }}
            onPointerCancel={() => {
              draggingRef.current = false;
            }}
            className="w-48 h-48 sm:w-44 sm:h-44 select-none touch-none cursor-crosshair rounded-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800"
          >
            {/* Outer boundary & 50% ring */}
            <circle cx={cx} cy={cy} r={radiusPx} fill="none" stroke="currentColor" strokeWidth="1.25" className="text-slate-300 dark:text-slate-700" />
            <circle cx={cx} cy={cy} r={radiusPx * 0.5} fill="none" stroke="currentColor" strokeDasharray="3 3" strokeWidth="1" className="text-slate-200 dark:text-slate-800" />

            {/* Crosshairs */}
            <line x1={cx - radiusPx} y1={cy} x2={cx + radiusPx} y2={cy} stroke="currentColor" strokeWidth="1" className="text-slate-200 dark:text-slate-800" />
            <line x1={cx} y1={cy - radiusPx} x2={cx} y2={cy + radiusPx} stroke="currentColor" strokeWidth="1" className="text-slate-200 dark:text-slate-800" />

            {/* 36-sector circularity polygon */}
            {circularity.sampleCount >= 3 && (
              <polygon
                points={circularityPolygonPoints}
                fill="rgba(37, 99, 235, 0.14)"
                stroke="#2563eb"
                strokeWidth="1.5"
              />
            )}

            {/* Inner deadzone radius */}
            <circle
              cx={cx}
              cy={cy}
              r={deadzoneRadius}
              fill="rgba(217, 119, 6, 0.10)"
              stroke="#d97706"
              strokeDasharray="3 2"
              strokeWidth="1.25"
            />

            {/* Raw sample crosshair */}
            <line x1={cx} y1={cy} x2={rawDotX} y2={rawDotY} stroke="rgba(148, 163, 184, 0.55)" strokeWidth="1" />
            <circle cx={rawDotX} cy={rawDotY} r="4.5" fill="none" stroke="#f59e0b" strokeWidth="1.5" />

            {/* Calibrated vector dot */}
            <circle
              cx={calDotX}
              cy={calDotY}
              r="5.5"
              fill={sample.inDeadzone ? '#10b981' : '#2563eb'}
              stroke="#ffffff"
              strokeWidth="1.5"
            />
          </svg>
        </div>

        <div className="sm:col-span-7 space-y-2.5 text-xs">
          <div className="grid grid-cols-2 gap-x-3 gap-y-2 pb-2 border-b border-slate-100 dark:border-slate-800">
            <div>
              <div className="text-slate-500 dark:text-slate-400">Raw X / Y</div>
              <div className="font-mono tabular-nums font-semibold text-slate-900 dark:text-slate-100">
                {sample.rawX.toFixed(3)} / {sample.rawY.toFixed(3)}
              </div>
            </div>
            <div>
              <div className="text-slate-500 dark:text-slate-400">Calibrated X / Y</div>
              <div className="font-mono tabular-nums font-semibold text-blue-700 dark:text-blue-400">
                {sample.calX.toFixed(3)} / {sample.calY.toFixed(3)}
              </div>
            </div>
            <div>
              <div className="text-slate-500 dark:text-slate-400">Center Trim</div>
              <div className="font-mono tabular-nums text-slate-800 dark:text-slate-200">
                {config.centerX.toFixed(3)}, {config.centerY.toFixed(3)}
              </div>
            </div>
            <div>
              <div className="text-slate-500 dark:text-slate-400">Circularity Error</div>
              <div className="font-mono tabular-nums font-semibold text-slate-900 dark:text-slate-100">
                {circularity.sampleCount >= 4
                  ? `${circularity.avgErrorPct}% (${circularity.sectorCoveragePct}%)`
                  : 'Sweep rim to test'}
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <div>
              <div className="flex items-center justify-between mb-1">
                <label
                  htmlFor={`${stickKey}-deadzone`}
                  className="text-xs font-medium text-slate-700 dark:text-slate-300"
                >
                  Inner Deadzone
                </label>
                <span className="font-mono tabular-nums text-slate-900 dark:text-slate-100 font-semibold">
                  {Math.round(config.deadzone * 100)}%
                </span>
              </div>
              <input
                id={`${stickKey}-deadzone`}
                type="range"
                min={0}
                max={25}
                step={1}
                value={Math.round(config.deadzone * 100)}
                onChange={(e) =>
                  onChangeConfig({ ...config, deadzone: Number(e.target.value) / 100 })
                }
                className="w-full accent-blue-600 cursor-pointer"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label
                  htmlFor={`${stickKey}-outer`}
                  className="text-xs font-medium text-slate-700 dark:text-slate-300"
                >
                  Outer Saturation
                </label>
                <span className="font-mono tabular-nums text-slate-900 dark:text-slate-100 font-semibold">
                  {Math.round(config.outerThreshold * 100)}%
                </span>
              </div>
              <input
                id={`${stickKey}-outer`}
                type="range"
                min={75}
                max={100}
                step={1}
                value={Math.round(config.outerThreshold * 100)}
                onChange={(e) =>
                  onChangeConfig({ ...config, outerThreshold: Number(e.target.value) / 100 })
                }
                className="w-full accent-blue-600 cursor-pointer"
              />
            </div>
          </div>

          <div className="pt-1 flex items-center justify-between text-xs">
            <span className="text-slate-500 dark:text-slate-400">Drift Status</span>
            <span
              className={`font-medium ${
                drift.severity === 'severe'
                  ? 'text-red-600 dark:text-red-400'
                  : drift.severity === 'minor'
                    ? 'text-amber-600 dark:text-amber-400'
                    : 'text-emerald-700 dark:text-emerald-400'
              }`}
            >
              {drift.severity === 'nominal'
                ? `Nominal (${drift.radialOffsetPct}%)`
                : drift.severity === 'minor'
                  ? `Minor Offset (${drift.radialOffsetPct}%)`
                  : `Drift Detected (${drift.radialOffsetPct}%)`}
            </span>
          </div>
          {circularity.sampleCount >= 4 && (
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-500 dark:text-slate-400">Rim Classification</span>
              <span className="font-medium text-slate-800 dark:text-slate-200">{circularity.verdict}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function GamepadCalibrationStage({
  activeProfile,
  onSaveCalibration,
  onScanGamepad,
  onPlugBenchProfile,
  onOpenRepair,
}: GamepadCalibrationStageProps) {
  const [leftConfig, setLeftConfig] = useState<StickCalibrationConfig>(DEFAULT_STICK_CALIBRATION);
  const [rightConfig, setRightConfig] = useState<StickCalibrationConfig>(DEFAULT_STICK_CALIBRATION);

  const [leftStick, setLeftStick] = useState<StickRuntimeSnapshot>({
    rawX: 0,
    rawY: 0,
    sectors: emptySectors(),
    restSamples: [],
  });
  const [rightStick, setRightStick] = useState<StickRuntimeSnapshot>({
    rawX: 0,
    rawY: 0,
    sectors: emptySectors(),
    restSamples: [],
  });

  const [triggerDeadzone, setTriggerDeadzone] = useState(0.03);
  const [triggerFull, setTriggerFull] = useState(0.96);
  const [rawTriggers, setRawTriggers] = useState<{ left: number; right: number }>({
    left: 0,
    right: 0,
  });

  const [livePadList, setLivePadList] = useState<Array<{ index: number; id: string; mapping: string }>>([]);
  const [selectedPadIndex, setSelectedPadIndex] = useState<number>(0);
  const [livePollingStats, setLivePollingStats] = useState<{ hz: number; avgIntervalMs: number }>({
    hz: 0,
    avgIntervalMs: 0,
  });

  // Combined physical + manual simulated press state
  const [physicalPressed, setPhysicalPressed] = useState<Record<number, number>>({});
  const [simPressed, setSimPressed] = useState<Record<number, boolean>>({});
  const [pressCounts, setPressCounts] = useState<Record<number, number>>({});
  const [inputEvents, setInputEvents] = useState<Array<{ id: string; text: string; time: string }>>([]);

  const [strongRumblePct, setStrongRumblePct] = useState(75);
  const [weakRumblePct, setWeakRumblePct] = useState(60);
  const [rumbleStatus, setRumbleStatus] = useState<string | null>(null);
  const [calibrationSavedMsg, setCalibrationSavedMsg] = useState<string | null>(null);
  const [driftInjected, setDriftInjected] = useState(false);

  const prevPressedRef = useRef<Record<number, boolean>>({});
  const pollDeltasRef = useRef<number[]>([]);
  const lastPollTsRef = useRef<number>(0);
  const sweepTimerRef = useRef<number | null>(null);

  const activeLayout = useMemo(() => {
    const padId = livePadList.find((p) => p.index === selectedPadIndex)?.id ?? '';
    return getControllerButtonLayout(padId || activeProfile?.partNumber || 'DUALSENSE');
  }, [activeProfile?.partNumber, livePadList, selectedPadIndex]);

  const recordEvent = useCallback((text: string) => {
    const time = new Date().toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    setInputEvents((prev) =>
      [{ id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, text, time }, ...prev].slice(
        0,
        12,
      ),
    );
  }, []);

  const recordStickSample = useCallback(
    (side: 'left' | 'right', x: number, y: number) => {
      const setter = side === 'left' ? setLeftStick : setRightStick;
      const mag = Math.hypot(x, y);
      setter((prev) => {
        const nextSectors = [...prev.sectors];
        if (mag >= 0.65) {
          const secIdx = getCircularitySectorIndex(x, y);
          const existing = nextSectors[secIdx];
          if (existing === null || mag > existing) {
            nextSectors[secIdx] = Number(mag.toFixed(3));
          }
        }
        const nextRest =
          mag < 0.35
            ? [...prev.restSamples.slice(-29), { x, y }]
            : prev.restSamples;
        return {
          rawX: x,
          rawY: y,
          sectors: nextSectors,
          restSamples: nextRest,
        };
      });
    },
    [],
  );

  // Live W3C Gamepad API rAF polling loop
  useEffect(() => {
    let rafId = 0;
    let active = true;

    const tick = (ts: number) => {
      if (!active) return;
      if (typeof navigator !== 'undefined' && typeof navigator.getGamepads === 'function') {
        try {
          const pads = navigator.getGamepads();
          const connected = pads
            .filter((p): p is Gamepad => Boolean(p && p.connected))
            .map((p) => ({ index: p.index, id: p.id, mapping: p.mapping || 'standard' }));

          setLivePadList((prev) => {
            if (
              prev.length === connected.length &&
              prev.every((item, i) => item.index === connected[i].index && item.id === connected[i].id)
            ) {
              return prev;
            }
            return connected;
          });

          const target =
            pads.find((p) => p && p.connected && p.index === selectedPadIndex) ??
            pads.find((p) => p && p.connected) ??
            null;

          if (target) {
            if (lastPollTsRef.current > 0) {
              const dt = ts - lastPollTsRef.current;
              pollDeltasRef.current = [...pollDeltasRef.current.slice(-24), dt];
              if (pollDeltasRef.current.length % 10 === 0) {
                setLivePollingStats(computePollingStats(pollDeltasRef.current));
              }
            }
            lastPollTsRef.current = ts;

            const lx = Number((target.axes[0] ?? 0).toFixed(3));
            const ly = Number((target.axes[1] ?? 0).toFixed(3));
            const rx = Number((target.axes[2] ?? 0).toFixed(3));
            const ry = Number((target.axes[3] ?? 0).toFixed(3));
            recordStickSample('left', lx, ly);
            recordStickSample('right', rx, ry);

            const l2Val = target.buttons[6]?.value ?? 0;
            const r2Val = target.buttons[7]?.value ?? 0;
            setRawTriggers({ left: l2Val, right: r2Val });

            const nextPhys: Record<number, number> = {};
            const newlyPressed: number[] = [];
            target.buttons.forEach((btn, idx) => {
              const val = btn.value ?? (btn.pressed ? 1 : 0);
              if (btn.pressed || val > 0.1) {
                nextPhys[idx] = Number(val.toFixed(2));
                if (!prevPressedRef.current[idx]) {
                  newlyPressed.push(idx);
                }
                prevPressedRef.current[idx] = true;
              } else {
                prevPressedRef.current[idx] = false;
              }
            });
            setPhysicalPressed(nextPhys);
            if (newlyPressed.length > 0) {
              setPressCounts((prev) => {
                const updated = { ...prev };
                for (const idx of newlyPressed) {
                  updated[idx] = (updated[idx] ?? 0) + 1;
                }
                return updated;
              });
              for (const idx of newlyPressed) {
                const label = activeLayout.buttons.find((b) => b.index === idx)?.label ?? `Button ${idx}`;
                recordEvent(`${label} pressed`);
              }
            }
          }
        } catch {
          // Ignore restricted gamepad context
        }
      }
      rafId = window.requestAnimationFrame(tick);
    };

    rafId = window.requestAnimationFrame(tick);
    return () => {
      active = false;
      window.cancelAnimationFrame(rafId);
      if (sweepTimerRef.current !== null) {
        window.clearInterval(sweepTimerRef.current);
      }
    };
  }, [activeLayout.buttons, recordEvent, recordStickSample, selectedPadIndex]);

  const handleTriggerButtonTest = (index: number, label: string) => {
    setSimPressed((prev) => ({ ...prev, [index]: true }));
    setPressCounts((prev) => ({ ...prev, [index]: (prev[index] ?? 0) + 1 }));
    recordEvent(`${label} tested`);
    window.setTimeout(() => {
      setSimPressed((prev) => {
        const next = { ...prev };
        delete next[index];
        return next;
      });
    }, 180);
  };

  const handleToggleInjectDrift = () => {
    if (!driftInjected) {
      setDriftInjected(true);
      recordStickSample('left', 0.115, -0.055);
      recordStickSample('left', 0.112, -0.052);
      recordStickSample('right', -0.075, 0.042);
      recordEvent('Injected simulated +12.7% L / 8.6% R potentiometer drift');
    } else {
      setDriftInjected(false);
      setLeftStick((prev) => ({ ...prev, rawX: 0, rawY: 0, restSamples: [{ x: 0, y: 0 }] }));
      setRightStick((prev) => ({ ...prev, rawX: 0, rawY: 0, restSamples: [{ x: 0, y: 0 }] }));
      recordEvent('Cleared simulated stick drift');
    }
  };

  const handleRunSweepDemo = () => {
    if (sweepTimerRef.current !== null) {
      window.clearInterval(sweepTimerRef.current);
      sweepTimerRef.current = null;
    }
    let step = 0;
    const total = CIRCULARITY_SECTORS;
    sweepTimerRef.current = window.setInterval(() => {
      const angle = (step / total) * Math.PI * 2;
      const lx = Number((Math.cos(angle) * 0.99).toFixed(3));
      const ly = Number((Math.sin(angle) * 0.99).toFixed(3));
      const rx = Number((Math.cos(angle) * 1.03).toFixed(3));
      const ry = Number((Math.sin(angle) * 1.01).toFixed(3));
      recordStickSample('left', lx, ly);
      recordStickSample('right', rx, ry);
      step += 1;
      if (step >= total) {
        if (sweepTimerRef.current !== null) {
          window.clearInterval(sweepTimerRef.current);
          sweepTimerRef.current = null;
        }
        recordStickSample('left', 0, 0);
        recordStickSample('right', 0, 0);
        recordEvent('36-sector circularity rim sweep completed');
      }
    }, 18);
  };

  const handleTestRumble = async () => {
    const pads =
      typeof navigator !== 'undefined' && typeof navigator.getGamepads === 'function'
        ? navigator.getGamepads()
        : [];
    const target =
      pads.find((p) => p && p.connected && p.index === selectedPadIndex) ??
      pads.find((p) => p && p.connected);

    const actuator = (target as Gamepad & {
      vibrationActuator?: {
        playEffect?: (
          type: string,
          params: { duration: number; strongMagnitude: number; weakMagnitude: number },
        ) => Promise<string>;
      };
    } | null)?.vibrationActuator;

    if (actuator?.playEffect) {
      try {
        await actuator.playEffect('dual-rumble', {
          duration: 400,
          strongMagnitude: strongRumblePct / 100,
          weakMagnitude: weakRumblePct / 100,
        });
        setRumbleStatus(
          `Triggered dual-rumble on ${target?.id.slice(0, 32) ?? 'controller'} (400ms · Low ${strongRumblePct}% / High ${weakRumblePct}%).`,
        );
        recordEvent(`Dual-rumble tested (${strongRumblePct}% / ${weakRumblePct}%)`);
        return;
      } catch {
        // Fallback confirmation below
      }
    }

    setRumbleStatus(
      `Bench haptic pulse dispatched (400ms · Low ${strongRumblePct}% / High ${weakRumblePct}%). Connect a DualSense/Xbox controller over USB or Bluetooth for physical motor vibration.`,
    );
    recordEvent(`Haptic motor pulse tested (${strongRumblePct}% / ${weakRumblePct}%)`);
  };

  const handleSaveToProfile = () => {
    const patch = buildCalibrationBytePatch(leftConfig, rightConfig);
    onSaveCalibration({
      ...patch,
      leftDeadzonePct: Math.round(leftConfig.deadzone * 100),
      rightDeadzonePct: Math.round(rightConfig.deadzone * 100),
    });
    setCalibrationSavedMsg(
      `Saved center trims (${patch.lxByte}, ${patch.lyByte} / ${patch.rxByte}, ${patch.ryByte}) & deadzone (${patch.dzByte}) to bench profile.`,
    );
    recordEvent(`Saved calibration bytes (Deadzone ${patch.dzByte})`);
  };

  const calLeftTrigger = calibrateTriggerValue(rawTriggers.left, triggerDeadzone, triggerFull);
  const calRightTrigger = calibrateTriggerValue(rawTriggers.right, triggerDeadzone, triggerFull);

  const leftDrift = analyzeStickDrift(leftStick.restSamples);
  const rightDrift = analyzeStickDrift(rightStick.restSamples);
  const hasAnyDrift = leftDrift.severity !== 'nominal' || rightDrift.severity !== 'nominal';

  const totalPresses = Object.values(pressCounts).reduce((a, b) => a + b, 0);
  const activePad = livePadList.find((p) => p.index === selectedPadIndex) ?? livePadList[0] ?? null;

  return (
    <section className="space-y-6">
      {/* Header & Toolbar */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 sm:p-6 space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="text-xs text-slate-500 dark:text-slate-400">
              {activePad
                ? `Live W3C Gamepad API · ${activePad.id} · ${livePollingStats.hz > 0 ? `${livePollingStats.hz} Hz (${livePollingStats.avgIntervalMs} ms)` : 'Active'}`
                : `${activeProfile?.displayName ?? 'Bench Calibration Mode'} · ${activeLayout.familyName}`}
            </div>
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-slate-100 tracking-tight flex items-center gap-2.5">
              <Gamepad2 className="w-6 h-6 text-blue-600 dark:text-blue-400 shrink-0" aria-hidden="true" />
              <span>Gamepad Calibration &amp; Button Testing Center</span>
            </h1>
            <p className="text-sm text-slate-600 dark:text-slate-300 max-w-2xl">
              Test every button, analog trigger, dual-stick deadzone, 36-sector circularity accuracy, and haptic rumble on old and new controllers.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={onScanGamepad}
              className="min-h-[44px] px-3.5 py-2 text-xs sm:text-sm font-medium text-slate-800 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 rounded-lg transition-colors"
            >
              Scan Controller
            </button>
            <button
              type="button"
              onClick={handleSaveToProfile}
              className="min-h-[44px] px-4 py-2 text-xs sm:text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors flex items-center gap-2"
            >
              <Save className="w-4 h-4" aria-hidden="true" />
              <span>Save Calibration</span>
            </button>
          </div>
        </div>

        {/* Controller Slot / Quick Target Switcher & Utility Actions */}
        <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            {livePadList.length > 0 ? (
              livePadList.map((pad) => (
                <button
                  key={pad.index}
                  type="button"
                  onClick={() => setSelectedPadIndex(pad.index)}
                  className={`min-h-[36px] px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
                    selectedPadIndex === pad.index
                      ? 'bg-blue-50 dark:bg-blue-950/60 border-blue-500 text-blue-700 dark:text-blue-300'
                      : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300'
                  }`}
                >
                  Pad {pad.index + 1}: {pad.id.slice(0, 22)}
                </button>
              ))
            ) : (
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-xs text-slate-500 dark:text-slate-400 mr-1">Layout Profile:</span>
                {[
                  { id: 'DUALSENSE', label: 'PlayStation' },
                  { id: 'XBOX-CTRL', label: 'Xbox / XInput' },
                  { id: 'SWITCH-PRO', label: 'Nintendo' },
                ].map((preset) => (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => onPlugBenchProfile(preset.id)}
                    className={`min-h-[36px] px-2.5 py-1 text-xs font-medium rounded-lg border transition-colors ${
                      activeProfile?.partNumber === preset.id
                        ? 'bg-blue-50 dark:bg-blue-950/60 border-blue-500 text-blue-700 dark:text-blue-300'
                        : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700'
                    }`}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleRunSweepDemo}
              className="min-h-[36px] px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg transition-colors flex items-center gap-1.5"
            >
              <Crosshair className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Sweep Circularity</span>
            </button>
            <button
              type="button"
              onClick={handleToggleInjectDrift}
              className={`min-h-[36px] px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
                driftInjected
                  ? 'bg-amber-50 dark:bg-amber-950/40 border-amber-400 text-amber-800 dark:text-amber-300'
                  : 'bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700'
              }`}
            >
              {driftInjected ? 'Clear Simulated Drift' : 'Inject Stick Drift'}
            </button>
          </div>
        </div>

        {calibrationSavedMsg && (
          <div className="px-3.5 py-2.5 rounded-lg border border-emerald-200 dark:border-emerald-900 bg-emerald-50 dark:bg-emerald-950/40 text-xs text-emerald-800 dark:text-emerald-300 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" aria-hidden="true" />
            <span>{calibrationSavedMsg}</span>
          </div>
        )}
      </div>

      {/* Dual Analog Stick Scopes */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <StickScopeCard
          title="Left Analog Stick (LX / LY)"
          stickKey="left"
          rawX={leftStick.rawX}
          rawY={leftStick.rawY}
          config={leftConfig}
          sectors={leftStick.sectors}
          restSamples={leftStick.restSamples}
          onChangeConfig={setLeftConfig}
          onManualPosition={(x, y) => recordStickSample('left', x, y)}
          onZeroCenter={() => {
            setLeftConfig((c) => ({ ...c, centerX: leftStick.rawX, centerY: leftStick.rawY }));
            setLeftStick((s) => ({ ...s, restSamples: [{ x: leftStick.rawX, y: leftStick.rawY }] }));
            recordEvent(`Captured Left Stick zero center (${leftStick.rawX.toFixed(3)}, ${leftStick.rawY.toFixed(3)})`);
          }}
          onResetCircularity={() => setLeftStick((s) => ({ ...s, sectors: emptySectors() }))}
        />

        <StickScopeCard
          title="Right Analog Stick (RX / RY)"
          stickKey="right"
          rawX={rightStick.rawX}
          rawY={rightStick.rawY}
          config={rightConfig}
          sectors={rightStick.sectors}
          restSamples={rightStick.restSamples}
          onChangeConfig={setRightConfig}
          onManualPosition={(x, y) => recordStickSample('right', x, y)}
          onZeroCenter={() => {
            setRightConfig((c) => ({ ...c, centerX: rightStick.rawX, centerY: rightStick.rawY }));
            setRightStick((s) => ({ ...s, restSamples: [{ x: rightStick.rawX, y: rightStick.rawY }] }));
            recordEvent(`Captured Right Stick zero center (${rightStick.rawX.toFixed(3)}, ${rightStick.rawY.toFixed(3)})`);
          }}
          onResetCircularity={() => setRightStick((s) => ({ ...s, sectors: emptySectors() }))}
        />
      </div>

      {/* Analog Triggers + Button Input Matrix */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
        {/* Triggers & Hair-Trigger Thresholds */}
        <div className="xl:col-span-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <Sliders className="w-4 h-4 text-slate-500 dark:text-slate-400" aria-hidden="true" />
              <span>Analog Triggers &amp; Hair-Trigger</span>
            </h2>
            <span className="text-xs font-mono tabular-nums text-slate-500 dark:text-slate-400">
              Deadzone {Math.round(triggerDeadzone * 100)}% · Max {Math.round(triggerFull * 100)}%
            </span>
          </div>

          <div className="space-y-4">
            {/* Left Trigger */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <label htmlFor="left-trigger-sim" className="font-medium text-slate-800 dark:text-slate-200">
                  {activeLayout.leftTriggerLabel}
                </label>
                <span className="font-mono tabular-nums text-slate-700 dark:text-slate-300">
                  Raw {(rawTriggers.left * 100).toFixed(0)}% · Cal {(calLeftTrigger * 100).toFixed(0)}%
                </span>
              </div>
              <div className="h-3 w-full bg-slate-100 dark:bg-slate-800 rounded overflow-hidden">
                <div
                  className="h-full bg-blue-600 transition-[width] duration-75"
                  style={{ width: `${Math.round(calLeftTrigger * 100)}%` }}
                />
              </div>
              <input
                id="left-trigger-sim"
                type="range"
                min={0}
                max={100}
                value={Math.round(rawTriggers.left * 100)}
                onChange={(e) => setRawTriggers((t) => ({ ...t, left: Number(e.target.value) / 100 }))}
                aria-label={`Test ${activeLayout.leftTriggerLabel} pull`}
                className="w-full accent-blue-600 cursor-pointer"
              />
            </div>

            {/* Right Trigger */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <label htmlFor="right-trigger-sim" className="font-medium text-slate-800 dark:text-slate-200">
                  {activeLayout.rightTriggerLabel}
                </label>
                <span className="font-mono tabular-nums text-slate-700 dark:text-slate-300">
                  Raw {(rawTriggers.right * 100).toFixed(0)}% · Cal {(calRightTrigger * 100).toFixed(0)}%
                </span>
              </div>
              <div className="h-3 w-full bg-slate-100 dark:bg-slate-800 rounded overflow-hidden">
                <div
                  className="h-full bg-blue-600 transition-[width] duration-75"
                  style={{ width: `${Math.round(calRightTrigger * 100)}%` }}
                />
              </div>
              <input
                id="right-trigger-sim"
                type="range"
                min={0}
                max={100}
                value={Math.round(rawTriggers.right * 100)}
                onChange={(e) => setRawTriggers((t) => ({ ...t, right: Number(e.target.value) / 100 }))}
                aria-label={`Test ${activeLayout.rightTriggerLabel} pull`}
                className="w-full accent-blue-600 cursor-pointer"
              />
            </div>
          </div>

          <div className="pt-3 border-t border-slate-100 dark:border-slate-800 grid grid-cols-2 gap-3 text-xs">
            <div>
              <div className="flex items-center justify-between mb-1">
                <label htmlFor="trigger-dz" className="text-slate-600 dark:text-slate-400">
                  Start Deadzone
                </label>
                <span className="font-mono tabular-nums font-medium text-slate-900 dark:text-slate-100">
                  {Math.round(triggerDeadzone * 100)}%
                </span>
              </div>
              <input
                id="trigger-dz"
                type="range"
                min={0}
                max={20}
                value={Math.round(triggerDeadzone * 100)}
                onChange={(e) => setTriggerDeadzone(Number(e.target.value) / 100)}
                className="w-full accent-blue-600 cursor-pointer"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label htmlFor="trigger-full" className="text-slate-600 dark:text-slate-400">
                  Full Saturation
                </label>
                <span className="font-mono tabular-nums font-medium text-slate-900 dark:text-slate-100">
                  {Math.round(triggerFull * 100)}%
                </span>
              </div>
              <input
                id="trigger-full"
                type="range"
                min={70}
                max={100}
                value={Math.round(triggerFull * 100)}
                onChange={(e) => setTriggerFull(Number(e.target.value) / 100)}
                className="w-full accent-blue-600 cursor-pointer"
              />
            </div>
          </div>
        </div>

        {/* Full Button, Stick Diagram & Deadzone Testing Matrix */}
        <div className="xl:col-span-7 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-5">
          {(() => {
            const leftSample = applyStickCalibration(leftStick.rawX, leftStick.rawY, leftConfig);
            const rightSample = applyStickCalibration(rightStick.rawX, rightStick.rawY, rightConfig);
            const isBtnActive = (idx: number) =>
              (physicalPressed[idx] ?? 0) > 0 || Boolean(simPressed[idx]);
            const leftAngleDeg =
              leftSample.rawMagnitude > 0.02
                ? Math.round(((Math.atan2(-leftSample.rawY, leftSample.rawX) * 180) / Math.PI + 360) % 360)
                : 0;
            const rightAngleDeg =
              rightSample.rawMagnitude > 0.02
                ? Math.round(((Math.atan2(-rightSample.rawY, rightSample.rawX) * 180) / Math.PI + 360) % 360)
                : 0;

            const stickDirections: Array<{
              key: string;
              side: 'left' | 'right';
              label: string;
              dx: number;
              dy: number;
            }> = [
              { key: 'L-UP', side: 'left', label: 'L-Stick Up', dx: 0, dy: -0.95 },
              { key: 'L-DOWN', side: 'left', label: 'L-Stick Down', dx: 0, dy: 0.95 },
              { key: 'L-LEFT', side: 'left', label: 'L-Stick Left', dx: -0.95, dy: 0 },
              { key: 'L-RIGHT', side: 'left', label: 'L-Stick Right', dx: 0.95, dy: 0 },
              { key: 'R-UP', side: 'right', label: 'R-Stick Up', dx: 0, dy: -0.95 },
              { key: 'R-DOWN', side: 'right', label: 'R-Stick Down', dx: 0, dy: 0.95 },
              { key: 'R-LEFT', side: 'right', label: 'R-Stick Left', dx: -0.95, dy: 0 },
              { key: 'R-RIGHT', side: 'right', label: 'R-Stick Right', dx: 0.95, dy: 0 },
            ];

            return (
              <>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                      <Activity className="w-4 h-4 text-slate-500 dark:text-slate-400" aria-hidden="true" />
                      <span>Button, Stick &amp; Deadzone Testing ({activeLayout.buttons.length} Buttons + 2 Sticks)</span>
                    </h2>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Live controller diagram tracks buttons, analog sticks &amp; deadzone boundaries · Presses:{' '}
                      <span className="font-mono tabular-nums">{totalPresses}</span>
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        recordStickSample('left', 0, 0);
                        recordStickSample('right', 0, 0);
                        recordEvent('Centered Left & Right analog sticks to (0, 0)');
                      }}
                      className="min-h-[36px] px-2.5 py-1 text-xs font-medium text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg transition-colors"
                    >
                      Center Sticks
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setPressCounts({});
                        setInputEvents([]);
                      }}
                      className="min-h-[36px] px-3 py-1 text-xs font-medium text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg transition-colors flex items-center gap-1.5"
                    >
                      <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>Reset Counts</span>
                    </button>
                  </div>
                </div>

                {/* Live Interactive Gamepad & Dual-Stick Diagram */}
                <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                    <span className="font-semibold text-slate-800 dark:text-slate-200">
                      Live Controller &amp; Stick Input Diagram
                    </span>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-slate-500 dark:text-slate-400 mr-1">Deadzone Preset:</span>
                      {[
                        { pct: 0, label: '0% Raw' },
                        { pct: 5, label: '5% FPS' },
                        { pct: 10, label: '10% Std' },
                        { pct: 15, label: '15% Drift' },
                      ].map((dz) => {
                        const activeDz =
                          Math.round(leftConfig.deadzone * 100) === dz.pct &&
                          Math.round(rightConfig.deadzone * 100) === dz.pct;
                        return (
                          <button
                            key={dz.pct}
                            type="button"
                            onClick={() => {
                              setLeftConfig((c) => ({ ...c, deadzone: dz.pct / 100 }));
                              setRightConfig((c) => ({ ...c, deadzone: dz.pct / 100 }));
                              recordEvent(`Applied ${dz.pct}% stick deadzone to Left & Right sticks`);
                            }}
                            className={`min-h-[30px] px-2 py-0.5 text-[11px] font-medium rounded-md border transition-colors ${
                              activeDz
                                ? 'bg-amber-50 dark:bg-amber-950/50 border-amber-400 text-amber-800 dark:text-amber-300'
                                : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                            }`}
                          >
                            {dz.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <svg
                    viewBox="0 0 480 210"
                    role="img"
                    aria-label="Live controller schematic showing buttons, D-Pad, triggers, left and right analog sticks, and deadzone rings"
                    className="w-full max-w-[480px] mx-auto block select-none"
                  >
                    {/* Trigger Gauges (Top Shoulders) */}
                    <rect
                      x="54"
                      y="10"
                      width="72"
                      height="14"
                      rx="4"
                      fill={isBtnActive(6) || rawTriggers.left > 0.05 ? '#2563eb' : 'rgba(148,163,184,0.2)'}
                      stroke="currentColor"
                      className="text-slate-300 dark:text-slate-700"
                    />
                    <text x="90" y="20" textAnchor="middle" fontSize="8" fill={isBtnActive(6) ? '#fff' : '#64748b'}>
                      L2/LT {Math.round(calLeftTrigger * 100)}%
                    </text>

                    <rect
                      x="354"
                      y="10"
                      width="72"
                      height="14"
                      rx="4"
                      fill={isBtnActive(7) || rawTriggers.right > 0.05 ? '#2563eb' : 'rgba(148,163,184,0.2)'}
                      stroke="currentColor"
                      className="text-slate-300 dark:text-slate-700"
                    />
                    <text x="390" y="20" textAnchor="middle" fontSize="8" fill={isBtnActive(7) ? '#fff' : '#64748b'}>
                      R2/RT {Math.round(calRightTrigger * 100)}%
                    </text>

                    {/* L1 / R1 Bumpers */}
                    <rect
                      x="54"
                      y="28"
                      width="72"
                      height="13"
                      rx="4"
                      fill={isBtnActive(4) ? '#2563eb' : 'rgba(148,163,184,0.16)'}
                      stroke="currentColor"
                      className="text-slate-300 dark:text-slate-700 cursor-pointer"
                      onClick={() => handleTriggerButtonTest(4, activeLayout.buttons[4]?.label ?? 'L1/LB')}
                    />
                    <text x="90" y="37" textAnchor="middle" fontSize="8" fill={isBtnActive(4) ? '#fff' : '#64748b'} pointerEvents="none">
                      L1/LB
                    </text>
                    <rect
                      x="354"
                      y="28"
                      width="72"
                      height="13"
                      rx="4"
                      fill={isBtnActive(5) ? '#2563eb' : 'rgba(148,163,184,0.16)'}
                      stroke="currentColor"
                      className="text-slate-300 dark:text-slate-700 cursor-pointer"
                      onClick={() => handleTriggerButtonTest(5, activeLayout.buttons[5]?.label ?? 'R1/RB')}
                    />
                    <text x="390" y="37" textAnchor="middle" fontSize="8" fill={isBtnActive(5) ? '#fff' : '#64748b'} pointerEvents="none">
                      R1/RB
                    </text>

                    {/* Controller Chassis Outline */}
                    <path
                      d="M90,46 L390,46 C428,46 452,82 446,138 C442,175 418,198 394,194 C372,190 356,158 334,154 L146,154 C124,158 108,190 86,194 C62,198 38,175 34,138 C28,82 52,46 90,46 Z"
                      fill="rgba(148,163,184,0.08)"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      className="text-slate-300 dark:text-slate-700"
                    />

                    {/* D-Pad (B12..B15) */}
                    <rect x="92" y="64" width="18" height="16" rx="3" fill={isBtnActive(12) ? '#2563eb' : 'rgba(148,163,184,0.28)'} className="cursor-pointer" onClick={() => handleTriggerButtonTest(12, 'D-Up')} />
                    <rect x="92" y="98" width="18" height="16" rx="3" fill={isBtnActive(13) ? '#2563eb' : 'rgba(148,163,184,0.28)'} className="cursor-pointer" onClick={() => handleTriggerButtonTest(13, 'D-Down')} />
                    <rect x="74" y="81" width="18" height="16" rx="3" fill={isBtnActive(14) ? '#2563eb' : 'rgba(148,163,184,0.28)'} className="cursor-pointer" onClick={() => handleTriggerButtonTest(14, 'D-Left')} />
                    <rect x="110" y="81" width="18" height="16" rx="3" fill={isBtnActive(15) ? '#2563eb' : 'rgba(148,163,184,0.28)'} className="cursor-pointer" onClick={() => handleTriggerButtonTest(15, 'D-Right')} />
                    <text x="101" y="126" textAnchor="middle" fontSize="8" fill="#64748b">D-PAD</text>

                    {/* System Buttons (B8 Select, B16 Home, B9 Start) */}
                    <rect x="184" y="66" width="22" height="10" rx="4" fill={isBtnActive(8) ? '#2563eb' : 'rgba(148,163,184,0.3)'} className="cursor-pointer" onClick={() => handleTriggerButtonTest(8, activeLayout.buttons[8]?.label ?? 'Select')} />
                    <circle cx="240" cy="76" r="10" fill={isBtnActive(16) ? '#2563eb' : 'rgba(148,163,184,0.28)'} className="cursor-pointer" onClick={() => handleTriggerButtonTest(16, activeLayout.buttons[16]?.label ?? 'Home')} />
                    <rect x="274" y="66" width="22" height="10" rx="4" fill={isBtnActive(9) ? '#2563eb' : 'rgba(148,163,184,0.3)'} className="cursor-pointer" onClick={() => handleTriggerButtonTest(9, activeLayout.buttons[9]?.label ?? 'Start')} />

                    {/* Face Buttons (B3 North, B1 East, B0 South, B2 West) */}
                    <circle cx="380" cy="66" r="10" fill={isBtnActive(3) ? '#2563eb' : 'rgba(148,163,184,0.28)'} className="cursor-pointer" onClick={() => handleTriggerButtonTest(3, activeLayout.buttons[3]?.label ?? 'North')} />
                    <circle cx="402" cy="88" r="10" fill={isBtnActive(1) ? '#2563eb' : 'rgba(148,163,184,0.28)'} className="cursor-pointer" onClick={() => handleTriggerButtonTest(1, activeLayout.buttons[1]?.label ?? 'East')} />
                    <circle cx="380" cy="110" r="10" fill={isBtnActive(0) ? '#2563eb' : 'rgba(148,163,184,0.28)'} className="cursor-pointer" onClick={() => handleTriggerButtonTest(0, activeLayout.buttons[0]?.label ?? 'South')} />
                    <circle cx="358" cy="88" r="10" fill={isBtnActive(2) ? '#2563eb' : 'rgba(148,163,184,0.28)'} className="cursor-pointer" onClick={() => handleTriggerButtonTest(2, activeLayout.buttons[2]?.label ?? 'West')} />

                    {/* Live Left Stick Well + Deadzone Ring + Puck (CX=168, CY=124, R=26) */}
                    <circle
                      cx="168"
                      cy="124"
                      r="28"
                      fill="rgba(15,23,42,0.06)"
                      stroke={isBtnActive(10) ? '#2563eb' : 'currentColor'}
                      strokeWidth={isBtnActive(10) ? '2.5' : '1.25'}
                      className="text-slate-300 dark:text-slate-700 cursor-pointer"
                      onClick={() => handleTriggerButtonTest(10, activeLayout.buttons[10]?.label ?? 'L3')}
                    />
                    <line x1="142" y1="124" x2="194" y2="124" stroke="rgba(148,163,184,0.35)" strokeWidth="1" />
                    <line x1="168" y1="98" x2="168" y2="150" stroke="rgba(148,163,184,0.35)" strokeWidth="1" />
                    {/* Left Stick Deadzone Circle */}
                    <circle
                      cx="168"
                      cy="124"
                      r={Math.max(2, leftConfig.deadzone * 25)}
                      fill="rgba(217,119,6,0.16)"
                      stroke="#d97706"
                      strokeDasharray="2 2"
                      strokeWidth="1.2"
                      pointerEvents="none"
                    />
                    {/* Left Stick Raw Ghost Dot */}
                    <circle
                      cx={168 + leftSample.rawX * 22}
                      cy={124 + leftSample.rawY * 22}
                      r="3"
                      fill="none"
                      stroke="#f59e0b"
                      strokeWidth="1.2"
                      pointerEvents="none"
                    />
                    {/* Left Stick Live Calibrated Vector & Puck */}
                    <line
                      x1="168"
                      y1="124"
                      x2={168 + leftSample.calX * 22}
                      y2={124 + leftSample.calY * 22}
                      stroke="#2563eb"
                      strokeWidth="2"
                      pointerEvents="none"
                    />
                    <circle
                      cx={168 + leftSample.calX * 22}
                      cy={124 + leftSample.calY * 22}
                      r="7"
                      fill={isBtnActive(10) ? '#1d4ed8' : leftSample.inDeadzone ? '#10b981' : '#2563eb'}
                      stroke="#ffffff"
                      strokeWidth="1.5"
                      pointerEvents="none"
                    />
                    <text x="168" y="166" textAnchor="middle" fontSize="8" fill="#64748b">
                      L-STICK (DZ {Math.round(leftConfig.deadzone * 100)}%)
                    </text>

                    {/* Live Right Stick Well + Deadzone Ring + Puck (CX=312, CY=124, R=26) */}
                    <circle
                      cx="312"
                      cy="124"
                      r="28"
                      fill="rgba(15,23,42,0.06)"
                      stroke={isBtnActive(11) ? '#2563eb' : 'currentColor'}
                      strokeWidth={isBtnActive(11) ? '2.5' : '1.25'}
                      className="text-slate-300 dark:text-slate-700 cursor-pointer"
                      onClick={() => handleTriggerButtonTest(11, activeLayout.buttons[11]?.label ?? 'R3')}
                    />
                    <line x1="286" y1="124" x2="338" y2="124" stroke="rgba(148,163,184,0.35)" strokeWidth="1" />
                    <line x1="312" y1="98" x2="312" y2="150" stroke="rgba(148,163,184,0.35)" strokeWidth="1" />
                    {/* Right Stick Deadzone Circle */}
                    <circle
                      cx="312"
                      cy="124"
                      r={Math.max(2, rightConfig.deadzone * 25)}
                      fill="rgba(217,119,6,0.16)"
                      stroke="#d97706"
                      strokeDasharray="2 2"
                      strokeWidth="1.2"
                      pointerEvents="none"
                    />
                    {/* Right Stick Raw Ghost Dot */}
                    <circle
                      cx={312 + rightSample.rawX * 22}
                      cy={124 + rightSample.rawY * 22}
                      r="3"
                      fill="none"
                      stroke="#f59e0b"
                      strokeWidth="1.2"
                      pointerEvents="none"
                    />
                    {/* Right Stick Live Calibrated Vector & Puck */}
                    <line
                      x1="312"
                      y1="124"
                      x2={312 + rightSample.calX * 22}
                      y2={124 + rightSample.calY * 22}
                      stroke="#2563eb"
                      strokeWidth="2"
                      pointerEvents="none"
                    />
                    <circle
                      cx={312 + rightSample.calX * 22}
                      cy={124 + rightSample.calY * 22}
                      r="7"
                      fill={isBtnActive(11) ? '#1d4ed8' : rightSample.inDeadzone ? '#10b981' : '#2563eb'}
                      stroke="#ffffff"
                      strokeWidth="1.5"
                      pointerEvents="none"
                    />
                    <text x="312" y="166" textAnchor="middle" fontSize="8" fill="#64748b">
                      R-STICK (DZ {Math.round(rightConfig.deadzone * 100)}%)
                    </text>
                  </svg>

                  {/* Live Stick Input & Deadzone Status Bar */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-slate-200 dark:border-slate-800 text-[11px] font-mono tabular-nums">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-slate-600 dark:text-slate-400">
                        L-Stick ({leftSample.calX.toFixed(2)}, {leftSample.calY.toFixed(2)}) · {leftAngleDeg}°
                      </span>
                      <span
                        className={
                          leftSample.inDeadzone
                            ? 'text-emerald-700 dark:text-emerald-400 font-semibold'
                            : 'text-blue-700 dark:text-blue-400 font-semibold'
                        }
                      >
                        {leftSample.inDeadzone
                          ? `In Deadzone (≤${Math.round(leftConfig.deadzone * 100)}%)`
                          : `Active (${Math.round(leftSample.calMagnitude * 100)}%)`}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-slate-600 dark:text-slate-400">
                        R-Stick ({rightSample.calX.toFixed(2)}, {rightSample.calY.toFixed(2)}) · {rightAngleDeg}°
                      </span>
                      <span
                        className={
                          rightSample.inDeadzone
                            ? 'text-emerald-700 dark:text-emerald-400 font-semibold'
                            : 'text-blue-700 dark:text-blue-400 font-semibold'
                        }
                      >
                        {rightSample.inDeadzone
                          ? `In Deadzone (≤${Math.round(rightConfig.deadzone * 100)}%)`
                          : `Active (${Math.round(rightSample.calMagnitude * 100)}%)`}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Stick Directional Test Options Included Inside Button Testing */}
                <div className="space-y-2">
                  <div className="text-xs font-medium text-slate-700 dark:text-slate-300">
                    Analog Stick Directional &amp; Deadzone Test Inputs
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {stickDirections.map((dir) => {
                      const activeStick = dir.side === 'left' ? leftSample : rightSample;
                      const isDirActive =
                        (dir.dx < 0 && activeStick.calX < -0.5) ||
                        (dir.dx > 0 && activeStick.calX > 0.5) ||
                        (dir.dy < 0 && activeStick.calY < -0.5) ||
                        (dir.dy > 0 && activeStick.calY > 0.5);
                      return (
                        <button
                          key={dir.key}
                          type="button"
                          onClick={() => {
                            recordStickSample(dir.side, dir.dx, dir.dy);
                            recordEvent(`${dir.label} tested (${dir.dx}, ${dir.dy})`);
                          }}
                          aria-pressed={isDirActive}
                          className={`min-h-[44px] px-2.5 py-1.5 text-left rounded-lg border transition-colors flex flex-col justify-between ${
                            isDirActive
                              ? 'bg-blue-600 border-blue-600 text-white'
                              : 'bg-slate-50 dark:bg-slate-800/70 border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800'
                          }`}
                        >
                          <span className="text-[10px] font-mono opacity-75">{dir.key}</span>
                          <span className="text-xs font-semibold truncate">{dir.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Full Digital & Pressure Button Matrix */}
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                  {activeLayout.buttons.map((btn) => {
                    const physVal = physicalPressed[btn.index] ?? 0;
                    const isPressed = physVal > 0 || Boolean(simPressed[btn.index]);
                    const count = pressCounts[btn.index] ?? 0;

                    return (
                      <button
                        key={btn.index}
                        type="button"
                        onClick={() => handleTriggerButtonTest(btn.index, btn.label)}
                        aria-pressed={isPressed}
                        className={`min-h-[48px] px-3 py-2 text-left rounded-lg border transition-colors flex flex-col justify-between ${
                          isPressed
                            ? 'bg-blue-600 border-blue-600 text-white'
                            : count > 0
                              ? 'bg-emerald-50/70 dark:bg-emerald-950/30 border-emerald-300 dark:border-emerald-800 text-slate-900 dark:text-slate-100 hover:bg-emerald-100/70 dark:hover:bg-emerald-950/50'
                              : 'bg-slate-50 dark:bg-slate-800/70 border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-1 text-[11px] font-mono tabular-nums opacity-80">
                          <span>{btn.code}</span>
                          <span>{isPressed ? `${(physVal || 1).toFixed(2)}` : count > 0 ? `×${count}` : 'Idle'}</span>
                        </div>
                        <div className="text-xs font-semibold truncate">{btn.label}</div>
                      </button>
                    );
                  })}
                </div>
              </>
            );
          })()}
        </div>
      </div>

      {/* Rumble / Haptic Test + Event Log + Repair Link */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
        <div className="xl:col-span-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <Vibrate className="w-4 h-4 text-slate-500 dark:text-slate-400" aria-hidden="true" />
              <span>Rumble &amp; Haptic Actuator Test</span>
            </h2>
            {hasAnyDrift && (
              <button
                type="button"
                onClick={onOpenRepair}
                className="min-h-[36px] px-2.5 py-1 text-xs font-medium text-amber-800 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/50 border border-amber-300 dark:border-amber-800 rounded-lg transition-colors flex items-center gap-1.5"
              >
                <Wrench className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Open Stick Repair Guide</span>
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
            <div>
              <div className="flex items-center justify-between mb-1">
                <label htmlFor="rumble-strong" className="text-slate-700 dark:text-slate-300 font-medium">
                  Low-Freq Motor (Left)
                </label>
                <span className="font-mono tabular-nums font-semibold text-slate-900 dark:text-slate-100">
                  {strongRumblePct}%
                </span>
              </div>
              <input
                id="rumble-strong"
                type="range"
                min={0}
                max={100}
                value={strongRumblePct}
                onChange={(e) => setStrongRumblePct(Number(e.target.value))}
                className="w-full accent-blue-600 cursor-pointer"
              />
            </div>
            <div>
              <div className="flex items-center justify-between mb-1">
                <label htmlFor="rumble-weak" className="text-slate-700 dark:text-slate-300 font-medium">
                  High-Freq / VCM (Right)
                </label>
                <span className="font-mono tabular-nums font-semibold text-slate-900 dark:text-slate-100">
                  {weakRumblePct}%
                </span>
              </div>
              <input
                id="rumble-weak"
                type="range"
                min={0}
                max={100}
                value={weakRumblePct}
                onChange={(e) => setWeakRumblePct(Number(e.target.value))}
                className="w-full accent-blue-600 cursor-pointer"
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => void handleTestRumble()}
              className="min-h-[44px] px-4 py-2 text-xs sm:text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors flex items-center gap-2"
            >
              <Vibrate className="w-4 h-4" aria-hidden="true" />
              <span>Test Rumble (400ms)</span>
            </button>
            <span className="text-xs text-slate-500 dark:text-slate-400">
              {rumbleStatus ?? 'Tests ERM dual-rumble & VCM actuator symmetry via Gamepad Vibration API.'}
            </span>
          </div>
        </div>

        <div className="xl:col-span-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              Input &amp; Calibration Event Log
            </h2>
            <span className="text-xs font-mono tabular-nums text-slate-500 dark:text-slate-400">
              {inputEvents.length} events
            </span>
          </div>
          {inputEvents.length === 0 ? (
            <p className="text-xs text-slate-500 dark:text-slate-400 py-4">
              No button presses or calibration captures recorded yet. Press buttons, drag the stick reticle, or click Sweep Circularity above.
            </p>
          ) : (
            <ul className="divide-y divide-slate-100 dark:divide-slate-800 text-xs max-h-44 overflow-y-auto">
              {inputEvents.map((ev) => (
                <li key={ev.id} className="py-1.5 flex items-center justify-between gap-3">
                  <span className="text-slate-800 dark:text-slate-200 truncate">{ev.text}</span>
                  <span className="font-mono tabular-nums text-slate-500 dark:text-slate-400 shrink-0">
                    {ev.time}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}
