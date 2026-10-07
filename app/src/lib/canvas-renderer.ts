import { getZIndex } from './zmap';
import type { Look } from './fashion';

export interface SpriteEffect {
  image: string; // data URI (PNG) or URL
  origin: { x: number; y: number };
  mapOffset: {
    navel?: { x: number; y: number };
    brow?: { x: number; y: number };
    neck?: { x: number; y: number };
    hand?: { x: number; y: number };
  };
  position: string;
}

export interface ItemSpriteData {
  id: number;
  frames: Record<string, SpriteEffect[]>; // key: "stand1:0", "default:0", etc.
}

// In-memory cache for fast, synchronous rendering
const spriteDataCache = new Map<number, ItemSpriteData>();
const imageCache = new Map<string, HTMLImageElement>();
const pendingFetches = new Map<number, Promise<ItemSpriteData | null>>();

function loadImage(src: string): Promise<HTMLImageElement> {
  const cached = imageCache.get(src);
  if (cached && cached.complete && cached.naturalWidth > 0) {
    return Promise.resolve(cached);
  }
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      imageCache.set(src, img);
      resolve(img);
    };
    img.onerror = reject;
    img.src = src;
  });
}

export function getCachedImage(src: string): HTMLImageElement | null {
  const img = imageCache.get(src);
  return img && img.complete && img.naturalWidth > 0 ? img : null;
}

/**
 * Fetch item sprite data from static /sprites/items/{id}.json,
 * falling back to maplestory.io if not yet baked locally.
 */
export async function fetchItemSpriteData(id: number, srcType?: 'GMS'): Promise<ItemSpriteData | null> {
  if (spriteDataCache.has(id)) return spriteDataCache.get(id)!;
  if (pendingFetches.has(id)) return pendingFetches.get(id)!;

  const fetchPromise = (async () => {
    try {
      // 1. Try local static edge bundle
      const localRes = await fetch(`/sprites/items/${id}.json`);
      if (localRes.ok) {
        const data: ItemSpriteData = await localRes.json();
        spriteDataCache.set(id, data);
        // Preload effect images into Image objects
        preloadEffects(data);
        return data;
      }
    } catch {
      // Fall through to live API
    }

    try {
      // 2. Fallback to maplestory.io item endpoint
      const apiBase = srcType === 'GMS' ? 'https://maplestory.io/api/GMS/270' : 'https://maplestory.io/api/MCW/CBT2';
      const apiRes = await fetch(`${apiBase}/item/${id}`);
      if (!apiRes.ok) return null;
      const json = await apiRes.json();
      const frames: Record<string, SpriteEffect[]> = {};

      const books = json.frameBooks || {};
      for (const [actionName, action] of Object.entries<any>(books)) {
        if (!action?.frames) continue;
        action.frames.forEach((f: any, fIdx: number) => {
          const key = `${actionName}:${fIdx}`;
          const effects: SpriteEffect[] = [];
          for (const eff of Object.values<any>(f.effects || {})) {
            if (!eff?.image) continue;
            effects.push({
              image: eff.image.startsWith('data:') ? eff.image : `data:image/png;base64,${eff.image}`,
              origin: { x: eff.origin?.x ?? 0, y: eff.origin?.y ?? 0 },
              mapOffset: {
                navel: eff.mapOffset?.navel ? { x: eff.mapOffset.navel.x ?? 0, y: eff.mapOffset.navel.y ?? 0 } : undefined,
                brow: eff.mapOffset?.brow ? { x: eff.mapOffset.brow.x ?? 0, y: eff.mapOffset.brow.y ?? 0 } : undefined,
                hand: eff.mapOffset?.hand ? { x: eff.mapOffset.hand.x ?? 0, y: eff.mapOffset.hand.y ?? 0 } : undefined,
              },
              position: eff.position || 'default',
            });
          }
          if (effects.length) frames[key] = effects;
        });
      }

      const itemData: ItemSpriteData = { id, frames };
      spriteDataCache.set(id, itemData);
      preloadEffects(itemData);
      return itemData;
    } catch {
      return null;
    } finally {
      pendingFetches.delete(id);
    }
  })();

  pendingFetches.set(id, fetchPromise);
  return fetchPromise;
}

function preloadEffects(data: ItemSpriteData) {
  for (const effects of Object.values(data.frames)) {
    for (const eff of effects) {
      if (eff.image && !imageCache.has(eff.image)) {
        loadImage(eff.image).catch(() => {});
      }
    }
  }
}

interface DrawableLayer {
  img: HTMLImageElement;
  x: number;
  y: number;
  zIndex: number;
}

/**
 * Draws the character on a 128x128 canvas.
 * Returns true if all layers were drawn, or false if some layers are still loading.
 */
