/**
 * Bake skill effect sprites for play mode into public/sprites/skills/.
 * Source: the reference playground's extracted Skill.wz data (static JSON +
 * PNGs). Runtime reads only the local manifest. Existing PNGs are reused.
 */

import { writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = join(ROOT, 'public', 'sprites', 'skills');
const REFERENCE_ROOT = 'https://javipen.github.io/maplestory-cosmetic-playground/';

/** Skill ids as they appear in the reference data/skills/ folder. */
const SKILL_IDS = [
  '1001001', '1001002', // Power Strike, Slash Blast (warrior)
  '2001002', '2001003', // Energy Bolt, Magic Claw (mage)
  '3101005', '3201004', '3111003', // Arrow Bomb, Iron Arrow, Strafe (bow / crossbow)
  '4001002', '4201003', '4001003', // Double Stab, Savage Blow, Lucky Seven (thief)
];

/** The reference names some records oddly or leaves them blank; the pad label is set here. */
const NAME_OVERRIDES: Record<string, string> = { '3101005': 'Arrow Bomb', '3201004': 'Iron Arrow' };

/**
 * Arrow Bomb's hit record (3101005) is unnamed and ships no in-flight arrow; that lives in the
 * record named after the skill: skill id -> { sequence name -> record id to take it from }.
 */
const SEQUENCE_DONORS: Record<string, Record<string, string>> = { '3101005': { ball: '3101004' } };

/** Thrown item projectiles: skill id -> item id whose icon flies at the target (Lucky Seven's Subi stars). */
const PROJECTILE_ITEMS: Record<string, number> = { '4001003': 2070000 };

interface Point {
  x: number;
  y: number;
}

/** Fixed documented schema of the reference data/skills/<id>.json (see header). */
interface ReferenceFrame {
  url?: string;
  origin: Point;
  delay: number | null;
  a0?: number;
  a1?: number;
}

interface ReferenceSkill {
  skill_id: string;
  name: string;
  max_stored_level: number;
  weapon_types: string[];
  icon?: { url?: string };
  sequences: Record<string, ReferenceFrame[]>;
}

export interface BakedSkillFrame {
  image: string;
  origin: Point;
  /** Milliseconds this frame is shown. */
  delay: number;
  /** Opacity (0-255) at the start and end of the frame; the sprite fades between them. */
  a0: number;
  a1: number;
}

export interface BakedSkill {
  id: string;
  name: string;
  icon: string;
  masterLevel: number;
  /** Source weapon-type codes this skill is recorded for (e.g. 33 dagger, 47 claw). */
  weaponTypes: string[];
  /** Local path of the thrown sprite, for skills that throw something. */
  projectile?: string;
  sequences: Record<string, BakedSkillFrame[]>;
}

async function fetchBytes(path: string): Promise<Buffer> {
  const res = await fetch(`${REFERENCE_ROOT}${path}`, { signal: AbortSignal.timeout(30000) });
  if (!res.ok) throw new Error(`GET ${path} -> ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

async function savePng(skillDir: string, url: string): Promise<string> {
  const file = `${url.split('/').pop()}`;
  const dest = join(skillDir, file);
  if (!existsSync(dest)) {
    const bytes = await fetchBytes(url);
    if (bytes.length < 8 || bytes.readUInt32BE(0) !== 0x89504e47) throw new Error(`Not a PNG: ${url}`);
    writeFileSync(dest, bytes);
  }
  return file;
}

async function main(): Promise<void> {
  mkdirSync(OUT_DIR, { recursive: true });
  const manifest: Record<string, BakedSkill> = {};
  for (const id of SKILL_IDS) {
    // Boundary: reference skill JSON has the fixed ReferenceSkill schema.
    const raw: ReferenceSkill = JSON.parse((await fetchBytes(`data/skills/${id}.json`)).toString('utf8'));
    const skillDir = join(OUT_DIR, id);
    mkdirSync(skillDir, { recursive: true });
    const publicDir = `/sprites/skills/${id}`;
    const sequences: Record<string, BakedSkillFrame[]> = {};
    const sources: [string, ReferenceFrame[]][] = Object.entries(raw.sequences);
    for (const [name, donorId] of Object.entries(SEQUENCE_DONORS[id] ?? {})) {
      const donorRaw: ReferenceSkill = JSON.parse((await fetchBytes(`data/skills/${donorId}.json`)).toString('utf8'));
      const frames = donorRaw.sequences[name];
      if (!frames) throw new Error(`Donor ${donorId} has no ${name} sequence`);
      sources.push([name, frames]);
    }
    for (const [name, frames] of sources) {
      const baked: BakedSkillFrame[] = [];
      for (const frame of frames) {
        if (!frame.url) continue;
        baked.push({
          image: `${publicDir}/${await savePng(skillDir, frame.url)}`,
          origin: frame.origin,
          delay: frame.delay ?? 100,
          a0: frame.a0 ?? 255,
          a1: frame.a1 ?? 255,
        });
      }
      if (baked.length) sequences[name] = baked;
    }
    const iconUrl = raw.icon?.url;
    if (!iconUrl) throw new Error(`Skill ${id} has no icon`);
    let projectile: string | undefined;
    const item = PROJECTILE_ITEMS[id];
    if (item) {
      const dest = join(skillDir, 'projectile.png');
      if (!existsSync(dest)) {
        const res = await fetch(`https://maplestory.io/api/GMS/270/item/${item}/icon`, { signal: AbortSignal.timeout(30000), headers: { 'user-agent': 'Mozilla/5.0' } });
        const bytes = Buffer.from(await res.arrayBuffer());
        if (!res.ok || bytes.length < 8 || bytes.readUInt32BE(0) !== 0x89504e47) throw new Error(`Projectile icon ${item}: ${res.status}`);
        writeFileSync(dest, bytes);
      }
      projectile = `${publicDir}/projectile.png`;
    }
    manifest[id] = {
      id,
      name: NAME_OVERRIDES[id] ?? raw.name,
      icon: `${publicDir}/${await savePng(skillDir, iconUrl)}`,
      masterLevel: raw.max_stored_level,
      weaponTypes: raw.weapon_types,
      projectile,
      sequences,
    };
    console.log(`${NAME_OVERRIDES[id] ?? raw.name}: ${Object.entries(sequences).map(([k, v]) => `${k}=${v.length}`).join(' ')}`);
  }
  writeFileSync(join(OUT_DIR, 'skills.json'), JSON.stringify(manifest));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
