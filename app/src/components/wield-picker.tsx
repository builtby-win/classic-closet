import { WEAPON_GROUPS, wieldLabel } from '../lib/fashion';

/** One-tap stance switch for the worn weapon skin: a chip per weapon type it ships art for. */
export default function WieldPicker({ choices, value, onChange }: { choices: string[]; value: string; onChange: (wield: string) => void }) {
  return (
    <div className="wield-picker" role="group" aria-label="Wield weapon as">
      <span>Wield as</span>
      {choices.map((choice) => (
        <button key={choice} type="button" className={'job-pill' + (value === choice ? ' on' : '')} aria-pressed={value === choice} onClick={() => onChange(choice)}>
          {wieldLabel(choice)}
        </button>
      ))}
    </div>
  );
}

/** Weapon drawer filter by stance (1H, 2H, bow, …); tap the active chip again to clear. */
export function WeaponGroupFilter({ value, onChange }: { value: string | null; onChange: (group: string | null) => void }) {
  return (
    <div className="wield-picker" role="group" aria-label="Filter weapons by type">
      <span>Type</span>
      {WEAPON_GROUPS.map((group) => (
        <button key={group.id} type="button" className={'job-pill' + (value === group.id ? ' on' : '')} aria-pressed={value === group.id} onClick={() => onChange(value === group.id ? null : group.id)}>
          {group.label}
        </button>
      ))}
    </div>
  );
}
