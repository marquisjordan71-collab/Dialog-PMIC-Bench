export interface StickCalibrationConfig {
  centerX: number;
  centerY: number;
  deadzone: number; // 0 .. 0.35
  outerThreshold: number; // 0.70 .. 1.0
}

export interface CalibratedStickSample {
  rawX: number;
  rawY: number;
  calX: number;
  calY: number;
  rawMagnitude: number;
  calMagnitude: number;
  angleRad: number;
  inDeadzone: boolean;
}

export interface CircularityResult {
  avgErrorPct: number;
  maxErrorPct: number;
  sectorCoveragePct: number;
  sampleCount: number;
  verdict: 'Unmeasured' | 'Excellent (Hall / TMR)' | 'Nominal (ALPS / OEM)' | 'Asymmetric / Worn Rim';
}

export interface DriftAnalysis {
  meanX: number;
  meanY: number;
  radialOffsetPct: number;
  jitterPct: number;
  severity: 'nominal' | 'minor' | 'severe';
  verdict: string;
}

export interface ButtonMappingItem {
  index: number;
  code: string;
  label: string;
  group: 'face' | 'shoulder' | 'dpad' | 'system' | 'stick';
}

export interface ControllerButtonLayout {
  familyName: string;
  leftTriggerLabel: string;
  rightTriggerLabel: string;
  buttons: ButtonMappingItem[];
}

export const DEFAULT_STICK_CALIBRATION: StickCalibrationConfig = {
  centerX: 0,
  centerY: 0,
  deadzone: 0.06,
  outerThreshold: 1.0,
};

export function clampUnit(val: number): number {
  if (!Number.isFinite(val)) return 0;
  return Math.max(-1, Math.min(1, val));
}

export function applyStickCalibration(
  rawX: number,
  rawY: number,
  config: StickCalibrationConfig,
): CalibratedStickSample {
  const rx = clampUnit(rawX);
  const ry = clampUnit(rawY);
  const shiftedX = rx - config.centerX;
  const shiftedY = ry - config.centerY;

  const normScaleX = shiftedX >= 0 ? Math.max(0.25, 1 - config.centerX) : Math.max(0.25, 1 + config.centerX);
  const normScaleY = shiftedY >= 0 ? Math.max(0.25, 1 - config.centerY) : Math.max(0.25, 1 + config.centerY);

  const centeredX = clampUnit(shiftedX / normScaleX);
  const centeredY = clampUnit(shiftedY / normScaleY);

  const rawMagnitude = Math.min(1.414, Math.hypot(rx, ry));
  const centeredMag = Math.hypot(centeredX, centeredY);
  const angleRad = Math.atan2(centeredY, centeredX);

  const dz = Math.max(0, Math.min(0.35, config.deadzone));
  const outer = Math.max(dz + 0.2, Math.min(1.0, config.outerThreshold));

  if (centeredMag <= dz || centeredMag === 0) {
    return {
      rawX: rx,
      rawY: ry,
      calX: 0,
      calY: 0,
      rawMagnitude,
      calMagnitude: 0,
      angleRad,
      inDeadzone: true,
    };
  }

  const scaledMag = Math.min(1, (centeredMag - dz) / (outer - dz));
  const unitX = centeredX / centeredMag;
  const unitY = centeredY / centeredMag;
  const calX = clampUnit(unitX * scaledMag);
  const calY = clampUnit(unitY * scaledMag);

  return {
    rawX: rx,
    rawY: ry,
    calX,
    calY,
    rawMagnitude,
    calMagnitude: Math.min(1, Math.hypot(calX, calY)),
    angleRad,
    inDeadzone: false,
  };
}

export function calibrateTriggerValue(
  rawValue: number,
  startDeadzone = 0.03,
  fullThreshold = 0.96,
): number {
  const v = Math.max(0, Math.min(1, Number.isFinite(rawValue) ? rawValue : 0));
  const dz = Math.max(0, Math.min(0.3, startDeadzone));
  const full = Math.max(dz + 0.1, Math.min(1, fullThreshold));
  if (v <= dz) return 0;
  if (v >= full) return 1;
  return (v - dz) / (full - dz);
}

export const CIRCULARITY_SECTORS = 36;

export function getCircularitySectorIndex(x: number, y: number): number {
  const angle = Math.atan2(y, x); // -PI..PI
  const normalized = angle < 0 ? angle + Math.PI * 2 : angle;
  return Math.min(
    CIRCULARITY_SECTORS - 1,
    Math.floor((normalized / (Math.PI * 2)) * CIRCULARITY_SECTORS),
  );
}

