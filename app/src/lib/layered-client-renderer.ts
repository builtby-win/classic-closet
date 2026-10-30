import { CLASSIC_ZMAP_ORDER, composeLayers, drawComposition, type Point, type SourceLayer } from './layered-renderer';
import { CATALOG, weaponVariant, type Look } from './fashion';
import { ATTACK_FRAMES } from './skills';

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
export const MOTION_ANIMS = new Set(['walk1', 'walk2', 'prone', ...Object.keys(ATTACK_FRAMES)]);

const records = new Map<string, Promise<ItemRecord | null>>();
const motionRecords = new Map<number, Promise<ItemRecord | null>>();
const images = new Map<string, Promise<HTMLImageElement>>();
let baseManifest: Promise<BaseManifest | null> | null = null;

const BAKED_FALLBACK_ACTIONS = new Set(['stand1', 'stand2', 'alert', 'jump', 'default']);

async function fetchRemoteItem(id: number): Promise<ItemRecord | null> {
  try {
    const response = await fetch(`https://maplestory.io/api/GMS/270/item/${id}`);
    if (!response.ok) return null;
    const raw = await response.json();
    if (!raw?.frameBooks) return null;
    const frames: Record<string, EffectRecord[]> = {};
    for (const [actionName, action] of Object.entries<any>(raw.frameBooks)) {
      if (!BAKED_FALLBACK_ACTIONS.has(actionName) || !action?.frames) continue;
      action.frames.forEach((f: any, fIdx: number) => {
        const key = `${actionName}:${fIdx}`;
        const effects: EffectRecord[] = [];
        for (const eff of Object.values<any>(f.effects || {})) {
          if (!eff?.image) continue;
          const mapOffset: Record<string, Point> = {};
          for (const [name, point] of Object.entries<any>(eff.mapOffset ?? {})) {
            if (point && typeof point.x === 'number' && typeof point.y === 'number') {
              mapOffset[name] = { x: point.x, y: point.y };
            }
          }
          effects.push({
            image: eff.image.startsWith('data:') ? eff.image : `data:image/png;base64,${eff.image}`,
            origin: { x: eff.origin?.x ?? 0, y: eff.origin?.y ?? 0 },
            mapOffset,
            position: eff.position || 'default',
          });
        }
        if (effects.length) frames[key] = effects;
      });
    }
    const vslots: string[] = raw.metaInfo?.vslots ?? [];
    const islots: string[] = raw.metaInfo?.islots ?? [];
    return { id, frames, vslot: vslots.join(''), islot: islots.join('') };
  } catch {
    return null;
  }
}

/** `variant` > 0 is a cash weapon's per-weapon-type art (`<id>.w<variant>.json`), which already carries its motion frames. */
function localItem(id: number, variant = 0): Promise<ItemRecord | null> {
  const key = variant ? `${id}.w${variant}` : String(id);
  const cached = records.get(key);
  if (cached) return cached;
  const request = fetch(`/sprites/items/${key}.json`)
    .then((response) => response.ok ? response.json() as Promise<ItemRecord> : variant ? localItem(id) : fetchRemoteItem(id))
    .catch(() => variant ? localItem(id) : fetchRemoteItem(id));
  records.set(key, request);
  return request;
}

const emoteRecords = new Map<number, Promise<ItemRecord | null>>();

/** Face record plus its expression frames; a face without an emote file just keeps its default expression. */
function localEmoteFace(id: number): Promise<ItemRecord | null> {
  let request = emoteRecords.get(id);
  if (!request) {
    request = Promise.all([
      localItem(id),
      fetch(`/sprites/items/${id}.emotes.json`)
        .then((response) => response.ok ? response.json() as Promise<Pick<ItemRecord, 'frames'>> : null)
        .catch(() => null),
    ]).then(([record, emotes]) => record && emotes ? { ...record, frames: { ...record.frames, ...emotes.frames } } : record);
    emoteRecords.set(id, request);
  }
  return request;
}

/** The face's own expression art by emote id (`default` included), as data URLs for the picker. */
export async function faceExpressionSprites(id: number): Promise<Record<string, string>> {
  const record = await localEmoteFace(id);
  const sprites: Record<string, string> = {};
  for (const [key, effects] of Object.entries(record?.frames ?? {})) {
    const [name, frame] = key.split(':');
    const image = effects[0]?.image;
    if (name && frame === '0' && image) sprites[name] = image;
  }
  return sprites;
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
    // Resolve only once decoded, so the first drawImage never decodes on the main thread mid-frame.
    image.onload = () => { image.decode().catch(() => undefined).then(() => resolve(image)); };
    image.onerror = () => reject(new Error('Could not load local sprite image'));
    image.src = src;
  });
  images.set(src, request);
  request.catch(() => images.delete(src));
  return request;
}

