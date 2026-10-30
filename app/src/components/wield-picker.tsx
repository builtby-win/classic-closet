import { wieldLabel } from '../lib/fashion';

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
