import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Look } from './fashion';

/** A kept outfit: everything that changes how the character looks, minus pose and name. */
export interface Outfit {
  id: string;
  key: string;
  look: Look;
  ts: number;
  name: string;
}

const STORAGE_KEY = 'cc:playground:saved:v2';
const SAVED_CAP = 40;

/** Identity of an outfit. Pose and name are excluded so poking frames never forks it. */
export function outfitKey(look: Look): string {
  const items = Object.entries(look.items)
    .filter(([, id]) => id != null)
    .sort(([a], [b]) => (a < b ? -1 : 1));
  return JSON.stringify([look.sex, look.skin, look.hair, look.face, items]);
}

/** A detached copy safe to keep: pose and name stripped. */
export function snapshot(look: Look): Look {
  return { ...look, name: '', anim: 'stand1', frame: 0, emote: undefined, emoteFrame: undefined, items: { ...look.items } };
}

function read(): Outfit[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]');
    return Array.isArray(parsed) ? (parsed as Outfit[]).filter((o) => o && typeof o.key === 'string' && o.look) : [];
  } catch {
    return [];
  }
}

let counter = 0;
const newId = () => `${Date.now().toString(36)}${(counter++).toString(36)}`;

function freeName(list: Outfit[]): string {
  const taken = new Set(list.map((o) => o.name));
  let n = list.length + 1;
  while (taken.has(`Outfit ${n}`)) n++;
  return `Outfit ${n}`;
}

/** Outfits the person chose to keep. Trying things on never writes here. */
export function useSavedOutfits(look: Look) {
  const [saved, setSaved] = useState<Outfit[]>([]);
  const [loaded, setLoaded] = useState(false);
  const savedRef = useRef(saved);
  savedRef.current = saved;
  const key = useMemo(() => outfitKey(look), [look]);

  useEffect(() => {
    setSaved(read());
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (!loaded) return;
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(saved)); } catch { /* storage unavailable */ }
  }, [saved, loaded]);

  /** Keep `target` (default: what's worn now). Returns the stored outfit, reusing an identical one. */
  const save = useCallback((target: Look = look): Outfit => {
    const k = outfitKey(target);
    const hit = savedRef.current.find((o) => o.key === k);
    if (hit) return hit;
    const outfit: Outfit = { id: newId(), key: k, look: snapshot(target), ts: Date.now(), name: freeName(savedRef.current) };
    setSaved((list) => [outfit, ...list].slice(0, SAVED_CAP));
    return outfit;
  }, [look]);

  const remove = useCallback((outfit: Outfit) => {
    setSaved((list) => list.filter((o) => o.id !== outfit.id));
  }, []);

  const rename = useCallback((outfit: Outfit, name: string) => {
    const clean = name.trim().slice(0, 24);
    if (!clean) return;
    setSaved((list) => list.map((o) => o.id === outfit.id ? { ...o, name: clean } : o));
  }, []);

  return { saved, current: saved.find((o) => o.key === key), key, save, remove, rename };
}
