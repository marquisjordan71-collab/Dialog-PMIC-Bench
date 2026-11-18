import test from 'node:test';
import assert from 'node:assert/strict';
import { generateManualPdf } from './pdfGenerator';
import { CONSUMER_DEVICE_PROFILES, DIALOG_PMIC_PROFILES, MANUAL_CATALOG } from './pmicCatalog';

test('generateManualPdf produces a valid multi-page PDF 1.4 binary with xref and EOF', () => {
  const doc = MANUAL_CATALOG.find((m) => m.partNumber === 'DA9063') ?? MANUAL_CATALOG[0];
  const profile = DIALOG_PMIC_PROFILES.DA9063;
  const bytes = generateManualPdf(doc, profile);

  assert.ok(bytes instanceof Uint8Array);
  assert.ok(bytes.length > 1000);

  const text = new TextDecoder('utf-8').decode(bytes);
  assert.ok(text.startsWith('%PDF-1.4\n'), 'PDF must start with %PDF-1.4 header');
  assert.ok(text.includes('/Count 2'), 'PDF must have 2 pages');
  assert.ok(text.includes('DA9063 System PMIC Datasheet'), 'PDF must include manual title');
  assert.ok(text.includes('BCORE1'), 'PDF must include rail specifications');
  assert.ok(text.includes('xref\n'), 'PDF must include xref table');
  assert.ok(text.trimEnd().endsWith('%%EOF'), 'PDF must terminate with %%EOF');
});

test('generateManualPdf produces valid consumer gamepad PDF with controller IC and USB-C steps', () => {
  const doc = MANUAL_CATALOG.find((m) => m.partNumber === 'DUALSENSE');
  assert.ok(doc);
  const profile = CONSUMER_DEVICE_PROFILES.DUALSENSE;
  const bytes = generateManualPdf(doc, profile);

  const text = new TextDecoder('utf-8').decode(bytes);
  assert.ok(text.startsWith('%PDF-1.4\n'));
  assert.ok(text.includes('CONSUMER DEVICE, GAMEPAD & USB-C BENCH DOCUMENTATION'));
  assert.ok(text.includes('DUALSENSE'));
  assert.ok(text.includes('VCM_HAPTIC'));
  assert.ok(text.trimEnd().endsWith('%%EOF'));
});
