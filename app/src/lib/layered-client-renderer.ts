import { CLASSIC_ZMAP_ORDER, composeLayers, drawComposition, type Point, type SourceLayer } from './layered-renderer';
import type { Look } from './fashion';

interface BaseEffect {
  part: string;
  name: string;
  image: string;
  origin?: Point;
  mapOffset?: Record<string, Point>;
  position?: string;
}

interface BaseFrame {
  body: BaseEffect[];
  head: BaseEffect[];
}

interface BaseManifest {
  frames: Record<string, BaseFrame>;
}

interface EffectRecord {
  image: string;
  origin?: Point;
  mapOffset?: Record<string, Point>;
  position?: string;
}

interface ItemRecord {
  id: number;
  frames: Record<string, EffectRecord[]>;
  vslot?: string;
  islot?: string;
}

/** Poses baked into `<id>.motion.json` (play mode) instead of the main item file. */
export const MOTION_ANIMS = new Set(['walk1', 'walk2', 'prone', 'swingO1', 'stabO1', 'swingT1', 'stabT1', 'swingP1', 'shoot1', 'shoot2']);

const records = new Map<number, Promise<ItemRecord | null>>();
const motionRecords = new Map<number, Promise<ItemRecord | null>>();
const images = new Map<string, Promise<HTMLImageElement>>();
let baseManifest: Promise<BaseManifest | null> | null = null;

function localItem(id: number): Promise<ItemRecord | null> {
  const cached = records.get(id);
  if (cached) return cached;
  const request = fetch(`/sprites/items/${id}.json`)
    .then((response) => response.ok ? response.json() as Promise<ItemRecord> : null)
    .catch(() => null);
  records.set(id, request);
  return request;
}

/** Item record plus its play-mode frames; a missing motion file just means no extra poses. */
function localMotionItem(id: number): Promise<ItemRecord | null> {
  let request = motionRecords.get(id);
  if (!request) {
    request = Promise.all([
      localItem(id),
      fetch(`/sprites/items/${id}.motion.json`)
        .then((response) => response.ok ? response.json() as Promise<Pick<ItemRecord, 'frames'>> : null)
        .catch(() => null),
    ]).then(([record, motion]) => record && motion ? { ...record, frames: { ...record.frames, ...motion.frames } } : record);
    motionRecords.set(id, request);
  }
  return request;
}

function localBase(): Promise<BaseManifest | null> {
  if (!baseManifest) {
    baseManifest = fetch('/sprites/base.json')
      .then((response) => response.ok ? response.json() as Promise<BaseManifest> : null)
      .catch(() => null);
  }
  return baseManifest;
}

function localImage(src: string): Promise<HTMLImageElement> {
  const cached = images.get(src);
  if (cached) return cached;
  const request = new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Could not load local sprite image'));
    image.src = src;
  });
  images.set(src, request);
  request.catch(() => images.delete(src));
  return request;
}

function frameEffects(record: ItemRecord, look: Look, isFace: boolean): EffectRecord[] {
  if (isFace) return record.frames['default:0'] ?? [];
  const wanted = `${look.anim || 'stand1'}:${look.frame || 0}`;
  return record.frames[wanted]
    ?? record.frames[`${look.anim || 'stand1'}:0`]
    ?? record.frames['stand1:0']
    ?? Object.values(record.frames)[0]
    ?? [];
}

function baseFrame(manifest: BaseManifest, look: Look): BaseFrame | null {
  const wanted = `${look.skin}:${look.anim || 'stand1'}:${look.frame || 0}`;
  return manifest.frames[wanted]
    ?? manifest.frames[`${look.skin}:${look.anim || 'stand1'}:0`]
    ?? manifest.frames[`${look.skin}:stand1:0`]
    ?? null;
}

function effectMap(effect: EffectRecord): Record<string, Point> {
  // A sprite without attachment points draws at its source origin (the
  // compositor places empty-map layers at -origin); no fake anchor needed.
  return effect.mapOffset ?? {};
}

/**
 * Independent local-only preview pipeline. It reads baked source sprites,
 * resolves named anchors, and draws in z-map order; there is no API fallback.
 *
 * The base body is unflattened source layers (Body/body root, Body/arm,
 * Head/head, Head/humanEar) from the local base manifest: weapons attach to
 * the source arm hand anchor and faces/hair to the source head brow anchor
 * through the normal multi-pass chain. No fake hand/brow/navel constants.
 */
