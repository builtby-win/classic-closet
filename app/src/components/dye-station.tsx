import { useState } from 'react';
import { iconFallbackURL, iconURL } from '../lib/fashion';
import { clampDye, NO_DYE, rollDye, type Dye } from '../lib/dye';

export interface DyeSlot {
  slot: string;
  id: number;
  name: string;
}

interface DyeStationProps {
  slots: DyeSlot[];
  dyes: Record<string, Dye> | undefined;
  /** `null` restores the item's original colors. */
  onChange: (id: number, dye: Dye | null) => void;
  /** True while the user holds "Original": the preview shows undyed art. */
  onCompare: (comparing: boolean) => void;
  onClose: () => void;
}

const AXES = [
  { key: 'tone', label: 'Tone', min: -359, max: 359 },
  { key: 'chroma', label: 'Chroma', min: -100, max: 100 },
  { key: 'brightness', label: 'Brightness', min: -100, max: 100 },
] as const;

const HISTORY_MAX = 5;
const signed = (n: number) => (n > 0 ? `+${n}` : String(n));
const same = (a: Dye, b: Dye) => a.tone === b.tone && a.chroma === b.chroma && a.brightness === b.brightness;

/** Reads the game's tooltip text: "Tone: +277, Chroma: +72, Brightness: +56". */
function parseTooltip(text: string): Dye | null {
  const read = (label: string) => new RegExp(`${label}\\s*:?\\s*([+-]?\\d+)`, 'i').exec(text)?.[1];
  const [tone, chroma, brightness] = [read('tone'), read('chroma'), read('brightness')];
  if (tone == null || chroma == null || brightness == null) return null;
  return clampDye({ tone: Number(tone), chroma: Number(chroma), brightness: Number(brightness) });
}

/** Dye station: pick a worn item, roll Mystery Palette, fine-tune, or paste an in-game result. Recolor math is an approximation. */
export default function DyeStation({ slots, dyes, onChange, onCompare, onClose }: DyeStationProps) {
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [history, setHistory] = useState<Record<string, Dye[]>>({});
  const [paste, setPaste] = useState('');
  const selected = slots.find((s) => s.id === selectedId) ?? slots[0];
  const dye = selected ? dyes?.[String(selected.id)] ?? NO_DYE : NO_DYE;
  const past = selected ? history[String(selected.id)] ?? [] : [];

  // Every dye change remembers the value it replaced, so a bad roll is one tap from undone.
  const apply = (id: number, next: Dye | null) => {
    const prev = dyes?.[String(id)];
    if (prev && (!next || !same(prev, next))) {
      setHistory((h) => ({ ...h, [String(id)]: [prev, ...(h[String(id)] ?? []).filter((d) => !same(d, prev))].slice(0, HISTORY_MAX) }));
    }
    onChange(id, next);
  };

  return (
    <aside id="dye-station" role="dialog" aria-label="Dye station">
      <header className="dye-head">
        <h2>Dye station</h2>
        <button type="button" className="dye-close" aria-label="Close dye station" onClick={onClose}>×</button>
      </header>
      {!selected ? <p className="dye-empty">Wear an item to dye it.</p> : <>
        <div className="dye-strip" role="listbox" aria-label="Worn items">
          {slots.map(({ slot, id, name }) => (
            <button key={id} type="button" role="option" aria-selected={id === selected.id} className={`dye-chip${id === selected.id ? ' on' : ''}`} title={`${slot}: ${name}`} onClick={() => setSelectedId(id)}>
              <img src={iconURL(id)} alt="" draggable={false} onError={(e) => { const next = iconFallbackURL(e.currentTarget.src); if (next) e.currentTarget.src = next; else e.currentTarget.style.visibility = 'hidden'; }} />
              {dyes?.[String(id)] && <i className="dye-dot" />}
            </button>
          ))}
        </div>
        <div className="dye-name"><b>{selected.name}</b><span>{selected.slot}</span></div>
        <div className="dye-actions">
          <button type="button" className="primary dye-roll" onClick={() => apply(selected.id, rollDye())}>Roll Mystery Palette</button>
          <button type="button" onClick={() => slots.forEach((s) => apply(s.id, rollDye()))}>Roll all</button>
        </div>
        <output className="dye-readout">Tone {signed(dye.tone)} · Chroma {signed(dye.chroma)} · Brightness {signed(dye.brightness)}</output>
        <div className="dye-actions">
          <button type="button" onPointerDown={() => onCompare(true)} onPointerUp={() => onCompare(false)} onPointerLeave={() => onCompare(false)} onPointerCancel={() => onCompare(false)}>Hold: original</button>
          <button type="button" disabled={!dyes?.[String(selected.id)]} onClick={() => apply(selected.id, null)}>Reset</button>
        </div>
        {past.length > 0 && <div className="dye-history">
          <span>Previous</span>
          {past.map((d) => <button key={`${d.tone}:${d.chroma}:${d.brightness}`} type="button" onClick={() => apply(selected.id, d)}>{signed(d.tone)} / {signed(d.chroma)} / {signed(d.brightness)}</button>)}
        </div>}
        <details className="dye-fine">
          <summary>Fine-tune</summary>
          {AXES.map(({ key, label, min, max }) => (
            <label key={key} className="dye-axis">
              <span>{label}</span>
              <input type="range" min={min} max={max} value={dye[key]} onChange={(e) => onChange(selected.id, { ...dye, [key]: Number(e.target.value) })} />
              <output>{dye[key]}</output>
            </label>
          ))}
          <input className="dye-paste" placeholder="Paste in-game: Tone: +277, Chroma: +72, Brightness: +56" value={paste} aria-label="Paste in-game dye tooltip"
            onChange={(e) => { setPaste(e.target.value); const parsed = parseTooltip(e.target.value); if (parsed) apply(selected.id, parsed); }} />
        </details>
      </>}
      <small className="dye-note">Preview only; the game's roll and exact colors differ.</small>
    </aside>
  );
}
