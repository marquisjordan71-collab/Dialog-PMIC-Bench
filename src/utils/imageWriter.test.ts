import test from 'node:test';
import assert from 'node:assert/strict';
import {
  analyzeRawImageBuffer,
  buildHexPreviewLines,
  buildUf2Image,
  computeSha256Hex,
  createSampleBootableDiskImage,
  formatByteSize,
  parseMbrPartitions,
  pureSha256Hex,
} from './imageWriter';

test('createSampleBootableDiskImage and analyzeRawImageBuffer detect MBR partitions and SHA-256', async () => {
  const img = createSampleBootableDiskImage('DUALSENSE');
  assert.equal(img.length, 65536);

  const partitions = parseMbrPartitions(img);
  assert.equal(partitions.length, 1);
  assert.equal(partitions[0].bootable, true);
  assert.equal(partitions[0].typeHex, '0x0C');
  assert.equal(partitions[0].typeName, 'FAT32 (LBA)');
  assert.equal(partitions[0].startLba, 2048);

  const analyzed = await analyzeRawImageBuffer('dualsense_boot.img', img);
  assert.equal(analyzed.format, 'MBR / FAT Bootable Image');
  assert.equal(analyzed.sectorCount, 128);
  assert.match(analyzed.crc32, /^0x[0-9A-F]{8}$/);
  assert.equal(analyzed.sha256.length, 64);
  assert.equal(analyzed.sha256, pureSha256Hex(img));
  assert.ok(analyzed.hexPreviewLines.length >= 4);
});

test('pureSha256Hex matches exact FIPS 180-4 vectors for non-HTTPS LAN devices', async () => {
  assert.equal(
    pureSha256Hex(new Uint8Array(0)),
    'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
  );
  const abc = new TextEncoder().encode('abc');
  assert.equal(
    pureSha256Hex(abc),
    'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
  );
  assert.equal(await computeSha256Hex(abc), pureSha256Hex(abc));
});

test('buildUf2Image creates valid UF2 blocks recognized by analyzeRawImageBuffer', async () => {
  const payload = new Uint8Array(600);
  for (let i = 0; i < payload.length; i++) payload[i] = i & 0xff;

  const uf2 = buildUf2Image(payload, 0x10000000);
  assert.equal(uf2.length, 3 * 512);

  const analyzed = await analyzeRawImageBuffer('firmware_patch.uf2', uf2);
  assert.equal(analyzed.format, 'UF2 Bootloader Image');
  assert.equal(analyzed.uf2Blocks, 3);
  assert.equal(analyzed.uf2TargetAddrHex, '0x10000000');
});

test('formatByteSize and buildHexPreviewLines format binary views cleanly', () => {
  assert.equal(formatByteSize(512), '512 B');
  assert.equal(formatByteSize(65536), '64.0 KB');
  assert.equal(formatByteSize(2 * 1024 * 1024), '2.00 MB');

  const preview = buildHexPreviewLines(new Uint8Array([0x41, 0x42, 0x43, 0x00]), 16);
  assert.equal(preview.length, 1);
  assert.ok(preview[0].includes('41 42 43 00'));
  assert.ok(preview[0].includes('|ABC.'));
});
