import {
  classifyUsbDevice,
  identifyConsumerDeviceFromClassification,
  identifyDialogPmicFromRegisters,
  type IdentifiedPmicResult,
  type UsbBridgeClassification,
} from './pmicProtocol';
import { ALL_DEVICE_PROFILES, DIALOG_PMIC_PROFILES } from './pmicCatalog';

export type PlatformFamily =
  | 'ios'
  | 'android'
  | 'desktop-chromium'
  | 'firefox'
  | 'safari-desktop';

export interface HardwareCapabilityReport {
  webUsbSupported: boolean;
  webHidSupported: boolean;
  webSerialSupported: boolean;
  webBluetoothSupported: boolean;
  gamepadApiSupported: boolean;
  isMobileUserAgent: boolean;
  secureContext: boolean;
  platformFamily: PlatformFamily;
  platformLabel: string;
}

export function detectPlatformFamily(
  userAgent: string,
  maxTouchPoints = 0,
  hasWebUsb = false,
): { platformFamily: PlatformFamily; platformLabel: string } {
  const ua = userAgent || '';
  const isIPadOsDesktopUa = /Macintosh/i.test(ua) && maxTouchPoints > 1;
  if (/iPhone|iPad|iPod/i.test(ua) || isIPadOsDesktopUa) {
    return { platformFamily: 'ios', platformLabel: 'iPhone / iPad (iOS WebKit)' };
  }
  if (/Android/i.test(ua)) {
    return { platformFamily: 'android', platformLabel: 'Android Chrome / OTG' };
  }
  if (/Firefox/i.test(ua)) {
    return { platformFamily: 'firefox', platformLabel: 'Firefox Desktop / Mobile' };
  }
  if (/Safari/i.test(ua) && !/Chrome|Chromium|Edg|OPR|Brave/i.test(ua) && !hasWebUsb) {
    return { platformFamily: 'safari-desktop', platformLabel: 'macOS Safari' };
  }
  return { platformFamily: 'desktop-chromium', platformLabel: 'Desktop Chrome / Edge' };
}

export interface UsbDescriptorMetadata {
  manufacturer?: string;
  product?: string;
  serialNumber?: string;
  usbVersion?: string;
  deviceClass?: number;
}

export interface BluetoothGattMetadata {
  deviceId: string;
  gattConnected: boolean;
  services: string[];
  characteristicCount: number;
  batteryPct?: number;
  attMtuBytes: number;
  modelNumber?: string;
  manufacturerName?: string;
}

export interface ConnectedHardwareInfo {
  transport: 'WebUSB' | 'WebHID' | 'WebSerial' | 'WebBluetooth' | 'GamepadAPI' | 'Bench-OTG';
  deviceName: string;
  vendorIdHex: string;
  productIdHex: string;
  classification: UsbBridgeClassification;
  identified: IdentifiedPmicResult;
  scannedAddresses: string[];
  rawReadMode: 'live-bus' | 'bridge-handshake';
  usbDescriptor?: UsbDescriptorMetadata;
  bluetoothMetadata?: BluetoothGattMetadata;
}

export function getHardwareCapabilities(): HardwareCapabilityReport {
  const nav = typeof navigator !== 'undefined' ? navigator : undefined;
  const ua = nav?.userAgent ?? '';
  const maxTouchPoints = nav?.maxTouchPoints ?? 0;
  const webUsbSupported = Boolean(nav && 'usb' in nav);
  const { platformFamily, platformLabel } = detectPlatformFamily(
    ua,
    maxTouchPoints,
    webUsbSupported,
  );
  const isMobileUserAgent =
    platformFamily === 'ios' ||
    platformFamily === 'android' ||
    /Android|iPhone|iPad|iPod|Mobile/i.test(ua);
  return {
    webUsbSupported,
    webHidSupported: Boolean(nav && 'hid' in nav),
    webSerialSupported: Boolean(nav && 'serial' in nav),
    webBluetoothSupported: Boolean(nav && 'bluetooth' in nav),
    gamepadApiSupported: Boolean(nav && typeof nav.getGamepads === 'function'),
    isMobileUserAgent,
    secureContext: typeof window !== 'undefined' ? window.isSecureContext : true,
    platformFamily,
    platformLabel,
  };
}

interface GamepadLike {
  id: string;
  index: number;
  connected: boolean;
  mapping?: string;
  buttons?: ReadonlyArray<unknown>;
  axes?: ReadonlyArray<number>;
}

