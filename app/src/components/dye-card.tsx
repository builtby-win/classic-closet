import { NO_DYE, rollDye, type Dye } from '../lib/dye';

export interface DyeSlot {
  slot: string;
  id: number;
  name: string;
}

interface DyeCardProps {
  slots: DyeSlot[];
  dyes: Record<string, Dye> | undefined;
  /** `null` restores the item's original colors. */
  onChange: (id: number, dye: Dye | null) => void;
}

const AXES = [
  { key: 'tone', label: 'Tone', min: -359, max: 359 },
  { key: 'chroma', label: 'Chroma', min: -100, max: 100 },
  { key: 'brightness', label: 'Brightness', min: -100, max: 100 },
] as const;

/** Mystery Palette preview: roll or hand-tune a dye per worn item. The recolor math is an approximation of the game's. */
export default function DyeCard({ slots, dyes, onChange }: DyeCardProps) {
  if (!slots.length) return null;
  return (
    <section className="set-card dye-card">
      <h3>Mystery Palette</h3>
      {slots.map(({ slot, id, name }) => {
        const dye = dyes?.[String(id)] ?? NO_DYE;
        return (
          <div key={id} className="dye-item">
            <div className="setrow">
              <span title={name}>{slot}</span>
              <button type="button" onClick={() => onChange(id, rollDye())}>Roll</button>
              <button type="button" onClick={() => onChange(id, null)} disabled={!dyes?.[String(id)]}>Reset</button>
            </div>
            {AXES.map(({ key, label, min, max }) => (
              <label key={key} className="dye-axis">
                <span>{label}</span>
                <input type="range" min={min} max={max} value={dye[key]} onChange={(e) => onChange(id, { ...dye, [key]: Number(e.target.value) })} />
                <output>{dye[key]}</output>
              </label>
            ))}
          </div>
        );
      })}
      <small className="dye-note">Preview only; the game's roll and exact colors differ.</small>
    </section>
  );
}
