import assert from 'node:assert/strict';
import test from 'node:test';
import { DEFAULT_LOOK, EYE_COLORS, faceColorIndex, faceStyleId, formatAttainableInfo, fuzzyScore, matchesFuzzy, renderURL, assetSource, iconURL, matchesJob, randomLook, equipSlot, type Sex, applyPick, stanceForWeapon, weaponSubOf, weaponVariant, wieldOptions, wieldChoice, oneHandedWield, resolveWield, encodeLook, decodeLook, iconFallbackURL, TWO_HAND_SUBS, RANDOM_EQUIP_SLOTS, saveLookToStorage, loadLookForSex, mirrorStyleForSex, firstBannerStyle, defaultHairForSex, defaultFaceForSex, EMOTES } from '../src/lib/fashion';
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

test('single-family cash weapons behave as that weapon', () => {
  const items = catalog.items as Record<string, { sub: string; wsub?: string }>;
  // Plastic Slingshot is a bow, Toy Rifle a crossbow.
  assert.equal(weaponSubOf(items[1702003]), 'Bow');
  assert.equal(weaponSubOf(items[1702014]), 'Crossbow');
  assert.deepEqual(stanceForWeapon(weaponSubOf(items[1702014]), 'stand1'), { anim: 'stand2', frame: 0 });
  assert.equal(applyPick({ Shield: 1092000 }, 'Weapon', 1702003, 'Cash').Shield, undefined);
  assert.equal(applyPick({ Weapon: 1702003 }, 'Shield', 1092000, 'Shield').Weapon !== 1702003, true);
});

test('multi-type cash weapons can be wielded as any type they ship art for', () => {
  const items = catalog.items as Record<string, { sub: string; wsub?: string; wtypes?: Record<string, number> }>;
  const scepter = items[1702445];
  // The scepter fits every weapon family and defaults to one-handed; the broomstick only spear/pole arm.
  assert.equal(weaponSubOf(scepter), 'One-Handed Sword');
  for (const type of ['Two-Handed Sword', 'Spear', 'Pole Arm', 'Bow', 'Crossbow', 'Claw']) assert.ok(wieldOptions(scepter).includes(type), type);
  assert.deepEqual(wieldOptions(items[1702036]), ['Spear', 'Pole Arm']);
  assert.equal(weaponSubOf(scepter, 'Crossbow'), 'Crossbow');
  assert.notEqual(weaponVariant(scepter, 'Crossbow'), weaponVariant(scepter, 'Bow'));
  // A type the skin lacks (or a bogus value from a shared link) is ignored.
  assert.equal(weaponSubOf(items[1702036], 'Crossbow'), 'Spear');
  assert.equal(weaponSubOf(scepter, 'constructor'), 'One-Handed Sword');
  assert.equal(weaponVariant(items[1702003], 'Crossbow'), 0);
  assert.equal(wieldChoice(scepter, 'Spear'), 'Spear');
  // Wielding a two-handed type frees the hand: it takes the shield off, and a shield swaps a skin with no one-handed art for a classic sword.
  assert.equal(applyPick({ Shield: 1092000 }, 'Weapon', 1702445, 'Cash', 'Crossbow').Shield, undefined);
  assert.equal(applyPick({ Shield: 1092000 }, 'Weapon', 1702445, 'Cash').Shield, 1092000);
  assert.notEqual(applyPick({ Weapon: 1702036 }, 'Shield', 1092000, 'Shield').Weapon, 1702036);
  // A skin that also has one-handed art keeps itself: the shield drops its wield to a one-handed type instead.
  assert.equal(oneHandedWield(scepter, 'Spear'), 'One-Handed Sword');
  assert.equal(oneHandedWield(scepter, 'Wand'), undefined);
  assert.equal(oneHandedWield(scepter), undefined);
  assert.equal(oneHandedWield(items[1702036], 'Spear'), undefined);
  const shielded = applyPick({ Weapon: 1702445 }, 'Shield', 1092000, 'Shield', oneHandedWield(scepter, 'Spear'));
  assert.deepEqual(shielded, { Weapon: 1702445, Shield: 1092000 });
});

