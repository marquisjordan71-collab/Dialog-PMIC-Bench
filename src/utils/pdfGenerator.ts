import type { ManualDocument, PmicProfile } from './pmicCatalog.ts';

function sanitizePdfText(input: string): string {
  return input
    .replace(/[^\x20-\x7E]/g, ' ')
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)');
}

function wrapLine(text: string, maxChars = 84): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = '';
  for (const w of words) {
    if (!current) {
      current = w;
    } else if (current.length + 1 + w.length <= maxChars) {
      current += ` ${w}`;
    } else {
      lines.push(current);
      current = w;
    }
  }
  if (current) lines.push(current);
  return lines.length > 0 ? lines : [''];
}

function buildContentStream(lines: Array<{ text: string; size?: number; bold?: boolean; gap?: number }>): string {
  const ops: string[] = ['BT'];
  let y = 760;

  for (const item of lines) {
    const size = item.size ?? 10;
    const font = item.bold ? '/F2' : '/F1';
    const gap = item.gap ?? size + 4;
    ops.push(`${font} ${size} Tf`);
    ops.push(`1 0 0 1 48 ${y} Tm`);
    ops.push(`(${sanitizePdfText(item.text)}) Tj`);
    y -= gap;
    if (y < 52) break;
  }

  ops.push('ET');
  return ops.join('\n');
}

