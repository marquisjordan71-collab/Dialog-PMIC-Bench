import type { RegisterWriteLog } from '../types';

const CSV_HEADERS = [
  'Timestamp',
  'Part Number',
  'Operation',
  'I2C Address',
  'Register',
  'Value',
  'Note',
  'Transaction ID',
] as const;

export function escapeCsvCell(raw: string | number | undefined | null): string {
  const str = raw == null ? '' : String(raw);
  if (/[",\r\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function formatI2cLogCsv(entries: readonly RegisterWriteLog[], partNumber = ''): string {
  const lines: string[] = [CSV_HEADERS.join(',')];
  for (const entry of entries) {
    lines.push(
      [
        escapeCsvCell(entry.timestamp),
        escapeCsvCell(partNumber),
        escapeCsvCell(entry.operation),
        escapeCsvCell(entry.i2cAddr),
        escapeCsvCell(entry.regAddr),
        escapeCsvCell(entry.value),
        escapeCsvCell(entry.note),
        escapeCsvCell(entry.id),
      ].join(','),
    );
  }
  return `${lines.join('\r\n')}\r\n`;
}

export function buildI2cLogCsvFilename(partNumber = 'device', now: Date = new Date()): string {
  const safePart =
    partNumber
      .trim()
      .replace(/[^a-zA-Z0-9_-]+/g, '_')
      .replace(/^_+|_+$/g, '') || 'device';
  const stamp = now.toISOString().replace(/[:.]/g, '-').slice(0, 19);
  return `${safePart}_i2c_log_${stamp}.csv`;
}