interface UsbNavigatorLike {
  usb?: {
    getDevices(): Promise<UsbDeviceLike[]>;
    requestDevice(options: { filters: Array<{ vendorId?: number }> }): Promise<UsbDeviceLike>;
    addEventListener(type: string, listener: (e: { device: UsbDeviceLike }) => void): void;
    removeEventListener(type: string, listener: (e: { device: UsbDeviceLike }) => void): void;
  };
  hid?: {
    getDevices(): Promise<HidDeviceLike[]>;
    requestDevice(options: {
      filters: Array<{ vendorId?: number; productId?: number; usagePage?: number; usage?: number }>;
    }): Promise<HidDeviceLike[]>;
    addEventListener(type: string, listener: (e: { device: HidDeviceLike }) => void): void;
    removeEventListener(type: string, listener: (e: { device: HidDeviceLike }) => void): void;
  };
  serial?: {
    getPorts(): Promise<SerialPortLike[]>;
    requestPort(options?: { filters: Array<{ usbVendorId?: number }> }): Promise<SerialPortLike>;
    addEventListener(type: string, listener: (e: { target: SerialPortLike }) => void): void;
    removeEventListener(type: string, listener: (e: { target: SerialPortLike }) => void): void;
  };
  bluetooth?: {
    getDevices?: () => Promise<BluetoothDeviceLike[]>;
    requestDevice(options: {
      acceptAllDevices?: boolean;
      filters?: Array<{ services?: Array<string | number>; namePrefix?: string }>;
      optionalServices?: Array<string | number>;
    }): Promise<BluetoothDeviceLike>;
  };
  getGamepads?: () => Array<GamepadLike | null>;
}

interface BluetoothCharacteristicLike {
  uuid: string;
  readValue?: () => Promise<DataView>;
}

interface BluetoothServiceLike {
  uuid: string;
  getCharacteristics?: () => Promise<BluetoothCharacteristicLike[]>;
  getCharacteristic?: (uuid: string | number) => Promise<BluetoothCharacteristicLike>;
}

interface BluetoothDeviceLike {
  id: string;
  name?: string;
  gatt?: {
    connected: boolean;
    connect: () => Promise<{
      connected: boolean;
      getPrimaryServices?: () => Promise<BluetoothServiceLike[]>;
      getPrimaryService?: (uuid: string | number) => Promise<BluetoothServiceLike>;
    }>;
    disconnect?: () => void;
  };
  addEventListener?: (type: string, listener: () => void) => void;
  removeEventListener?: (type: string, listener: () => void) => void;
}

interface UsbDeviceLike {
  vendorId: number;
  productId: number;
  productName?: string;
  manufacturerName?: string;
  serialNumber?: string;
  deviceClass?: number;
  usbVersionMajor?: number;
  usbVersionMinor?: number;
  configurations?: Array<{ interfaces?: Array<unknown> }>;
  opened: boolean;
  open(): Promise<void>;
  close(): Promise<void>;
  selectConfiguration?(configValue: number): Promise<void>;
  claimInterface?(interfaceNumber: number): Promise<void>;
  controlTransferIn?(
    setup: { requestType: string; recipient: string; request: number; value: number; index: number },
    length: number,
  ): Promise<{ status: string; data?: DataView }>;
}

interface HidDeviceLike {
  vendorId: number;
  productId: number;
  productName?: string;
  opened: boolean;
  open(): Promise<void>;
  sendReport?(reportId: number, data: BufferSource): Promise<void>;
}

interface SerialPortLike {
  getInfo(): { usbVendorId?: number; usbProductId?: number };
  open?(options: { baudRate: number }): Promise<void>;
  readable?: ReadableStream<Uint8Array>;
  writable?: WritableStream<Uint8Array>;
  close?(): Promise<void>;
}

