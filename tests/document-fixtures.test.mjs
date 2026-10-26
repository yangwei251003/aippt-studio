import assert from 'node:assert/strict';
import { test } from 'node:test';
import { generateFixtures, verifyFixtures } from '../scripts/document-fixtures.mjs';

test('document fixtures cover valid, corrupt, macro, encrypted and magic-byte cases', async () => {
  await generateFixtures();
  const report = await verifyFixtures();
  assert.equal(report.files, 14);
  assert.deepEqual(report.errors, []);
});

