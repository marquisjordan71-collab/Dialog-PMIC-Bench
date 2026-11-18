import test from 'node:test';
import assert from 'node:assert/strict';
import { buildI2cLogCsvFilename, escapeCsvCell, formatI2cLogCsv } from './i2cCsvExport';
import type { RegisterWriteLog } from '../types';

test('escapeCsvCell handles plain text, commas, double quotes, and newlines per RFC 4180', () => {
  assert.equal(escapeCsvCell('0x0A3'), '0x0A3');
  assert.equal(escapeCsvCell('Rail, buck1'), '"Rail, buck1"');
  assert.equal(escapeCsvCell('Write "VBUCK1"'), '"Write ""VBUCK1"""');
  assert.equal(escapeCsvCell('Line 1\nLine 2'), '"Line 1\nLine 2"');
  assert.equal(escapeCsvCell(undefined), '');
});

test('formatI2cLogCsv outputs header row only when log is empty', () => {
  const csv = formatI2cLogCsv([], 'DA9063');
  assert.equal(
    csv,
    'Timestamp,Part Number,Operation,I2C Address,Register,Value,Note,Transaction ID\r\n',
  );
});

test('formatI2cLogCsv exports all I2C log rows with escaped fields and CRLF line endings', () => {
  const entries: RegisterWriteLog[] = [
    {
      id: 'tx-2',
      timestamp: '02:45:10',
      i2cAddr: '0x58',
      regAddr: '0x0A3',
      value: '0x52',
      operation: 'WRITE',
      note: 'Set VBUCK1 = 1200 mV, "turbo"',
    },
    {
      id: 'tx-1',
      timestamp: '02:45:01',
      i2cAddr: '0x58',
      regAddr: '0x181',
      value: '0x63',
      operation: 'READ',
      note: 'Manual I2C read\nverified ACK',
    },
  ];

  const csv = formatI2cLogCsv(entries, 'DA9063');
  const expected = [
    'Timestamp,Part Number,Operation,I2C Address,Register,Value,Note,Transaction ID',
    '02:45:10,DA9063,WRITE,0x58,0x0A3,0x52,"Set VBUCK1 = 1200 mV, ""turbo""",tx-2',
    '02:45:01,DA9063,READ,0x58,0x181,0x63,"Manual I2C read\nverified ACK",tx-1',
    '',
  ].join('\r\n');

  assert.equal(csv, expected);
});

test('buildI2cLogCsvFilename sanitizes part numbers and appends ISO timestamp', () => {
  const fixedDate = new Date('2026-11-18T10:42:55.123Z');
  assert.equal(
    buildI2cLogCsvFilename('DA9063 / EVK', fixedDate),
    'DA9063_EVK_i2c_log_2026-11-18T10-42-55.csv',
  );
  assert.equal(
    buildI2cLogCsvFilename('   ', fixedDate),
    'device_i2c_log_2026-11-18T10-42-55.csv',
  );
});
