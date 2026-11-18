import {
  ALL_DEVICE_PROFILES,
  DIALOG_PMIC_PROFILES,
  FIRMWARE_CATALOG,
  MANUAL_CATALOG,
  type DeviceCategory,
  type FirmwarePackage,
  type ManualDocument,
  type PmicProfile,
  type RailDefinition,
} from './pmicCatalog.ts';

export interface UsbBridgeClassification {
  vendorName: string;
  bridgeModel: string;
  recommendedTransport: 'WebUSB' | 'WebHID' | 'WebSerial';
  i2cMaxKhz: number;
  mobileOtgPlugAndPlay: boolean;
  defaultTargetPart?: string;
  deviceCategory?: DeviceCategory;
  matchedDevicePart?: string;
  usbClassLabel?: string;
}

export interface IdentifiedPmicResult {
  matched: boolean;
  partNumber: string;
  confidence: 'exact' | 'family' | 'generic';
  i2cAddr: string;
  deviceIdHex: string;
  variantIdHex: string;
  profile: PmicProfile;
}

export interface RailRuntimeState {
  id: string;
  enabled: boolean;
  voltageMv: number;
  currentMa: number;
  tempC: number;
}

export interface ParsedFirmwareImage {
  fileName: string;
  format: 'intel-hex' | 'binary' | 'json-otp' | 'catalog';
  byteLength: number;
  crc32: string;
  targetPartHint?: string;
  registerPatches: Array<{ addr: string; name: string; value: string; note: string }>;
  valid: boolean;
  error?: string;
}

function usbClassToLabel(deviceClass?: number): string | undefined {
  switch (deviceClass) {
    case 0x01:
      return 'USB Audio (UAC)';
    case 0x02:
      return 'CDC Communications';
    case 0x03:
      return 'HID Controller / Bridge';
    case 0x06:
      return 'MTP / PTP Imaging';
    case 0x08:
      return 'Mass Storage / UASP';
    case 0x09:
      return 'USB Hub';
    case 0x0a:
      return 'CDC Data';
    case 0x11:
      return 'USB Billboard / PD Alt';
    case 0xff:
      return 'Vendor Specific / ADB';
    default:
      return undefined;
  }
}

