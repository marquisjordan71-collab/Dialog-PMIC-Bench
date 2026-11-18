import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateRailPowerMw,
  calculateTotalPowerStats,
  classifyUsbDevice,
  computeCrc32Hex,
  createInitialRailStates,
  dacCodeToMillivolts,
  identifyConsumerDeviceFromClassification,
  identifyDialogPmicFromRegisters,
  matchFirmwareForPart,
  matchManualsForPart,
  millivoltsToDacCode,
  parseFirmwareUpload,
} from './pmicProtocol';
import { CONSUMER_DEVICE_PROFILES, DIALOG_PMIC_PROFILES } from './pmicCatalog';

test('classifyUsbDevice detects Dialog, CP2112 WebHID, and CH341A WebSerial bridges', () => {
  const dialog = classifyUsbDevice(0x1680, 0x9063, 'Dialog DA9063 EVK');
  assert.equal(dialog.vendorName, 'Dialog / Renesas');
  assert.equal(dialog.recommendedTransport, 'WebUSB');
  assert.equal(dialog.defaultTargetPart, 'DA9063');
  assert.equal(dialog.mobileOtgPlugAndPlay, true);

  const cp2112 = classifyUsbDevice(0x10c4, 0xea90);
  assert.equal(cp2112.vendorName, 'Silicon Labs');
  assert.equal(cp2112.recommendedTransport, 'WebHID');

  const ch341 = classifyUsbDevice(0x1a86, 0x5523);
  assert.equal(ch341.vendorName, 'WCH');
  assert.equal(ch341.recommendedTransport, 'WebSerial');

  const stm32 = classifyUsbDevice(0x0483, 0x374b, 'STM32 DA9313 OTG Probe');
  assert.equal(stm32.vendorName, 'STMicroelectronics');
  assert.equal(stm32.defaultTargetPart, 'DA9313');

  const cypress = classifyUsbDevice(0x04b4, 0x0002);
  assert.equal(cypress.vendorName, 'Infineon / Cypress');
});

test('classifyUsbDevice and identifyConsumerDeviceFromClassification cover consumer devices and all gamepads old and new', () => {
  const samsung = classifyUsbDevice(0x04e8, 0x6860, 'Galaxy S25 Ultra');
  assert.equal(samsung.matchedDevicePart, 'GALAXY-USBC');
  assert.equal(identifyConsumerDeviceFromClassification(samsung)?.partNumber, 'GALAXY-USBC');

  const iphone = classifyUsbDevice(0x05ac, 0x12a8, 'iPhone USB-C');
  assert.equal(iphone.matchedDevicePart, 'IPHONE-USBC');
  assert.equal(identifyConsumerDeviceFromClassification(iphone)?.partNumber, 'IPHONE-USBC');

  const dualsense = classifyUsbDevice(0x054c, 0x0ce6, 'DualSense Wireless Controller');
  assert.equal(dualsense.matchedDevicePart, 'DUALSENSE');
  assert.equal(dualsense.recommendedTransport, 'WebHID');

  const ds4 = classifyUsbDevice(0x054c, 0x09cc, 'Wireless Controller');
  assert.equal(ds4.matchedDevicePart, 'DUALSHOCK4');

  const ps3 = classifyUsbDevice(0x054c, 0x0268, 'PLAYSTATION(R)3 Controller');
  assert.equal(ps3.matchedDevicePart, 'PS3-SIXAXIS');

  const xboxSeries = classifyUsbDevice(0x045e, 0x0b12, 'Xbox Wireless Controller');
  assert.equal(xboxSeries.matchedDevicePart, 'XBOX-CTRL');

  const xbox360 = classifyUsbDevice(0x045e, 0x028e, 'Controller (Xbox 360 For Windows)');
  assert.equal(xbox360.matchedDevicePart, 'XBOX-360');

  const switchPro = classifyUsbDevice(0x057e, 0x2009, 'Pro Controller');
  assert.equal(switchPro.matchedDevicePart, 'SWITCH-PRO');

  const retroGc = classifyUsbDevice(0x057e, 0x0337, 'GameCube Controller Adapter');
  assert.equal(retroGc.matchedDevicePart, 'NINTENDO-RETRO');

  const retroDragon = classifyUsbDevice(0x0079, 0x0011, 'USB Gamepad SNES');
  assert.equal(retroDragon.matchedDevicePart, 'NINTENDO-RETRO');

  const eightBitDo = classifyUsbDevice(0x2dc8, 0x3106, '8BitDo Ultimate Controller');
  assert.equal(eightBitDo.matchedDevicePart, '8BITDO-PAD');

  const logitech = classifyUsbDevice(0x046d, 0xc21d, 'Gamepad F310');
  assert.equal(logitech.matchedDevicePart, 'LOGITECH-PAD');

  assert.equal(Object.keys(CONSUMER_DEVICE_PROFILES).length, 18);
});

test('identifyDialogPmicFromRegisters matches exact silicon IDs and addresses', () => {
  const da9063 = identifyDialogPmicFromRegisters('0x58', 0x63, 0x50);
  assert.equal(da9063.matched, true);
  assert.equal(da9063.partNumber, 'DA9063');
  assert.equal(da9063.confidence, 'exact');

  const slg = identifyDialogPmicFromRegisters('0x75', 0x51, 0x00);
  assert.equal(slg.matched, true);
  assert.equal(slg.partNumber, 'SLG51000');
  assert.equal(slg.confidence, 'exact');

  const da9121 = identifyDialogPmicFromRegisters('0x68', 0x05, 0x02);
  assert.equal(da9121.matched, true);
  assert.equal(da9121.partNumber, 'DA9121');
});