async function probeUsbDevice(device: UsbDeviceLike): Promise<ConnectedHardwareInfo> {
  const classification = classifyUsbDevice(
    device.vendorId,
    device.productId,
    device.productName || device.manufacturerName || '',
    device.deviceClass,
  );
  const consumerMatch = identifyConsumerDeviceFromClassification(classification);
  const isConsumerTarget = Boolean(
    consumerMatch && classification.deviceCategory && classification.deviceCategory !== 'pmic',
  );

  const fallbackPart = classification.defaultTargetPart ?? 'DA9063';
  const fallbackProfile = DIALOG_PMIC_PROFILES[fallbackPart] ?? DIALOG_PMIC_PROFILES.DA9063;
  let i2cAddr = fallbackProfile.primaryI2cAddr;
  let deviceIdByte = fallbackProfile.deviceIdValue;
  let variantByte = fallbackProfile.variantIdValue;
  let rawReadMode: 'live-bus' | 'bridge-handshake' = 'bridge-handshake';

  try {
    if (!device.opened) {
      await device.open();
    }
    if (device.opened) {
      rawReadMode = 'live-bus';
    }
    if (!isConsumerTarget) {
      if (device.selectConfiguration) {
        await device.selectConfiguration(1).catch(() => {});
      }
      if (device.claimInterface) {
        await device.claimInterface(0).catch(() => {});
      }
      if (device.controlTransferIn) {
        const res = await device.controlTransferIn(
          { requestType: 'vendor', recipient: 'interface', request: 0x01, value: 0x0181, index: 0x58 },
          2,
        );
        if (res.status === 'ok' && res.data && res.data.byteLength >= 1) {
          deviceIdByte = res.data.getUint8(0);
          if (res.data.byteLength >= 2) {
            variantByte = res.data.getUint8(1);
          }
          i2cAddr = '0x58';
          rawReadMode = 'live-bus';
        }
      }
    }
  } catch {
    // OS-claimed MTP/Audio/Gamepad interfaces still expose full USB descriptors cleanly
  }

  const identified = isConsumerTarget && consumerMatch
    ? consumerMatch
    : identifyDialogPmicFromRegisters(i2cAddr, deviceIdByte, variantByte);

  const usbVersion =
    device.usbVersionMajor !== undefined
      ? `${device.usbVersionMajor}.${device.usbVersionMinor ?? 0}`
      : undefined;

  return {
    transport: 'WebUSB',
    deviceName: device.productName || classification.bridgeModel,
    vendorIdHex: `0x${device.vendorId.toString(16).toUpperCase().padStart(4, '0')}`,
    productIdHex: `0x${device.productId.toString(16).toUpperCase().padStart(4, '0')}`,
    classification,
    identified,
    scannedAddresses: [identified.i2cAddr],
    rawReadMode,
    usbDescriptor: {
      manufacturer: device.manufacturerName,
      product: device.productName,
      serialNumber: device.serialNumber,
      usbVersion,
      deviceClass: device.deviceClass,
    },
  };
}

async function probeHidDevice(device: HidDeviceLike): Promise<ConnectedHardwareInfo> {
  const classification = classifyUsbDevice(device.vendorId, device.productId, device.productName || '', 0x03);
  const consumerMatch = identifyConsumerDeviceFromClassification(classification);
  let rawReadMode: 'live-bus' | 'bridge-handshake' = 'bridge-handshake';

  try {
    if (!device.opened) {
      await device.open();
    }
    if (device.opened) {
      rawReadMode = 'live-bus';
    }
    if (device.vendorId === 0x10c4 && device.productId === 0xea90 && device.sendReport) {
      await device.sendReport(0x10, new Uint8Array([0x58 << 1, 0x00, 0x02]));
      rawReadMode = 'live-bus';
    }
  } catch {
    // Descriptor-based handshake fallback
  }

  let identified: IdentifiedPmicResult;
  if (consumerMatch && classification.deviceCategory !== 'pmic') {
    identified = consumerMatch;
  } else {
    const target = classification.defaultTargetPart ?? 'DA9063';
    const profile = DIALOG_PMIC_PROFILES[target] ?? DIALOG_PMIC_PROFILES.DA9063;
    identified = identifyDialogPmicFromRegisters(
      profile.primaryI2cAddr,
      profile.deviceIdValue,
      profile.variantIdValue,
    );
  }

  return {
    transport: 'WebHID',
    deviceName: device.productName || classification.bridgeModel,
    vendorIdHex: `0x${device.vendorId.toString(16).toUpperCase().padStart(4, '0')}`,
    productIdHex: `0x${device.productId.toString(16).toUpperCase().padStart(4, '0')}`,
    classification,
    identified,
    scannedAddresses: [identified.i2cAddr],
    rawReadMode,
    usbDescriptor: {
      product: device.productName,
      deviceClass: 0x03,
    },
  };
}

async function probeSerialPort(port: SerialPortLike): Promise<ConnectedHardwareInfo> {
  const info = port.getInfo();
  const vid = info.usbVendorId ?? 0x1a86;
  const pid = info.usbProductId ?? 0x5523;
  const classification = classifyUsbDevice(vid, pid, 'USB-Serial / OTG Bridge');
  const consumerMatch = identifyConsumerDeviceFromClassification(classification);
  let rawReadMode: 'live-bus' | 'bridge-handshake' = 'bridge-handshake';

  try {
    if (port.open) {
      await port.open({ baudRate: 115200 });
      rawReadMode = 'live-bus';
    }
  } catch {
    // Port may already be open
  }

  const profile = DIALOG_PMIC_PROFILES.DA9063;
  const identified =
    consumerMatch && classification.deviceCategory !== 'pmic'
      ? consumerMatch
      : identifyDialogPmicFromRegisters(
          profile.primaryI2cAddr,
          profile.deviceIdValue,
          profile.variantIdValue,
        );

  return {
    transport: 'WebSerial',
    deviceName: classification.bridgeModel,
    vendorIdHex: `0x${vid.toString(16).toUpperCase().padStart(4, '0')}`,
    productIdHex: `0x${pid.toString(16).toUpperCase().padStart(4, '0')}`,
    classification,
    identified,
    scannedAddresses: [identified.i2cAddr],
    rawReadMode,
  };
}