export function classifyUsbDevice(
  vendorId: number,
  productId: number,
  productName = '',
  deviceClass?: number,
): UsbBridgeClassification {
  const lower = productName.toLowerCase();
  const usbClassLabel = usbClassToLabel(deviceClass);

  const detectedPartHint = lower.includes('9062')
    ? 'DA9062'
    : lower.includes('9121')
      ? 'DA9121'
      : lower.includes('9313')
        ? 'DA9313'
        : lower.includes('51000')
          ? 'SLG51000'
          : lower.includes('7280')
            ? 'DA7280'
            : lower.includes('9063')
              ? 'DA9063'
              : undefined;

  // Dialog / Renesas EVK & explicit Dialog part hints
  if (vendorId === 0x1680 || vendorId === 0x045b || lower.includes('dialog') || lower.includes('renesas')) {
    return {
      vendorName: 'Dialog / Renesas',
      bridgeModel: productName || 'Dialog EVK USB-I2C Bridge',
      recommendedTransport: 'WebUSB',
      i2cMaxKhz: 3400,
      mobileOtgPlugAndPlay: true,
      defaultTargetPart: detectedPartHint ?? 'DA9063',
      deviceCategory: 'pmic',
      matchedDevicePart: detectedPartHint ?? 'DA9063',
      usbClassLabel,
    };
  }

  // Consumer Smartphones & Tablets
  if (vendorId === 0x04e8 || vendorId === 0x22b8 || vendorId === 0x2a70 || vendorId === 0x2717) {
    const isPortableSsd = lower.includes('ssd') || lower.includes('t5') || lower.includes('t7') || lower.includes('t9');
    const target = isPortableSsd ? 'NVME-USBC' : 'GALAXY-USBC';
    const vendorName =
      vendorId === 0x04e8
        ? 'Samsung Electronics'
        : vendorId === 0x22b8
          ? 'Motorola Mobility'
          : vendorId === 0x2a70
            ? 'OnePlus'
            : 'Xiaomi';
    return {
      vendorName,
      bridgeModel: productName || (isPortableSsd ? 'Samsung Portable USB-C SSD' : `${vendorName} USB-C Device`),
      recommendedTransport: 'WebUSB',
      i2cMaxKhz: 400,
      mobileOtgPlugAndPlay: true,
      matchedDevicePart: target,
      deviceCategory: isPortableSsd ? 'consumer-audio-storage' : 'consumer-mobile',
      usbClassLabel,
    };
  }

  if (vendorId === 0x18d1) {
    return {
      vendorName: 'Google',
      bridgeModel: productName || 'Google Pixel USB-C Device',
      recommendedTransport: 'WebUSB',
      i2cMaxKhz: 400,
      mobileOtgPlugAndPlay: true,
      matchedDevicePart: 'PIXEL-PD',
      deviceCategory: 'consumer-mobile',
      usbClassLabel,
    };
  }

  if (vendorId === 0x05ac) {
    return {
      vendorName: 'Apple',
      bridgeModel: productName || 'Apple iPhone / iPad USB-C Device',
      recommendedTransport: 'WebUSB',
      i2cMaxKhz: 400,
      mobileOtgPlugAndPlay: true,
      matchedDevicePart: 'IPHONE-USBC',
      deviceCategory: 'consumer-mobile',
      usbClassLabel,
    };
  }

  // Sony PlayStation Controllers (PS5 DualSense, PS4 DualShock 4, PS3 DualShock 3)
  if (vendorId === 0x054c) {
    const isPs3 = productId === 0x0268 || lower.includes('ps3') || lower.includes('sixaxis') || lower.includes('playstation(r)3');
    const isPs4 =
      productId === 0x05c4 ||
      productId === 0x09cc ||
      productId === 0x0ba0 ||
      lower.includes('dualshock 4') ||
      lower.includes('wireless controller') && !lower.includes('dualsense');
    const target = isPs3 ? 'PS3-SIXAXIS' : isPs4 ? 'DUALSHOCK4' : 'DUALSENSE';
    return {
      vendorName: 'Sony Interactive Entertainment',
      bridgeModel:
        productName ||
        (isPs3
          ? 'PlayStation 3 DualShock 3 / Sixaxis'
          : isPs4
            ? 'PlayStation DualShock 4 Controller'
            : 'PlayStation DualSense Wireless Controller'),
      recommendedTransport: 'WebHID',
      i2cMaxKhz: 400,
      mobileOtgPlugAndPlay: true,
      matchedDevicePart: target,
      deviceCategory: 'consumer-gamepad',
      usbClassLabel: usbClassLabel ?? 'USB HID Gamepad',
    };
  }

  // Microsoft Xbox Controllers (Xbox Series / One & Classic Xbox 360)
  if (vendorId === 0x045e) {
    const isX360 =
      productId === 0x028e ||
      productId === 0x028f ||
      productId === 0x0291 ||
      productId === 0x0719 ||
      lower.includes('360');
    const target = isX360 ? 'XBOX-360' : 'XBOX-CTRL';
    return {
      vendorName: 'Microsoft',
      bridgeModel: productName || (isX360 ? 'Xbox 360 Controller (XInput)' : 'Xbox Series / One Controller'),
      recommendedTransport: 'WebUSB',
      i2cMaxKhz: 400,
      mobileOtgPlugAndPlay: true,
      matchedDevicePart: target,
      deviceCategory: 'consumer-gamepad',
      usbClassLabel: usbClassLabel ?? 'USB Gamepad (GIP / XInput)',
    };
  }

  // Nintendo Consoles, Switch Pro, Joy-Con & GameCube Adapter
  if (vendorId === 0x057e) {
    const isProOrJoycon =
      productId === 0x2009 ||
      productId === 0x2006 ||
      productId === 0x2007 ||
      productId === 0x200e ||
      lower.includes('pro controller') ||
      lower.includes('joy-con');
    const isRetroAdapter = productId === 0x0337 || lower.includes('gamecube') || lower.includes('nes') || lower.includes('snes');
    const target = isRetroAdapter ? 'NINTENDO-RETRO' : isProOrJoycon ? 'SWITCH-PRO' : 'SWITCH-OLED';
    return {
      vendorName: 'Nintendo',
      bridgeModel:
        productName ||
        (isRetroAdapter
          ? 'Nintendo GameCube / Retro USB Adapter'
          : isProOrJoycon
            ? 'Nintendo Switch Pro / Joy-Con Controller'
            : 'Nintendo Switch / OLED Console'),
      recommendedTransport: isProOrJoycon ? 'WebHID' : 'WebUSB',
      i2cMaxKhz: 400,
      mobileOtgPlugAndPlay: true,
      matchedDevicePart: target,
      deviceCategory: isProOrJoycon || isRetroAdapter ? 'consumer-gamepad' : 'consumer-gaming',
      usbClassLabel,
    };
  }

  // Valve Steam Deck
  if (vendorId === 0x28de) {
    return {
      vendorName: 'Valve',
      bridgeModel: productName || 'Valve Steam Deck USB-C Controller',
      recommendedTransport: 'WebHID',
      i2cMaxKhz: 400,
      mobileOtgPlugAndPlay: true,
      matchedDevicePart: 'STEAM-DECK',
      deviceCategory: 'consumer-gaming',
      usbClassLabel,
    };
  }

  // Classic Retro USB Gamepads & Third-Party Modern Gamepads (8BitDo, Hori, PowerA, DragonRise, Logitech)
  if (vendorId === 0x0079 || vendorId === 0x0810) {
    return {
      vendorName: vendorId === 0x0079 ? 'DragonRise / Retro HID' : 'Classic Twin-USB Gamepad',
      bridgeModel: productName || 'Retro USB Gamepad (NES/SNES/N64/GC/Arcade)',
      recommendedTransport: 'WebHID',
      i2cMaxKhz: 100,
      mobileOtgPlugAndPlay: true,
      matchedDevicePart: 'NINTENDO-RETRO',
      deviceCategory: 'consumer-gamepad',
      usbClassLabel: 'USB HID Gamepad',
    };
  }

  if (vendorId === 0x2dc8 || vendorId === 0x0f0d || vendorId === 0x20d6 || vendorId === 0x3537) {
    const vendorName =
      vendorId === 0x2dc8
        ? '8BitDo'
        : vendorId === 0x0f0d
          ? 'Hori'
          : vendorId === 0x20d6
            ? 'PowerA'
            : 'GameSir';
    return {
      vendorName,
      bridgeModel: productName || `${vendorName} Modern / Hall-Effect Gamepad`,
      recommendedTransport: 'WebHID',
      i2cMaxKhz: 400,
      mobileOtgPlugAndPlay: true,
      matchedDevicePart: '8BITDO-PAD',
      deviceCategory: 'consumer-gamepad',
      usbClassLabel: 'USB HID Gamepad',
    };
  }

  if (vendorId === 0x046d) {
    return {
      vendorName: 'Logitech',
      bridgeModel: productName || 'Logitech F310 / F710 / DirectInput Gamepad',
      recommendedTransport: 'WebHID',
      i2cMaxKhz: 400,
      mobileOtgPlugAndPlay: true,
      matchedDevicePart: 'LOGITECH-PAD',
      deviceCategory: 'consumer-gamepad',
      usbClassLabel: usbClassLabel ?? 'USB HID Gamepad',
    };
  }

  // USB-C Docks, Hubs, Storage, Audio DACs
  if (vendorId === 0x2109 || vendorId === 0x05e3) {
    return {
      vendorName: vendorId === 0x2109 ? 'VIA Labs' : 'Genesys Logic',
      bridgeModel: productName || 'USB-C Multiport Hub & Dock',
      recommendedTransport: 'WebUSB',
      i2cMaxKhz: 400,
      mobileOtgPlugAndPlay: true,
      matchedDevicePart: 'USBC-DOCK',
      deviceCategory: 'consumer-pd-dock',
      usbClassLabel,
    };
  }

  if (vendorId === 0x0bda) {
    const isAudio = deviceClass === 0x01 || lower.includes('audio') || lower.includes('alc') || lower.includes('dac');
    const isNvme = lower.includes('9210') || lower.includes('nvme') || lower.includes('ssd') || deviceClass === 0x08;
    const target = isAudio ? 'USBC-DAC' : isNvme ? 'NVME-USBC' : 'USBC-DOCK';
    return {
      vendorName: 'Realtek Semiconductor',
      bridgeModel: productName || (isAudio ? 'Realtek USB-C Audio DAC' : isNvme ? 'RTL9210B NVMe SSD Enclosure' : 'Realtek USB-C Dock Controller'),
      recommendedTransport: 'WebUSB',
      i2cMaxKhz: 400,
      mobileOtgPlugAndPlay: true,
      matchedDevicePart: target,
      deviceCategory: isAudio || isNvme ? 'consumer-audio-storage' : 'consumer-pd-dock',
      usbClassLabel,
    };
  }

  if (vendorId === 0x0781 || vendorId === 0x0951 || vendorId === 0x152d) {
    const vendorName =
      vendorId === 0x0781 ? 'SanDisk' : vendorId === 0x0951 ? 'Kingston' : 'JMicron';
    return {
      vendorName,
      bridgeModel: productName || `${vendorName} Portable USB-C NVMe SSD`,
      recommendedTransport: 'WebUSB',
      i2cMaxKhz: 400,
      mobileOtgPlugAndPlay: true,
      matchedDevicePart: 'NVME-USBC',
      deviceCategory: 'consumer-audio-storage',
      usbClassLabel: usbClassLabel ?? 'Mass Storage / UASP',
    };
  }

  if (vendorId === 0x1235 || vendorId === 0x262a || deviceClass === 0x01) {
    return {
      vendorName: vendorId === 0x1235 ? 'Focusrite' : vendorId === 0x262a ? 'Savitech / Audio' : 'USB Audio Device',
      bridgeModel: productName || 'Hi-Fi USB-C Audio DAC / Interface',
      recommendedTransport: 'WebUSB',
      i2cMaxKhz: 400,
      mobileOtgPlugAndPlay: true,
      matchedDevicePart: 'USBC-DAC',
      deviceCategory: 'consumer-audio-storage',
      usbClassLabel: usbClassLabel ?? 'USB Audio (UAC)',
    };
  }

  // Dedicated I2C / Serial / Debug Bridges (for Dialog PMICs or Consumer Board Probing)
  if (vendorId === 0x10c4 && productId === 0xea90) {
    return {
      vendorName: 'Silicon Labs',
      bridgeModel: 'CP2112 HID USB-to-SMBus/I2C Bridge',
      recommendedTransport: 'WebHID',
      i2cMaxKhz: 400,
      mobileOtgPlugAndPlay: true,
      defaultTargetPart: detectedPartHint,
      deviceCategory: 'pmic',
      usbClassLabel,
    };
  }

  if (vendorId === 0x10c4) {
    return {
      vendorName: 'Silicon Labs',
      bridgeModel: productName || 'CP210x USB-UART Bridge',
      recommendedTransport: 'WebUSB',
      i2cMaxKhz: 400,
      mobileOtgPlugAndPlay: true,
      defaultTargetPart: detectedPartHint,
      deviceCategory: 'pmic',
      usbClassLabel,
    };
  }

  if (vendorId === 0x04d8 && productId === 0x00dd) {
    return {
      vendorName: 'Microchip',
      bridgeModel: 'MCP2221A USB-I2C/UART Bridge',
      recommendedTransport: 'WebHID',
      i2cMaxKhz: 400,
      mobileOtgPlugAndPlay: true,
      defaultTargetPart: detectedPartHint,
      deviceCategory: 'pmic',
      usbClassLabel,
    };
  }

  if (vendorId === 0x0403) {
    return {
      vendorName: 'FTDI',
      bridgeModel: productName || 'FT2232H / FT232H MPSSE I2C Bridge',
      recommendedTransport: 'WebUSB',
      i2cMaxKhz: 1000,
      mobileOtgPlugAndPlay: true,
      defaultTargetPart: detectedPartHint,
      deviceCategory: 'pmic',
      usbClassLabel,
    };
  }

  if (vendorId === 0x1a86) {
    return {
      vendorName: 'WCH',
      bridgeModel: productName || 'CH341A / CH340 USB-I2C Adapter',
      recommendedTransport: 'WebSerial',
      i2cMaxKhz: 400,
      mobileOtgPlugAndPlay: true,
      defaultTargetPart: detectedPartHint,
      deviceCategory: 'pmic',
      usbClassLabel,
    };
  }

  if (vendorId === 0x2e8a) {
    return {
      vendorName: 'Raspberry Pi',
      bridgeModel: productName || 'RP2040 USB-C I2C Probe',
      recommendedTransport: 'WebSerial',
      i2cMaxKhz: 1000,
      mobileOtgPlugAndPlay: true,
      defaultTargetPart: detectedPartHint,
      deviceCategory: 'pmic',
      usbClassLabel,
    };
  }

  if (vendorId === 0x0483) {
    return {
      vendorName: 'STMicroelectronics',
      bridgeModel: productName || 'STM32 USB-C OTG / I2C Probe',
      recommendedTransport: 'WebUSB',
      i2cMaxKhz: 1000,
      mobileOtgPlugAndPlay: true,
      defaultTargetPart: detectedPartHint,
      deviceCategory: 'pmic',
      usbClassLabel,
    };
  }

  if (vendorId === 0x04b4 || vendorId === 0x058b) {
    const isPdCharger = lower.includes('pd') || lower.includes('ccg') || lower.includes('charger');
    return {
      vendorName: 'Infineon / Cypress',
      bridgeModel: productName || 'Cypress USB-Serial / I2C Bridge',
      recommendedTransport: 'WebUSB',
      i2cMaxKhz: 400,
      mobileOtgPlugAndPlay: true,
      defaultTargetPart: detectedPartHint,
      matchedDevicePart: isPdCharger ? 'GAN-PD-100W' : undefined,
      deviceCategory: isPdCharger ? 'consumer-pd-dock' : 'pmic',
      usbClassLabel,
    };
  }

  if (vendorId === 0x0451 || vendorId === 0x2047) {
    const isPd = lower.includes('pd') || lower.includes('tps');
    return {
      vendorName: 'Texas Instruments',
      bridgeModel: productName || 'TI USB2ANY / PD Interface',
      recommendedTransport: 'WebUSB',
      i2cMaxKhz: 400,
      mobileOtgPlugAndPlay: true,
      defaultTargetPart: detectedPartHint,
      matchedDevicePart: isPd ? 'GAN-PD-100W' : undefined,
      deviceCategory: isPd ? 'consumer-pd-dock' : 'pmic',
      usbClassLabel,
    };
  }

  if (vendorId === 0x1fc9 || vendorId === 0x15a2 || vendorId === 0x067b || vendorId === 0x303a || vendorId === 0x2341) {
    return {
      vendorName:
        vendorId === 0x067b
          ? 'Prolific'
          : vendorId === 0x303a
            ? 'Espressif'
            : vendorId === 0x2341
              ? 'Arduino'
              : 'NXP',
      bridgeModel: productName || 'USB-I2C / Serial OTG Adapter',
      recommendedTransport: 'WebUSB',
      i2cMaxKhz: 400,
      mobileOtgPlugAndPlay: true,
      defaultTargetPart: detectedPartHint,
      deviceCategory: 'pmic',
      usbClassLabel,
    };
  }

  // Product-name fallback for generic HID gamepads or consumer USB peripherals
  if (lower.includes('gamepad') || lower.includes('joystick') || lower.includes('controller') || deviceClass === 0x03) {
    return {
      vendorName: 'USB HID Gamepad',
      bridgeModel: productName || 'Generic USB HID Gamepad / Controller',
      recommendedTransport: 'WebHID',
      i2cMaxKhz: 400,
      mobileOtgPlugAndPlay: true,
      matchedDevicePart: 'NINTENDO-RETRO',
      deviceCategory: 'consumer-gamepad',
      usbClassLabel: usbClassLabel ?? 'USB HID Gamepad',
    };
  }

  return {
    vendorName: 'Generic USB OTG',
    bridgeModel:
      productName ||
      `USB Device (0x${vendorId.toString(16).padStart(4, '0')}:0x${productId.toString(16).padStart(4, '0')})`,
    recommendedTransport: 'WebUSB',
    i2cMaxKhz: 400,
    mobileOtgPlugAndPlay: true,
    defaultTargetPart: detectedPartHint,
    usbClassLabel,
  };
}

