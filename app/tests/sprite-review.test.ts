import assert from 'node:assert/strict';
import test from 'node:test';
import { unreviewedItems } from '../scripts/lib/sprite-review';

test('every baked catalog sprite is approved in data/sprite-review.json', () => {
  const pending = unreviewedItems();
  assert.deepEqual(
    pending.map((p) => `${p.id} ${p.item.name}`),
    [],
    'new or re-baked sprites need human review: pnpm check-sprites, then --approve <id…>',
  );
});