export function computeCircularityStats(sectorPeaks: Array<number | null>): CircularityResult {
  const measured = sectorPeaks.filter((v): v is number => typeof v === 'number' && v > 0);
  if (measured.length < 4) {
    return {
      avgErrorPct: 0,
      maxErrorPct: 0,
      sectorCoveragePct: Math.round((measured.length / CIRCULARITY_SECTORS) * 100),
      sampleCount: measured.length,
      verdict: 'Unmeasured',
    };
  }

  let totalAbsErr = 0;
  let maxErr = 0;
  for (const r of measured) {
    const err = Math.abs(r - 1.0) * 100;
    totalAbsErr += err;
    if (err > maxErr) maxErr = err;
  }

  const avgErrorPct = Number((totalAbsErr / measured.length).toFixed(1));
  const maxErrorPct = Number(maxErr.toFixed(1));
  const sectorCoveragePct = Math.round((measured.length / CIRCULARITY_SECTORS) * 100);

  let verdict: CircularityResult['verdict'] = 'Nominal (ALPS / OEM)';
  if (avgErrorPct <= 4.5) {
    verdict = 'Excellent (Hall / TMR)';
  } else if (avgErrorPct > 12.5) {
    verdict = 'Asymmetric / Worn Rim';
  }

  return {
    avgErrorPct,
    maxErrorPct,
    sectorCoveragePct,
    sampleCount: measured.length,
    verdict,
  };
}

export function analyzeStickDrift(
  samples: Array<{ x: number; y: number }>,
): DriftAnalysis {
  if (samples.length === 0) {
    return {
      meanX: 0,
      meanY: 0,
      radialOffsetPct: 0,
      jitterPct: 0,
      severity: 'nominal',
      verdict: 'Nominal (< 3% offset)',
    };
  }

  let sumX = 0;
  let sumY = 0;
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;

  for (const s of samples) {
    sumX += s.x;
    sumY += s.y;
    if (s.x < minX) minX = s.x;
    if (s.x > maxX) maxX = s.x;
    if (s.y < minY) minY = s.y;
    if (s.y > maxY) maxY = s.y;
  }

  const meanX = Number((sumX / samples.length).toFixed(3));
  const meanY = Number((sumY / samples.length).toFixed(3));
  const radialOffsetPct = Number((Math.hypot(meanX, meanY) * 100).toFixed(1));
  const jitterPct = Number((Math.max(maxX - minX, maxY - minY) * 100).toFixed(1));

  if (radialOffsetPct >= 8.0) {
    return {
      meanX,
      meanY,
      radialOffsetPct,
      jitterPct,
      severity: 'severe',
      verdict: 'Severe drift (> 8%) — Clean wipers or install Hall/TMR stick',
    };
  }
  if (radialOffsetPct >= 3.0) {
    return {
      meanX,
      meanY,
      radialOffsetPct,
      jitterPct,
      severity: 'minor',
      verdict: 'Minor offset (3–8%) — Capture Zero Center or raise deadzone',
    };
  }
  return {
    meanX,
    meanY,
    radialOffsetPct,
    jitterPct,
    severity: 'nominal',
    verdict: 'Nominal (< 3% offset)',
  };
}

export function computePollingStats(intervalsMs: number[]): { hz: number; avgIntervalMs: number } {
  const valid = intervalsMs.filter((ms) => Number.isFinite(ms) && ms > 0.5 && ms < 250);
  if (valid.length === 0) {
    return { hz: 0, avgIntervalMs: 0 };
  }
  const avg = valid.reduce((a, b) => a + b, 0) / valid.length;
  return {
    hz: Math.round(1000 / avg),
    avgIntervalMs: Number(avg.toFixed(1)),
  };
}

export function buildCalibrationBytePatch(
  leftConfig: StickCalibrationConfig,
  rightConfig: StickCalibrationConfig,
): {
  lxByte: string;
  lyByte: string;
  rxByte: string;
  ryByte: string;
  dzByte: string;
} {
  const encodeSigned = (val: number) => {
    const clamped = Math.max(-127, Math.min(127, Math.round(val * 127)));
    const unsigned = clamped < 0 ? 256 + clamped : clamped;
    return `0x${unsigned.toString(16).toUpperCase().padStart(2, '0')}`;
  };
  const avgDz = Math.round(((leftConfig.deadzone + rightConfig.deadzone) / 2) * 100);
  return {
    lxByte: encodeSigned(leftConfig.centerX),
    lyByte: encodeSigned(leftConfig.centerY),
    rxByte: encodeSigned(rightConfig.centerX),
    ryByte: encodeSigned(rightConfig.centerY),
    dzByte: `0x${Math.max(0, Math.min(50, avgDz)).toString(16).toUpperCase().padStart(2, '0')}`,
  };
}

