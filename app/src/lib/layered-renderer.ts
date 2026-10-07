/**
 * Layer compositor ported from Javipen/maplestory-cosmetic-playground
 * (`browser-engine.mjs` -> `composeLayers`).
 *
 * Rules, in order:
 * 1. The `body`/`body` layer is the root at (0,0) and publishes its named
 *    anchors (brow/navel/neck/hand/...) for every other sprite.
 * 2. Any layer sharing at least one anchor name with the published set
 *    attaches at `anchor_world - own_offset` (multi-pass so chains resolve).
 * 3. Layers with no anchors draw at their source origin; layers whose
 *    anchors never resolve are dropped and reported in `unresolved`.
 * 4. vslot claims hide covered layers (same-item layers exempt).
 * 5. Draw order follows the classic z-map, back to front.
 */

export interface Point {
  x: number;
  y: number;
}

export interface SourceLayer {
  /** Stable identity for diagnostics and anchor lookup. */
  key: string;
  /** Shared by all layers belonging to the same worn item. */
  itemKey: string;
  part: string;
  name: string;
  image: CanvasImageSource;
  width: number;
  height: number;
  origin: Point;
  /** Named attachment points, relative to the sprite's top-left. */
  map: Record<string, Point>;
  z: string;
  /** MapleStory equipment slots, when supplied by the source manifest. */
  islot?: string;
  vslot?: string;
}

export interface PlacedLayer extends SourceLayer {
  x: number;
  y: number;
  zIndex: number;
}

export interface Composition {
  layers: PlacedLayer[];
  bounds: { left: number; top: number; right: number; bottom: number };
  unresolved: string[];
}

/** Official classic z-map order: earlier names are behind later names. */
export const CLASSIC_ZMAP_ORDER = [
  'backTamingMobMid', 'backMobEquipUnderSaddle', 'backSaddle', 'backMobEquipMid',
  'backTamingMobFront', 'backMobEquipFront', 'weaponBelowBody', 'hairBelowBody',
  'capeBelowBody', 'shieldBelowBody', 'capAccessoryBelowBody', 'gloveBelowBody',
  'gloveWristBelowBody', 'body', 'gloveOverBody', 'mailChestBelowPants',
  'pantsBelowShoes', 'shoes', 'pants', 'mailChestOverPants', 'shoesOverPants',
  'pantsOverShoesBelowMailChest', 'shoesTop', 'mailChest', 'pantsOverMailChest',
  'mailChestOverHighest', 'gloveWristOverBody', 'mailChestTop', 'weaponOverBody',
  'armBelowHead', 'mailArmBelowHead', 'armBelowHeadOverMailChest', 'gloveBelowHead',
  'mailArmBelowHeadOverMailChest', 'gloveWristBelowHead', 'weaponOverArmBelowHead',
  'shield', 'weapon', 'arm', 'glove', 'mailArm', 'gloveWrist', 'cape', 'head',
  'hairShade', 'face', 'capBelowAccessory', 'capAccessoryBelowAccFace', 'hair', 'cap',
  'capAccessory', 'hairOverHead', 'capOverHair', 'weaponBelowArm',
  'armOverHairBelowWeapon', 'mailArmOverHairBelowWeapon', 'armOverHair',
  'gloveBelowMailArm', 'mailArmOverHair', 'gloveWristBelowMailArm', 'weaponOverArm',
  'gloveBelowWeapon', 'gloveWristBelowWeapon', 'shieldOverHair', 'weaponOverHand',
  'gloveOverHair', 'gloveWristOverHair', 'weaponOverGlove', 'capeOverHead',
  'weaponWristOverGlove', 'characterStart',
] as const;

/** Remove layers covered by another item's vslot claims. */
function visibleLayers(layers: SourceLayer[]): SourceLayer[] {
  const claims: Record<string, string> = {};
  for (const layer of layers) {
    for (const slot of layer.vslot?.match(/[A-Z][a-z0-9]/g) ?? []) claims[slot] = layer.itemKey;
  }

  return layers.filter((layer) => {
    const slots = layer.islot?.match(/[A-Z][a-z0-9]/g) ?? [];
    return slots.length === 0 || slots.every((slot) => !(slot in claims) || claims[slot] === layer.itemKey);
  });
}

