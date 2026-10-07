import { test } from 'node:test';
import assert from 'node:assert/strict';
import { composeLayers, type SourceLayer } from '../src/lib/layered-renderer';

const image = {} as CanvasImageSource;

test('resolves body, arm and weapon through the shared hand anchor', () => {
  const layers: SourceLayer[] = [
    {
      key: 'body', itemKey: 'base', part: 'body', name: 'body', image,
      width: 43, height: 68, origin: { x: 0, y: 0 },
      map: { navel: { x: 18, y: 46 }, hand: { x: 35, y: 41 } }, z: 'body',
    },
    {
      key: 'arm', itemKey: 'base', part: 'body', name: 'arm', image,
      width: 9, height: 13, origin: { x: 0, y: 0 },
      map: { navel: { x: 18, y: 46 }, hand: { x: 35, y: 41 } }, z: 'arm',
    },
    {
      key: 'sword', itemKey: 'sword', part: 'Weapon', name: 'weapon', image,
      width: 41, height: 13, origin: { x: 25, y: 7 },
      map: { hand: { x: 6, y: -5 } }, z: 'weapon',
    },
  ];

  const result = composeLayers(layers, ['body', 'arm', 'weapon']);

  assert.deepEqual(result.layers.map((layer) => layer.key), ['body', 'arm', 'sword']);
  assert.deepEqual({ x: result.layers[2]?.x, y: result.layers[2]?.y }, { x: 4, y: 39 });
  assert.deepEqual(result.unresolved, []);
});

test('resolves face and hair through the body brow anchor', () => {
  const layers: SourceLayer[] = [
    {
      key: 'body', itemKey: 'base', part: 'body', name: 'body', image,
      width: 43, height: 68, origin: { x: 0, y: 0 },
      map: { brow: { x: 17, y: 14 } }, z: 'body',
    },
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

  const result = composeLayers(layers, ['body', 'face', 'hair']);

  assert.deepEqual(result.layers.map((layer) => layer.key), ['body', 'face', 'hair']);
  assert.deepEqual(result.unresolved, []);
});

test('drops layers whose anchors never resolve and reports them', () => {
  const layers: SourceLayer[] = [
    {
      key: 'body', itemKey: 'base', part: 'body', name: 'body', image,
      width: 43, height: 68, origin: { x: 0, y: 0 }, map: {}, z: 'body',
    },
    {
      key: 'hat', itemKey: 'hat', part: 'Hat', name: 'cap', image,
      width: 10, height: 5, origin: { x: 0, y: 0 }, map: { brow: { x: 4, y: 2 } }, z: 'cap',
    },
  ];

  const result = composeLayers(layers, ['body', 'cap']);

  assert.deepEqual(result.layers.map((layer) => layer.key), ['body']);
  assert.deepEqual(result.unresolved, ['hat:brow']);
});

test('hides layers covered by another item vslot claim', () => {
  const layers: SourceLayer[] = [
    {
      key: 'body', itemKey: 'base', part: 'body', name: 'body', image,
      width: 43, height: 68, origin: { x: 0, y: 0 },
      map: { navel: { x: 18, y: 46 } }, z: 'body',
    },
    {
      key: 'hair', itemKey: '30130', part: 'Hair', name: 'hair', image,
      width: 10, height: 10, origin: { x: 0, y: 0 },
      map: { navel: { x: 0, y: 0 } }, z: 'hair', islot: 'Hr',
    },
    {
      key: 'hat', itemKey: '1002000', part: 'Hat', name: 'cap', image,
      width: 10, height: 10, origin: { x: 0, y: 0 },
      map: { navel: { x: 0, y: 0 } }, z: 'cap', vslot: 'Hr',
    },
  ];

  const result = composeLayers(layers, ['body', 'hair', 'cap']);

  assert.deepEqual(result.layers.map((layer) => layer.key), ['body', 'hat']);
});
