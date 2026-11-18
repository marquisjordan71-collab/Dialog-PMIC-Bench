import test from 'node:test';
import assert from 'node:assert/strict';
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
} from './gamepadCalibration';

test('applyStickCalibration applies center offset trim and radial deadzone shaping', () => {
  const centered = applyStickCalibration(0.08, -0.04, {
    centerX: 0.08,
    centerY: -0.04,
    deadzone: 0.06,
    outerThreshold: 1.0,
  });
  assert.equal(centered.inDeadzone, true);
  assert.equal(centered.calX, 0);
  assert.equal(centered.calY, 0);

  const deflected = applyStickCalibration(1.0, 0, DEFAULT_STICK_CALIBRATION);
  assert.equal(deflected.inDeadzone, false);
  assert.ok(deflected.calX > 0.99);
  assert.equal(deflected.calY, 0);

  // Inner deadzone suppresses resting micro-drift
  const microDrift = applyStickCalibration(0.04, -0.03, DEFAULT_STICK_CALIBRATION);
  assert.equal(microDrift.inDeadzone, true);
  assert.equal(microDrift.calMagnitude, 0);
});

test('computeCircularityStats evaluates 36-sector rim sweep accuracy', () => {
  const ideal = new Array<number | null>(CIRCULARITY_SECTORS).fill(1.0);
  const idealStats = computeCircularityStats(ideal);
  assert.equal(idealStats.avgErrorPct, 0);
  assert.equal(idealStats.sectorCoveragePct, 100);
  assert.equal(idealStats.verdict, 'Excellent (Hall / TMR)');

  const squareGated = new Array<number | null>(CIRCULARITY_SECTORS).fill(1.18);
  const squareStats = computeCircularityStats(squareGated);
  assert.equal(squareStats.avgErrorPct, 18);
  assert.equal(squareStats.verdict, 'Asymmetric / Worn Rim');

  assert.equal(getCircularitySectorIndex(1, 0), 0);
  assert.equal(getCircularitySectorIndex(0, 1), 9);
});

test('analyzeStickDrift detects nominal, minor, and severe stick drift', () => {
  const nominal = analyzeStickDrift([
    { x: 0.01, y: -0.01 },
    { x: 0.02, y: 0.0 },
  ]);
  assert.equal(nominal.severity, 'nominal');

  const minor = analyzeStickDrift([
    { x: 0.05, y: 0.02 },
    { x: 0.06, y: 0.02 },
  ]);
  assert.equal(minor.severity, 'minor');

  const severe = analyzeStickDrift([
    { x: 0.14, y: -0.05 },
    { x: 0.16, y: -0.06 },
  ]);
  assert.equal(severe.severity, 'severe');
});

test('calibrateTriggerValue, computePollingStats, layouts, and calibration byte encoding', () => {
  assert.equal(calibrateTriggerValue(0.02, 0.05, 0.95), 0);
  assert.equal(calibrateTriggerValue(0.97, 0.05, 0.95), 1);
  assert.ok(Math.abs(calibrateTriggerValue(0.5, 0.0, 1.0) - 0.5) < 0.001);

  const poll = computePollingStats([4, 4, 4, 4]);
  assert.equal(poll.hz, 250);
  assert.equal(poll.avgIntervalMs, 4);

  const psLayout = getControllerButtonLayout('DUALSENSE');
  assert.equal(psLayout.buttons[0].label, 'Cross (×)');
  assert.equal(psLayout.leftTriggerLabel, 'L2 Trigger');

  const nintendoLayout = getControllerButtonLayout('SWITCH-PRO');
  assert.equal(nintendoLayout.buttons[0].label, 'B (South)');

  const xboxLayout = getControllerButtonLayout('XBOX-360');
  assert.equal(xboxLayout.buttons[0].label, 'A (South)');

  const patch = buildCalibrationBytePatch(
    { centerX: 0.05, centerY: -0.05, deadzone: 0.08, outerThreshold: 1 },
    { centerX: 0, centerY: 0, deadzone: 0.06, outerThreshold: 1 },
  );
  assert.match(patch.lxByte, /^0x[0-9A-F]{2}$/);
  assert.match(patch.lyByte, /^0x[0-9A-F]{2}$/);
  assert.equal(patch.dzByte, '0x07');
});
