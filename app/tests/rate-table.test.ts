import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { frozenRates, parseRateTable } from '../scripts/rate-table';

const table = (rows: Record<string, string>) =>
  '<table>' + Object.entries(rows).map(([n, r]) => `<tr><td>${n}</td><td>${r}</td></tr>`).join('') + '<tr><td>100.00%</td></tr></table>';
const twoTables = `<p>Live</p>${table({ A: '1.00%' })}<h2>Coming Soon</h2>${table({ B: '2.00%' })}`;

test('splits live and upcoming tables at the marker', () => {
  assert.deepEqual([...parseRateTable(twoTables, 'current').keys()], ['A']);
  assert.deepEqual([...parseRateTable(twoTables, 'upcoming').keys()], ['B']);
});

test('upcoming table stops at a later cycle marker', () => {
  const three = `${twoTables}<h2>Coming Soon</h2>${table({ C: '3.00%' })}`;
  assert.deepEqual([...parseRateTable(three, 'upcoming').keys()], ['B']);
});

test('marker removed after the switch: refuses to guess a part', () => {
  assert.throws(() => parseRateTable(table({ B: '2.00%' }), 'upcoming'), /marker/);
  assert.throws(() => parseRateTable(table({ B: '2.00%' }), 'current'), /marker/);
});

test('frozen snapshot ignores later edits to the live post', async () => {
  const file = join(mkdtempSync(join(tmpdir(), 'rates-')), 'snap.json');
  const first = await frozenRates(file, 'b', async () => parseRateTable(twoTables, 'upcoming'));
  assert.deepEqual([...first], [['B', '2.00%']]);
  const again = await frozenRates(file, 'b', async () => new Map([['Z', '9.00%']]));
  assert.deepEqual([...again], [['B', '2.00%']]);
  assert.deepEqual(Object.keys(JSON.parse(readFileSync(file, 'utf8'))), ['b']);
  writeFileSync(file, '{}');
  await assert.rejects(frozenRates(file, 'x', async () => new Map()), /empty/);
});