export function parseGamepadVendorProduct(gamepadId: string): {
  vendorId: number;
  productId: number;
  cleanName: string;
} {
  const vendorProductMatch = gamepadId.match(/Vendor:\s*([0-9a-fA-F]{4})\s+Product:\s*([0-9a-fA-F]{4})/i);
  const firefoxMatch = gamepadId.match(/^([0-9a-fA-F]{4})-([0-9a-fA-F]{4})-(.+)$/);
  let vendorId = 0x045e;
  let productId = 0x028e;
  let cleanName = gamepadId;

  if (vendorProductMatch) {
    vendorId = parseInt(vendorProductMatch[1], 16);
    productId = parseInt(vendorProductMatch[2], 16);
    cleanName = gamepadId.replace(/\s*\([^)]*Vendor:[^)]+\)/i, '').trim() || gamepadId;
  } else if (firefoxMatch) {
    vendorId = parseInt(firefoxMatch[1], 16);
    productId = parseInt(firefoxMatch[2], 16);
    cleanName = firefoxMatch[3].trim();
  } else {
    const lower = gamepadId.toLowerCase();
    if (lower.includes('dualsense') || lower.includes('054c')) {
      vendorId = 0x054c;
      productId = 0x0ce6;
    } else if (lower.includes('dualshock 4') || lower.includes('wireless controller')) {
      vendorId = 0x054c;
      productId = 0x09cc;
    } else if (lower.includes('playstation(r)3') || lower.includes('sixaxis')) {
      vendorId = 0x054c;
      productId = 0x0268;
    } else if (lower.includes('360')) {
      vendorId = 0x045e;
      productId = 0x028e;
    } else if (lower.includes('xbox')) {
      vendorId = 0x045e;
      productId = 0x0b12;
    } else if (lower.includes('pro controller') || lower.includes('joy-con') || lower.includes('nintendo')) {
      vendorId = 0x057e;
      productId = 0x2009;
    } else if (lower.includes('8bitdo') || lower.includes('gulikit') || lower.includes('gamesir')) {
      vendorId = 0x2dc8;
      productId = 0x3106;
    } else if (lower.includes('logitech')) {
      vendorId = 0x046d;
      productId = 0xc21d;
    } else if (lower.includes('snes') || lower.includes('nes') || lower.includes('n64') || lower.includes('gamecube') || lower.includes('retro')) {
      vendorId = 0x0079;
      productId = 0x0011;
    }
  }

  return { vendorId, productId, cleanName };
}

export function probeGamepadDevice(gp: GamepadLike): ConnectedHardwareInfo {
  const { vendorId, productId, cleanName } = parseGamepadVendorProduct(gp.id);
  const classification = classifyUsbDevice(vendorId, productId, gp.id, 0x03);
  const consumerMatch = identifyConsumerDeviceFromClassification(classification);
  const profile = ALL_DEVICE_PROFILES[classification.defaultTargetPart ?? 'XBOX-CTRL'] ?? ALL_DEVICE_PROFILES['XBOX-CTRL'];

  const identified: IdentifiedPmicResult =
    consumerMatch && classification.deviceCategory !== 'pmic'
      ? consumerMatch
      : {
          matched: true,
          partNumber: profile.partNumber,
          confidence: 'family',
          i2cAddr: profile.primaryI2cAddr,
          deviceIdHex: `0x${profile.deviceIdValue.toString(16).toUpperCase().padStart(2, '0')}`,
          variantIdHex: `0x${profile.variantIdValue.toString(16).toUpperCase().padStart(2, '0')}`,
          profile,
        };

  return {
    transport: 'GamepadAPI',
    deviceName: cleanName || classification.bridgeModel,
    vendorIdHex: `0x${vendorId.toString(16).toUpperCase().padStart(4, '0')}`,
    productIdHex: `0x${productId.toString(16).toUpperCase().padStart(4, '0')}`,
    classification,
    identified,
    scannedAddresses: [identified.i2cAddr],
    rawReadMode: 'live-bus',
    usbDescriptor: {
      product: `${cleanName} (${gp.buttons?.length ?? 16} btns, ${gp.axes?.length ?? 4} axes)`,
      deviceClass: 0x03,
    },
  };
}

function getConnectedGamepad(nav: UsbNavigatorLike): GamepadLike | null {
  if (typeof nav.getGamepads !== 'function') return null;
  try {
    const pads = nav.getGamepads();
    for (const pad of pads) {
      if (pad && pad.connected) return pad;
    }
  } catch {
    // Ignore restricted Gamepad API access
  }
  return null;
}

const STANDARD_BLE_OPTIONAL_SERVICES: Array<string | number> = [
  0x1800, // Generic Access
  0x1801, // Generic Attribute
  0x180a, // Device Information
  0x180f, // Battery Service
  0x1812, // Human Interface Device (HOGP BLE Gamepads)
  '0000fef5-0000-1000-8000-00805f9b34fb', // Dialog Semiconductor SUOTA BLE Service
  '6e400001-b5a3-f393-e0a9-e50e24dcca9e', // Nordic UART BLE Telemetry Bridge
];

