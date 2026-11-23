/** Mystery Palette dye. Values mirror the in-game "Tone / Chroma / Brightness" readout.
 *
 *  The transform is a port of henesys.store's simulator (which says it is based on the
 *  WzComparerR2 "prism" color math; we have not seen that source): HSL tone rotation snapped
 *  to 16 palette steps, then chroma and brightness passes. Pure black and white are skipped,
 *  and positive brightness lifts neutral greys toward white. It is an approximation, not
 *  Nexon's code. The ranges below are that simulator's conventions, unconfirmed for the game.
 *  In game, an undyed item reads 0/-100/-100 (a placeholder: a re-dyed item shows its prior
 *  dye there), so 0/0/0 here just means "no change". The roll distribution is unknown
 *  (players only say all three values are random); we roll uniformly. Real samples with the
 *  resulting look are in app/data/dye-samples.json.
 */
export interface Dye {
  /** Hue rotation in degrees, -359..359. */
  tone: number;
  /** Saturation shift, -100..100. */
  chroma: number;
  /** Lightness shift, -100..100. */
  brightness: number;
}

export const NO_DYE: Dye = { tone: 0, chroma: 0, brightness: 0 };

export function rollDye(random: () => number = Math.random): Dye {
  return {
    tone: Math.round(random() * 718 - 359),
    chroma: Math.round(random() * 200 - 100),
    brightness: Math.round(random() * 200 - 100),
  };
}

type Rgb = [number, number, number];

function rgbToHsl(r: number, g: number, b: number): Rgb {
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  let h = 0;
  if (d) {
    h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    h = (h * 60 + 360) % 360;
  }
  const l = (max + min) / 2;
  return [h, d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1)), l];
}

function hslToRgb(h: number, s: number, l: number): Rgb {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return [(r + m) * 255, (g + m) * 255, (b + m) * 255];
}

/** Snap to the sprites' 16 palette steps (multiples of 17). */
function snap(v: number): number {
  const t = Math.max(0, Math.min(255, v)) / 17;
  return (Math.floor(t) + (t % 1 >= 0.985 ? 1 : 0)) * 17;
}

/** Dye one pixel. */
export function dyeRgb(r: number, g: number, b: number, dye: Dye): Rgb {
  const { tone, chroma, brightness } = dye;
  if ((!tone && !chroma && !brightness) || (r === g && g === b && (r === 0 || r === 255))) return [r, g, b];
  const hi = Math.max(r, g, b), lo = Math.min(r, g, b), spread = hi - lo;
  const [h0, sat, light] = rgbToHsl(r / 255, g / 255, b / 255);
  const hue = (h0 + tone + 360) % 360;
  let out = hslToRgb(hue, sat, light);
  if (tone) out = out.map(snap) as Rgb;
  const cap = out.map((v) => (v > 238 ? 255 : 238));
  if (chroma && sat > 0) out = hslToRgb(hue, Math.max(0, Math.min(1, sat + chroma / 100)), light);
  if (brightness) {
    const top = Math.max(...out), bottom = Math.min(...out);
    out = out.map((v) => {
      if (brightness > 0) {
        const target = hi === 255 || spread === 0 ? 255 : top + ((255 - top) * (15 - (12 * spread) / (lo + spread))) / 15;
        return v + ((target - v) * brightness) / 100;
      }
      if (spread === 0) return v;
      if (v <= 0) return -255;
      return v + ((bottom === 0 ? v : (spread / hi) * top) * brightness) / 100;
    }) as Rgb;
  }
  return out.map((v, i) => snap(Math.max(0, Math.min(cap[i]!, v)))) as Rgb;
}

/** Recolor RGBA pixels in place. */
export function dyePixels(data: Uint8ClampedArray, dye: Dye): void {
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] === 0) continue;
    const [r, g, b] = dyeRgb(data[i]!, data[i + 1]!, data[i + 2]!, dye);
    data[i] = r;
    data[i + 1] = g;
    data[i + 2] = b;
  }
}

/** Dyed copy of a sprite. */
export function dyeImage(source: CanvasImageSource & { width: number; height: number }, dye: Dye): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = source.width;
  canvas.height = source.height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(source, 0, 0);
  const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
  dyePixels(pixels.data, dye);
  ctx.putImageData(pixels, 0, 0);
  return canvas;
}

export function clampDye(dye: Dye): Dye {
  const clamp = (v: number, limit: number) => Math.max(-limit, Math.min(limit, Math.round(v)));
  return { tone: clamp(dye.tone, 359), chroma: clamp(dye.chroma, 100), brightness: clamp(dye.brightness, 100) };
}

/** Dyed canvases per source sprite, so redraws and pose changes never recolor twice. */
const dyedSprites = new WeakMap<HTMLImageElement, Map<string, HTMLCanvasElement>>();

export function dyedSprite(image: HTMLImageElement, dye: Dye): HTMLCanvasElement {
  let byDye = dyedSprites.get(image);
  if (!byDye) dyedSprites.set(image, (byDye = new Map()));
  const key = `${dye.tone}:${dye.chroma}:${dye.brightness}`;
  let canvas = byDye.get(key);
  if (!canvas) byDye.set(key, (canvas = dyeImage(image, dye)));
  return canvas;
}