function frameEffects(record: ItemRecord, look: Look, isFace: boolean): EffectRecord[] {
  if (isFace) {
    const emote = look.emote;
    return (emote && (record.frames[`${emote}:${look.emoteFrame ?? 0}`] ?? record.frames[`${emote}:0`])) || record.frames['default:0'] || [];
  }
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

  const weaponId = look.items.Weapon;
  const variant = weaponId != null ? weaponVariant(CATALOG.items[weaponId], look.wield) : 0;
  const loaded = await Promise.all(selections.map(async (selection) => {
    if (selection.face && look.emote) return { selection, record: await localEmoteFace(selection.id) };
    if (selection.part === 'Weapon' && variant) return { selection, record: await localItem(selection.id, variant) };
    return { selection, record: await (!selection.face && MOTION_ANIMS.has(look.anim) ? localMotionItem(selection.id) : localItem(selection.id)) };
  }));
  for (const { record, selection } of loaded) {
    if (!record) missing.push(selection.id);
  }

  for (const { selection, record } of loaded) {
    if (!record) continue;
    for (const effect of frameEffects(record, look, selection.face ?? false)) localImage(effect.image).catch(() => {});
  }

  for (const { selection, record } of loaded) {
    if (!record) continue;
    const effects = frameEffects(record, look, selection.face ?? false);
    for (let index = 0; index < effects.length; index++) {
      const effect = effects[index]!;
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

/** A fully composited look+pose, ready to blit with a single drawImage. */
export interface PosedFrame {
  canvas: HTMLCanvasElement;
  missing: number[];
  unresolved: string[];
  origin: Point;
}

/** Composited frames of the current look only (play mode cycles a handful of poses); cleared whenever the look changes. */
let framesLook = '';
const frames = new Map<string, Promise<PosedFrame>>();
const readyFrames = new Map<string, PosedFrame>();

/** Identity of everything about a look except its pose. */
export function lookIdentity(look: Look): string {
  return JSON.stringify({ ...look, name: '', anim: '', frame: 0, emote: '', emoteFrame: 0 });
}

function frameKey(look: Look, size: number): string {
  return `${look.anim}:${look.frame}:${look.emote ?? ''}:${look.emoteFrame ?? 0}:${size}`;
}

/** The composited frame if it is already built, else undefined; lets callers draw synchronously. */
export function readyPosedFrame(identity: string, look: Look, size: number): PosedFrame | undefined {
  return identity === framesLook ? readyFrames.get(frameKey(look, size)) : undefined;
}

/** Composite (once) a look at a pose into its own canvas. `identity` is `lookIdentity(look)`. */
export function posedFrame(identity: string, look: Look, size: number): Promise<PosedFrame> {
  if (identity !== framesLook) {
    framesLook = identity;
    frames.clear();
    readyFrames.clear();
  }
  const key = frameKey(look, size);
  const cached = frames.get(key);
  if (cached) return cached;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return Promise.reject(new Error('no 2d context'));
  const request = renderLayeredCharacter(ctx, look, size, size).then((result) => {
    const built: PosedFrame = { canvas, ...result };
    // A frame built with missing art may be fixed by a retry, so only complete frames are cached.
    if (identity !== framesLook) return built;
    if (result.missing.length || result.unresolved.length) frames.delete(key);
    else readyFrames.set(key, built);
    return built;
  });
  request.catch(() => { if (frames.get(key) === request) frames.delete(key); });
  frames.set(key, request);
  return request;
}

/** Composite every frame of the given poses ahead of time so play mode never stalls on first use. */
export async function warmPoses(look: Look, poses: Array<{ anim: string; frames: number }>, size: number): Promise<void> {
  const identity = lookIdentity(look);
  for (const { anim, frames: count } of poses) {
    await Promise.all(Array.from({ length: count }, (_, frame) =>
      posedFrame(identity, { ...look, anim, frame }, size).catch(() => undefined)));
  }
}

/** Attack poses an item actually has baked frames for (cash weapons ship whatever their art needs). */
export async function motionActions(id: number, variant = 0): Promise<Set<string>> {
  const record = await (variant ? localItem(id, variant) : localMotionItem(id));
  return new Set(Object.keys(record?.frames ?? {}).map((key) => key.split(':')[0]!));
}
