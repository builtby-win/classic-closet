import assert from 'node:assert/strict';
import test from 'node:test';
import { DEFAULT_LOOK, EYE_COLORS, faceColorIndex, faceStyleId, formatAttainableInfo, fuzzyScore, matchesFuzzy, renderURL, iconURL, matchesJob, randomLook, equipSlot, type Sex, applyPick, stanceForWeapon, TWO_HAND_SUBS, RANDOM_EQUIP_SLOTS } from '../src/lib/fashion';
import catalog from '../src/data/catalog.json';

test('mixed render preserves Classic body and equips with retail cosmetics', () => {
  const url = new URL(renderURL({ ...DEFAULT_LOOK, hair: 32397, face: 20033, items: { Hat: 1007116, Overall: 1057049, Shoes: 1077017, Weapon: 1702010 } }));
  const entries = JSON.parse(`[${decodeURIComponent(url.pathname.split('/')[3])}]`);
  assert.deepEqual(entries, [
    ...[2000, 12000].map(itemId => ({ itemId, region: 'MCW', version: 'CBT2' })),
    ...[20033, 32397].map(itemId => ({ itemId, region: 'GMS', version: '270' })),
    ...[1007116, 1057049, 1077017, 1702010].map(itemId => ({ itemId, region: 'MCW', version: 'CBT2' })),
  ]);
  assert.ok(url.pathname.endsWith('/stand1/0'));
});

test('Mystery coupon catalog contains all six hairs and faces per sex', () => {
  for (const sex of ['m', 'f']) {
    assert.equal(Object.values(catalog.styles).filter(meta => meta.sex === sex && meta.coupon === 'mystery' && meta.attainable).length, 6);
    assert.equal(Object.values(catalog.items).filter(meta => meta.sex === sex && meta.coupon === 'mystery' && meta.attainable).length, 6);
  }
});

test('Classic non-NX equips are indexed, searchable, and rendered from MCW', () => {
  const group = catalog.indexes.groups['classic-equips'];
  const ids = [...group.u, ...group.m, ...group.f];
  assert.equal(new Set(ids).size, ids.length);
  for (const id of ids) {
    const item = catalog.items[id as keyof typeof catalog.items];
    assert.equal(item.group, 'classic-equips');
    assert.ok(id >= 1000000);
    assert.ok(catalog.indexes.search.some(entry => entry.id === id));
    assert.ok(iconURL(id).includes('/MCW/CBT2/'));
  }
});

test('job filtering retains common equips and hides other classes', () => {
  const items = Object.values(catalog.items).filter(item => item.group === 'classic-equips');
  const warrior = items.find(item => item.requiredJobs?.includes('Warrior') && !item.requiredJobs.includes('Beginner'))!;
  const common = items.find(item => item.requiredJobs?.includes('Beginner'))!;
  assert.ok(warrior);
  assert.ok(matchesJob(warrior, 'Warrior'));
  assert.equal(matchesJob(warrior, 'Magician'), false);
  assert.ok(matchesJob(common, 'Magician'));
  assert.ok(matchesJob(warrior, 'All'));
  assert.ok(matchesJob(catalog.items[1007116], 'Magician'));
});

test('randomized starting looks include complete compatible outfits and matching hair colors', () => {
  for (const sex of ['m', 'f'] as Sex[]) {
    for (let seed = 0; seed < 100; seed++) {
      let state = seed + 1;
      const look = randomLook(sex, () => {
        state = (state * 1664525 + 1013904223) >>> 0;
        return state / 4294967296;
      });
      assert.equal(look.hair % 10, look.hairCol);
      assert.ok(catalog.indexes.hairs[sex].active.includes(Math.floor(look.hair / 10)));
      assert.ok(catalog.indexes.faces[sex].active.some(id => faceStyleId(id) === faceStyleId(look.face)));
      assert.ok(faceColorIndex(look.face) >= 0 && faceColorIndex(look.face) < EYE_COLORS.length);
      assert.equal(look.items.Overall, undefined);
      for (const slot of ['Hat', 'Top', 'Bottom', 'Shoes', 'Glove', 'Cape', 'Weapon']) {
        const id = look.items[slot];
        assert.ok(id, `Missing ${slot} for ${sex}`);
        const item = catalog.items[id as keyof typeof catalog.items];
        assert.ok(item.attainable);
        assert.ok(item.sex === 'u' || item.sex === sex);
        assert.equal(equipSlot(item.sub), slot);
      }
    }
  }
});