test('a new cash weapon keeps the held type when it fits, else falls back with a notice', () => {
  const items = catalog.items as Record<number, { sub: string; wsub?: string; wtypes?: Record<string, number> }>;
  const crossbow = items[1462000]!, bow = items[1452000]!, sword = items[1302000]!, axe = items[1312000]!;
  assert.deepEqual(resolveWield(crossbow, undefined, items[1702445]!), { wield: 'Crossbow' });
  // From another skin wielded as a crossbow, the type carries on to the next skin that fits it.
  assert.deepEqual(resolveWield(items[1702445], 'Crossbow', items[1702468]!), { wield: 'Crossbow' });
  // The pumpkin basket ships a frame book for every family, so a held bow/crossbow keeps its type.
  assert.deepEqual(resolveWield(bow, undefined, items[1702092]!), { wield: 'Bow' });
  assert.deepEqual(resolveWield(crossbow, undefined, items[1702092]!), { wield: 'Crossbow' });
  assert.deepEqual(resolveWield(sword, undefined, items[1702036]!), { notice: { types: ['Spear', 'Pole Arm'], applied: 'Spear', held: 'One-Handed Sword' } });
  assert.deepEqual(resolveWield(crossbow, undefined, items[1702036]!).notice?.held, 'Crossbow');
  // Swapping between one-handed types, a matching single-type skin, or nothing held never prompts.
  assert.deepEqual(resolveWield(axe, undefined, { sub: 'Cash', wsub: 'One-Handed Sword' }), {});
  assert.deepEqual(resolveWield(bow, undefined, items[1702003]!), {});
  assert.deepEqual(resolveWield(undefined, undefined, items[1702036]!), {});
  // A single-type skin that doesn't match what was held still says so.
  assert.deepEqual(resolveWield(crossbow, undefined, items[1702003]!).notice, { types: ['Bow'], applied: 'Bow', held: 'Crossbow' });
  // Classic weapons never carry a wield.
  assert.deepEqual(resolveWield(items[1702445], 'Crossbow', sword), {});
});

test('the wield choice round-trips through share links only for skins that support it', () => {
  const look = { ...DEFAULT_LOOK, items: { Weapon: 1702445 }, wield: 'Crossbow' };
  assert.equal(decodeLook(encodeLook(look))?.wield, 'Crossbow');
  assert.equal(decodeLook(encodeLook({ ...look, items: { Weapon: 1302000 } }))?.wield, undefined);
  assert.equal(decodeLook(encodeLook({ ...look, wield: 'Warrior' }))?.wield, undefined);
});

