/**
 * Layer compositor ported from Javipen/maplestory-cosmetic-playground
 * (`browser-engine.mjs` -> `composeLayers`).
 *
 * Rules, in order:
 * 1. The `body`/`body` layer is the root at (0,0) and publishes its named
 *    anchors (navel/neck/...) for the arm and head attachment chains.
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
  /** Named attachment points, relative to the sprite's source origin. */
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

/** Official classic z-map order: earlier names are behind later names.
 *  accessoryEye/accessoryEar/capBelowBody come from upstream frame data
 *  (e.g. 1027004 sunglasses, 1032000 earrings, hats with lower trims):
 *  Eye decorations draw over the face (remote render confirms the glasses
 *  cover the eyes), ear decorations beside it, cap trims under the cap. */
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
  'shield', 'weapon', 'arm', 'hand', 'glove', 'mailArm', 'gloveWrist', 'cape', 'head',
  'hairShade', 'face', 'accessoryEar', 'accessoryEye', 'capBelowAccessory', 'capBelowBody', 'capAccessoryBelowAccFace', 'hair', 'cap',
  'capAccessory', 'hairOverHead', 'capOverHair', 'weaponBelowArm',
  'armOverHairBelowWeapon', 'mailArmOverHairBelowWeapon', 'armOverHair',
  'gloveBelowMailArm', 'mailArmOverHair', 'gloveWristBelowMailArm', 'weaponOverArm',
  'handBelowWeapon', 'gloveBelowWeapon', 'gloveWristBelowWeapon', 'shieldOverHair', 'weaponOverHand',
  'handOverHair', 'gloveOverHair', 'gloveWristOverHair', 'weaponOverGlove', 'capeOverHead',
  'weaponWristOverGlove', 'characterStart',
] as const;

/**
 * Hair-coverage slots per z-name, ported from the reference engine's
 * `smaps.classic` table: a hair layer is hidden when any of its slots is
 * claimed by a worn hat's vslot (e.g. `CpH1H5` covers `hairOverHead` via H1
 * but leaves the `hair` side fringe via H2). Full-coverage hats
 * (`CpHdH1H2H3…`) hide every strand so nothing pokes out from under them.
 */
const HAIR_COVERAGE_SLOTS: Record<string, readonly string[]> = {
  hairOverHead: ['H1'],
  hair: ['H2'],
  hairShade: ['Hs'],
  hairBelowBody: ['Hb'],
  backHair: ['H1'],
  backHairBelowHead: ['Hf'],
  backHairBelowCap: ['H6'],
  backHairBelowCapWide: ['H4'],
  backHairBelowCapNarrow: ['H5'],
};

/** Two-character equipment slots (`Cp`, `H1`, …) claimed by a vslot string. */
function vslotsOf(vslot: string | undefined): string[] {
  return vslot?.match(/[A-Z][a-z0-9]/g) ?? [];
}
/** Remove layers covered by another item's vslot claims. */
function visibleLayers(layers: SourceLayer[]): SourceLayer[] {
  const claims: Record<string, string> = {};
  for (const layer of layers) {
    for (const slot of vslotsOf(layer.vslot)) claims[slot] = layer.itemKey;
  }

 
  // Hats hide individual hair strands through vslot coverage: any Hat-part
  // layer claiming a slot also claimed by a hat is dropped, so a tight cap
  // covers the fringe while a standard CpH1H5 hat keeps the side hair.
  const hatSlots = new Set<string>();
  for (const layer of layers) {
    if (layer.part === 'Hat') for (const slot of vslotsOf(layer.vslot)) hatSlots.add(slot);
  }

  return layers.filter((layer) => {
    const coverage = HAIR_COVERAGE_SLOTS[layer.z];
    if (coverage && layer.part === 'Hair' && coverage.some((slot) => hatSlots.has(slot))) return false;
    const slots = vslotsOf(layer.islot);
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
  const attach = (waiting: SourceLayer[]): SourceLayer[] => {
    let remain = waiting;
    for (let pass = 0; pass < 10 && remain.length; pass++) {
      const next: SourceLayer[] = [];
      let progress = false;
      for (const layer of remain) {
        const shared = Object.keys(layer.map).find((name) => name in anchors);
        if (shared === undefined) {
          next.push(layer);
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
      remain = next;
      if (!progress) break;
    }
    return remain;
  };
  pending = attach(pending);
  // The source arm publishes `hand` but never `handMove`, while glove layers
  // attach through `handMove` alone (e.g. 1082000). Mirror the reference
  // engine: a neutral grip falls back to the source arm hand point.
  if (anchors['hand'] && !('handMove' in anchors) && pending.some((layer) => 'handMove' in layer.map)) {
    anchors['handMove'] = { ...anchors['hand']! };
    pending = attach(pending);
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

/** Draw a composition into a fixed-size canvas with pixel art smoothing off; returns the source origin's canvas position. */
export function drawComposition(
  ctx: CanvasRenderingContext2D,
  composition: Composition,
  width: number,
  height: number,
): Point {
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, width, height);
  if (!composition.layers.length) return { x: width / 2, y: height / 2 };
  // Center the complete base character, excluding equipment bounds so a
  // long weapon cannot move the character across the preview.
  const root = composition.layers.find((layer) => layer.part === 'body' && layer.name === 'body');
  let left = Infinity, top = Infinity, right = -Infinity, bottom = -Infinity;
  for (const layer of composition.layers) {
    if (root && layer.itemKey !== root.itemKey) continue;
    left = Math.min(left, layer.x);
    top = Math.min(top, layer.y);
    right = Math.max(right, layer.x + layer.width);
    bottom = Math.max(bottom, layer.y + layer.height);
  }
  const xOffset = Math.round((width - left - right) / 2);
  const yOffset = Math.round((height - top - bottom) / 2);
  for (const layer of composition.layers) {
    ctx.drawImage(layer.image, Math.round(layer.x + xOffset), Math.round(layer.y + yOffset));
  }
  // Where the character's source origin (0,0) landed on the canvas.
  return { x: xOffset, y: yOffset };
}