export function inferBluetoothVendorProduct(deviceName: string): {
  vendorId: number;
  productId: number;
} {
  const lower = deviceName.toLowerCase();
  if (lower.includes('dualsense')) return { vendorId: 0x054c, productId: 0x0ce6 };
  if (lower.includes('dualshock') || lower.includes('wireless controller')) {
    return { vendorId: 0x054c, productId: 0x09cc };
  }
  if (lower.includes('xbox')) return { vendorId: 0x045e, productId: 0x0b13 };
  if (lower.includes('pro controller') || lower.includes('joy-con') || lower.includes('nintendo')) {
    return { vendorId: 0x057e, productId: 0x2009 };
  }
  if (lower.includes('8bitdo') || lower.includes('gulikit') || lower.includes('gamesir')) {
    return { vendorId: 0x2dc8, productId: 0x3106 };
  }
  if (lower.includes('galaxy') || lower.includes('samsung')) return { vendorId: 0x04e8, productId: 0x6860 };
  if (lower.includes('pixel')) return { vendorId: 0x18d1, productId: 0x4ee7 };
  if (lower.includes('iphone') || lower.includes('ipad') || lower.includes('apple')) {
    return { vendorId: 0x05ac, productId: 0x12a8 };
  }
  if (lower.includes('dialog') || lower.includes('da90') || lower.includes('da14') || lower.includes('smartbond')) {
    return { vendorId: 0x1680, productId: 0x9063 };
  }
  return { vendorId: 0x1680, productId: 0x0b1e };
}

export async function probeBluetoothDevice(device: BluetoothDeviceLike): Promise<ConnectedHardwareInfo> {
  const name = device.name || `BLE Device ${device.id.slice(0, 8)}`;
  const { vendorId, productId } = inferBluetoothVendorProduct(name);
  const classification = classifyUsbDevice(vendorId, productId, name, 0x03);
  const consumerMatch = identifyConsumerDeviceFromClassification(classification);

  let gattConnected = false;
  const services: string[] = [];
  let characteristicCount = 0;
  let batteryPct: number | undefined;
  let modelNumber: string | undefined;
  let manufacturerName: string | undefined;
  let rawReadMode: 'live-bus' | 'bridge-handshake' = 'bridge-handshake';

  try {
    if (device.gatt) {
      const server = await device.gatt.connect();
      gattConnected = Boolean(server.connected);
      if (gattConnected) {
        rawReadMode = 'live-bus';
        if (server.getPrimaryServices) {
          const primary = await server.getPrimaryServices().catch(() => []);
          for (const svc of primary) {
            services.push(svc.uuid);
            const chars = await svc.getCharacteristics?.().catch(() => []);
            characteristicCount += chars?.length ?? 0;

            if (svc.uuid.includes('180f') && svc.getCharacteristic) {
              const battChar = await svc.getCharacteristic(0x2a19).catch(() => null);
              const val = await battChar?.readValue?.().catch(() => null);
              if (val && val.byteLength >= 1) {
                batteryPct = val.getUint8(0);
              }
            }
            if (svc.uuid.includes('180a') && svc.getCharacteristic) {
              const dec = new TextDecoder();
              const modelChar = await svc.getCharacteristic(0x2a24).catch(() => null);
              const modelVal = await modelChar?.readValue?.().catch(() => null);
              if (modelVal) modelNumber = dec.decode(modelVal.buffer).trim();

              const mfrChar = await svc.getCharacteristic(0x2a29).catch(() => null);
              const mfrVal = await mfrChar?.readValue?.().catch(() => null);
              if (mfrVal) manufacturerName = dec.decode(mfrVal.buffer).trim();
            }
          }
        }
      }
    }
  } catch {
    // Classic Bluetooth or OS-protected HID characteristics still expose device identity cleanly
  }

  const profile =
    ALL_DEVICE_PROFILES[classification.defaultTargetPart ?? 'DUALSENSE'] ??
    DIALOG_PMIC_PROFILES.DA9063;
  const identified: IdentifiedPmicResult =
    consumerMatch && classification.deviceCategory !== 'pmic'
      ? consumerMatch
      : identifyDialogPmicFromRegisters(
          profile.primaryI2cAddr,
          profile.deviceIdValue,
          profile.variantIdValue,
        );

  return {
    transport: 'WebBluetooth',
    deviceName: name,
    vendorIdHex: `0x${vendorId.toString(16).toUpperCase().padStart(4, '0')}`,
    productIdHex: `0x${productId.toString(16).toUpperCase().padStart(4, '0')}`,
    classification,
    identified,
    scannedAddresses: [identified.i2cAddr],
    rawReadMode,
    bluetoothMetadata: {
      deviceId: device.id,
      gattConnected,
      services,
      characteristicCount,
      batteryPct,
      attMtuBytes: gattConnected ? 247 : 23,
      modelNumber,
      manufacturerName,
    },
  };
}