export function identifyConsumerDeviceFromClassification(
  classification: UsbBridgeClassification,
): IdentifiedPmicResult | null {
  const part = classification.matchedDevicePart;
  if (!part) return null;
  const profile = ALL_DEVICE_PROFILES[part];
  if (!profile) return null;

  return {
    matched: true,
    partNumber: profile.partNumber,
    confidence: 'exact',
    i2cAddr: profile.primaryI2cAddr,
    deviceIdHex: formatHexByte(profile.deviceIdValue),
    variantIdHex: formatHexByte(profile.variantIdValue),
    profile,
  };
}

export function identifyDialogPmicFromRegisters(
  i2cAddr: string,
  deviceIdByte: number,
  variantIdByte = 0x00,
): IdentifiedPmicResult {
  const normalizedAddr = i2cAddr.toLowerCase();
  const hexId = `0x${(deviceIdByte & 0xff).toString(16).toUpperCase().padStart(2, '0')}`;
  const hexVar = `0x${(variantIdByte & 0xff).toString(16).toUpperCase().padStart(2, '0')}`;

  for (const profile of Object.values(DIALOG_PMIC_PROFILES)) {
    const addrMatch = profile.i2cAddresses.some((a) => a.toLowerCase() === normalizedAddr);
    if (profile.deviceIdValue === deviceIdByte && addrMatch) {
      const exactVariant = profile.variantIdValue === variantIdByte;
      return {
        matched: true,
        partNumber: profile.partNumber,
        confidence: exactVariant ? 'exact' : 'family',
        i2cAddr: normalizedAddr,
        deviceIdHex: hexId,
        variantIdHex: hexVar,
        profile,
      };
    }
  }

  // Fallback match by Device ID alone
  for (const profile of Object.values(DIALOG_PMIC_PROFILES)) {
    if (profile.deviceIdValue === deviceIdByte) {
      return {
        matched: true,
        partNumber: profile.partNumber,
        confidence: 'family',
        i2cAddr: normalizedAddr,
        deviceIdHex: hexId,
        variantIdHex: hexVar,
        profile,
      };
    }
  }

  return {
    matched: false,
    partNumber: 'DA9063',
    confidence: 'generic',
    i2cAddr: normalizedAddr,
    deviceIdHex: hexId,
    variantIdHex: hexVar,
    profile: DIALOG_PMIC_PROFILES.DA9063,
  };
}

