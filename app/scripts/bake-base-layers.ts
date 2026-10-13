/**
 * Bake source body, arm and head layers with their per-pose WZ anchors.
 * maplestory.io has no skin item frameBooks; use the reference renderer's
 * Character/Character_000.wz extraction. Runtime reads only local assets.
 * Called by bake-sprites.ts; existing PNGs are reused.
 */

import { writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const BASE_DIR = join(ROOT, 'public', 'sprites', 'base');
const MANIFEST_PATH = join(ROOT, 'public', 'sprites', 'base.json');

/** Reference WZ extraction (see header). Skin index N == item id 2000 + N. */
const REFERENCE_BASE_URL =
  'https://javipen.github.io/maplestory-cosmetic-playground/data/base.json.gz';
const REFERENCE_ROOT = 'https://javipen.github.io/maplestory-cosmetic-playground/';

const SKIN_IDS = [2000, 2001, 2002, 2003, 2004, 2005, 2006];
const POSES = [
  'stand1', 'stand2', 'alert', 'jump',
  // Play mode: walk, duck, and one attack pose per weapon family.
  'walk1', 'walk2', 'prone', 'shoot1', 'shoot2',
  'swingO1', 'swingO2', 'swingO3', 'stabO1', 'stabO2',
  'swingT1', 'swingT2', 'swingT3', 'stabT1', 'stabT2', 'swingP1', 'swingP2',
];

export interface BasePoint {
  x: number;
  y: number;
}

export interface BakedBaseEffect {
  part: string;
  name: string;
  /** Local sprite path served from /sprites/base/. */
  image: string;
  origin: BasePoint;
  mapOffset: Record<string, BasePoint>;
  /** Source z name (e.g. body, arm, armOverHair, head, hairShade). */
  position: string;
}

export interface BakedBaseFrame {
  body: BakedBaseEffect[];
  head: BakedBaseEffect[];
}

export interface BakedBaseManifest {
  source: string;
  skins: number[];
  frames: Record<string, BakedBaseFrame>;
}

/** Fixed documented schema of the reference base.json.gz (see header). */
interface ReferenceLayer {
  name: string;
  origin: BasePoint;
  maps: Record<string, BasePoint>;
  z: string;
  url: string;
}

interface ReferencePose {
  body: ReferenceLayer[];
  head: ReferenceLayer[];
}

interface ReferenceBase {
  poses: Record<string, Record<string, ReferencePose>>;
}

async function fetchBytes(url: string, tries = 5): Promise<Buffer> {
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(30000) });
      if (!res.ok) throw new Error(`GET ${url} -> ${res.status}`);
      return Buffer.from(await res.arrayBuffer());
    } catch (error) {
      // GitHub Pages sheds load with the odd 503; back off and retry before failing the bake.
      if (attempt >= tries) throw error;
      await new Promise((resolve) => setTimeout(resolve, 1000 * attempt));
    }
  }
}

export async function bakeBaseBodies(): Promise<void> {
  mkdirSync(BASE_DIR, { recursive: true });
  // Boundary: reference base.json.gz has the fixed ReferenceBase schema.
  const parsed: ReferenceBase = JSON.parse(
    gunzipSync(await fetchBytes(REFERENCE_BASE_URL)).toString('utf8'),
  );
  const poses = parsed.poses ?? {};

  const manifest: BakedBaseManifest = {
    source: 'Character/Character_000.wz via maplestory-cosmetic-playground base.json.gz',
    skins: [...SKIN_IDS],
    frames: {},
  };

  let downloaded = 0;
  for (const skin of SKIN_IDS) {
    const skinPoses = poses[String(skin - 2000)] ?? {};
    for (const anim of POSES) {
      const frameIndexes = Object.keys(skinPoses)
        .filter((key) => key.startsWith(`${anim}/`))
        .map((key) => Number(key.slice(anim.length + 1)))
        .filter((index) => Number.isInteger(index))
        .sort((a, b) => a - b);
      for (const frame of frameIndexes) {
        const pose = skinPoses[`${anim}/${frame}`];
        if (!pose) continue;
        const rawBody = Array.isArray(pose.body) ? pose.body : [];
        const rawHead = Array.isArray(pose.head) ? pose.head : [];
        const wanted = [
          ...rawBody.map((layer) => ({ layer, part: 'body' })),
          ...rawHead
            .filter((layer) => layer.name === 'head' || layer.name === 'humanEar')
            .map((layer) => ({ layer, part: 'Head' })),
        ];
        const baked: BakedBaseEffect[] = [];
        for (const { layer, part } of wanted) {
          if (!layer.url) throw new Error(`Missing asset URL for ${skin} ${anim}/${frame} ${layer.name}`);
          const file = `${skin}_${anim}_${frame}_${layer.name}.png`;
          const dest = join(BASE_DIR, file);
          if (!existsSync(dest)) {
            const bytes = await fetchBytes(`${REFERENCE_ROOT}${layer.url}`);
            if (bytes.length < 8 || bytes.readUInt32BE(0) !== 0x89504e47) {
              throw new Error(`Not a PNG: ${layer.url}`);
            }
            writeFileSync(dest, bytes);
            downloaded++;
          }
          baked.push({
            part,
            name: layer.name,
            image: `/sprites/base/${file}`,
            origin: layer.origin,
            mapOffset: layer.maps,
            position: layer.z,
          });
        }
        if (!baked.some((layer) => layer.part === 'body' && layer.name === 'body')) {
          throw new Error(`Missing Body/body root for ${skin} ${anim}/${frame}`);
        }
        manifest.frames[`${skin}:${anim}:${frame}`] = {
          body: baked.filter((layer) => layer.part === 'body'),
          head: baked.filter((layer) => layer.part === 'Head'),
        };
      }
    }
  }

  writeFileSync(MANIFEST_PATH, JSON.stringify(manifest));
  console.log(`Baked base layers: ${downloaded} new PNGs, ${Object.keys(manifest.frames).length} frames`);
}