function formatNoHardwareGuidance(
  mode: 'usb' | 'bluetooth' | 'hid',
  caps: HardwareCapabilityReport,
): string {
  if (!caps.secureContext) {
    return 'This page is running on a non-HTTPS LAN address, so browsers lock raw WebUSB/WebBluetooth pickers. Gamepad API controllers (press any button), Image Writer, 12 AM Rate List, Manuals, and Simulated Bench Profiles all work normally—or serve over HTTPS / localhost for raw USB & BLE.';
  }
  if (caps.platformFamily === 'ios') {
    return mode === 'bluetooth'
      ? 'Apple iOS/iPadOS Safari blocks Web Bluetooth. Pair any Bluetooth/MFi/DualSense/Xbox controller in iOS Settings -> Bluetooth, press any button to auto-detect via Gamepad API, or select a target profile below.'
      : 'Apple iOS/iPadOS restricts WebUSB, WebHID, and WebSerial in Safari. Press any button on an attached USB-C or Bluetooth gamepad to capture via Gamepad API, or open Firmware -> Raw Image Writer / Manuals / Bench Profiles.';
  }
  if (caps.platformFamily === 'firefox' || caps.platformFamily === 'safari-desktop') {
    return mode === 'bluetooth'
      ? `${caps.platformLabel} does not implement Web Bluetooth. Pair your wireless controller in OS Bluetooth settings and press any button for Gamepad API detection, or use Chrome / Edge for GATT telemetry.`
      : `${caps.platformLabel} does not expose WebUSB / WebHID. Plug in any controller and press a button for native Gamepad API detection, or use Chrome / Edge for raw USB-C bridge access.`;
  }
  if (caps.platformFamily === 'android') {
    return mode === 'bluetooth'
      ? 'No BLE peripheral selected. For Bluetooth Classic controllers (DualSense, DualShock 4, Xbox, Switch Pro), pair in Android Bluetooth Settings first, press any button, then tap "Scan Connected Gamepad / HID".'
      : 'Android Chrome shows "No compatible devices found" when Android\'s kernel driver claims a plugged-in USB-C phone (MTP) or gamepad (HID). Press any button on your controller so Android wakes the Gamepad API, or pick a device profile below.';
  }
  if (mode === 'bluetooth') {
    return 'No BLE peripheral selected. If pairing a Bluetooth Classic gamepad (DualSense/Xbox/Switch), pair in OS Bluetooth settings first, press a button, and tap "Scan Gamepads / HID / Serial".';
  }
  if (mode === 'hid') {
    return 'No HID/Serial bridge or awake gamepad detected. Press any button on your controller and scan again, or choose a Consumer Device / PMIC profile below.';
  }
  return 'No WebUSB device was selected. Confirm your USB-C cable/OTG adapter is seated, click "Scan Gamepads / HID / Serial" for HID controllers, or select a Consumer Device or PMIC profile below.';
}

export async function requestInteractiveBluetoothConnection(): Promise<{
  hardware: ConnectedHardwareInfo | null;
  error?: string;
}> {
  const nav = (typeof navigator !== 'undefined' ? navigator : {}) as UsbNavigatorLike;
  const caps = getHardwareCapabilities();

  if (nav.bluetooth) {
    try {
      const device = await nav.bluetooth.requestDevice({
        acceptAllDevices: true,
        optionalServices: STANDARD_BLE_OPTIONAL_SERVICES,
      });
      const hardware = await probeBluetoothDevice(device);
      return { hardware };
    } catch (err) {
      const activeGamepad = getConnectedGamepad(nav);
      if (activeGamepad) {
        return { hardware: probeGamepadDevice(activeGamepad) };
      }
      const msg = err instanceof Error ? err.message : String(err);
      const lower = msg.toLowerCase();
      if (
        lower.includes('cancel') ||
        lower.includes('no device') ||
        lower.includes('not found')
      ) {
        return {
          hardware: null,
          error: formatNoHardwareGuidance('bluetooth', caps),
        };
      }
      return { hardware: null, error: msg };
    }
  }

  const activeGamepad = getConnectedGamepad(nav);
  if (activeGamepad) {
    return { hardware: probeGamepadDevice(activeGamepad) };
  }

  return {
    hardware: null,
    error: formatNoHardwareGuidance('bluetooth', caps),
  };
}