export function dacCodeToMillivolts(
  code: number,
  minMv: number,
  stepMv: number,
  maxMv: number,
): number {
  const raw = minMv + Math.max(0, code) * stepMv;
  return Math.min(maxMv, Math.round(raw));
}

export function millivoltsToDacCode(
  mv: number,
  minMv: number,
  stepMv: number,
  maxMv: number,
): number {
  const clamped = Math.min(maxMv, Math.max(minMv, mv));
  return Math.round((clamped - minMv) / stepMv);
}

export function formatHexByte(value: number): string {
  return `0x${(value & 0xff).toString(16).toUpperCase().padStart(2, '0')}`;
}

export function calculateRailPowerMw(voltageMv: number, currentMa: number, enabled = true): number {
  if (!enabled) return 0;
  return Math.round((voltageMv * currentMa) / 1000);
}

export function calculateTotalPowerStats(
  rails: RailRuntimeState[],
  railDefs: RailDefinition[],
  vinMv: number,
): {
  totalOutputMw: number;
  estimatedInputMw: number;
  efficiencyPct: number;
  activeRailsCount: number;
  peakTempC: number;
} {
  let totalOutputMw = 0;
  let activeRailsCount = 0;
  let peakTempC = 28;

  for (const r of rails) {
    if (r.enabled) {
      activeRailsCount += 1;
      totalOutputMw += calculateRailPowerMw(r.voltageMv, r.currentMa, true);
      if (r.tempC > peakTempC) peakTempC = r.tempC;
    }
  }

  const buckShare = rails.reduce((acc, r) => {
    const def = railDefs.find((d) => d.id === r.id);
    if (!r.enabled || !def) return acc;
    return acc + (def.type === 'BUCK' ? calculateRailPowerMw(r.voltageMv, r.currentMa, true) : 0);
  }, 0);

  const ldoShare = Math.max(0, totalOutputMw - buckShare);
  const buckInput = buckShare / 0.91;
  const ldoInput = vinMv > 0 ? ldoShare * Math.max(1.15, vinMv / 2200) : ldoShare * 1.4;
  const estimatedInputMw = totalOutputMw === 0 ? 12 : Math.round(buckInput + ldoInput + 18);
  const efficiencyPct =
    totalOutputMw === 0 ? 0 : Math.min(98.5, Number(((totalOutputMw / estimatedInputMw) * 100).toFixed(1)));

  return {
    totalOutputMw,
    estimatedInputMw,
    efficiencyPct,
    activeRailsCount,
    peakTempC: Number(peakTempC.toFixed(1)),
  };
}

