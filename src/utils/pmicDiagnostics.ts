import type { PmicProfile } from './pmicCatalog';
import { formatHexByte, millivoltsToDacCode, type RailRuntimeState } from './pmicProtocol';

export type DiagnosticFaultScenario =
  | 'auto'
  | 'i2c-pullup-hw'
  | 'buck-inductor-hw'
  | 'vbus-cable-hw'
  | 'thermal-pad-hw'
  | 'usbc-port-hw';

export type HardwareGraphicKind =
  | 'i2c-pullup'
  | 'buck-inductor'
  | 'vbus-usb-otg'
  | 'thermal-qfn'
  | 'usbc-port';

export interface HardwareRepairStep {
  stepNumber: number;
  title: string;
  instruction: string;
  expectedReading: string;
  caution?: string;
  highlightZone: 'power-off' | 'probe' | 'rework' | 'verify';
}

export interface PartSourceEntry {
  name: string;
  spec: string;
  packageSize: string;
  estPriceUsd: string;
  suppliers: Array<{ name: string; url: string }>;
}

export interface DiagnosticFinding {
  id: string;
  code: string;
  title: string;
  subsystem: 'I2C Bus' | 'Power Rails' | 'Input Supply' | 'OTP / Watchdog' | 'Thermal' | 'USB-C / Port';
  severity: 'critical' | 'warning';
  repairType: 'software' | 'hardware';
  summary: string;
  measuredValue: string;
  expectedValue: string;
  // For 1-touch software repair
  repairActionLabel?: string;
  repairRegisterWrites?: Array<{ addr: string; value: string; note: string }>;
  repairRailUpdates?: Array<{ railId: string; voltageMv?: number; enabled?: boolean }>;
  clearHardwareScenario?: boolean;
  // For step-by-step hardware repair
  toolsNeeded?: string[];
  partsToSource?: PartSourceEntry[];
  graphicKind?: HardwareGraphicKind;
  repairSteps?: HardwareRepairStep[];
}

export interface DiagnosticReport {
  ranAt: string;
  partNumber: string;
  totalChecks: number;
  passedChecks: number;
  findings: DiagnosticFinding[];
  overallStatus: 'healthy' | 'warnings' | 'critical';
}

export interface DiagnosticInput {
  profile: PmicProfile;
  railStates: RailRuntimeState[];
  registerOverrides: Record<string, string>;
  activeFirmwareVersion: string;
  vinMv: number;
  faultScenario: DiagnosticFaultScenario;
  bootFaultCleared?: boolean;
}

function buildSuppliers(
  keyword: string,
  options?: { includeRenesas?: boolean; includeIfixit?: boolean; ifixitQuery?: string },
): Array<{ name: string; url: string }> {
  const encoded = encodeURIComponent(keyword);
  const list = [
    { name: 'DigiKey', url: `https://www.digikey.com/en/products/result?keywords=${encoded}` },
    { name: 'Mouser', url: `https://www.mouser.com/c/?q=${encoded}` },
    { name: 'Arrow', url: `https://www.arrow.com/en/products/search?q=${encoded}` },
  ];
  if (options?.includeRenesas) {
    list.unshift({ name: 'Renesas Direct', url: `https://www.renesas.com/en/search?keywords=${encoded}` });
  }
  if (options?.includeIfixit) {
    const q = encodeURIComponent(options.ifixitQuery || keyword);
    list.unshift({ name: 'iFixit Parts', url: `https://www.ifixit.com/Search?query=${q}` });
  }
  return list;
}

function getRegVal(profile: PmicProfile, overrides: Record<string, string>, addr: string): string {
  const norm = `0x${addr.replace(/^0x/i, '').padStart(3, '0').toUpperCase()}`;
  if (overrides[norm] !== undefined) return overrides[norm];
  const def = profile.registers.find(
    (r) => `0x${r.addr.replace(/^0x/i, '').padStart(3, '0').toUpperCase()}` === norm,
  );
  return def?.defaultVal ?? '0x00';
}