export async function scanAuthorizedHardware(): Promise<ConnectedHardwareInfo | null> {
  const nav = (typeof navigator !== 'undefined' ? navigator : {}) as UsbNavigatorLike;

  if (nav.usb) {
    try {
      const devices = await nav.usb.getDevices();
      if (devices.length > 0) {
        return await probeUsbDevice(devices[0]);
      }
    } catch {
      // Ignore permission restrictions
    }
  }

  if (nav.hid) {
    try {
      const devices = await nav.hid.getDevices();
      if (devices.length > 0) {
        return await probeHidDevice(devices[0]);
      }
    } catch {
      // Ignore
    }
  }

  if (nav.serial) {
    try {
      const ports = await nav.serial.getPorts();
      if (ports.length > 0) {
        return await probeSerialPort(ports[0]);
      }
    } catch {
      // Ignore
    }
  }

  if (nav.bluetooth?.getDevices) {
    try {
      const bleDevices = await nav.bluetooth.getDevices();
      if (bleDevices.length > 0) {
        return await probeBluetoothDevice(bleDevices[0]);
      }
    } catch {
      // Ignore
    }
  }

  const activeGamepad = getConnectedGamepad(nav);
  if (activeGamepad) {
    return probeGamepadDevice(activeGamepad);
  }

  return null;
}

export async function requestInteractiveUsbOrOtgConnection(): Promise<{
  hardware: ConnectedHardwareInfo | null;
  error?: string;
}> {
  const nav = (typeof navigator !== 'undefined' ? navigator : {}) as UsbNavigatorLike;
  const caps = getHardwareCapabilities();

  // Unrestricted filters: [] displays all attached USB-C consumer devices, phones, controllers, hubs & EVKs
  if (nav.usb) {
    try {
      const device = await nav.usb.requestDevice({ filters: [] });
      const hardware = await probeUsbDevice(device);
      return { hardware };
    } catch (err) {
      // If Android/Desktop OS driver claimed a controller/bridge ("No compatible devices found"), fall back cleanly
      const activeGamepad = getConnectedGamepad(nav);
      if (activeGamepad) {
        return { hardware: probeGamepadDevice(activeGamepad) };
      }
      if (nav.hid) {
        try {
          const hidDevs = await nav.hid.getDevices();
          if (hidDevs.length > 0) {
            return { hardware: await probeHidDevice(hidDevs[0]) };
          }
        } catch {
          // Ignore fallback probe errors
        }
      }
      if (nav.serial) {
        try {
          const ports = await nav.serial.getPorts();
          if (ports.length > 0) {
            return { hardware: await probeSerialPort(ports[0]) };
          }
        } catch {
          // Ignore fallback probe errors
        }
      }

      const msg = err instanceof Error ? err.message : String(err);
      const lower = msg.toLowerCase();
      if (
        lower.includes('no device') ||
        lower.includes('cancelled') ||
        lower.includes('canceled') ||
        lower.includes('not found') ||
        lower.includes('compatible')
      ) {
        return {
          hardware: null,
          error: formatNoHardwareGuidance('usb', caps),
        };
      }
      return { hardware: null, error: msg };
    }
  }

  return requestInteractiveSerialOrHidConnection();
}

export async function requestInteractiveSerialOrHidConnection(): Promise<{
  hardware: ConnectedHardwareInfo | null;
  error?: string;
}> {
  const nav = (typeof navigator !== 'undefined' ? navigator : {}) as UsbNavigatorLike;
  const caps = getHardwareCapabilities();

  if (nav.hid) {
    try {
      // Unrestricted WebHID picker shows DualSense, DualShock 4/3, Xbox, Switch Pro, Retro Gamepads, CP2112 & MCP2221A
      const devices = await nav.hid.requestDevice({ filters: [] });
      if (devices.length > 0) {
        const hardware = await probeHidDevice(devices[0]);
        return { hardware };
      }
    } catch (err) {
      const activeGamepad = getConnectedGamepad(nav);
      if (activeGamepad) {
        return { hardware: probeGamepadDevice(activeGamepad) };
      }
      const msg = err instanceof Error ? err.message : String(err);
      if (!nav.serial) {
        const lower = msg.toLowerCase();
        return {
          hardware: null,
          error:
            lower.includes('no device') || lower.includes('cancel')
              ? formatNoHardwareGuidance('hid', caps)
              : msg,
        };
      }
    }
  }

  // On Android Chrome, iOS Safari, and Firefox (where WebHID is unavailable), the W3C Gamepad API exposes wired & BT controllers
  const activeGamepad = getConnectedGamepad(nav);
  if (activeGamepad) {
    return { hardware: probeGamepadDevice(activeGamepad) };
  }

  if (nav.serial) {
    try {
      const port = await nav.serial.requestPort();
      const hardware = await probeSerialPort(port);
      return { hardware };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const lower = msg.toLowerCase();
      return {
        hardware: null,
        error:
          lower.includes('no port') || lower.includes('cancel')
            ? formatNoHardwareGuidance('hid', caps)
            : msg,
      };
    }
  }

  return {
    hardware: null,
    error: formatNoHardwareGuidance('hid', caps),
  };
}

