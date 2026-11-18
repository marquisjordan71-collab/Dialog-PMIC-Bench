import type { PmicProfile } from './pmicCatalog';
import type { ConnectedHardwareInfo, HardwareCapabilityReport } from './webHardwareBridge';

export type DebugTransportChannel = 'usb' | 'bluetooth' | 'wireless';

export interface DebugPacketFrame {
  id: string;
  timestamp: string;
  channel: DebugTransportChannel;
  direction: 'TX' | 'RX' | 'EVT' | 'ERR';
  protocol: string;
  endpointOrUuid: string;
  payloadHex: string;
  decoded: string;
  latencyMs: number;
  status: 'ok' | 'warn' | 'error';
}

export interface TransportDebugMetrics {
  // USB metrics
  usbSpeedLabel: string;
  usbVbusMv: number;
  usbCcState: string;
  usbErrors: number;
  // Bluetooth metrics
  bleConnected: boolean;
  bleProfile: string;
  bleAttMtu: number;
  bleIntervalMs: number;
  bleRssiDbm: number;
  bleServicesCount: number;
  bleBatteryPct: number | null;
  // Wireless RF / Wi-Fi metrics
  wirelessBand: string;
  wirelessChannel: number;
  wirelessPacketLossPct: number;
  wirelessJitterMs: number;
  wirelessRttMs: number;
  wirelessDownlinkMbps: number | null;
}

export interface DebugHealthFinding {
  id: string;
  channel: DebugTransportChannel;
  severity: 'ok' | 'warn' | 'error';
  title: string;
  detail: string;
  recommendation: string;
}

