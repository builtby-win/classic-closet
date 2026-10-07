import { CLASSIC_ZMAP_ORDER, composeLayers, drawComposition, type Point, type SourceLayer } from './layered-renderer';
import type { Look } from './fashion';

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

const records = new Map<number, Promise<ItemRecord | null>>();
const images = new Map<string, Promise<HTMLImageElement>>();

function localItem(id: number): Promise<ItemRecord | null> {
  const cached = records.get(id);
  if (cached) return cached;
  const request = fetch(`/sprites/items/${id}.json`)
    .then((response) => response.ok ? response.json() as Promise<ItemRecord> : null)
    .catch(() => null);
  records.set(id, request);
  return request;
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

function effectMap(effect: EffectRecord): Record<string, Point> {
  const offsets = effect.mapOffset ?? {};
  if (Object.keys(offsets).length) return { ...offsets };
  // A sprite without an attachment point uses its source origin, which is
  // represented by the base layer's zero-valued root anchor.
  return { base: { x: 0, y: 0 } };
}

/**
 * Independent local-only preview pipeline. It reads baked source sprites,
 * resolves named anchors, and draws in z-map order; there is no API fallback.
 */
export async function renderLayeredCharacter(
  ctx: CanvasRenderingContext2D,
  look: Look,
  width = 128,
  height = 128,
): Promise<{ missing: number[]; unresolved: string[] }> {
  const pose = look.anim === 'stand2' || look.anim === 'alert' ? look.anim : 'stand1';
  const bodyImage = await localImage(`/sprites/base/${look.skin}_${pose}_0.png`);
  const bodyLayer: SourceLayer = {
    key: 'base:body', itemKey: 'base', part: 'body', name: 'body',
    image: bodyImage, width: bodyImage.naturalWidth, height: bodyImage.naturalHeight,
    origin: { x: 0, y: 0 },
    map: {
      base: { x: 0, y: 0 }, navel: { x: 18, y: 46 },
      brow: { x: 17, y: 14 }, neck: { x: 20, y: 22 }, hand: { x: 35, y: 41 },
    },
    z: 'body',
  };

  const selections: Array<{ id: number; part: string; face?: boolean; hair?: boolean }> = [];
  if (look.face) selections.push({ id: look.face, part: 'Face', face: true });
  if (look.hair) selections.push({ id: look.hair, part: 'Hair', hair: true });
  for (const [slot, id] of Object.entries(look.items)) {
    if (id != null) selections.push({ id, part: slot });
  }

  const loaded = await Promise.all(selections.map(async (selection) => ({
    selection,
    record: await localItem(selection.id),
  })));
  const missing = loaded.filter(({ record }) => !record).map(({ selection }) => selection.id);
  const spriteLayers: SourceLayer[] = [bodyLayer];
  const hatHasCap = loaded.some(({ selection, record }) => selection.part === 'Hat'
    && Object.values(record?.frames ?? {}).flat().some((effect) =>
      ['cap', 'capAccessory', 'capBelowAccessory'].includes(effect.position ?? '')));

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
  drawComposition(ctx, composition, width, height);
  return { missing: [...new Set(missing)], unresolved: composition.unresolved };
}