export function createInitialRailStates(profile: PmicProfile): RailRuntimeState[] {
  return profile.rails.map((r, idx) => {
    const nominalLoad = Math.round(r.maxCurrentMa * (r.type === 'BUCK' ? 0.34 : 0.28));
    return {
      id: r.id,
      enabled: true,
      voltageMv: r.defaultMv,
      currentMa: nominalLoad,
      tempC: Number((33.5 + idx * 1.4).toFixed(1)),
    };
  });
}

export function matchManualsForPart(query: string): ManualDocument[] {
  const clean = query.trim().toUpperCase();
  if (!clean) {
    return MANUAL_CATALOG;
  }

  const matchingProfileParts = new Set(
    Object.values(ALL_DEVICE_PROFILES)
      .filter(
        (p) =>
          p.partNumber.toUpperCase().includes(clean) ||
          (p.displayName ?? '').toUpperCase().includes(clean) ||
          p.manufacturer.toUpperCase().includes(clean) ||
          (p.controllerIc ?? '').toUpperCase().includes(clean) ||
          (p.searchAliases ?? []).some((a) => a.toUpperCase().includes(clean) || clean.includes(a.toUpperCase())),
      )
      .map((p) => p.partNumber.toUpperCase()),
  );

  const directMatches = MANUAL_CATALOG.filter(
    (doc) =>
      doc.partNumber.toUpperCase().includes(clean) ||
      doc.title.toUpperCase().includes(clean) ||
      doc.summary.toUpperCase().includes(clean) ||
      matchingProfileParts.has(doc.partNumber.toUpperCase()),
  );

  if (directMatches.length > 0) {
    return directMatches;
  }

  // Synthesize official lookup entry for any custom Dialog / Consumer part query
  const sanitizedPart = clean.replace(/[^A-Z0-9-]/g, '');
  if (sanitizedPart.length >= 3) {
    const slug = sanitizedPart.toLowerCase();
    const isDialogPart = sanitizedPart.startsWith('DA') || sanitizedPart.startsWith('SLG');
    return [
      {
        id: `custom-${slug}-datasheet`,
        partNumber: sanitizedPart,
        title: isDialogPart
          ? `${sanitizedPart} PMIC Datasheet & Technical Manual`
          : `${sanitizedPart} USB-C Power, Pinout & Service Manual`,
        docType: isDialogPart ? 'Datasheet' : 'Service Manual',
        revision: 'Latest Release',
        releaseDate: '2026-03-01',
        pages: isDialogPart ? 96 : 48,
        fileSizeKb: isDialogPart ? 1650 : 1280,
        officialUrl: isDialogPart
          ? `https://www.renesas.com/en/search?keywords=${encodeURIComponent(sanitizedPart)}`
          : `https://www.ifixit.com/Search?query=${encodeURIComponent(sanitizedPart)}`,
        summary: isDialogPart
          ? `Auto-generated technical manual & Renesas/Dialog datasheet reference package for ${sanitizedPart}.`
          : `Auto-generated consumer hardware service reference, USB-C / HID pinout, and power rail diagnostic checklist for ${sanitizedPart}.`,
        highlights: isDialogPart
          ? [
              `Part lookup for ${sanitizedPart}`,
              'I2C 2-wire control & OTP initialization template',
              'Mobile USB-C OTG bench bring-up checklist',
            ]
          : [
              `Hardware service lookup for ${sanitizedPart}`,
              'USB-C / HID CC1-CC2 & VBUS diode-mode checklist',
              'Replacement IC & port parts sourcing workflow',
            ],
      },
      {
        id: `custom-${slug}-regmap`,
        partNumber: sanitizedPart,
        title: isDialogPart
          ? `${sanitizedPart} I2C Register & OTP Reference`
          : `${sanitizedPart} Controller Telemetry & Repair Pinout`,
        docType: 'Register Map',
        revision: 'Rev 1.0',
        releaseDate: '2026-03-01',
        pages: 32,
        fileSizeKb: 720,
        officialUrl: isDialogPart
          ? `https://www.renesas.com/en/search?keywords=${encodeURIComponent(`${sanitizedPart} register`)}`
          : `https://www.ifixit.com/Search?query=${encodeURIComponent(`${sanitizedPart} repair`)}`,
        summary: isDialogPart
          ? `Standard Dialog/Renesas PMIC register template and fault diagnostic workflow for ${sanitizedPart}.`
          : `Standard USB-C PD / HID telemetry map, LDO test pads, and diagnostic workflow for ${sanitizedPart}.`,
        highlights: ['Device ID & variant register decode', 'Power rail voltage limits & protection thresholds', '1-touch firmware/controller reset checks'],
      },
    ];
  }

  return [];
}

