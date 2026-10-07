import { test } from 'node:test';
import assert from 'node:assert/strict';
import { composeLayers, drawComposition, type SourceLayer } from '../src/lib/layered-renderer';

const image = {} as CanvasImageSource;

/** Real source geometry: skin 2000 stand1/0 from the WZ extraction. */
function sourceBase(): SourceLayer[] {
  return [
    {
      key: 'base:body:body', itemKey: 'base', part: 'body', name: 'body', image,
      width: 21, height: 31, origin: { x: 16, y: 31 },
      map: { neck: { x: -4, y: -32 }, navel: { x: -8, y: -21 } }, z: 'body',
    },
    {
      key: 'base:body:arm', itemKey: 'base', part: 'body', name: 'arm', image,
      width: 10, height: 19, origin: { x: 5, y: 9 },
      map: { navel: { x: -13, y: -1 }, hand: { x: -1, y: 5 } }, z: 'arm',
    },
    {
      key: 'base:Head:head', itemKey: 'base', part: 'Head', name: 'head', image,
      width: 35, height: 35, origin: { x: 18, y: 17 },
      map: { neck: { x: 0, y: 15 }, brow: { x: -4, y: -5 } }, z: 'head',
    },
    {
      key: 'base:Head:humanEar', itemKey: 'base', part: 'Head', name: 'humanEar', image,
      width: 8, height: 8, origin: { x: 19, y: -2 },
      map: { neck: { x: 0, y: 15 }, brow: { x: -4, y: -5 } }, z: 'hairShade',
    },
  ];
}

function doubleAxeStand1(): SourceLayer {
  // Baked 1312001 stand1:0: origin (25,7), hand (3,-3), z weapon.
  return {
    key: 'sword', itemKey: 'sword', part: 'Weapon', name: 'weapon', image,
    width: 41, height: 13, origin: { x: 25, y: 7 },
    map: { hand: { x: 3, y: -3 } }, z: 'weapon',
  };
}

test('attaches the Double Axe to the source arm hand in stand1', () => {
  const layers = [...sourceBase(), doubleAxeStand1()];

  const result = composeLayers(layers);
  assert.deepEqual(result.unresolved, []);
  const arm = result.layers.find((layer) => layer.key === 'base:body:arm')!;
  const axe = result.layers.find((layer) => layer.key === 'sword')!;
  // Axe origin sits on the published arm hand anchor, not a fake root hand:
  // hand world = arm pos + hand offset (-1,+5); axe pos = hand world - own
  // offset (3,-3); drawn x/y = pos - axe origin (25,7).
  assert.deepEqual(
    { x: axe.x, y: axe.y },
    { x: arm.x + arm.origin.x - 1 - 3 - 25, y: arm.y + arm.origin.y + 5 + 3 - 7 },
  );
  assert.ok(result.layers.indexOf(axe) < result.layers.indexOf(arm));
});

test('falls back to the source hand for handMove-only gloves', () => {
  const layers: SourceLayer[] = [
    ...sourceBase(),
    {
      key: 'glove', itemKey: 'glove', part: 'Glove', name: 'gloveBelowWeapon', image,
      width: 11, height: 9, origin: { x: 15, y: 24 },
      map: { handMove: { x: -11, y: -20 } }, z: 'gloveBelowWeapon',
    },
  ];

  const result = composeLayers(layers, ['body', 'gloveBelowWeapon', 'arm', 'head', 'hairShade']);

  assert.deepEqual(result.unresolved, []);
  const glove = result.layers.find((layer) => layer.key === 'glove')!;
  assert.deepEqual({ x: glove.x, y: glove.y }, { x: 0, y: -19 });
});

test('resolves face and hair through the head-published brow anchor', () => {
  const layers: SourceLayer[] = [
    ...sourceBase(),
    {
      key: 'face', itemKey: '20805', part: 'Face', name: 'face', image,
      width: 25, height: 16, origin: { x: 13, y: 8 },
      map: { brow: { x: -1, y: -12 } }, z: 'face',
    },
    {
      key: 'hair', itemKey: '30130', part: 'Hair', name: 'hair', image,
      width: 28, height: 24, origin: { x: 14, y: 12 },
      map: { brow: { x: 0, y: 0 } }, z: 'hair',
    },
  ];

  const result = composeLayers(layers, ['body', 'arm', 'head', 'hairShade', 'face', 'hair']);

  assert.deepEqual(result.unresolved, []);
  const head = result.layers.find((layer) => layer.key === 'base:Head:head')!;
  // brow world = head pos + (-4,-5); face x/y = brow world - own offsets - origin.
  const face = result.layers.find((layer) => layer.key === 'face')!;
  assert.deepEqual(
    { x: face.x, y: face.y },
    { x: head.x + head.origin.x - 4 + 1 - 13, y: head.y + head.origin.y - 5 + 12 - 8 },
  );
});

