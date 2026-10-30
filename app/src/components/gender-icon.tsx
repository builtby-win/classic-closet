// SVG instead of ♂/♀ text: Safari/iOS renders those glyphs from fallback fonts with inconsistent size and baseline.
export function GenderIcon({ sex }: { sex: 'm' | 'f' }) {
  return (
    <svg className="gender-sym" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {sex === 'm'
        ? <><circle cx="10" cy="14" r="5.5" /><path d="M14 10 20.5 3.5M14.5 3.5h6v6" /></>
        : <><circle cx="12" cy="9" r="5.5" /><path d="M12 14.5V21.5M8.5 18h7" /></>}
    </svg>
  );
}