/**
 * Resolve each sprite against the shared anchor table published by the root
 * body layer, then order the composed layers by the game's z-map.
 */
export function composeLayers(
  input: SourceLayer[],
  zmap: readonly string[] = CLASSIC_ZMAP_ORDER,
): Composition {
  const layers = visibleLayers(input);
  const root = layers.find((layer) => layer.part === 'body' && layer.name === 'body');
  const unresolved: string[] = [];
  const anchors: Record<string, Point> = {};
  const positions: Record<string, Point> = {};

  if (root) {
    positions[root.key] = { x: 0, y: 0 };
    for (const [name, point] of Object.entries(root.map)) anchors[name] = { ...point };
  }

  // Multi-pass: each pass attaches every layer sharing an anchor with the
  // published table and publishes its own anchors for the next pass.
  let pending = layers.filter((layer) => layer !== root);
  for (let pass = 0; pass < 10 && pending.length; pass++) {
    const remain: SourceLayer[] = [];
    let progress = false;
    for (const layer of pending) {
      const shared = Object.keys(layer.map).find((name) => name in anchors);
      if (shared === undefined) {
        remain.push(layer);
        continue;
      }
      const base = anchors[shared]!;
      const own = layer.map[shared]!;
      const at = { x: base.x - own.x, y: base.y - own.y };
      positions[layer.key] = at;
      for (const [name, point] of Object.entries(layer.map)) {
        if (!(name in anchors)) anchors[name] = { x: at.x + point.x, y: at.y + point.y };
      }
      progress = true;
    }
    pending = remain;
    if (!progress) break;
  }

  const placed: PlacedLayer[] = [];
  for (const layer of layers) {
    const origin = positions[layer.key];
    if (origin) {
      const zIndex = zmap.indexOf(layer.z);
      placed.push({
        ...layer,
        x: origin.x - layer.origin.x,
        y: origin.y - layer.origin.y,
        // Unknown layers stay behind the character and are visible in diagnostics.
        zIndex: zIndex < 0 ? -1 : zIndex,
      });
      continue;
    }
    if (Object.keys(layer.map).length === 0) {
      const zIndex = zmap.indexOf(layer.z);
      placed.push({
        ...layer,
        x: -layer.origin.x,
        y: -layer.origin.y,
        zIndex: zIndex < 0 ? -1 : zIndex,
      });
      continue;
    }
    unresolved.push(`${layer.key}:${Object.keys(layer.map).join('+') || 'no-anchor'}`);
  }

  const inputOrder: Record<string, number> = {};
  layers.forEach((layer, index) => { inputOrder[layer.key] = index; });
  placed.sort((a, b) => a.zIndex - b.zIndex || inputOrder[a.key]! - inputOrder[b.key]!);

  const bounds = placed.reduce(
    (box, layer) => ({
      left: Math.min(box.left, layer.x),
      top: Math.min(box.top, layer.y),
      right: Math.max(box.right, layer.x + layer.width),
      bottom: Math.max(box.bottom, layer.y + layer.height),
    }),
    { left: Infinity, top: Infinity, right: -Infinity, bottom: -Infinity },
  );

  return { layers: placed, bounds, unresolved };
}

/** Draw a composition into a fixed-size canvas with pixel art smoothing off. */
export function drawComposition(
  ctx: CanvasRenderingContext2D,
  composition: Composition,
  width: number,
  height: number,
): void {
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, width, height);
  if (!composition.layers.length) return;
  // Keep the base body centered so adding a long weapon doesn't shift the
  // character itself across the preview.
  const xOffset = Math.floor((width - 43) / 2);
  const yOffset = Math.floor((height - 68) / 2);
  for (const layer of composition.layers) {
    ctx.drawImage(layer.image, Math.round(layer.x + xOffset), Math.round(layer.y + yOffset));
  }
}
