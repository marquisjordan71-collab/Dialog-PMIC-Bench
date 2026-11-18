import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyTelemetrySyncTick,
  deserializeBenchSnapshot,
  resolveIsDark,
  serializeBenchSnapshot,
} from './workspaceSync';

test('resolveIsDark handles explicit light, dark, and system preference modes', () => {
  assert.equal(resolveIsDark('dark', false), true);
  assert.equal(resolveIsDark('light', true), false);
  assert.equal(resolveIsDark('system', true), true);
  assert.equal(resolveIsDark('system', false), false);
});

test('applyTelemetrySyncTick keeps disabled rails at 0 mA and bounds active rail jitter', () => {
  const rails = [
    { id: 'BCORE1', enabled: true, voltageMv: 1100, currentMa: 850, tempC: 35.0 },
    { id: 'LDO5', enabled: false, voltageMv: 2800, currentMa: 40, tempC: 34.0 },
  ];
  const next = applyTelemetrySyncTick(rails, 2);
  assert.ok(next[0].currentMa > 800 && next[0].currentMa < 900);
  assert.equal(next[1].currentMa, 0);
});

test('serializeBenchSnapshot and deserializeBenchSnapshot roundtrip cleanly', () => {
  const payload = serializeBenchSnapshot({
    partNumber: 'DA9063',
    transport: 'Bench-OTG',
    railStates: [{ id: 'BCORE1', enabled: true, voltageMv: 1120, currentMa: 850, tempC: 36.2 }],
    registerOverrides: { '0x0A3': '0x52' },
    activeFirmwareVersion: 'OTP-00HO2-R4',
    vinMv: 5000,
    bootFaultCleared: true,
    flashHistory: [],
    i2cLog: [],
    deviceManuals: [],
    updatedAt: '2026-11-16T23:10:00Z',
  });
  const parsed = deserializeBenchSnapshot(payload);
  assert.ok(parsed);
  assert.equal(parsed.partNumber, 'DA9063');
  assert.equal(parsed.registerOverrides['0x0A3'], '0x52');
  assert.equal(parsed.bootFaultCleared, true);
  assert.equal(deserializeBenchSnapshot('not-json'), null);
});