test('icons fall back through older maplestory.io versions that still ship them', () => {
  assert.equal(iconURL(1702445), 'https://maplestory.io/api/GMS/270/item/1702445/icon');
  assert.equal(iconFallbackURL('https://maplestory.io/api/MCW/CBT2/item/1002994/icon'), 'https://maplestory.io/api/GMS/270/item/1002994/icon');
  assert.equal(iconFallbackURL('https://maplestory.io/api/GMS/270/item/1702445/icon'), 'https://maplestory.io/api/GMS/255/item/1702445/icon');
  assert.equal(iconFallbackURL('https://maplestory.io/api/GMS/255/item/1702445/icon'), null);
  assert.equal(iconFallbackURL('/sprites/faces/20003.png'), null);
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


test('unreleased styles are searchable in the search index', () => {
  const searchIds = new Set(catalog.indexes.search.map(entry => entry.id));
  for (const sex of ['m', 'f'] as const) {
    for (const style of catalog.indexes.hairs[sex].unreleased) {
      assert.ok(searchIds.has(style), `unreleased hair style ${style} must be in indexes.search`);
    }
    for (const id of catalog.indexes.faces[sex].unreleased) {
      assert.ok(searchIds.has(id), `unreleased face ${id} must be in indexes.search`);
    }
  }
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

test('Puppy Eyes Face is active, attainable, and properly resolved across eye colors', () => {
  const face = catalog.items[20029 as unknown as keyof typeof catalog.items];
  assert.ok(face, '20029 Puppy Eyes Face must be present in catalog');
  assert.equal(face.name, 'Puppy Eyes Face');
  assert.equal(face.sex, 'm');
  assert.equal(face.bannerId, 'style-oct28');
  assert.equal(face.attainable, true);
  assert.equal(face.coupon, 'mystery');
  assert.equal(face.rate, '16.67%');

  // Must be in active male faces index
  assert.ok(catalog.indexes.faces.m.active.includes(20029));

  // Resolved across eye colors (e.g. 20329 with colored eyes)
  const infoBlack = formatAttainableInfo(catalog as any, 20029, Date.parse('2026-10-30T00:00:00Z'));
  assert.equal(infoBlack.isAttainable, true);
  assert.equal(infoBlack.bannerLabel, 'Mystery & Signature Style Coupons');

  const infoColored = formatAttainableInfo(catalog as any, 20329, Date.parse('2026-10-30T00:00:00Z'));
  assert.equal(infoColored.isAttainable, true);
  assert.equal(infoColored.bannerLabel, 'Mystery & Signature Style Coupons');
});

test('MCW/1-only cosmetics render and icon from MCW/1', () => {
  assert.deepEqual(assetSource(20329), { region: 'MCW', version: '1' });
  assert.deepEqual(assetSource(30863), { region: 'MCW', version: '1' });
  assert.deepEqual(assetSource(20805), { region: 'GMS', version: '270' });
  assert.equal(iconURL(30860), 'https://maplestory.io/api/MCW/1/item/30860/icon');
  assert.equal(iconURL(20028), '/sprites/faces/20028.png');
  assert.equal(iconFallbackURL('https://maplestory.io/api/MCW/1/item/30860/icon'), null);
});

test('rotated-out Alert Face still reads live until the old lineup ends at 08:00 UTC', () => {
  const before = formatAttainableInfo(catalog as any, 20805, Date.parse('2026-10-28T07:59:00Z'));
  assert.equal(before.isAttainable, true);
  assert.equal(before.statusText, 'Ends 10-28');
  const after = formatAttainableInfo(catalog as any, 20805, Date.parse('2026-10-28T08:00:00Z'));
  assert.equal(after.isAttainable, false);
  assert.equal(after.statusText, 'Not Attainable');
});

test('rotated-out Alert Face is a past rotation', () => {
  const alertFace = catalog.items[20805 as unknown as keyof typeof catalog.items];
  assert.ok(alertFace, '20805 Alert Face must stay in catalog');
  assert.equal(alertFace.bannerId, 'style-oct26');
  assert.equal(alertFace.attainable, false);
  assert.ok(catalog.indexes.faces.m.past.includes(20805));
  assert.ok(!catalog.indexes.faces.m.active.includes(20805));
});

test('Halloween crate indexes its drops and bannerId', () => {
  const group = catalog.indexes.groups['halloween-crate'];
  const ids = [...group.u, ...group.m, ...group.f];
  assert.ok(ids.length >= 50, `expected >=50 Halloween crate entries, got ${ids.length}`);
  for (const id of ids) {
    const item = catalog.items[id as unknown as keyof typeof catalog.items];
    assert.equal(item.bannerId, 'halloween-crate-oct26');
    assert.equal(item.attainable, true);
  }
  assert.equal(catalog.banners['halloween-crate-oct26'].end, '2026-11-04');
  assert.equal(catalog.banners['style-oct28'].end, '2026-11-11');
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

test('male and female looks persist in separate storage slots', () => {
  const store = new Map<string, string>();
  (globalThis as unknown as { localStorage: unknown }).localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => { store.set(k, v); },
    removeItem: (k: string) => { store.delete(k); },
  };
  try {
    saveLookToStorage({ ...DEFAULT_LOOK, sex: 'm', hair: 30130 });
    saveLookToStorage({ ...DEFAULT_LOOK, sex: 'f', hair: 31010 });
    assert.equal(loadLookForSex('m')?.hair, 30130);
    assert.equal(loadLookForSex('f')?.hair, 31010);
  } finally {
    delete (globalThis as unknown as { localStorage?: unknown }).localStorage;
  }
});

test('gender swap mirrors hair/face within the live banner lineup', () => {
  for (const sex of ['m', 'f'] as Sex[]) {
    const other = sex === 'm' ? 'f' : 'm';
    // Fresh defaults are attainable banner styles.
    const hairStyle = Math.floor(defaultHairForSex(sex) / 10);
    assert.ok(catalog.indexes.hairs[sex].active.includes(hairStyle));
    assert.ok(catalog.styles[hairStyle as keyof typeof catalog.styles].attainable);
    assert.ok(catalog.indexes.faces[sex].active.some((id) => faceStyleId(id) === faceStyleId(defaultFaceForSex(sex))));
    // Mirroring keeps coupon tier and lineup slot, and round-trips.
    for (const coupon of ['mystery', 'signature'] as const) {
      const fromStyles = catalog.indexes.hairs[sex].active.filter((id) => catalog.styles[id].coupon === coupon);
      if (!fromStyles.length) continue;
      const at = Math.min(2, fromStyles.length - 1);
      const style = fromStyles[at]!;
      const mirrored = mirrorStyleForSex('hair', sex, other, style);
      const toStyles = catalog.indexes.hairs[other].active.filter((id) => catalog.styles[id].coupon === coupon);
      assert.equal(mirrored, toStyles[at % toStyles.length]);
      assert.equal(mirrorStyleForSex('hair', other, sex, mirrored), style);
    }
    // Mystery leads the banner-first pick.
    assert.equal(catalog.styles[firstBannerStyle(sex, 'hair')].coupon, 'mystery');
  }
});


test('unreleased cash equips are preview-only and searchable', () => {
  const searchIds = new Set(catalog.indexes.search.map(entry => entry.id));
  for (const sex of ['m', 'f', 'u'] as const) {
    for (const id of catalog.indexes.groups['unreleased']?.[sex] ?? []) {
      const item = catalog.items[id as unknown as keyof typeof catalog.items] as any;
      assert.equal(item.attainable, false, `unreleased equip ${id} must not be attainable`);
      assert.equal(item.bannerId, 'unreleased');
      assert.ok(searchIds.has(id), `unreleased equip ${id} must be in indexes.search`);
    }
  }
});

test('emote round-trips through the share URL and unknown emotes are dropped', () => {
  for (const emote of EMOTES) assert.equal(decodeLook(encodeLook({ ...DEFAULT_LOOK, emote: emote.id }))?.emote, emote.id);
  assert.equal(decodeLook(encodeLook({ ...DEFAULT_LOOK, emote: 'nope' }))?.emote, undefined);
  assert.equal(decodeLook('hair=30130&face=20033&emote=nope')?.emote, undefined);
  assert.equal(new URLSearchParams(encodeLook({ ...DEFAULT_LOOK, emoteFrame: 1 })).has('emoteFrame'), false);
  assert.deepEqual(EMOTES.filter((emote) => emote.key).map((emote) => emote.key), ['F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7']);
});