test('randomizer omits chosen slots and keeps the other slots equipped', () => {
  for (const sex of ['m', 'f'] as Sex[]) {
    for (const omitted of RANDOM_EQUIP_SLOTS) {
      const look = randomLook(sex, () => 0, [omitted]);
      assert.equal(look.items[omitted], undefined);
      for (const slot of RANDOM_EQUIP_SLOTS.filter(slot => slot !== omitted)) assert.ok(look.items[slot]);
    }
    assert.deepEqual(randomLook(sex, () => 0, RANDOM_EQUIP_SLOTS).items, {});
  }
});

test('unequipping removes only the selected slot and preserves clothing exclusions', () => {
  const items = { Hat: 1007116, Top: 1040002, Bottom: 1060002, Shoes: 1072001 };
  assert.deepEqual(applyPick(items, 'Hat', null), { Top: 1040002, Bottom: 1060002, Shoes: 1072001 });
  const overall = applyPick(items, 'Overall', 1057049);
  assert.equal(overall.Top, undefined);
  assert.equal(overall.Bottom, undefined);
  assert.deepEqual(applyPick(overall, 'Overall', null), { Hat: 1007116, Shoes: 1072001 });
});

test('two-handed weapons drop the shield; shields swap to a one-handed weapon', () => {
  const both = applyPick({ Weapon: 1302000, Shield: 1092000 }, 'Weapon', 1402000, 'Two-Handed Sword');
  assert.equal(both.Weapon, 1402000);
  assert.equal(both.Shield, undefined);
  const kept = applyPick({ Weapon: 1302000 }, 'Weapon', 1332000, 'Dagger');
  assert.equal(kept.Weapon, 1332000);
  const swapped = applyPick({ Weapon: 1402000, Shield: undefined }, 'Shield', 1092000, 'Shield');
  assert.equal(swapped.Shield, 1092000);
  assert.ok(!TWO_HAND_SUBS[(catalog.items as Record<string, { sub: string }>)[String(swapped.Weapon)].sub]);
  const bowSwaps = applyPick({ Weapon: 1452000 }, 'Shield', 1092000, 'Shield');
  assert.equal(bowSwaps.Shield, 1092000);
  assert.ok(TWO_HAND_SUBS['Bow']);
  assert.ok(TWO_HAND_SUBS['Claw']);
});

test('each weapon family steers to a stance with renderer frames', () => {
  assert.deepEqual(stanceForWeapon('One-Handed Sword', 'stand1'), null);
  assert.deepEqual(stanceForWeapon('One-Handed Sword', 'stand2'), { anim: 'stand1', frame: 0 });
  assert.deepEqual(stanceForWeapon('Two-Handed Sword', 'stand1'), { anim: 'stand2', frame: 0 });
  assert.deepEqual(stanceForWeapon('Crossbow', 'stand1'), { anim: 'stand2', frame: 0 });
  assert.deepEqual(stanceForWeapon('Claw', 'stand2'), { anim: 'stand1', frame: 0 });
  assert.deepEqual(stanceForWeapon('Wand', 'stand2'), { anim: 'stand1', frame: 0 });
  assert.deepEqual(stanceForWeapon('Staff', 'stand2'), { anim: 'stand1', frame: 0 });
  assert.deepEqual(stanceForWeapon('Cash', 'stand1'), null);
  assert.deepEqual(stanceForWeapon('Cash', 'stand2'), { anim: 'stand1', frame: 0 });
  assert.deepEqual(stanceForWeapon('Two-Handed Sword', 'alert'), null);
});

