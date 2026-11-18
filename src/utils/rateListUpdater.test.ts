import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createDefaultRateList,
  executeRateListUpdateSweep,
  formatCountdownToMidnight,
  getLocalDateKey,
  getMsUntilNextMidnight,
  shouldRunMidnightUpdate,
} from './rateListUpdater';

test('getLocalDateKey and midnight schedule timing check cleanly', () => {
  const preMidnight = new Date(2026, 10, 17, 23, 30, 0);
  assert.equal(getLocalDateKey(preMidnight), '2026-11-17');
  assert.equal(getMsUntilNextMidnight(preMidnight), 30 * 60 * 1000);
  assert.equal(formatCountdownToMidnight(preMidnight), '0h 30m');

  assert.equal(
    shouldRunMidnightUpdate({ enabled12Am: true, lastRunDateKey: '2026-11-16' }, preMidnight),
    true,
  );
  assert.equal(
    shouldRunMidnightUpdate({ enabled12Am: true, lastRunDateKey: '2026-11-17' }, preMidnight),
    false,
  );
  assert.equal(
    shouldRunMidnightUpdate({ enabled12Am: false, lastRunDateKey: '2026-11-16' }, preMidnight),
    false,
  );
});

test('executeRateListUpdateSweep processes enabled rate list entries and skips disabled ones', () => {
  const list = createDefaultRateList();
  list[2] = { ...list[2], enabled: false };

  const result = executeRateListUpdateSweep(list, new Date('2026-11-17T00:00:05.000Z'));
  assert.equal(result.updatedCount, list.length - 1);
  assert.equal(result.updatedList[0].status, 'updated');
  assert.equal(result.updatedList[2].status, 'skipped');
  assert.ok(result.summary.includes('Updated 4 Rate List target(s)'));
});
