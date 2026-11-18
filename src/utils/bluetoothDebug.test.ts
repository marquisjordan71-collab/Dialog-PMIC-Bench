import test from 'node:test';
import assert from 'node:assert/strict';
import {
  analyzeTransportHealth,
  buildBluetoothProbeFrames,
  buildDefaultDebugMetrics,
  buildUsbProbeFrames,
  buildWirelessRfProbeFrames,
  parseCustomHexCommand,
} from './bluetoothDebug';
import { inferBluetoothVendorProduct, probeBluetoothDevice } from './webHardwareBridge';

test('inferBluetoothVendorProduct and probeBluetoothDevice identify BLE DualSense & Dialog SmartBond peripherals', async () => {
  const dsIds = inferBluetoothVendorProduct('DualSense Wireless Controller');
  assert.equal(dsIds.vendorId, 0x054c);
  assert.equal(dsIds.productId, 0x0ce6);

  const mockDevice = {
    id: 'ble-ds-001',
    name: 'DualSense Wireless Controller',
    gatt: {
      connected: false,
      connect: async () => ({
        connected: true,
        getPrimaryServices: async () => [
          {
            uuid: '0000180f-0000-1000-8000-00805f9b34fb',
            getCharacteristics: async () => [{ uuid: '00002a19-0000-1000-8000-00805f9b34fb' }],
            getCharacteristic: async () => ({
              uuid: '00002a19-0000-1000-8000-00805f9b34fb',
              readValue: async () => new DataView(new Uint8Array([84]).buffer),
            }),
          },
          {
            uuid: '00001812-0000-1000-8000-00805f9b34fb',
            getCharacteristics: async () => [],
          },
        ],
      }),
    },
  };

  const info = await probeBluetoothDevice(mockDevice);
  assert.equal(info.transport, 'WebBluetooth');
  assert.equal(info.identified.partNumber, 'DUALSENSE');
  assert.equal(info.bluetoothMetadata?.gattConnected, true);
  assert.equal(info.bluetoothMetadata?.batteryPct, 84);
  assert.equal(info.bluetoothMetadata?.services.length, 2);
});

test('probe generators and custom hex command parser build valid USB, Bluetooth, and Wireless frames', () => {
  const metrics = buildDefaultDebugMetrics(null, null, 5000, {
    webUsbSupported: true,
    webHidSupported: true,
    webSerialSupported: false,
    webBluetoothSupported: true,
    gamepadApiSupported: true,
    isMobileUserAgent: false,
    secureContext: true,
    platformFamily: 'desktop-chromium',
    platformLabel: 'Desktop Chrome / Edge',
  });

  const usbFrames = buildUsbProbeFrames(null, null);
  const btFrames = buildBluetoothProbeFrames(null, metrics);
  const wlFrames = buildWirelessRfProbeFrames(metrics);

  assert.equal(usbFrames.length, 3);
  assert.equal(btFrames.length, 3);
  assert.equal(wlFrames.length, 3);

  const goodCmd = parseCustomHexCommand('bluetooth', '0x12 0x34 0xFF');
  assert.equal(goodCmd.ok, true);
  if (goodCmd.ok) {
    assert.deepEqual(goodCmd.bytes, [0x12, 0x34, 0xff]);
    assert.equal(goodCmd.txFrame.channel, 'bluetooth');
    assert.equal(goodCmd.rxFrame.direction, 'RX');
  }

  const badCmd = parseCustomHexCommand('usb', 'ZZ 10');
  assert.equal(badCmd.ok, false);
});

test('analyzeTransportHealth flags weak RSSI, VBUS droop, and high wireless jitter accurately', () => {
  const degraded = analyzeTransportHealth(
    {
      usbSpeedLabel: 'USB 2.0 HS OTG',
      usbVbusMv: 2400,
      usbCcState: 'CC1 Short',
      usbErrors: 2,
      bleConnected: true,
      bleProfile: 'HOGP BLE',
      bleAttMtu: 23,
      bleIntervalMs: 15,
      bleRssiDbm: -86,
      bleServicesCount: 2,
      bleBatteryPct: 40,
      wirelessBand: '2.4 GHz RF',
      wirelessChannel: 6,
      wirelessPacketLossPct: 4.5,
      wirelessJitterMs: 11.2,
      wirelessRttMs: 28,
      wirelessDownlinkMbps: 12,
    },
    2800,
  );

  assert.equal(degraded.filter((f) => f.severity !== 'ok').length, 3);
});
