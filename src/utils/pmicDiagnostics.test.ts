import test from 'node:test';
import assert from 'node:assert/strict';
import { CONSUMER_DEVICE_PROFILES, DIALOG_PMIC_PROFILES } from './pmicCatalog';
import { createInitialRailStates } from './pmicProtocol';
import { runPmicDiagnostics } from './pmicDiagnostics';

test('runPmicDiagnostics flags disabled rail and latched fault log as software 1-touch repairable', () => {
  const profile = DIALOG_PMIC_PROFILES.DA9063;
  const rails = createInitialRailStates(profile);
  rails[0] = { ...rails[0], enabled: false };

  const report = runPmicDiagnostics({
    profile,
    railStates: rails,
    registerOverrides: { '0x0E0': '0x08' },
    activeFirmwareVersion: profile.firmwareVersion,
    vinMv: 5000,
    faultScenario: 'auto',
    bootFaultCleared: true,
  });

  assert.equal(report.overallStatus, 'critical');
  assert.ok(report.findings.some((f) => f.id === 'diag-fault-log' && f.repairType === 'software'));
  const railFinding = report.findings.find((f) => f.id === 'diag-rail-off-BCORE1');
  assert.ok(railFinding);
  assert.equal(railFinding.repairType, 'software');
  assert.ok(railFinding.repairRailUpdates && railFinding.repairRailUpdates.length === 1);
  assert.equal(railFinding.repairRailUpdates[0].enabled, true);
});

test('runPmicDiagnostics returns healthy report after software issues are repaired', () => {
  const profile = DIALOG_PMIC_PROFILES.DA9063;
  const rails = createInitialRailStates(profile);

  const report = runPmicDiagnostics({
    profile,
    railStates: rails,
    registerOverrides: { '0x0E0': '0x00' },
    activeFirmwareVersion: profile.firmwareVersion,
    vinMv: 5000,
    faultScenario: 'auto',
    bootFaultCleared: true,
  });

  assert.equal(report.overallStatus, 'healthy');
  assert.equal(report.findings.length, 0);
  assert.equal(report.passedChecks, report.totalChecks);
});

test('runPmicDiagnostics generates step-by-step hardware repair guide, tools, sourcing links, and graphics metadata', () => {
  const profile = DIALOG_PMIC_PROFILES.DA9063;
  const rails = createInitialRailStates(profile);

  const i2cReport = runPmicDiagnostics({
    profile,
    railStates: rails,
    registerOverrides: {},
    activeFirmwareVersion: profile.firmwareVersion,
    vinMv: 5000,
    faultScenario: 'i2c-pullup-hw',
    bootFaultCleared: true,
  });

  const hwFinding = i2cReport.findings.find((f) => f.repairType === 'hardware');
  assert.ok(hwFinding);
  assert.equal(hwFinding.graphicKind, 'i2c-pullup');
  assert.ok(hwFinding.toolsNeeded && hwFinding.toolsNeeded.length >= 4);
  assert.ok(hwFinding.partsToSource && hwFinding.partsToSource.length >= 2);
  assert.ok(hwFinding.partsToSource[0].suppliers.some((s) => s.name === 'DigiKey'));
  assert.ok(hwFinding.repairSteps && hwFinding.repairSteps.length === 4);

  const buckReport = runPmicDiagnostics({
    profile,
    railStates: rails,
    registerOverrides: {},
    activeFirmwareVersion: profile.firmwareVersion,
    vinMv: 5000,
    faultScenario: 'buck-inductor-hw',
    bootFaultCleared: true,
  });
  const buckHw = buckReport.findings.find((f) => f.graphicKind === 'buck-inductor');
  assert.ok(buckHw);
  assert.ok(buckHw.partsToSource?.some((p) => p.suppliers.some((s) => s.name === 'Renesas Direct')));
  assert.ok(buckHw.repairSteps && buckHw.repairSteps.length === 4);
});

test('runPmicDiagnostics supports consumer USB-C port / PD IC and gamepad Hall-effect hardware repair workflow', () => {
  const dualsense = CONSUMER_DEVICE_PROFILES.DUALSENSE;
  const padRails = createInitialRailStates(dualsense);

  const portReport = runPmicDiagnostics({
    profile: dualsense,
    railStates: padRails,
    registerOverrides: {},
    activeFirmwareVersion: dualsense.firmwareVersion,
    vinMv: dualsense.nominalVinMv,
    faultScenario: 'usbc-port-hw',
    bootFaultCleared: true,
  });

  const portHw = portReport.findings.find((f) => f.id === 'diag-hw-usbc-port');
  assert.ok(portHw);
  assert.equal(portHw.graphicKind, 'usbc-port');
  assert.ok(portHw.repairSteps && portHw.repairSteps.length === 4);
  assert.ok(portHw.partsToSource?.some((p) => p.name.includes('Hall-Effect')));
  assert.ok(portHw.partsToSource?.some((p) => p.suppliers.some((s) => s.name === 'iFixit Parts')));

  // Consumer software reset latch on cold boot
  const coldBoot = runPmicDiagnostics({
    profile: CONSUMER_DEVICE_PROFILES['GALAXY-USBC'],
    railStates: createInitialRailStates(CONSUMER_DEVICE_PROFILES['GALAXY-USBC']),
    registerOverrides: {},
    activeFirmwareVersion: CONSUMER_DEVICE_PROFILES['GALAXY-USBC'].firmwareVersion,
    vinMv: CONSUMER_DEVICE_PROFILES['GALAXY-USBC'].nominalVinMv,
    faultScenario: 'auto',
    bootFaultCleared: false,
  });
  assert.ok(coldBoot.findings.some((f) => f.id === 'diag-fault-log' && f.repairType === 'software'));
});