export function generateManualPdf(
  manual: ManualDocument,
  profile?: PmicProfile,
  ownerSeal?: string,
): Uint8Array {
  const isConsumer = Boolean(profile?.deviceCategory && profile.deviceCategory !== 'pmic');
  const headerBanner = isConsumer
    ? 'CONSUMER DEVICE, GAMEPAD & USB-C BENCH DOCUMENTATION'
    : 'DIALOG SEMICONDUCTOR / RENESAS TECHNICAL DOCUMENTATION';

  const page1Lines: Array<{ text: string; size?: number; bold?: boolean; gap?: number }> = [
    { text: headerBanner, size: 9, bold: true, gap: 16 },
    { text: manual.title, size: 17, bold: true, gap: 22 },
    {
      text: `Part / Model: ${manual.partNumber}  |  Type: ${manual.docType}  |  Revision: ${manual.revision}  |  Date: ${manual.releaseDate}`,
      size: 10,
      gap: 20,
    },
    { text: '1. EXECUTIVE SUMMARY', size: 12, bold: true, gap: 16 },
  ];

  for (const line of wrapLine(manual.summary, 86)) {
    page1Lines.push({ text: line, size: 10, gap: 14 });
  }

  page1Lines.push({ text: '', size: 8, gap: 10 });
  page1Lines.push({ text: '2. KEY FEATURES & OPERATING HIGHLIGHTS', size: 12, bold: true, gap: 16 });
  for (const h of manual.highlights) {
    for (const line of wrapLine(`- ${h}`, 84)) {
      page1Lines.push({ text: line, size: 10, gap: 14 });
    }
  }

  if (profile) {
    page1Lines.push({ text: '', size: 8, gap: 10 });
    page1Lines.push({ text: '3. HARDWARE IDENTIFICATION & SUPPLY RATINGS', size: 12, bold: true, gap: 16 });
    if (profile.controllerIc || profile.busProtocol) {
      page1Lines.push({
        text: `Controller / PMIC: ${profile.controllerIc ?? profile.partNumber}  |  Bus: ${profile.busProtocol ?? 'I2C'}`,
        size: 10,
        gap: 14,
      });
    }
    page1Lines.push({
      text: `Package: ${profile.packageType}  |  Primary Addr: ${profile.primaryI2cAddr} (Alt: ${profile.i2cAddresses.join(', ')})`,
      size: 10,
      gap: 14,
    });
    page1Lines.push({
      text: `Device ID Reg (${profile.deviceIdReg}): 0x${profile.deviceIdValue.toString(16).toUpperCase().padStart(2, '0')}  |  VIN Range: ${(profile.vinMinMv / 1000).toFixed(1)}V - ${(profile.vinMaxMv / 1000).toFixed(1)}V`,
      size: 10,
      gap: 14,
    });
    page1Lines.push({
      text: `Factory Revision: ${profile.otpRevision}  |  Firmware Tag: ${profile.firmwareVersion}`,
      size: 10,
      gap: 18,
    });

    page1Lines.push({ text: '4. POWER RAIL ARCHITECTURE', size: 12, bold: true, gap: 16 });
    page1Lines.push({
      text: 'RAIL       TYPE   REG    RANGE (mV)      STEP    DEFAULT   IMAX (mA)  SEQ',
      size: 9,
      bold: true,
      gap: 14,
    });
    for (const r of profile.rails.slice(0, 8)) {
      const row = `${r.id.padEnd(10)} ${r.type.padEnd(6)} ${r.regAddr.padEnd(6)} ${String(r.minMv).padStart(4)}-${String(r.maxMv).padEnd(9)} ${String(r.stepMv).padEnd(7)} ${String(r.defaultMv).padEnd(9)} ${String(r.maxCurrentMa).padEnd(10)} #${r.seqSlot}`;
      page1Lines.push({ text: row, size: 9, gap: 13 });
    }
  }

  page1Lines.push({ text: '', size: 8, gap: 10 });
  page1Lines.push({
    text: `Official Reference URL: ${manual.officialUrl}`,
    size: 9,
    gap: 14,
  });
  if (ownerSeal) {
    page1Lines.push({
      text: `Licensed Distribution: ${ownerSeal}`,
      size: 8,
      bold: true,
      gap: 12,
    });
  }

  // Page 2: Register Map & Mobile USB-C OTG / Firmware Update Guide
  const page2Lines: Array<{ text: string; size?: number; bold?: boolean; gap?: number }> = [
    {
      text: isConsumer
        ? `${manual.partNumber} -- TELEMETRY MAP, PINOUT & USB-C / HID BRING-UP`
        : `${manual.partNumber} -- REGISTER MAP & MOBILE OTG BRING-UP`,
      size: 13,
      bold: true,
      gap: 20,
    },
  ];

  if (profile) {
    page2Lines.push({
      text: isConsumer ? '5. CONTROLLER / TELEMETRY REGISTER MAP' : '5. I2C CONTROL & STATUS REGISTER MAP',
      size: 11,
      bold: true,
      gap: 16,
    });
    page2Lines.push({ text: 'ADDR    REGISTER        DEF     ACCESS  DESCRIPTION', size: 9, bold: true, gap: 14 });
    for (const reg of profile.registers) {
      const row = `${reg.addr.padEnd(7)} ${reg.name.padEnd(15)} ${reg.defaultVal.padEnd(7)} ${reg.access.padEnd(7)} ${reg.description.slice(0, 46)}`;
      page2Lines.push({ text: row, size: 9, gap: 13 });
    }

    page2Lines.push({ text: '', size: 8, gap: 10 });
    page2Lines.push({ text: '6. CRITICAL PINOUT & TEST PAD ASSIGNMENTS', size: 11, bold: true, gap: 16 });
    for (const pin of profile.pinoutHighlights) {
      page2Lines.push({ text: `Pin ${pin.pin.padEnd(10)} ${pin.name.padEnd(16)} ${pin.function}`, size: 9, gap: 13 });
    }
  }

  page2Lines.push({ text: '', size: 8, gap: 10 });
  page2Lines.push({
    text: isConsumer
      ? '7. USB-C / HID BENCH DIAGNOSTICS & FIRMWARE UPDATE PROCEDURE'
      : '7. MOBILE USB-C OTG & FIRMWARE REFLASHING PROCEDURE',
    size: 11,
    bold: true,
    gap: 16,
  });
  const otgSteps = isConsumer
    ? [
        '1. Connect the device or gamepad over USB-C / OTG (use Scan HID / Serial for DirectInput/XInput/DualSense pads).',
        '2. Inspect CC1/CC2 pull-downs (5.1k ohm), VBUS diode readings (0.45-0.70V on D+/D-), and primary rail levels.',
        '3. Verify Device ID & fault latch registers before tuning PD/VCM power rails or clearing latched fault bits.',
        '4. For firmware updates: back up current configuration (.hex), verify CRC-32 checksum, flash, and re-run Diagnostics.',
      ]
    : [
        '1. Connect mobile device USB-C OTG port to EVK USB-I2C bridge (CP2112, MCP2221A, FTDI, or Dialog EVK).',
        '2. Verify SDA/SCL pull-ups (2.2k ohm to VIO 1.8V or 3.3V) and VSYS supply >= 3.3V before probing.',
        '3. Read Device ID & Variant ID registers to confirm silicon revision before writing VSEL or OTP pages.',
        '4. For firmware/OTP reflashing: back up shadow registers, validate CRC-32 checksum, unlock MTP/OTP, write pages, and readback verify.',
      ];
  for (const step of otgSteps) {
    for (const line of wrapLine(step, 84)) {
      page2Lines.push({ text: line, size: 9.5, gap: 13 });
    }
  }
  if (ownerSeal) {
    page2Lines.push({ text: '', size: 8, gap: 8 });
    page2Lines.push({
      text: `Protected Copy -- ${ownerSeal}`,
      size: 8,
      bold: true,
      gap: 12,
    });
  }

  const stream1 = buildContentStream(page1Lines);
  const stream2 = buildContentStream(page2Lines);

  const objects: string[] = [
    '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n',
    '2 0 obj\n<< /Type /Pages /Kids [3 0 R 4 0 R] /Count 2 >>\nendobj\n',
    '3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R /F2 6 0 R >> >> /Contents 7 0 R >>\nendobj\n',
    '4 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R /F2 6 0 R >> >> /Contents 8 0 R >>\nendobj\n',
    '5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Courier >>\nendobj\n',
    '6 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Courier-Bold >>\nendobj\n',
    `7 0 obj\n<< /Length ${stream1.length} >>\nstream\n${stream1}\nendstream\nendobj\n`,
    `8 0 obj\n<< /Length ${stream2.length} >>\nstream\n${stream2}\nendstream\nendobj\n`,
  ];

  const encoder = new TextEncoder();
  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [0];
  for (const obj of objects) {
    offsets.push(encoder.encode(pdf).length);
    pdf += obj;
  }

  const xrefOffset = encoder.encode(pdf).length;
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += '0000000000 65535 f \n';
  for (let i = 1; i <= objects.length; i++) {
    pdf += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;

  return new TextEncoder().encode(pdf);
}