export function getControllerButtonLayout(partOrId: string | null | undefined): ControllerButtonLayout {
  const upper = (partOrId ?? '').toUpperCase();

  if (
    upper.includes('DUALSENSE') ||
    upper.includes('DUALSHOCK') ||
    upper.includes('PS3') ||
    upper.includes('PLAYSTATION') ||
    upper.includes('SIXAXIS') ||
    upper.includes('054C')
  ) {
    return {
      familyName: 'PlayStation (DualSense / DualShock)',
      leftTriggerLabel: 'L2 Trigger',
      rightTriggerLabel: 'R2 Trigger',
      buttons: [
        { index: 0, code: 'B0', label: 'Cross (×)', group: 'face' },
        { index: 1, code: 'B1', label: 'Circle (○)', group: 'face' },
        { index: 2, code: 'B2', label: 'Square (□)', group: 'face' },
        { index: 3, code: 'B3', label: 'Triangle (△)', group: 'face' },
        { index: 4, code: 'B4', label: 'L1', group: 'shoulder' },
        { index: 5, code: 'B5', label: 'R1', group: 'shoulder' },
        { index: 6, code: 'B6', label: 'L2', group: 'shoulder' },
        { index: 7, code: 'B7', label: 'R2', group: 'shoulder' },
        { index: 8, code: 'B8', label: 'Create / Share', group: 'system' },
        { index: 9, code: 'B9', label: 'Options / Start', group: 'system' },
        { index: 10, code: 'B10', label: 'L3 Stick', group: 'stick' },
        { index: 11, code: 'B11', label: 'R3 Stick', group: 'stick' },
        { index: 12, code: 'B12', label: 'D-Up', group: 'dpad' },
        { index: 13, code: 'B13', label: 'D-Down', group: 'dpad' },
        { index: 14, code: 'B14', label: 'D-Left', group: 'dpad' },
        { index: 15, code: 'B15', label: 'D-Right', group: 'dpad' },
        { index: 16, code: 'B16', label: 'PS Home', group: 'system' },
        { index: 17, code: 'B17', label: 'Touchpad Click', group: 'system' },
      ],
    };
  }

  if (
    upper.includes('SWITCH') ||
    upper.includes('NINTENDO') ||
    upper.includes('RETRO') ||
    upper.includes('SNES') ||
    upper.includes('N64') ||
    upper.includes('057E')
  ) {
    return {
      familyName: 'Nintendo (Switch / Retro)',
      leftTriggerLabel: 'ZL Trigger',
      rightTriggerLabel: 'ZR Trigger',
      buttons: [
        { index: 0, code: 'B0', label: 'B (South)', group: 'face' },
        { index: 1, code: 'B1', label: 'A (East)', group: 'face' },
        { index: 2, code: 'B2', label: 'Y (West)', group: 'face' },
        { index: 3, code: 'B3', label: 'X (North)', group: 'face' },
        { index: 4, code: 'B4', label: 'L', group: 'shoulder' },
        { index: 5, code: 'B5', label: 'R', group: 'shoulder' },
        { index: 6, code: 'B6', label: 'ZL', group: 'shoulder' },
        { index: 7, code: 'B7', label: 'ZR', group: 'shoulder' },
        { index: 8, code: 'B8', label: 'Minus / Select', group: 'system' },
        { index: 9, code: 'B9', label: 'Plus / Start', group: 'system' },
        { index: 10, code: 'B10', label: 'LS Click', group: 'stick' },
        { index: 11, code: 'B11', label: 'RS Click', group: 'stick' },
        { index: 12, code: 'B12', label: 'D-Up', group: 'dpad' },
        { index: 13, code: 'B13', label: 'D-Down', group: 'dpad' },
        { index: 14, code: 'B14', label: 'D-Left', group: 'dpad' },
        { index: 15, code: 'B15', label: 'D-Right', group: 'dpad' },
        { index: 16, code: 'B16', label: 'Home / Capture', group: 'system' },
      ],
    };
  }

  return {
    familyName: 'XInput / Standard HID (Xbox / 8BitDo / Logitech)',
    leftTriggerLabel: 'LT Analog',
    rightTriggerLabel: 'RT Analog',
    buttons: [
      { index: 0, code: 'B0', label: 'A (South)', group: 'face' },
      { index: 1, code: 'B1', label: 'B (East)', group: 'face' },
      { index: 2, code: 'B2', label: 'X (West)', group: 'face' },
      { index: 3, code: 'B3', label: 'Y (North)', group: 'face' },
      { index: 4, code: 'B4', label: 'LB', group: 'shoulder' },
      { index: 5, code: 'B5', label: 'RB', group: 'shoulder' },
      { index: 6, code: 'B6', label: 'LT', group: 'shoulder' },
      { index: 7, code: 'B7', label: 'RT', group: 'shoulder' },
      { index: 8, code: 'B8', label: 'View / Back', group: 'system' },
      { index: 9, code: 'B9', label: 'Menu / Start', group: 'system' },
      { index: 10, code: 'B10', label: 'LS Click', group: 'stick' },
      { index: 11, code: 'B11', label: 'RS Click', group: 'stick' },
      { index: 12, code: 'B12', label: 'D-Up', group: 'dpad' },
      { index: 13, code: 'B13', label: 'D-Down', group: 'dpad' },
      { index: 14, code: 'B14', label: 'D-Left', group: 'dpad' },
      { index: 15, code: 'B15', label: 'D-Right', group: 'dpad' },
      { index: 16, code: 'B16', label: 'Guide / Home', group: 'system' },
    ],
  };
}