test('the initial preview is dressed before the randomized render loads', () => {
  for (const slot of ['Top', 'Bottom', 'Shoes', 'Glove']) assert.ok(DEFAULT_LOOK.items[slot]);
});

test('z-index ordering preserves proper back-to-front layer stacking', async () => {
  const { getZIndex } = await import('../src/lib/zmap');
  assert.ok(getZIndex('hairBelowBody') < getZIndex('body'));
  assert.ok(getZIndex('body') < getZIndex('mailChest'));
  assert.ok(getZIndex('mailChest') < getZIndex('head'));
  assert.ok(getZIndex('head') < getZIndex('hair'));
  assert.ok(getZIndex('hair') < getZIndex('hairOverHead'));
});


test('fuzzy search matches substrings, typos, and ids', () => {
  assert.ok((fuzzyScore('antag', 'Antagonist') ?? -1) > (fuzzyScore('antag', 'Zephyr') ?? 1));
  assert.ok(fuzzyScore('antgnst', 'Antagonist') != null);
  assert.equal(fuzzyScore('zzz', 'Antagonist'), null);
  assert.ok(matchesFuzzy('Antagonist', 30130, 'antag'));
  assert.ok(matchesFuzzy('Antagonist', 30130, '3013'));
  assert.ok(!matchesFuzzy('Antagonist', 30130, 'zephyr'));
  assert.ok(matchesFuzzy(undefined, 30130, '3013'));
  assert.ok(matchesFuzzy('Antagonist', 30130, ''));
});

test('Alert Face is active, attainable, and properly resolved across eye colors', () => {
  const alertFace = catalog.items[20805 as unknown as keyof typeof catalog.items];
  assert.ok(alertFace, '20805 Alert Face must be present in catalog');
  assert.equal(alertFace.name, 'Alert Face');
  assert.equal(alertFace.sex, 'm');
  assert.equal(alertFace.bannerId, 'style-oct26');
  assert.equal(alertFace.attainable, true);
  assert.equal(alertFace.coupon, 'mystery');
  assert.equal(alertFace.rate, '16.67%');

  // Must be in active male faces index
  assert.ok(catalog.indexes.faces.m.active.includes(20805));

  // Resolved across eye colors (e.g. 20005 black eyes)
  const infoBlack = formatAttainableInfo(catalog as any, 20005);
  assert.equal(infoBlack.isAttainable, true);
  assert.equal(infoBlack.bannerLabel, 'Mystery & Signature Style Coupons');

  const infoViolet = formatAttainableInfo(catalog as any, 20805);
  assert.equal(infoViolet.isAttainable, true);
  assert.equal(infoViolet.bannerLabel, 'Mystery & Signature Style Coupons');
});

test('both male and female items are accessible and sort matching sex first', () => {
  const crateGroup = catalog.indexes.groups['mystery-crate'];
  assert.ok(crateGroup.m.length > 0);
  assert.ok(crateGroup.f.length > 0);
  assert.ok(crateGroup.u.length > 0);

  // When current character is male ('m')
  const maleLookSex: Sex = 'm';
  const otherSex: Sex = 'f';
  const allCrateItems = [...crateGroup.u, ...crateGroup[maleLookSex], ...crateGroup[otherSex]];
  assert.equal(new Set(allCrateItems).size, allCrateItems.length);

  // Matching items (u and m) sort before opposite sex (f)
  const sexMismatch = (id: number) => {
    const s = catalog.items[id as keyof typeof catalog.items]?.sex;
    return s && s !== 'u' && s !== maleLookSex ? 1 : 0;
  };
  const sorted = [...allCrateItems].sort((a, b) => sexMismatch(a) - sexMismatch(b));

  const firstOppositeIdx = sorted.findIndex(id => catalog.items[id as keyof typeof catalog.items]?.sex === 'f');
  assert.ok(firstOppositeIdx >= 0);
  // All items before firstOppositeIdx must be 'u' or 'm'
  for (let i = 0; i < firstOppositeIdx; i++) {
    const s = catalog.items[sorted[i]! as keyof typeof catalog.items]?.sex;
    assert.ok(s === 'u' || s === 'm');
  }
});

