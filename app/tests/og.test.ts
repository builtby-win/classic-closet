import assert from 'node:assert/strict';
import test from 'node:test';
import catalogData from '../src/data/catalog.json';
import { crawlerRenderURL, GMS_EQUIP_IDS, MCW1_FACE_IDS, MCW1_HAIR_STYLES, ogSourceFor, parseLookParams } from '../src/lib/og';
import { encodeLook, faceVariantId, type Look } from '../src/lib/fashion';
function entriesOf(url: string): Array<{ itemId: number; region: string; version: string }> {
  const u = new URL(url);
  assert.ok(u.pathname.startsWith('/api/character/'), `modern endpoint, got ${u.pathname}`);
  return JSON.parse(`[${decodeURIComponent(u.pathname.split('/')[3]!)}]`);
}

test('every hair color variant renders from GMS', () => {
  for (const style of [3000, 3013, 3100]) {
    for (let color = 0; color < 8; color++) {
      const id = style * 10 + color;
      assert.deepEqual(ogSourceFor(id), { region: 'GMS', version: '270' });
    }
  }
});

test('every eye color variant renders from GMS', () => {
  for (const sex of ['m', 'f'] as const) {
    for (let color = 0; color < 9; color++) {
      const id = faceVariantId(sex, 5, color);
      assert.deepEqual(ogSourceFor(id), { region: 'GMS', version: '270' });
    }
  }
});

test('GMS-only faces and classic equips route correctly', () => {
  for (const id of [21053, 21057, 21072, 21077]) {
    assert.deepEqual(ogSourceFor(id), { region: 'GMS', version: '270' });
  }
  for (const id of [2000, 12000, 1002000, 1040002, 1302000, 1007003]) {
    assert.deepEqual(ogSourceFor(id), { region: 'MCW', version: 'CBT2' });
  }
});

test('crawler URL keeps skin body+head, full color ids, and readable equip params', () => {
  const look: Look = {
    sex: 'f',
    skin: 2001,
    hair: 31247, // colored hair variant
    hairCol: 7,
    face: 21405, // eye color variant
    anim: 'stand1',
    frame: 0,
    items: { Hat: 1007003, Top: 1040002, Weapon: 1302000 },
  };
  const parsed = parseLookParams(new URLSearchParams(encodeLook(look)))!;
  const got = entriesOf(crawlerRenderURL(parsed));
  assert.deepEqual(got, [
    ...[2001, 12001].map((itemId) => ({ itemId, region: 'MCW', version: 'CBT2' })),
    ...[21405, 31247].map((itemId) => ({ itemId, region: 'GMS', version: '270' })),
    ...[1007003, 1040002, 1302000].map((itemId) => ({ itemId, region: 'MCW', version: 'CBT2' })),
  ]);
  const u = new URL(crawlerRenderURL(parsed));
  assert.ok(u.searchParams.get('resize') === '4', 'upscaled past 200px unfurler minimums');
  assert.ok(u.pathname.endsWith('/stand1/0'));
});

test('base64 ?look= param decodes the full outfit', () => {
  const look: Look = {
    sex: 'm',
    skin: 2000,
    hair: 30133,
    hairCol: 3,
    face: 20205,
    anim: 'stand1',
    frame: 0,
    items: { Hat: 1002000, Weapon: 1302000 },
  };
  const b64 = Buffer.from(JSON.stringify(look)).toString('base64url');
  const parsed = parseLookParams(new URLSearchParams(`look=${b64}`))!;
  const ids = entriesOf(crawlerRenderURL(parsed)).map((e) => e.itemId);
  assert.ok(ids.includes(20205) && ids.includes(30133));
  assert.ok(ids.includes(2000) && ids.includes(12000));
});

test('bare homepage has no look to rewrite', () => {
  assert.equal(parseLookParams(new URLSearchParams('')), null);
});

test('malicious or out-of-range values fall back safely', () => {
  const parsed = parseLookParams(
    new URLSearchParams('sex=m&skin=99999&hair=abc&face=1&anim=stand1\"><script>&frame=99&<img>=1&Hat=1302000'),
  )!;
  const url = crawlerRenderURL(parsed);
  assert.ok(!url.includes('<') && !url.includes('>') && !url.includes('"'));
  const ids = entriesOf(url).map((e) => e.itemId);
  assert.ok(ids.includes(2000) && ids.includes(20805) && ids.includes(30130));
  assert.ok(ids.includes(1302000));
  assert.ok(url.endsWith('/stand1/0?showears=false&showLefEars=false&showHighLefEars=false&resize=4&flipX=false&renderMode=0&padX=30&padY=50'));
});

test('og routing mirrors catalog src for every GMS equip', () => {
  const items = catalogData.items as Record<string, { src?: string }>;
  const gmsEquips = Object.keys(items).map(Number).filter((id) =>
    items[String(id)]?.src === 'GMS' && !(id >= 20000 && id < 50000));
  assert.ok(gmsEquips.length > 0, 'expected GMS-src equips in catalog');
  for (const id of gmsEquips) {
    assert.ok(GMS_EQUIP_IDS.has(id), `catalog GMS-src equip ${id} missing from GMS_EQUIP_IDS`);
    assert.deepEqual(ogSourceFor(id), { region: 'GMS', version: '270' });
  }
  // Buddy regression: GMS overalls must never route MCW.
  for (const id of [1050146, 1051170]) {
    assert.deepEqual(ogSourceFor(id), { region: 'GMS', version: '270' });
  }
});

test('og routing mirrors catalog src for MCW/1-only cosmetics', () => {
  const styles = catalogData.styles as Record<string, { src?: string }>;
  const items = catalogData.items as Record<string, { src?: string; sub: string }>;
  const hair = Object.keys(styles).map(Number).filter((id) => styles[String(id)]?.src === 'MCW1');
  const faces = Object.keys(items).map(Number).filter((id) => items[String(id)]?.src === 'MCW1');
  assert.ok(hair.length > 0 && faces.length > 0, 'expected MCW1 cosmetics in catalog');
  assert.deepEqual([...MCW1_HAIR_STYLES].sort(), hair.sort());
  assert.deepEqual([...MCW1_FACE_IDS].sort(), faces.sort());
  // Any color variant routes MCW/1; neighbours stay on GMS 270.
  assert.deepEqual(ogSourceFor(30863), { region: 'MCW', version: '1' });
  assert.deepEqual(ogSourceFor(20328), { region: 'MCW', version: '1' });
  assert.deepEqual(ogSourceFor(21630), { region: 'MCW', version: '1' });
  assert.deepEqual(ogSourceFor(30130), { region: 'GMS', version: '270' });
  assert.deepEqual(ogSourceFor(20805), { region: 'GMS', version: '270' });
});