export async function renderCharacterToCanvas(
  ctx: CanvasRenderingContext2D,
  look: Look,
  width = 128,
  height = 128
): Promise<boolean> {
  ctx.imageSmoothingEnabled = false;

  // Base body coordinates on 128x128 canvas
  // The standard base body image is 43 x 68 pixels
  const bodyWidth = 43;
  const bodyHeight = 68;
  const bodyX = Math.round((width - bodyWidth) / 2);
  const bodyY = Math.round((height - bodyHeight) / 2);

  const navel = { x: bodyX + 18, y: bodyY + 46 };
  const brow = { x: bodyX + 17, y: bodyY + 14 };
  const hand = { x: bodyX + 24, y: bodyY + 41 };

  // 1. Load base body image
  const anim = look.anim || 'stand1';
  const frame = look.frame || 0;
  const basePose = (anim === 'stand2' || anim === 'alert') ? anim : 'stand1';
  const baseSrc = `/sprites/base/${look.skin}_${basePose}_0.png`;

  let baseImg = getCachedImage(baseSrc);
  if (!baseImg) {
    try {
      baseImg = await loadImage(baseSrc);
    } catch {
      // Fallback to online base if local base is not yet cached
      const fallbackUrl = `https://maplestory.io/api/character/%7B%22itemId%22%3A${look.skin}%2C%22region%22%3A%22MCW%22%2C%22version%22%3A%22CBT2%22%7D%2C%7B%22itemId%22%3A${look.skin + 10000}%2C%22region%22%3A%22MCW%22%2C%22version%22%3A%22CBT2%22%7D/${basePose}/0`;
      baseImg = await loadImage(fallbackUrl);
    }
  }

  // 2. Collect all item IDs: face, hair, and worn equipment
  const activeIds: Array<{ id: number; isFace?: boolean }> = [];
  if (look.face) activeIds.push({ id: look.face, isFace: true });
  if (look.hair) activeIds.push({ id: look.hair });
  for (const itemId of Object.values(look.items)) {
    if (itemId != null) activeIds.push({ id: itemId });
  }

  // 3. Resolve all sprite data (from cache or background fetch)
  let allLoaded = true;
  const drawLayers: DrawableLayer[] = [];

  // Add base body layer
  if (baseImg) {
    drawLayers.push({
      img: baseImg,
      x: bodyX,
      y: bodyY,
      zIndex: getZIndex('body'),
    });
  }

  const spriteDataList = await Promise.all(
    activeIds.map(async ({ id }) => {
      let data: ItemSpriteData | null | undefined = spriteDataCache.get(id);
      if (!data) {
        data = await fetchItemSpriteData(id);
      }
      return data;
    })
  );

  for (let i = 0; i < activeIds.length; i++) {
    const { isFace } = activeIds[i]!;
    const itemData = spriteDataList[i];
    if (!itemData) {
      allLoaded = false;
      continue;
    }

    // Determine frame key: for face it is "default:0", for others anim:frame
    let key = `${anim}:${frame}`;
    if (isFace) {
      key = 'default:0';
    } else if (!itemData.frames[key]) {
      // Fallback to stand1:0 if stance specific frame is not found
      key = 'stand1:0';
    }

    const effects = itemData.frames[key] || itemData.frames['stand1:0'] || Object.values(itemData.frames)[0];
    if (!effects) continue;

    for (const eff of effects) {
      let img = getCachedImage(eff.image);
      if (!img) {
        try {
          img = await loadImage(eff.image);
        } catch {
          allLoaded = false;
          continue;
        }
      }

      // Compute anchor placement
      let drawX = bodyX;
      let drawY = bodyY;

      if (eff.mapOffset.brow) {
        drawX = brow.x - eff.origin.x - eff.mapOffset.brow.x;
        drawY = brow.y - eff.origin.y - eff.mapOffset.brow.y;
      } else if (eff.mapOffset.navel) {
        drawX = navel.x - eff.origin.x - eff.mapOffset.navel.x;
        drawY = navel.y - eff.origin.y - eff.mapOffset.navel.y;
      } else if (eff.mapOffset.hand) {
        drawX = hand.x - eff.origin.x - eff.mapOffset.hand.x;
        drawY = hand.y - eff.origin.y - eff.mapOffset.hand.y;
      } else {
        drawX = bodyX - eff.origin.x;
        drawY = bodyY - eff.origin.y;
      }

      drawLayers.push({
        img,
        x: Math.round(drawX),
        y: Math.round(drawY),
        zIndex: getZIndex(eff.position),
      });
    }
  }

  // 4. Sort layers by Z-index and draw to canvas
  drawLayers.sort((a, b) => a.zIndex - b.zIndex);

  ctx.clearRect(0, 0, width, height);
  for (const layer of drawLayers) {
    ctx.drawImage(layer.img, layer.x, layer.y);
  }

  return allLoaded;
}