export async function renderLayeredCharacter(
  ctx: CanvasRenderingContext2D,
  look: Look,
  width = 128,
  height = 128,
): Promise<{ missing: number[]; unresolved: string[]; origin: Point }> {
  const missing: number[] = [];
  const spriteLayers: SourceLayer[] = [];
  const base = await localBase();
  const frame = base ? baseFrame(base, look) : null;
  if (!frame) {
    missing.push(look.skin);
  } else {
    // Start every image request up front; the loops below then await cached promises.
    for (const layers of [frame.body, frame.head]) for (const effect of layers) localImage(effect.image).catch(() => {});
    for (const layers of [frame.body, frame.head]) {
      for (let index = 0; index < layers.length; index++) {
        const effect = layers[index]!;
        try {
          const image = await localImage(effect.image);
          spriteLayers.push({
            key: `base:${effect.part}:${effect.name}`,
            itemKey: 'base', part: effect.part, name: effect.name, image,
            width: image.naturalWidth, height: image.naturalHeight,
            origin: effect.origin ?? { x: 0, y: 0 },
            map: effect.mapOffset ?? {},
            z: effect.position ?? 'body',
          });
        } catch {
          missing.push(look.skin);
        }
      }
    }
  }

  const selections: Array<{ id: number; part: string; face?: boolean; hair?: boolean }> = [];
  if (look.face) selections.push({ id: look.face, part: 'Face', face: true });
  if (look.hair) selections.push({ id: look.hair, part: 'Hair', hair: true });
  for (const [slot, id] of Object.entries(look.items)) {
    if (id != null) selections.push({ id, part: slot });
  }

  const loaded = await Promise.all(selections.map(async (selection) => ({
    selection,
    record: await (!selection.face && MOTION_ANIMS.has(look.anim) ? localMotionItem(selection.id) : localItem(selection.id)),
  })));
  for (const { record, selection } of loaded) {
    if (!record) missing.push(selection.id);
  }
  const hatHasCap = loaded.some(({ selection, record }) => selection.part === 'Hat'
    && Object.values(record?.frames ?? {}).flat().some((effect) =>
      ['cap', 'capAccessory', 'capBelowAccessory'].includes(effect.position ?? '')));

  for (const { selection, record } of loaded) {
    if (!record) continue;
    for (const effect of frameEffects(record, look, selection.face ?? false)) localImage(effect.image).catch(() => {});
  }

  for (const { selection, record } of loaded) {
    if (!record) continue;
    const effects = frameEffects(record, look, selection.face ?? false);
    for (let index = 0; index < effects.length; index++) {
      const effect = effects[index]!;
      if (selection.hair && hatHasCap && effect.position === 'hairOverHead') continue;
      try {
        const image = await localImage(effect.image);
        spriteLayers.push({
          key: `${selection.id}:${effect.position ?? 'default'}:${index}`,
          itemKey: String(selection.id), part: selection.part,
          name: effect.position ?? 'default', image,
          width: image.naturalWidth, height: image.naturalHeight,
          origin: effect.origin ?? { x: 0, y: 0 }, map: effectMap(effect),
          z: effect.position ?? 'body',
          islot: record.islot, vslot: record.vslot,
        });
      } catch {
        missing.push(selection.id);
      }
    }
  }

  const composition = composeLayers(spriteLayers, CLASSIC_ZMAP_ORDER);
  const origin = drawComposition(ctx, composition, width, height);
  return { missing: [...new Set(missing)], unresolved: composition.unresolved, origin };
}

/** Decode every frame of the given poses ahead of time so play mode never stalls on first use. */
export async function warmPoses(look: Look, poses: Array<{ anim: string; frames: number }>): Promise<void> {
  const scratch = document.createElement('canvas').getContext('2d');
  if (!scratch) return;
  for (const { anim, frames } of poses) {
    for (let frame = 0; frame < frames; frame++) {
      await renderLayeredCharacter(scratch, { ...look, anim, frame }).catch(() => undefined);
    }
  }
}

/** Attack poses an item actually has baked frames for (cash weapons ship whatever their art needs). */
export async function motionActions(id: number): Promise<Set<string>> {
  const record = await localMotionItem(id);
  return new Set(Object.keys(record?.frames ?? {}).map((key) => key.split(':')[0]!));
}
