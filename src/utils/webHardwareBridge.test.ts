import test from 'node:test';
import assert from 'node:assert/strict';
import {
  detectPlatformFamily,
  inferBluetoothVendorProduct,
  parseGamepadVendorProduct,
  probeGamepadDevice,
} from './webHardwareBridge.ts';

test('detectPlatformFamily accurately classifies iOS, iPadOS desktop-mode, Android, Firefox, Safari, and Chromium', () => {
  assert.equal(
    detectPlatformFamily(
      'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1',
      5,
      false,
    ).platformFamily,
    'ios',
  );
  // iPadOS Safari reports Macintosh in UA with maxTouchPoints > 1
  assert.equal(
    detectPlatformFamily(
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/18.0 Safari/605.1.15',
      5,
      false,
    ).platformFamily,
    'ios',
  );
  assert.equal(
    detectPlatformFamily(
      'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/130.0.0.0 Mobile Safari/537.36',
      5,
      true,
    ).platformFamily,
    'android',
  );
  assert.equal(
    detectPlatformFamily(
      'Mozilla/5.0 (X11; Linux x86_64; rv:131.0) Gecko/20100101 Firefox/131.0',
      0,
      false,
    ).platformFamily,
    'firefox',
  );
  assert.equal(
    detectPlatformFamily(
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/18.0 Safari/605.1.15',
      0,
      false,
    ).platformFamily,
    'safari-desktop',
  );
  assert.equal(
    detectPlatformFamily(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130.0.0.0 Safari/537.36',
      0,
      true,
    ).platformFamily,
    'desktop-chromium',
  );
});

test('probeGamepadDevice and inferBluetoothVendorProduct identify old & new controllers across OS IDs', () => {
  const parsedWin = parseGamepadVendorProduct(
    'DualSense Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 0ce6)',
  );
  assert.equal(parsedWin.vendorId, 0x054c);
  assert.equal(parsedWin.productId, 0x0ce6);

  const parsedFirefox = parseGamepadVendorProduct('045e-028e-Xbox 360 Controller');
  assert.equal(parsedFirefox.vendorId, 0x045e);
  assert.equal(parsedFirefox.productId, 0x028e);

  const probed = probeGamepadDevice({
    id: 'Xbox Wireless Controller (STANDARD GAMEPAD Vendor: 045e Product: 0b12)',
    index: 0,
    connected: true,
    mapping: 'standard',
    buttons: new Array(17),
    axes: [0, 0, 0, 0],
  });
  assert.equal(probed.transport, 'GamepadAPI');
  assert.equal(probed.identified.partNumber, 'XBOX-CTRL');

  const bleInfo = inferBluetoothVendorProduct('Dialog DA14531 SmartBond BLE');
  assert.equal(bleInfo.vendorId, 0x1680);
});