test('orders the alert arm over hair and the axe over the arm', () => {
  // Source alert/0: the arm layer itself carries z armOverHair.
  const layers: SourceLayer[] = [
    {
      key: 'base:body:body', itemKey: 'base', part: 'body', name: 'body', image,
      width: 24, height: 29, origin: { x: 16, y: 29 },
      map: { neck: { x: -4, y: -29 }, navel: { x: -3, y: -18 } }, z: 'body',
    },
    {
      key: 'base:Head:head', itemKey: 'base', part: 'Head', name: 'head', image,
      width: 35, height: 35, origin: { x: 18, y: 17 },
      map: { neck: { x: 0, y: 15 }, brow: { x: -4, y: -5 } }, z: 'head',
    },
    {
      key: 'base:body:arm', itemKey: 'base', part: 'body', name: 'arm', image,
      width: 8, height: 14, origin: { x: 6, y: 8 },
      map: { navel: { x: -11, y: 1 }, hand: { x: -5, y: 5 } }, z: 'armOverHair',
    },
    {
      key: 'hair', itemKey: '30130', part: 'Hair', name: 'hairOverHead', image,
      width: 28, height: 24, origin: { x: 27, y: 23 },
      map: { brow: { x: 0, y: 0 } }, z: 'hairOverHead',
    },
    {
      key: 'axe', itemKey: 'axe', part: 'Weapon', name: 'weaponOverHand', image,
      width: 40, height: 20, origin: { x: 23, y: 10 },
      map: { hand: { x: 17, y: 2 } }, z: 'weaponOverHand',
    },
    {
      key: 'left-hand', itemKey: 'base', part: 'body', name: 'lHand', image,
      width: 11, height: 9, origin: { x: 15, y: 24 },
      map: { handMove: { x: -11, y: -20 } }, z: 'handBelowWeapon',
    },
    {
      key: 'right-hand', itemKey: 'base', part: 'body', name: 'rHand', image,
      width: 7, height: 8, origin: { x: 4, y: 4 },
      map: { navel: { x: -4, y: -2 } }, z: 'handOverHair',
    },
  ];

  const result = composeLayers(layers);

  assert.deepEqual(result.unresolved, []);
  assert.deepEqual(
    result.layers.map((layer) => layer.key),
    ['base:body:body', 'base:Head:head', 'hair', 'base:body:arm', 'left-hand', 'axe', 'right-hand'],
  );
});

test('drops layers whose anchors never resolve and reports them', () => {
  const layers: SourceLayer[] = [
    ...sourceBase(),
    {
      key: 'hat', itemKey: 'hat', part: 'Hat', name: 'cap', image,
      width: 10, height: 5, origin: { x: 0, y: 0 }, map: { unknownAnchor: { x: 4, y: 2 } }, z: 'cap',
    },
  ];

  const result = composeLayers(layers, ['body', 'arm', 'head', 'cap']);

  assert.ok(result.layers.every((layer) => layer.key !== 'hat'));
  assert.deepEqual(result.unresolved, ['hat:unknownAnchor']);
});

test('hides layers covered by another item vslot claim', () => {
  const layers: SourceLayer[] = [
    ...sourceBase(),
    {
      key: 'hair', itemKey: '30130', part: 'Hair', name: 'hair', image,
      width: 10, height: 10, origin: { x: 0, y: 0 },
      map: { brow: { x: 0, y: 0 } }, z: 'hair', islot: 'Hr',
    },
    {
      key: 'hat', itemKey: '1002000', part: 'Hat', name: 'cap', image,
      width: 10, height: 10, origin: { x: 0, y: 0 },
      map: { brow: { x: 0, y: 0 } }, z: 'cap', vslot: 'Hr',
    },
  ];

  const result = composeLayers(layers, ['body', 'arm', 'head', 'hair', 'cap']);

  assert.ok(result.layers.some((layer) => layer.key === 'hat'));
  assert.ok(result.layers.every((layer) => layer.key !== 'hair'));
});
test('draws eye decorations over the face', () => {
  const layers: SourceLayer[] = [
    ...sourceBase(),
    {
      key: 'face', itemKey: '20006', part: 'Face', name: 'face', image,
      width: 26, height: 16, origin: { x: 13, y: 8 },
      map: { brow: { x: -1, y: -13 } }, z: 'face', islot: 'Fc', vslot: 'Fc',
    },
    {
      // Baked 1027004 (Black Sunglasses) stand1:0: accessoryEye over brow.
      key: 'glasses', itemKey: '1027004', part: 'EyeDec', name: 'accessoryEye', image,
      width: 34, height: 10, origin: { x: 15, y: 25 },
      map: { brow: { x: -1, y: -32 } }, z: 'accessoryEye', islot: 'Ay', vslot: 'Ay',
    },
  ];

  const result = composeLayers(layers);

  assert.deepEqual(result.unresolved, []);
  const face = result.layers.find((layer) => layer.key === 'face')!;
  const glasses = result.layers.find((layer) => layer.key === 'glasses')!;
  assert.ok(result.layers.indexOf(face) < result.layers.indexOf(glasses));
});

test('centers the complete base character without following equipment bounds', () => {
  const base = composeLayers(sourceBase());
  const equipped = composeLayers([...sourceBase(), {
    ...doubleAxeStand1(), width: 400, height: 300,
  }]);
  const draws: Array<[number, number]> = [];
  const ctx = {
    clearRect() {},
    drawImage(_image: CanvasImageSource, x: number, y: number) { draws.push([x, y]); },
  } as unknown as CanvasRenderingContext2D;

  drawComposition(ctx, base, 128, 128);
  const baseDraws = [...draws];
  assert.deepEqual(baseDraws[0], [53, 65]);
  assert.deepEqual(baseDraws[2], [47, 32]);
  draws.length = 0;
  drawComposition(ctx, equipped, 128, 128);
  for (const [index, layer] of equipped.layers.entries()) {
    if (layer.itemKey === 'base') {
      const baseIndex = base.layers.findIndex((candidate) => candidate.key === layer.key);
      assert.deepEqual(draws[index], baseDraws[baseIndex]);
    }
  }
});
