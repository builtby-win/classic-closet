import assert from 'node:assert/strict';
import test from 'node:test';
import { announcements, attainableNow, dropInfo, formatDuration, unseen } from '../src/lib/drops';

const halloween = { id: 'h', start: '2026-10-28', end: '2026-11-04', startAt: '2026-10-28T08:00:00Z', endAt: '2026-11-04T08:00:00Z' };
const older = { id: 'o', start: '2026-10-06', end: '2026-11-18', endAt: '2026-11-18T18:00:00Z' };
const T = (iso: string) => Date.parse(iso);

test('dropInfo flips at the exact UTC instant, not the date', () => {
  assert.equal(dropInfo(halloween, T('2026-10-28T07:59:59Z')).state, 'upcoming');
  assert.equal(dropInfo(halloween, T('2026-10-28T08:00:00Z')).state, 'live');
  assert.equal(dropInfo(halloween, T('2026-11-04T08:00:00Z')).state, 'ended');
  assert.equal(dropInfo(halloween, T('2026-10-27T23:57:00Z')).startsInMs, 8 * 3600_000 + 3 * 60_000);
});

test('date-only banners switch at 08:00 UTC', () => {
  const b = { start: '2026-10-28', end: '2026-11-04' };
  assert.equal(dropInfo(b, T('2026-10-28T07:00:00Z')).state, 'upcoming');
  assert.equal(dropInfo(b, T('2026-10-28T09:00:00Z')).state, 'live');
});

test('NEW lasts 3 days and ending soon starts 2 days out', () => {
  assert.equal(dropInfo(halloween, T('2026-10-30T12:00:00Z')).isNew, true);
  assert.equal(dropInfo(halloween, T('2026-11-01T09:00:00Z')).isNew, false);
  assert.equal(dropInfo(halloween, T('2026-11-02T09:00:00Z')).endingSoon, true);
  assert.equal(dropInfo(halloween, T('2026-11-02T07:00:00Z')).endingSoon, false);
});

test('formatDuration', () => {
  assert.equal(formatDuration(2 * 86400_000 + 4 * 3600_000), '2d 4h');
  assert.equal(formatDuration(7 * 3600_000 + 52 * 60_000), '7h 52m');
  assert.equal(formatDuration(12 * 60_000 + 5_000), '12m 05s');
  assert.equal(formatDuration(-5), '0s');
});

test('announcements: new before upcoming, long-running banners skipped', () => {
  const justDropped = { id: 'j', start: '2026-10-26', end: '2026-11-10', startAt: '2026-10-26T08:00:00Z', endAt: '2026-11-10T08:00:00Z' };
  const far = { id: 'f', start: '2026-12-25', end: '2027-01-05' };
  const list = announcements([older, halloween, far, justDropped], T('2026-10-27T23:57:00Z'));
  assert.deepEqual(list.map((a) => a.banner.id), ['j', 'h']);
});

test('a banner is re-announced when its state changes', () => {
  const before = announcements([halloween], T('2026-10-27T23:57:00Z'));
  assert.equal(unseen(before, { h: 'upcoming' }).length, 0);
  const after = announcements([halloween], T('2026-10-28T08:01:00Z'));
  assert.equal(unseen(after, { h: 'upcoming' }).length, 1);
});

test('attainableNow: the sale window beats the baked flag', () => {
  // Archived early (flag false) but still on sale until the end instant.
  const archived = { start: '2026-10-06', end: '2026-10-28', endAt: '2026-10-28T08:00:00Z' };
  assert.equal(attainableNow(false, archived, T('2026-10-28T07:59:00Z')), true);
  assert.equal(attainableNow(false, archived, T('2026-10-28T08:00:00Z')), false);
  // Left in `current` past its end: lapses without a redeploy.
  assert.equal(attainableNow(true, archived, T('2026-10-28T08:00:00Z')), false);
  // Upcoming keeps the baked flag; undated banners and no banner are untouched.
  assert.equal(attainableNow(true, halloween, T('2026-10-27T00:00:00Z')), true);
  assert.equal(attainableNow(false, { start: null, end: null }, T('2026-10-27T00:00:00Z')), false);
  assert.equal(attainableNow(true, undefined, T('2026-10-27T00:00:00Z')), true);
});