test('DAC code to millivolt roundtrip stays accurate within step resolution', () => {
  const code = millivoltsToDacCode(1100, 300, 10, 1570);
  assert.equal(code, 80);
  assert.equal(dacCodeToMillivolts(code, 300, 10, 1570), 1100);

  // Clamping boundaries
  assert.equal(millivoltsToDacCode(100, 300, 10, 1570), 0);
  assert.equal(dacCodeToMillivolts(999, 300, 10, 1570), 1570);
});

test('power calculations sum active rails and compute realistic efficiency', () => {
  const profile = DIALOG_PMIC_PROFILES.DA9063;
  const rails = createInitialRailStates(profile);
  const stats = calculateTotalPowerStats(rails, profile.rails, 5000);
  assert.equal(stats.activeRailsCount, profile.rails.length);
  assert.ok(stats.totalOutputMw > 1000);
  assert.ok(stats.efficiencyPct > 60 && stats.efficiencyPct <= 98.5);
  assert.equal(calculateRailPowerMw(1100, 1000, true), 1100);
  assert.equal(calculateRailPowerMw(1100, 1000, false), 0);
});

test('matchManualsForPart finds curated Dialog and consumer/gamepad manuals via search aliases', () => {
  const da9063Docs = matchManualsForPart('DA9063');
  assert.ok(da9063Docs.length >= 3);
  assert.equal(da9063Docs[0].partNumber, 'DA9063');

  assert.ok(matchManualsForPart('ps4').some((d) => d.partNumber === 'DUALSHOCK4'));
  assert.ok(matchManualsForPart('xbox 360').some((d) => d.partNumber === 'XBOX-360'));
  assert.ok(matchManualsForPart('snes').some((d) => d.partNumber === 'NINTENDO-RETRO'));
  assert.ok(matchManualsForPart('8bitdo').some((d) => d.partNumber === '8BITDO-PAD'));
  assert.ok(matchManualsForPart('iphone').some((d) => d.partNumber === 'IPHONE-USBC'));

  const customDocs = matchManualsForPart('DA9141');
  assert.equal(customDocs.length, 2);
  assert.equal(customDocs[0].partNumber, 'DA9141');
});

test('parseFirmwareUpload parses Intel HEX, JSON OTP, and binary payloads with CRC32', () => {
  const intelHex = ':0200A3005230D9\n:00000001FF\n';
  const hexBytes = new TextEncoder().encode(intelHex);
  const parsedHex = parseFirmwareUpload('da9063_patch.hex', hexBytes);
  assert.equal(parsedHex.valid, true);
  assert.equal(parsedHex.format, 'intel-hex');
  assert.equal(parsedHex.byteLength, 2);
  assert.equal(parsedHex.registerPatches[0].addr, '0x0A3');
  assert.equal(parsedHex.registerPatches[0].value, '0x52');
  assert.match(parsedHex.crc32, /^0x[0-9A-F]{8}$/);

  const rawBin = new Uint8Array([0x5f, 0x52, 0x30, 0x04]);
  const parsedBin = parseFirmwareUpload('otp_update.bin', rawBin);
  assert.equal(parsedBin.valid, true);
  assert.equal(parsedBin.format, 'binary');
  assert.equal(parsedBin.crc32, computeCrc32Hex(rawBin));

  const empty = parseFirmwareUpload('empty.bin', new Uint8Array(0));
  assert.equal(empty.valid, false);
  assert.ok(empty.error);

  const fws = matchFirmwareForPart('DA9063');
  assert.ok(fws.some((f) => f.partNumber === 'DA9063'));
  assert.ok(fws.some((f) => f.partNumber === 'BRIDGE'));

  const padFws = matchFirmwareForPart('DUALSENSE');
  assert.ok(padFws.some((f) => f.partNumber === 'DUALSENSE'));
});

test('parseGamepadVendorProduct and probeGamepadDevice identify old & new gamepads via Gamepad API', async () => {
  const { parseGamepadVendorProduct, probeGamepadDevice } = await import('./webHardwareBridge');

  const chromeDualSense = parseGamepadVendorProduct(
    'DualSense Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 0ce6)',
  );
  assert.equal(chromeDualSense.vendorId, 0x054c);
  assert.equal(chromeDualSense.productId, 0x0ce6);
  assert.equal(chromeDualSense.cleanName, 'DualSense Wireless Controller');

  const probedDualSense = probeGamepadDevice({
    id: 'DualSense Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 0ce6)',
    index: 0,
    connected: true,
    buttons: new Array(17).fill(null),
    axes: [0, 0, 0, 0],
  });
  assert.equal(probedDualSense.transport, 'GamepadAPI');
  assert.equal(probedDualSense.identified.partNumber, 'DUALSENSE');

  const probed360 = probeGamepadDevice({
    id: '045e-028e-Microsoft X-Box 360 pad',
    index: 1,
    connected: true,
    buttons: new Array(15).fill(null),
    axes: [0, 0, 0, 0],
  });
  assert.equal(probed360.identified.partNumber, 'XBOX-360');

  const probedSnes = probeGamepadDevice({
    id: 'USB SNES Classic Gamepad',
    index: 2,
    connected: true,
    buttons: new Array(10).fill(null),
    axes: [0, 0],
  });
  assert.equal(probedSnes.identified.partNumber, 'NINTENDO-RETRO');
});
