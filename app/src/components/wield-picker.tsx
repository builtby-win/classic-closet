import { WEAPON_GROUPS, wieldLabel } from '../lib/fashion';

/** Stance switch for the worn weapon skin: one option per weapon type it ships art for. */
export default function WieldPicker({ choices, value, onChange }: { choices: string[]; value: string; onChange: (wield: string) => void }) {
  return (
    <label className="wield-picker">
      <span>Wield as</span>
      <select value={value} onChange={(e) => onChange(e.target.value)} aria-label="Wield weapon as">
        {choices.map((choice) => <option key={choice} value={choice}>{wieldLabel(choice)}</option>)}
      </select>
    </label>
  );
}

/** Weapon drawer filter by stance (1H, 2H, bow, …). */
export function WeaponGroupFilter({ value, onChange }: { value: string | null; onChange: (group: string | null) => void }) {
  return (
    <label className="wield-picker">
      <span>Type</span>
      <select value={value ?? ''} onChange={(e) => onChange(e.target.value || null)} aria-label="Filter weapons by type">
        <option value="">All types</option>
        {WEAPON_GROUPS.map((group) => <option key={group.id} value={group.id}>{group.label}</option>)}
      </select>
    </label>
  );
}
