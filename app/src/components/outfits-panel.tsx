import { useState } from 'react';
import type { Look } from '../lib/fashion';
import type { Outfit } from '../lib/outfits';
import { OutfitThumb } from './outfit-canvas';

interface OutfitsPanelProps {
  saved: Outfit[];
  /** Key of the outfit worn right now. */
  currentKey: string;
  /** Pose steering for the worn weapon. */
  normalize: (look: Look) => Look;
  onWear: (outfit: Outfit) => void;
  onCompare: (outfit: Outfit) => void;
  onRename: (outfit: Outfit, name: string) => void;
  onRemove: (outfit: Outfit) => void;
}

/** Closet-rail view of kept outfits. Tap to wear; ⇄ compares one with what you have on. */
export default function OutfitsPanel({ saved, currentKey, normalize, onWear, onCompare, onRename, onRemove }: OutfitsPanelProps) {
  const [renaming, setRenaming] = useState<string | null>(null);

  if (saved.length === 0) {
    return (
      <div id="outfit-list" className="of-empty">
        <p><b>No saved outfits yet.</b></p>
        <p>Try things on in the closet. When you land on one you like, tap ☆ under your character to keep it. Then you can compare it with whatever you try next.</p>
      </div>
    );
  }

  return (
    <div id="outfit-list" role="list" aria-label="Saved outfits">
      {saved.map((outfit) => (
        <div key={outfit.id} role="listitem" className={'of-card' + (outfit.key === currentKey ? ' worn' : '')}>
          <button type="button" className="of-main" onClick={() => onWear(outfit)} aria-label={`Wear ${outfit.name}`} aria-pressed={outfit.key === currentKey}>
            <OutfitThumb look={normalize(outfit.look)} size={72} />
          </button>
          {renaming === outfit.id
            ? <input className="of-name editing" autoFocus defaultValue={outfit.name} maxLength={24} aria-label="Outfit name"
                onBlur={(e) => { onRename(outfit, e.currentTarget.value); setRenaming(null); }}
                onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') { e.currentTarget.value = outfit.name; e.currentTarget.blur(); } }} />
            : <button type="button" className="of-name" onClick={() => setRenaming(outfit.id)} title="Rename">{outfit.name}</button>}
          <div className="of-actions">
            <button type="button" onClick={() => onCompare(outfit)} aria-label={`Compare ${outfit.name} with what I'm wearing`} title="Compare with what I'm wearing">⇄</button>
            <button type="button" onClick={() => onRemove(outfit)} aria-label={`Delete ${outfit.name}`} title="Delete">✕</button>
          </div>
        </div>
      ))}
    </div>
  );
}