export function runPmicDiagnostics(input: DiagnosticInput): DiagnosticReport {
  const { profile, railStates, registerOverrides, vinMv, faultScenario, bootFaultCleared } = input;
  const findings: DiagnosticFinding[] = [];
  const totalChecks = 7;

  const isConsumer = Boolean(profile.deviceCategory && profile.deviceCategory !== 'pmic');
  const isGamepad = profile.deviceCategory === 'consumer-gamepad';
  const deviceLabel = profile.displayName ?? profile.partNumber;
  const controllerLabel = profile.controllerIc ?? profile.partNumber;

  // 1. Check latched FAULT_LOG (or cold-boot factory POR advisory on initial connect)
  const faultRegDef = profile.registers.find(
    (r) => r.name.includes('FAULT') || r.addr.toUpperCase() === '0X0E0' || r.addr.toUpperCase() === '0X00A',
  );
  if (faultRegDef) {
    const val = getRegVal(profile, registerOverrides, faultRegDef.addr);
    const numVal = parseInt(val, 16);
    const hasLatchedFault = !Number.isNaN(numVal) && numVal !== 0;
    const isColdBootAdvisory =
      !bootFaultCleared && val === faultRegDef.defaultVal && numVal === 0 && faultScenario === 'auto';

    if (hasLatchedFault || isColdBootAdvisory) {
      findings.push({
        id: 'diag-fault-log',
        code: 'ERR-REG-0E0',
        title: hasLatchedFault
          ? `Latched Fault Bits Detected in ${faultRegDef.name}`
          : isConsumer
            ? `Unacknowledged USB-C / Controller Reset Flag in ${faultRegDef.name}`
            : `Unacknowledged Power-On Reset Flag in ${faultRegDef.name}`,
        subsystem: 'OTP / Watchdog',
        severity: hasLatchedFault ? 'critical' : 'warning',
        repairType: 'software',
        summary: hasLatchedFault
          ? `${faultRegDef.name} (${faultRegDef.addr}) holds non-zero fault bits (${val}) from a prior UVLO, OVP, or controller brownout event.`
          : isConsumer
            ? `Initial USB-C / HID enumeration on ${deviceLabel} flagged a power-on reset status bit requiring W1C register clear and telemetry sync.`
            : `Initial USB-C OTG enumeration flagged an unacknowledged power-on reset status bit requiring W1C register clear and watchdog sync.`,
        measuredValue: `${faultRegDef.addr} = ${hasLatchedFault ? val : '0x04 (POR_FLAG)'}`,
        expectedValue: `${faultRegDef.addr} = 0x00`,
        repairActionLabel: isConsumer ? 'Clear Reset Latch & Sync Controller' : 'Clear Fault Log & Sync Watchdog',
        repairRegisterWrites: [
          { addr: faultRegDef.addr, value: '0x00', note: `W1C clear ${faultRegDef.name}` },
        ],
      });
    }
  }

  // 2. Check disabled or under-voltage / over-voltage rails
  for (const railDef of profile.rails) {
    const st = railStates.find((s) => s.id === railDef.id);
    if (!st) continue;

    if (!st.enabled) {
      const code = millivoltsToDacCode(railDef.defaultMv, railDef.minMv, railDef.stepMv, railDef.maxMv);
      findings.push({
        id: `diag-rail-off-${railDef.id}`,
        code: `ERR-RAIL-${railDef.id}`,
        title: `Critical Supply Rail ${railDef.id} is Disabled`,
        subsystem: 'Power Rails',
        severity: 'critical',
        repairType: 'software',
        summary: `${railDef.name} (${railDef.description}) is currently turned off in enable register ${railDef.enableReg}. Downstream ${isConsumer ? 'controller/logic' : 'SoC logic'} may fail to respond.`,
        measuredValue: '0 mV (Disabled)',
        expectedValue: `${railDef.defaultMv} mV (Enabled)`,
        repairActionLabel: `Restore & Enable ${railDef.id}`,
        repairRailUpdates: [{ railId: railDef.id, voltageMv: railDef.defaultMv, enabled: true }],
        repairRegisterWrites: [
          { addr: railDef.enableReg, value: '0x01', note: `Enable ${railDef.id}` },
          { addr: railDef.regAddr, value: formatHexByte(code), note: `Set ${railDef.id} to ${railDef.defaultMv} mV` },
        ],
      });
    } else if (Math.abs(st.voltageMv - railDef.defaultMv) > Math.max(150, railDef.defaultMv * 0.2)) {
      const code = millivoltsToDacCode(railDef.defaultMv, railDef.minMv, railDef.stepMv, railDef.maxMv);
      findings.push({
        id: `diag-rail-drift-${railDef.id}`,
        code: `WARN-VOUT-${railDef.id}`,
        title: `${railDef.id} Voltage Outside Nominal Window`,
        subsystem: 'Power Rails',
        severity: 'warning',
        repairType: 'software',
        summary: `${railDef.id} target (${st.voltageMv} mV) deviates >20% from its nominal default (${railDef.defaultMv} mV).`,
        measuredValue: `${st.voltageMv} mV`,
        expectedValue: `${railDef.defaultMv} mV ±10%`,
        repairActionLabel: `Reset ${railDef.id} to ${railDef.defaultMv} mV`,
        repairRailUpdates: [{ railId: railDef.id, voltageMv: railDef.defaultMv, enabled: true }],
        repairRegisterWrites: [
          { addr: railDef.regAddr, value: formatHexByte(code), note: `Restore ${railDef.id} nominal DAC` },
        ],
      });
    }
  }

  // 3. Check VIN / VSYS Under-Voltage (Hardware fault)
  if (vinMv < profile.vinMinMv || faultScenario === 'vbus-cable-hw') {
    const measuredV = faultScenario === 'vbus-cable-hw' ? '2.42 V' : `${(vinMv / 1000).toFixed(2)} V`;
    findings.push({
      id: 'diag-hw-vbus-uvlo',
      code: 'HW-VBUS-UVLO',
      title: isConsumer
        ? 'USB VBUS Input Droop / Cable Resistance (Hardware)'
        : 'USB-C OTG / VSYS Input Under-Voltage (Hardware)',
      subsystem: 'Input Supply',
      severity: 'critical',
      repairType: 'hardware',
      summary: isConsumer
        ? `VBUS input to ${deviceLabel} droops below UVLO threshold under load, pointing to high-resistance USB cables, worn battery/VBUS connector pins, or degraded bulk capacitor C_IN.`
        : 'VSYS rail droops below minimum UVLO threshold under load, indicating excessive USB-C OTG cable resistance, faulty Schottky VBUS diode, or missing bulk input capacitance.',
      measuredValue: measuredV,
      expectedValue: `≥ ${(profile.vinMinMv / 1000).toFixed(2)} V (Nominal ${(profile.nominalVinMv / 1000).toFixed(2)} V)`,
      toolsNeeded: [
        'Digital Multimeter (DC Voltage & Continuity mode)',
        'USB-C PD / OTG Inline Power Meter',
        'Fine-tip Soldering Iron (320°C) + No-Clean Flux',
        'Precision ESD Tweezers & 99% Isopropyl Alcohol',
      ],
      partsToSource: [
        {
          name: '22 µF 10V X5R/X7R MLCC Capacitor (C_IN)',
          spec: '22 µF ±10%, 10V–16V DC, Low-ESR X5R/X7R',
          packageSize: '0805 (2012 Metric)',
          estPriceUsd: '$0.18 – $0.45',
          suppliers: buildSuppliers('22uF 10V X5R 0805'),
        },
        {
          name: 'Schottky Barrier Diode (VBUS Reverse Protection)',
          spec: '30V 3A Low-Vf (≤ 0.42V) SMD Schottky (e.g., B330 / MBRS340)',
          packageSize: 'SMA / SOD-123FL',
          estPriceUsd: '$0.25 – $0.60',
          suppliers: buildSuppliers('MBRS340 Schottky 30V 3A'),
        },
        {
          name: 'Short Shielded USB-C OTG Cable (5A Rated)',
          spec: 'USB-C to USB-C / OTG 20AWG power conductors, ≤ 0.5 m',
          packageSize: 'USB-C 24-pin',
          estPriceUsd: '$6.00 – $12.00',
          suppliers: buildSuppliers('USB-C OTG cable 5A', { includeIfixit: isConsumer, ifixitQuery: `${deviceLabel} cable` }),
        },
      ],
      graphicKind: 'vbus-usb-otg',
      repairSteps: [
        {
          stepNumber: 1,
          title: 'Measure VBUS & VSYS directly at Board Test Point',
          instruction:
            'Place the black multimeter probe on GND and red probe on VSYS / VBUS test pad (TP1). Compare voltage against an inline USB meter to isolate cable vs board drop.',
          expectedReading: 'VSYS ≥ 4.50 V DC (drop across cable/adapter < 0.25 V)',
          caution: 'Do not bridge adjacent USB-C CC1/CC2 pins with the probe tip.',
          highlightZone: 'probe',
        },
        {
          stepNumber: 2,
          title: 'Swap to a Low-Resistance USB Cable & Inspect Fuse / D1',
          instruction:
            'Disconnect power, swap to a short 5A-rated shielded cable, and verify VBUS input protection diode/fuse continuity.',
          expectedReading: 'Input fuse / D1 forward resistance < 0.15 Ω',
          highlightZone: 'power-off',
        },
        {
          stepNumber: 3,
          title: 'Inspect & Rework Bulk Input Capacitor (C_IN)',
          instruction:
            'Check the 22 µF VSYS decoupling capacitor adjacent to the USB input for hairline cracks or cold solder joints. Reflow or replace C_IN if ESR is high.',
          expectedReading: 'Capacitance 22 µF ±15%, no short to GND (> 5 kΩ)',
          caution: 'Discharge input rail completely before soldering.',
          highlightZone: 'rework',
        },
        {
          stepNumber: 4,
          title: 'Re-connect USB-C OTG and Re-Verify Telemetry',
          instruction:
            'Plug the device back in, confirm VBUS/VSYS holds steady under load, and run Diagnostics again.',
          expectedReading: 'VBUS / VSYS 4.85 V – 5.10 V stable (or negotiated PD PDO)',
          highlightZone: 'verify',
        },
      ],
    });
  }

  // 4. I2C Bus SDA/SCL Pull-Up Hardware Fault
  if (faultScenario === 'i2c-pullup-hw') {
    findings.push({
      id: 'diag-hw-i2c-pullup',
      code: 'HW-I2C-NACK',
      title: 'I2C Bus SDA/SCL Missing Pull-Up or Open Line (Hardware)',
      subsystem: 'I2C Bus',
      severity: 'critical',
      repairType: 'hardware',
      summary:
        'Host I2C transactions experience clock stretching timeouts or NACKs. Measured idle voltage on SDA/SCL indicates an open 2.2 kΩ pull-up resistor or unseated level-shifter jumper.',
      measuredValue: 'SDA 0.18 V / SCL 0.21 V (Float)',
      expectedValue: 'SDA & SCL Idle 1.80 V or 3.30 V',
      toolsNeeded: [
        'Digital Multimeter (Resistance & DC Volts)',
        'Precision ESD Tweezers',
        'Soldering Iron (310°C) + Lead-Free Solder & Flux',
        '99% Isopropyl Alcohol & ESD Brush',
      ],
      partsToSource: [
        {
          name: '2.2 kΩ SMD Pull-Up Resistors (R12 SDA, R13 SCL)',
          spec: '2.2 kΩ ±1%, 1/10W Thick-Film Chip Resistor (Qty: 2)',
          packageSize: '0603 (1608 Metric)',
          estPriceUsd: '$0.08 – $0.15',
          suppliers: buildSuppliers('2.2k ohm 0603 1% resistor'),
        },
        {
          name: '2.54mm Shunt Jumper Cap (VIO Logic Selector J2)',
          spec: '2-position 2.54mm (0.1") gold-plated shunt jumper',
          packageSize: '2.54mm Pitch',
          estPriceUsd: '$0.10 – $0.25',
          suppliers: buildSuppliers('2.54mm 2-pin jumper shunt'),
        },
        {
          name: 'USB-I2C Bridge Adapter (CP2112 / MCP2221A Backup)',
          spec: 'HID-to-SMBus/I2C OTG compatible bridge module',
          packageSize: 'USB-C / Breakout',
          estPriceUsd: '$6.50 – $14.00',
          suppliers: buildSuppliers('CP2112 USB I2C bridge'),
        },
      ],
      graphicKind: 'i2c-pullup',
      repairSteps: [
        {
          stepNumber: 1,
          title: 'Power Down & Check SDA/SCL Pull-Up Resistance',
          instruction:
            'Unplug USB-C OTG power. Measure resistance from TP_SDA and TP_SCL to the VIO pull-up rail (1.8 V / 3.3 V) using your multimeter.',
          expectedReading: '2.0 kΩ – 4.7 kΩ (Open / > 1 MΩ confirms missing pull-up)',
          caution: 'Never measure resistance while USB-C power is connected.',
          highlightZone: 'power-off',
        },
        {
          stepNumber: 2,
          title: 'Verify VIO Pull-Up Selector Jumper / Level Shifter',
          instruction:
            'Confirm the board I2C pull-up jumper or VIO supply bridges 1.8 V or 3.3 V matching your USB-I2C interface logic level.',
          expectedReading: 'VIO jumper continuity < 0.2 Ω',
          highlightZone: 'probe',
        },
        {
          stepNumber: 3,
          title: 'Solder / Reflow 2.2 kΩ Pull-Up Resistors (R12, R13)',
          instruction:
            'Apply tacky flux to pads R12 (SDA→VIO) and R13 (SCL→VIO), place 2.2 kΩ 0603 resistors with ESD tweezers, and reflow cleanly. Clean flux residue with IPA.',
          expectedReading: 'Both R12 & R13 read 2.2 kΩ ±5% with zero solder bridges',
          highlightZone: 'rework',
        },
        {
          stepNumber: 4,
          title: 'Power On & Confirm Clean I2C ACK',
          instruction:
            'Reconnect USB-C OTG, verify idle SDA and SCL voltages match VIO (1.8 V / 3.3 V), and re-run Diagnostics.',
          expectedReading: `Device ID ${profile.deviceIdReg} reads back cleanly with 0 NACKs`,
          highlightZone: 'verify',
        },
      ],
    });
  }

  // 5. Buck Inductor / Output Short Hardware Fault
  const firstBuck = profile.rails.find((r) => r.type === 'BUCK') ?? profile.rails[0];
  if (faultScenario === 'buck-inductor-hw') {
    findings.push({
      id: 'diag-hw-buck-inductor',
      code: 'HW-SW-IND',
      title: `${firstBuck.id} Switching Node Ripple / Inductor Fault (Hardware)`,
      subsystem: 'Power Rails',
      severity: 'critical',
      repairType: 'hardware',
      summary:
        `Elevated switching ripple and inductor current limit tripping on ${firstBuck.id} (${firstBuck.regAddr}). Indicates a cracked ferrite power inductor, shorted MLCC output cap, or cold SW pad.`,
      measuredValue: 'Vpp Ripple 185 mV / SW Short',
      expectedValue: 'Vpp Ripple < 25 mV / L = 0.47–1.0 µH',
      toolsNeeded: [
        'Digital Multimeter (Diode & Resistance mode)',
        'Oscilloscope (optional, 20 MHz BW limit for ripple)',
        'Hot-Air Rework Station (360°C) + Kapton Tape',
        'No-Clean Gel Flux & Solder Wick',
      ],
      partsToSource: [
        {
          name: '1.0 µH Shielded Power Inductor (L1)',
          spec: '1.0 µH ±20%, Isat ≥ 4.5A, DCR ≤ 28 mΩ (e.g., Coilcraft XAL4020 / Bourns SRP4020)',
          packageSize: '4.0 × 4.0 mm SMD',
          estPriceUsd: '$0.65 – $1.40',
          suppliers: buildSuppliers('1.0uH 4.5A shielded inductor 4020'),
        },
        {
          name: '22 µF 6.3V X5R Output Capacitor (C_OUT)',
          spec: '22 µF ±20%, 6.3V–10V X5R Ceramic MLCC',
          packageSize: '0603 / 0805',
          estPriceUsd: '$0.15 – $0.35',
          suppliers: buildSuppliers('22uF 6.3V X5R 0603'),
        },
        {
          name: `${controllerLabel} Replacement IC`,
          spec: `${controllerLabel} (${profile.manufacturer})`,
          packageSize: profile.packageType,
          estPriceUsd: '$2.80 – $8.50',
          suppliers: buildSuppliers(controllerLabel.split('+')[0].trim(), {
            includeRenesas: !isConsumer,
            includeIfixit: isConsumer,
            ifixitQuery: deviceLabel,
          }),
        },
      ],
      graphicKind: 'buck-inductor',
      repairSteps: [
        {
          stepNumber: 1,
          title: 'Check Output Rail Impedance to Ground',
          instruction:
            `With USB power removed, probe ${firstBuck.id} VOUT (TP5) to GND in Resistance mode to rule out a shorted output MLCC capacitor.`,
          expectedReading: '> 50 Ω to GND (reading < 2 Ω indicates shorted COUT or IC)',
          caution: 'Do not exceed 0.5V probe bias on core rails.',
          highlightZone: 'probe',
        },
        {
          stepNumber: 2,
          title: 'Mask Adjacent Components & Inspect Inductor L1',
          instruction:
            'Apply Kapton tape around L1 and nearby ceramic caps. Check the ferrite core of L1 for hairline fractures or lifted solder fillets on the SW pad.',
          expectedReading: 'SW-to-VOUT DC resistance (DCR) < 0.08 Ω',
          highlightZone: 'power-off',
        },
        {
          stepNumber: 3,
          title: 'Replace Power Inductor L1 with Hot-Air Station',
          instruction:
            'Pre-heat board gently, apply flux around L1 pads, lift damaged inductor at 360°C airflow, wick pads flat, and reflow a fresh ≥ 4.5A shielded inductor.',
          expectedReading: 'Clean concave solder fillets on both SW and VOUT pads',
          caution: 'Keep airflow angled away from plastic connectors and QFN/BGA packages.',
          highlightZone: 'rework',
        },
        {
          stepNumber: 4,
          title: 'Verify Output Regulation Under Load',
          instruction:
            `Power on via USB-C OTG and verify ${firstBuck.id} regulates at ${firstBuck.defaultMv} mV with low ripple.`,
          expectedReading: `${firstBuck.defaultMv} mV ±2%, die temp < 55°C`,
          highlightZone: 'verify',
        },
      ],
    });
  }

  // 6. Thermal Pad / Over-Temperature Hardware Fault
  const peakTemp = Math.max(...railStates.map((r) => r.tempC), 32);
  if (peakTemp >= 75 || faultScenario === 'thermal-pad-hw') {
    findings.push({
      id: 'diag-hw-thermal',
      code: 'HW-THERM-PAD',
      title: isConsumer
        ? `${deviceLabel} Controller Over-Temperature / Thermal Pad Delamination (Hardware)`
        : 'PMIC Die Over-Temperature / Thermal Pad Delamination (Hardware)',
      subsystem: 'Thermal',
      severity: 'critical',
      repairType: 'hardware',
      summary:
        'Elevated junction temperature delta indicates an under-soldered exposed ground thermal pad (EPAD), dried thermal paste/putty, or high-resistance PCB thermal vias.',
      measuredValue: faultScenario === 'thermal-pad-hw' ? '94.6 °C (Warning > 85°C)' : `${peakTemp.toFixed(1)} °C`,
      expectedValue: '30.0 °C – 60.0 °C Nominal',
      toolsNeeded: [
        'Hot-Air Rework Station + PCB Pre-Heater',
        'No-Clean Gel Flux & SAC305 Solder Paste',
        'IR Thermometer or Thermal Camera',
        '99% Isopropyl Alcohol & ESD Tweezers',
      ],
      partsToSource: [
        {
          name: 'Silicone Thermal Gap Pad / Copper Shim',
          spec: '1.5–3.0 W/m·K thermally conductive pad (0.5mm–1.0mm thick)',
          packageSize: 'Cut-to-fit 8 × 8 mm',
          estPriceUsd: '$1.20 – $3.50',
          suppliers: buildSuppliers('silicone thermal pad 3W/mK', { includeIfixit: isConsumer, ifixitQuery: 'thermal pad' }),
        },
        {
          name: 'Aluminum Mini Heatsink (QFN Top-Mount)',
          spec: '9 × 9 × 5 mm anodized aluminum heatsink with thermal adhesive',
          packageSize: '9 × 9 mm',
          estPriceUsd: '$0.55 – $1.10',
          suppliers: buildSuppliers('9x9x5mm aluminum heatsink'),
        },
        {
          name: `${controllerLabel} Replacement IC`,
          spec: `${controllerLabel} (${profile.manufacturer})`,
          packageSize: profile.packageType,
          estPriceUsd: '$2.80 – $8.50',
          suppliers: buildSuppliers(controllerLabel.split('+')[0].trim(), {
            includeRenesas: !isConsumer,
            includeIfixit: isConsumer,
            ifixitQuery: deviceLabel,
          }),
        },
      ],
      graphicKind: 'thermal-qfn',
      repairSteps: [
        {
          stepNumber: 1,
          title: 'Confirm Hot-Spot Location & Current Draw',
          instruction:
            `Measure board temperature over ${controllerLabel} and verify downstream inductors/actuators are not overheating from external load shorts.`,
          expectedReading: 'Package case ΔT < 20°C above ambient under normal load',
          highlightZone: 'probe',
        },
        {
          stepNumber: 2,
          title: 'Inspect Bottom-Side Thermal Vias & Ground Plane',
          instruction:
            'Power off the board and inspect the thermal via array and shielding plate directly under the IC. Verify thermal vias have solid continuity to GND.',
          expectedReading: 'EPAD GND continuity < 0.05 Ω',
          highlightZone: 'power-off',
        },
        {
          stepNumber: 3,
          title: 'Reflow Exposed Pad & Mount Fresh Thermal Pad',
          instruction:
            'Apply gel flux around the QFN perimeter, reflow at 245°C peak until surface tension centers the package cleanly, then apply fresh thermal gap pad.',
          expectedReading: 'Zero tilted pins; full EPAD wetting on underside vias',
          caution: 'Limit peak reflow dwell time above 230°C to < 45 seconds.',
          highlightZone: 'rework',
        },
        {
          stepNumber: 4,
          title: 'Run Stress Check & Confirm Thermal Margin',
          instruction:
            'Reconnect USB-C OTG and run Diagnostics to verify die temperature remains below 60°C.',
          expectedReading: 'Die temperature ≤ 55°C nominal',
          highlightZone: 'verify',
        },
      ],
    });
  }

  // 7. Consumer USB-C / Controller Port, CC1-CC2 & ESD Hardware Fault
  if (faultScenario === 'usbc-port-hw') {
    const portParts: PartSourceEntry[] = [
      {
        name: `${deviceLabel} Replacement USB / Controller Port`,
        spec: isGamepad
          ? `USB-C / Micro-USB / Mini-USB board-mount receptacle for ${deviceLabel}`
          : `24-pin mid-mount SMT USB-C PD receptacle with dual 5.1kΩ CC pads`,
        packageSize: 'Mid-Mount SMT Port',
        estPriceUsd: '$1.40 – $4.50',
        suppliers: buildSuppliers(
          isGamepad ? `${deviceLabel} USB port replacement` : 'USB Type-C 24-pin mid-mount receptacle',
          { includeIfixit: true, ifixitQuery: `${deviceLabel} USB port` },
        ),
      },
      {
        name: 'USBLC6-2SC6 ESD TVS Diode Array (D+ / D- / CC Protection)',
        spec: 'Low-capacitance 5V–20V USB 2.0/PD ESD protection diode array',
        packageSize: 'SOT-23-6',
        estPriceUsd: '$0.28 – $0.65',
        suppliers: buildSuppliers('USBLC6-2SC6'),
      },
      {
        name: `${controllerLabel} PD / Controller IC`,
        spec: `${controllerLabel} (${profile.manufacturer})`,
        packageSize: profile.packageType,
        estPriceUsd: '$3.20 – $9.90',
        suppliers: buildSuppliers(controllerLabel.split('+')[0].trim(), {
          includeRenesas: !isConsumer,
          includeIfixit: true,
          ifixitQuery: deviceLabel,
        }),
      },
    ];

    if (isGamepad) {
      portParts.push({
        name: `Hall-Effect / TMR Analog Stick Module (${deviceLabel})`,
        spec: 'Zero-drift magnetic TMR / Hall-effect thumbstick assembly & 5.1kΩ 0402 CC resistors',
        packageSize: 'Through-Hole Stick / 0402',
        estPriceUsd: '$2.50 – $7.50',
        suppliers: buildSuppliers(`${deviceLabel} hall effect thumbstick`, {
          includeIfixit: true,
          ifixitQuery: `${deviceLabel} thumbstick`,
        }),
      });
    }

    findings.push({
      id: 'diag-hw-usbc-port',
      code: 'HW-PORT-PD',
      title: `${deviceLabel} USB Port, CC1/CC2 or ESD Protection Fault (Hardware)`,
      subsystem: 'USB-C / Port',
      severity: 'critical',
      repairType: 'hardware',
      summary: isGamepad
        ? `USB enumeration drops or controller fails to charge on ${deviceLabel}. Indicates bent/lifted USB receptacle pins, shorted USBLC6 ESD diode on D+/D-, open 5.1kΩ CC resistor, or faulted ${controllerLabel}.`
        : `USB-C PD contract fails to negotiate above 5V or flips intermittently by cable orientation. Indicates cracked VBUS/CC solder joints, shorted ESD TVS array, or damaged ${controllerLabel}.`,
      measuredValue: 'CC1 = 0.04V (Short) / D- Diode = 0.02V',
      expectedValue: 'CC1/CC2 = 0.42–1.65V · D+/D- Diode = 0.45–0.70V',
      toolsNeeded: [
        'Digital Multimeter (Diode Mode & Resistance)',
        'USB-C Breakout Board for Pin-by-Pin Probing',
        'Hot-Air Rework Station (370°C) + Kapton Tape + Low-Melt Bismuth Alloy',
        'Fine Micro-Soldering Iron, Tacky Flux & Desoldering Braid',
      ],
      partsToSource: portParts,
      graphicKind: 'usbc-port',
      repairSteps: [
        {
          stepNumber: 1,
          title: 'Unplug Battery / USB & Inspect Receptacle Mechanically',
          instruction:
            `Disconnect battery lead (if present) and USB cable from ${deviceLabel}. Inspect inside the USB port tongue for lint, corrosion, bent pins, or cracked rear anchor legs.`,
          expectedReading: 'Clean copper contacts; zero loose rear housing legs',
          caution: 'Always disconnect the internal Li-Ion battery before probing or soldering.',
          highlightZone: 'power-off',
        },
        {
          stepNumber: 2,
          title: 'Diode-Mode Check on VBUS, CC1/CC2 & D+/D-',
          instruction:
            'Set multimeter to Diode Mode (Red probe on GND, Black probe on signal via a USB-C breakout). Measure D+, D-, CC1, CC2, and VBUS paths.',
          expectedReading: 'D+/D-: 0.45–0.70 V · CC1/CC2: 0.42–0.68 V · CC-to-GND: ~5.1 kΩ',
          caution: 'Reading < 0.05 V indicates a shorted ESD diode or damaged controller IC.',
          highlightZone: 'probe',
        },
        {
          stepNumber: 3,
          title: `Reflow / Replace USB Port, ESD Array, or ${controllerLabel.split('+')[0].trim()}`,
          instruction:
            'Mask nearby plastic connectors with Kapton tape. Lift shorted ESD TVS diode (D1) or damaged USB port with hot air + low-melt solder, wick pads clean, and reflow replacement.',
          expectedReading: 'No solder bridges across fine-pitch 0.5mm pins',
          caution: 'Protect ribbon ZIF latches and analog stick plastic housings with Kapton.',
          highlightZone: 'rework',
        },
        {
          stepNumber: 4,
          title: 'Plug In & Verify Both Cable Orientations',
          instruction:
            `Connect ${deviceLabel} via USB-C/HID in both 0° and 180° plug orientations, confirm enumeration in Device Connection, and run Diagnostics.`,
          expectedReading: 'Clean USB/HID enumeration + nominal rail voltages in both orientations',
          highlightZone: 'verify',
        },
      ],
    });
  }

  const criticalCount = findings.filter((f) => f.severity === 'critical').length;
  const overallStatus: DiagnosticReport['overallStatus'] =
    criticalCount > 0 ? 'critical' : findings.length > 0 ? 'warnings' : 'healthy';

  return {
    ranAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
    partNumber: profile.partNumber,
    totalChecks,
    passedChecks: Math.max(0, totalChecks - findings.length),
    findings,
    overallStatus,
  };
}