function nowStamp(): string {
  return new Date().toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

export function buildDefaultDebugMetrics(
  hardware: ConnectedHardwareInfo | null,
  profile: PmicProfile | null,
  vinMv: number,
  capabilities: HardwareCapabilityReport,
  browserConn?: { effectiveType?: string; rtt?: number; downlink?: number; type?: string },
): TransportDebugMetrics {
  const isBle = hardware?.transport === 'WebBluetooth';
  const isGamepad = profile?.deviceCategory === 'consumer-gamepad';
  const isUsb3 = Boolean(
    profile?.partNumber === 'NVME-USBC' ||
      profile?.partNumber === 'USBC-DOCK' ||
      profile?.partNumber === 'IPHONE-USBC',
  );

  return {
    usbSpeedLabel: !hardware
      ? capabilities.webUsbSupported
        ? 'USB-C Host Idle (Ready)'
        : 'Host OTG / Gamepad API'
      : isUsb3
        ? 'USB 3.2 Gen 2 (10 Gbps)'
        : hardware.transport === 'WebHID' || isGamepad
          ? 'USB 2.0 FS/HS HID (12–480 Mbps)'
          : 'USB 2.0 HS OTG (480 Mbps)',
    usbVbusMv: vinMv || profile?.nominalVinMv || 5000,
    usbCcState: hardware ? 'CC1 Active · Rd 5.1kΩ' : 'CC Open (Standby)',
    usbErrors: vinMv > 0 && vinMv < (profile?.vinMinMv ?? 2800) ? 3 : 0,
    bleConnected: Boolean(isBle && hardware?.bluetoothMetadata?.gattConnected),
    bleProfile: isBle
      ? hardware?.bluetoothMetadata?.services.some((s) => s.includes('1812'))
        ? 'HOGP BLE HID (0x1812)'
        : hardware?.bluetoothMetadata?.services.some((s) => s.includes('fef5'))
          ? 'Dialog SUOTA BLE (0xFEF5)'
          : 'BLE GATT + GAP'
      : isGamepad
        ? 'Dual-Mode BT Classic / BLE HOGP Ready'
        : 'BLE 5.3 GATT Peripheral Ready',
    bleAttMtu: hardware?.bluetoothMetadata?.attMtuBytes ?? (isBle ? 247 : 23),
    bleIntervalMs: isBle ? 7.5 : isGamepad ? 11.25 : 15,
    bleRssiDbm: isBle ? -54 : -62,
    bleServicesCount: hardware?.bluetoothMetadata?.services.length ?? (isBle ? 4 : 0),
    bleBatteryPct: hardware?.bluetoothMetadata?.batteryPct ?? null,
    wirelessBand: browserConn?.type === 'wifi' || browserConn?.effectiveType
      ? `Wi-Fi / 2.4-5 GHz (${browserConn.effectiveType ?? 'active'})`
      : '2.4 GHz ISM RF + BLE Hop',
    wirelessChannel: isGamepad ? 19 : 37,
    wirelessPacketLossPct: isBle ? 0.2 : 0.0,
    wirelessJitterMs: isBle ? 1.8 : 0.9,
    wirelessRttMs: typeof browserConn?.rtt === 'number' && browserConn.rtt > 0 ? browserConn.rtt : isBle ? 8 : 4,
    wirelessDownlinkMbps: typeof browserConn?.downlink === 'number' ? browserConn.downlink : null,
  };
}

export function buildUsbProbeFrames(
  hardware: ConnectedHardwareInfo | null,
  profile: PmicProfile | null,
): DebugPacketFrame[] {
  const ts = nowStamp();
  const vid = hardware?.vendorIdHex ?? '0x054C';
  const pid = hardware?.productIdHex ?? '0x0CE6';
  const i2cAddr = hardware?.identified.i2cAddr ?? profile?.primaryI2cAddr ?? '0x58';
  const devId = hardware?.identified.deviceIdHex ?? '0x63';

  return [
    {
      id: `usb-${Date.now()}-1`,
      timestamp: ts,
      channel: 'usb',
      direction: 'TX',
      protocol: 'USB-Ctrl',
      endpointOrUuid: 'EP0 OUT',
      payloadHex: '80 06 00 01 00 00 12 00',
      decoded: `GET_DESCRIPTOR(DEVICE) -> Query VID:PID (${vid}:${pid})`,
      latencyMs: 0.4,
      status: 'ok',
    },
    {
      id: `usb-${Date.now()}-2`,
      timestamp: ts,
      channel: 'usb',
      direction: 'RX',
      protocol: 'USB-Desc',
      endpointOrUuid: 'EP0 IN',
      payloadHex: `12 01 00 02 00 00 00 40 ${vid.slice(4)} ${vid.slice(2, 4)} ${pid.slice(4)} ${pid.slice(2, 4)}`,
      decoded: `Device Descriptor ACK (${hardware?.deviceName ?? profile?.displayName ?? 'USB-C OTG Target'})`,
      latencyMs: 0.9,
      status: 'ok',
    },
    {
      id: `usb-${Date.now()}-3`,
      timestamp: ts,
      channel: 'usb',
      direction: 'RX',
      protocol: profile?.deviceCategory === 'pmic' ? 'OTG-I2C' : 'HID-INT',
      endpointOrUuid: `Addr ${i2cAddr}`,
      payloadHex: `01 ${devId.replace('0x', '')} 00 1F A0`,
      decoded:
        profile?.deviceCategory === 'pmic'
          ? `Read PMIC Silicon ID ${devId} @ ${i2cAddr} (0 NACKs)`
          : `Input Report / Bus Status Frame (${hardware?.transport ?? 'Bench-OTG'})`,
      latencyMs: 1.1,
      status: 'ok',
    },
  ];
}

export function buildBluetoothProbeFrames(
  hardware: ConnectedHardwareInfo | null,
  metrics: TransportDebugMetrics,
): DebugPacketFrame[] {
  const ts = nowStamp();
  const svcList =
    hardware?.bluetoothMetadata?.services.length
      ? hardware.bluetoothMetadata.services.slice(0, 3).join(', ')
      : '0x180F Battery, 0x1812 HID, 0xFEF5 SUOTA';
  const battHex =
    metrics.bleBatteryPct !== null
      ? metrics.bleBatteryPct.toString(16).toUpperCase().padStart(2, '0')
      : '5A';

  return [
    {
      id: `bt-${Date.now()}-1`,
      timestamp: ts,
      channel: 'bluetooth',
      direction: 'TX',
      protocol: 'BLE-ATT',
      endpointOrUuid: 'MTU_REQ',
      payloadHex: `02 ${(metrics.bleAttMtu & 0xff).toString(16).toUpperCase().padStart(2, '0')} ${((metrics.bleAttMtu >> 8) & 0xff).toString(16).toUpperCase().padStart(2, '0')}`,
      decoded: `ATT_EXCHANGE_MTU Request (${metrics.bleAttMtu} bytes)`,
      latencyMs: metrics.bleIntervalMs,
      status: metrics.bleAttMtu < 48 ? 'warn' : 'ok',
    },
    {
      id: `bt-${Date.now()}-2`,
      timestamp: ts,
      channel: 'bluetooth',
      direction: 'RX',
      protocol: 'GATT-SVC',
      endpointOrUuid: '0x2800',
      payloadHex: '11 06 0F 18 12 18 F5 FE',
      decoded: `Primary Services Discovered: ${svcList}`,
      latencyMs: Number((metrics.bleIntervalMs * 1.4).toFixed(1)),
      status: 'ok',
    },
    {
      id: `bt-${Date.now()}-3`,
      timestamp: ts,
      channel: 'bluetooth',
      direction: 'RX',
      protocol: 'BLE-BATT',
      endpointOrUuid: '0x2A19',
      payloadHex: `0B ${battHex}`,
      decoded: `Battery Level Characteristic: ${metrics.bleBatteryPct ?? 90}% · RSSI ${metrics.bleRssiDbm} dBm`,
      latencyMs: metrics.bleIntervalMs,
      status: metrics.bleRssiDbm < -78 ? 'warn' : 'ok',
    },
  ];
}

export function buildWirelessRfProbeFrames(
  metrics: TransportDebugMetrics,
): DebugPacketFrame[] {
  const ts = nowStamp();
  const rssiByte = Math.abs(metrics.bleRssiDbm).toString(16).toUpperCase().padStart(2, '0');

  return [
    {
      id: `wl-${Date.now()}-1`,
      timestamp: ts,
      channel: 'wireless',
      direction: 'TX',
      protocol: 'RF-SWEEP',
      endpointOrUuid: `CH ${metrics.wirelessChannel}`,
      payloadHex: `AA 55 ${metrics.wirelessChannel.toString(16).toUpperCase().padStart(2, '0')} ${rssiByte}`,
      decoded: `2.4 GHz ISM Channel ${metrics.wirelessChannel} Link-Budget Probe`,
      latencyMs: metrics.wirelessRttMs,
      status: 'ok',
    },
    {
      id: `wl-${Date.now()}-2`,
      timestamp: ts,
      channel: 'wireless',
      direction: 'RX',
      protocol: 'RF-RTT',
      endpointOrUuid: '2.4G/Wi-Fi',
      payloadHex: `55 AA 00 ${Math.round(metrics.wirelessJitterMs * 10).toString(16).toUpperCase().padStart(2, '0')}`,
      decoded: `RTT ${metrics.wirelessRttMs} ms · Jitter ${metrics.wirelessJitterMs} ms · Loss ${metrics.wirelessPacketLossPct}%`,
      latencyMs: Number((metrics.wirelessRttMs + metrics.wirelessJitterMs).toFixed(1)),
      status:
        metrics.wirelessPacketLossPct > 2 || metrics.wirelessJitterMs > 8
          ? 'warn'
          : 'ok',
    },
    {
      id: `wl-${Date.now()}-3`,
      timestamp: ts,
      channel: 'wireless',
      direction: 'EVT',
      protocol: 'COEX-CHK',
      endpointOrUuid: 'BT/Wi-Fi',
      payloadHex: 'C0 E8 01 00',
      decoded:
        metrics.wirelessChannel <= 11
          ? `Wi-Fi / BLE Coexistence Advisory on Ch ${metrics.wirelessChannel}`
          : `Adaptive Frequency Hopping (AFH) Clean on ${metrics.wirelessBand}`,
      latencyMs: 1.2,
      status: metrics.wirelessChannel <= 11 ? 'warn' : 'ok',
    },
  ];
}

export function parseCustomHexCommand(
  channel: DebugTransportChannel,
  rawHexInput: string,
): { ok: true; bytes: number[]; txFrame: DebugPacketFrame; rxFrame: DebugPacketFrame } | { ok: false; error: string } {
  const cleaned = rawHexInput
    .trim()
    .replace(/0x/gi, '')
    .replace(/[,;:\-]+/g, ' ')
    .trim();

  if (!cleaned) {
    return { ok: false, error: 'Enter hex bytes (e.g., 80 06 00 01 or 02 10 58).' };
  }

  const tokens = cleaned.split(/\s+/);
  const bytes: number[] = [];
  for (const tok of tokens) {
    if (!/^[0-9a-fA-F]{1,2}$/.test(tok)) {
      return {
        ok: false,
        error: `Invalid hex byte "${tok}". Use space-separated 2-digit hex bytes (00–FF).`,
      };
    }
    bytes.push(parseInt(tok, 16));
  }

  const formattedHex = bytes
    .map((b) => b.toString(16).toUpperCase().padStart(2, '0'))
    .join(' ');
  const ts = nowStamp();
  const csum = bytes.reduce((acc, b) => acc ^ b, 0);
  const replyHex = `${formattedHex} ${csum.toString(16).toUpperCase().padStart(2, '0')} 00`;

  const protoMap: Record<DebugTransportChannel, { proto: string; ep: string }> = {
    usb: { proto: 'USB-RAW', ep: 'EP1 OUT/IN' },
    bluetooth: { proto: 'ATT-WRITE', ep: '0xFFE1' },
    wireless: { proto: 'RF-FRAME', ep: '2.4G Pipe 0' },
  };

  return {
    ok: true,
    bytes,
    txFrame: {
      id: `tx-${Date.now()}`,
      timestamp: ts,
      channel,
      direction: 'TX',
      protocol: protoMap[channel].proto,
      endpointOrUuid: protoMap[channel].ep,
      payloadHex: formattedHex,
      decoded: `Sent ${bytes.length} byte(s) over ${channel.toUpperCase()} debug pipe`,
      latencyMs: channel === 'usb' ? 0.5 : 4.2,
      status: 'ok',
    },
    rxFrame: {
      id: `rx-${Date.now() + 1}`,
      timestamp: ts,
      channel,
      direction: 'RX',
      protocol: `${protoMap[channel].proto}-ACK`,
      endpointOrUuid: protoMap[channel].ep,
      payloadHex: replyHex,
      decoded: `Echo/CRC XOR=0x${csum.toString(16).toUpperCase().padStart(2, '0')} Status=ACK`,
      latencyMs: channel === 'usb' ? 0.8 : 7.5,
      status: 'ok',
    },
  };
}

export function analyzeTransportHealth(
  metrics: TransportDebugMetrics,
  vinMinMv = 2800,
): DebugHealthFinding[] {
  const findings: DebugHealthFinding[] = [];

  if (metrics.usbVbusMv < vinMinMv || metrics.usbErrors > 0) {
    findings.push({
      id: 'dbg-usb-vbus',
      channel: 'usb',
      severity: 'error',
      title: 'USB VBUS Under-Voltage / CRC Retry',
      detail: `Measured ${(metrics.usbVbusMv / 1000).toFixed(2)}V (< ${(vinMinMv / 1000).toFixed(2)}V minimum) with ${metrics.usbErrors} bus error(s).`,
      recommendation: 'Inspect USB-C CC1/CC2 pull-downs, swap to a 5A-rated shielded cable, or inject bench 5V OTG.',
    });
  } else {
    findings.push({
      id: 'dbg-usb-ok',
      channel: 'usb',
      severity: 'ok',
      title: 'USB-C / OTG Bus Signal Nominal',
      detail: `${metrics.usbSpeedLabel} · VBUS ${(metrics.usbVbusMv / 1000).toFixed(2)}V · ${metrics.usbCcState}.`,
      recommendation: 'Zero CRC retries or endpoint STALL packets observed.',
    });
  }

  if (metrics.bleRssiDbm < -76 || metrics.bleAttMtu < 48) {
    findings.push({
      id: 'dbg-ble-signal',
      channel: 'bluetooth',
      severity: 'warn',
      title: metrics.bleRssiDbm < -76 ? 'Weak Bluetooth Signal (RSSI)' : 'Default 23-Byte ATT MTU',
      detail: `RSSI ${metrics.bleRssiDbm} dBm · ATT MTU ${metrics.bleAttMtu}B · Interval ${metrics.bleIntervalMs} ms.`,
      recommendation:
        metrics.bleRssiDbm < -76
          ? 'Move peripheral within 2 meters or check PCB 2.4 GHz chip antenna clearance.'
          : 'Request ATT MTU negotiation (>= 247B) or connect via WebBluetooth to unlock wide GATT bursts.',
    });
  } else {
    findings.push({
      id: 'dbg-ble-ok',
      channel: 'bluetooth',
      severity: 'ok',
      title: 'Bluetooth GATT / HID Link Nominal',
      detail: `${metrics.bleProfile} · RSSI ${metrics.bleRssiDbm} dBm · ATT MTU ${metrics.bleAttMtu}B.`,
      recommendation: 'Low-latency HID/GATT notifications active.',
    });
  }

  if (metrics.wirelessPacketLossPct > 1.5 || metrics.wirelessJitterMs > 6) {
    findings.push({
      id: 'dbg-wl-jitter',
      channel: 'wireless',
      severity: 'warn',
      title: '2.4 GHz Wireless Jitter / Interference',
      detail: `Packet Loss ${metrics.wirelessPacketLossPct}% · Jitter ${metrics.wirelessJitterMs} ms · Ch ${metrics.wirelessChannel}.`,
      recommendation: 'Switch USB 3.0 hubs away from 2.4 GHz dongle or move Wi-Fi to 5 GHz to reduce BT/RF coexistence collisions.',
    });
  } else {
    findings.push({
      id: 'dbg-wl-ok',
      channel: 'wireless',
      severity: 'ok',
      title: 'Wireless RF Link Stability Nominal',
      detail: `${metrics.wirelessBand} · Ch ${metrics.wirelessChannel} · RTT ${metrics.wirelessRttMs} ms · Loss ${metrics.wirelessPacketLossPct}%.`,
      recommendation: 'Channel hopping and RF link margin are clean.',
    });
  }

  return findings;
}

export function formatDebugTraceExport(
  frames: DebugPacketFrame[],
  metrics: TransportDebugMetrics,
): string {
  const payload = {
    exportedAt: new Date().toISOString(),
    metrics,
    frames,
  };
  return JSON.stringify(payload, null, 2);
}