export function matchFirmwareForPart(partNumber: string): FirmwarePackage[] {
  const clean = partNumber.trim().toUpperCase();
  const specific = FIRMWARE_CATALOG.filter((fw) => fw.partNumber.toUpperCase() === clean);
  const bridge = FIRMWARE_CATALOG.filter((fw) => fw.partNumber === 'BRIDGE');
  return [...specific, ...bridge];
}

export function computeCrc32Hex(bytes: Uint8Array): string {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    crc ^= bytes[i];
    for (let j = 0; j < 8; j++) {
      const mask = -(crc & 1);
      crc = (crc >>> 1) ^ (0xedb88320 & mask);
    }
  }
  const unsigned = (crc ^ 0xffffffff) >>> 0;
  return `0x${unsigned.toString(16).toUpperCase().padStart(8, '0')}`;
}

export function parseFirmwareUpload(fileName: string, rawBytes: Uint8Array): ParsedFirmwareImage {
  const lower = fileName.toLowerCase();
  const text = new TextDecoder('utf-8', { fatal: false }).decode(rawBytes);

  if (rawBytes.length === 0) {
    return {
      fileName,
      format: 'binary',
      byteLength: 0,
      crc32: '0x00000000',
      registerPatches: [],
      valid: false,
      error: 'Firmware file is empty (0 bytes).',
    };
  }

  if (lower.endsWith('.hex') || text.trimStart().startsWith(':')) {
    const lines = text
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
    const dataBytes: number[] = [];
    const registerPatches: Array<{ addr: string; name: string; value: string; note: string }> = [];

    for (const line of lines) {
      if (!line.startsWith(':') || line.length < 11) {
        return {
          fileName,
          format: 'intel-hex',
          byteLength: rawBytes.length,
          crc32: computeCrc32Hex(rawBytes),
          registerPatches: [],
          valid: false,
          error: `Invalid Intel HEX record: "${line.slice(0, 16)}"`,
        };
      }
      const byteCount = parseInt(line.slice(1, 3), 16);
      const addr = parseInt(line.slice(3, 7), 16);
      const recType = parseInt(line.slice(7, 9), 16);
      if (Number.isNaN(byteCount) || Number.isNaN(addr) || Number.isNaN(recType)) {
        return {
          fileName,
          format: 'intel-hex',
          byteLength: rawBytes.length,
          crc32: computeCrc32Hex(rawBytes),
          registerPatches: [],
          valid: false,
          error: 'Malformed hex nibbles in Intel HEX file.',
        };
      }
      if (recType === 0x00) {
        for (let i = 0; i < byteCount; i++) {
          const b = parseInt(line.slice(9 + i * 2, 11 + i * 2), 16);
          if (!Number.isNaN(b)) {
            dataBytes.push(b);
            if (registerPatches.length < 16) {
              const regAddr = `0x${(addr + i).toString(16).toUpperCase().padStart(3, '0')}`;
              registerPatches.push({
                addr: regAddr,
                name: `REG_${regAddr.slice(2)}`,
                value: formatHexByte(b),
                note: 'Intel HEX payload byte',
              });
            }
          }
        }
      }
    }

    const payload = new Uint8Array(dataBytes);
    return {
      fileName,
      format: 'intel-hex',
      byteLength: payload.length,
      crc32: computeCrc32Hex(payload),
      registerPatches,
      valid: payload.length > 0,
      error: payload.length === 0 ? 'Intel HEX contained no data records.' : undefined,
    };
  }

  if (lower.endsWith('.json')) {
    try {
      const parsed = JSON.parse(text) as {
        partNumber?: string;
        registers?: Array<{ addr: string; name?: string; value: string; note?: string }>;
      };
      const registerPatches = (parsed.registers ?? []).map((r) => ({
        addr: r.addr,
        name: r.name ?? `REG_${r.addr}`,
        value: r.value,
        note: r.note ?? 'JSON OTP preset',
      }));
      return {
        fileName,
        format: 'json-otp',
        byteLength: rawBytes.length,
        crc32: computeCrc32Hex(rawBytes),
        targetPartHint: parsed.partNumber,
        registerPatches,
        valid: registerPatches.length > 0,
        error: registerPatches.length === 0 ? 'JSON file must contain a non-empty registers array.' : undefined,
      };
    } catch {
      return {
        fileName,
        format: 'json-otp',
        byteLength: rawBytes.length,
        crc32: computeCrc32Hex(rawBytes),
        registerPatches: [],
        valid: false,
        error: 'Unable to parse JSON OTP image.',
      };
    }
  }

  // Raw .bin / .uf2 / .otp / .dfu binary image
  const registerPatches: Array<{ addr: string; name: string; value: string; note: string }> = [];
  const sampleCount = Math.min(8, rawBytes.length);
  for (let i = 0; i < sampleCount; i++) {
    const regAddr = `0x${(0x0a0 + i).toString(16).toUpperCase().padStart(3, '0')}`;
    registerPatches.push({
      addr: regAddr,
      name: `OTP_BYTE_${i}`,
      value: formatHexByte(rawBytes[i]),
      note: 'Binary firmware image offset',
    });
  }

  return {
    fileName,
    format: 'binary',
    byteLength: rawBytes.length,
    crc32: computeCrc32Hex(rawBytes),
    registerPatches,
    valid: true,
  };
}