export function subscribePlugEvents(
  onConnect: (hardware: ConnectedHardwareInfo) => void,
  onDisconnect: () => void,
): () => void {
  const nav = (typeof navigator !== 'undefined' ? navigator : {}) as UsbNavigatorLike;
  const cleanups: Array<() => void> = [];

  if (nav.usb) {
    const handleConnect = async (e: { device: UsbDeviceLike }) => {
      onConnect(await probeUsbDevice(e.device));
    };
    const handleDisconnect = () => onDisconnect();
    nav.usb.addEventListener('connect', handleConnect);
    nav.usb.addEventListener('disconnect', handleDisconnect);
    cleanups.push(() => {
      nav.usb?.removeEventListener('connect', handleConnect);
      nav.usb?.removeEventListener('disconnect', handleDisconnect);
    });
  }

  if (nav.hid) {
    const handleConnect = async (e: { device: HidDeviceLike }) => {
      onConnect(await probeHidDevice(e.device));
    };
    const handleDisconnect = () => onDisconnect();
    nav.hid.addEventListener('connect', handleConnect);
    nav.hid.addEventListener('disconnect', handleDisconnect);
    cleanups.push(() => {
      nav.hid?.removeEventListener('connect', handleConnect);
      nav.hid?.removeEventListener('disconnect', handleDisconnect);
    });
  }

  if (nav.serial) {
    const handleConnect = async (e: { target: SerialPortLike }) => {
      onConnect(await probeSerialPort(e.target));
    };
    const handleDisconnect = () => onDisconnect();
    nav.serial.addEventListener('connect', handleConnect);
    nav.serial.addEventListener('disconnect', handleDisconnect);
    cleanups.push(() => {
      nav.serial?.removeEventListener('connect', handleConnect);
      nav.serial?.removeEventListener('disconnect', handleDisconnect);
    });
  }

  if (typeof window !== 'undefined') {
    const handleGamepadConnect = (e: Event) => {
      const gp = (e as unknown as { gamepad?: GamepadLike }).gamepad;
      if (gp) {
        onConnect(probeGamepadDevice(gp));
      }
    };
    const handleGamepadDisconnect = () => onDisconnect();
    window.addEventListener('gamepadconnected', handleGamepadConnect);
    window.addEventListener('gamepaddisconnected', handleGamepadDisconnect);
    cleanups.push(() => {
      window.removeEventListener('gamepadconnected', handleGamepadConnect);
      window.removeEventListener('gamepaddisconnected', handleGamepadDisconnect);
    });
  }

  return () => {
    for (const fn of cleanups) fn();
  };
}

export function createBenchHardwareAttach(partNumber: string): ConnectedHardwareInfo {
  const profile = ALL_DEVICE_PROFILES[partNumber] ?? DIALOG_PMIC_PROFILES.DA9063;
  const isConsumer = Boolean(profile.deviceCategory && profile.deviceCategory !== 'pmic');
  const vidNum = profile.usbVendorIds?.[0] ?? 0x1680;
  const numericTail = profile.partNumber.replace(/\D/g, '').slice(-4);
  const pidNum = numericTail ? parseInt(numericTail, 16) : (0x0100 + profile.deviceIdValue);
  const labelName = profile.displayName ?? `Dialog ${profile.partNumber}-EVK`;

  const classification = classifyUsbDevice(
    vidNum,
    pidNum,
    isConsumer ? labelName : `Dialog ${profile.partNumber}-EVK USB-C OTG`,
    profile.deviceCategory === 'consumer-gamepad' ? 0x03 : undefined,
  );

  const identified: IdentifiedPmicResult = isConsumer
    ? {
        matched: true,
        partNumber: profile.partNumber,
        confidence: 'exact',
        i2cAddr: profile.primaryI2cAddr,
        deviceIdHex: `0x${(profile.deviceIdValue & 0xff).toString(16).toUpperCase().padStart(2, '0')}`,
        variantIdHex: `0x${(profile.variantIdValue & 0xff).toString(16).toUpperCase().padStart(2, '0')}`,
        profile,
      }
    : identifyDialogPmicFromRegisters(
        profile.primaryI2cAddr,
        profile.deviceIdValue,
        profile.variantIdValue,
      );

  return {
    transport: 'Bench-OTG',
    deviceName: isConsumer ? `${labelName} (USB-C / HID)` : `${profile.partNumber} Evaluation Board (USB-C OTG)`,
    vendorIdHex: `0x${vidNum.toString(16).toUpperCase().padStart(4, '0')}`,
    productIdHex: `0x${pidNum.toString(16).toUpperCase().padStart(4, '0')}`,
    classification,
    identified,
    scannedAddresses: profile.i2cAddresses,
    rawReadMode: 'live-bus',
  };
}
