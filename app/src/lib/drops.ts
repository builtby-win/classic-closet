/** Sale timing helpers: what's upcoming, newly live, or ending, and what a visitor has already seen. */
import type { BannerMeta } from './fashion';

const DAY = 86_400_000;
/** A banner counts as NEW for this long after it goes live. */
export const NEW_WINDOW_MS = 3 * DAY;
/** Red "ending soon" state threshold. */
export const SOON_WINDOW_MS = 2 * DAY;
/** Upcoming banners are announced this far ahead. */
export const UPCOMING_WINDOW_MS = 14 * DAY;
/** Nexon flips sales at 08:00 UTC; date-only banners use that hour. */
const SWITCH_TIME = 'T08:00:00Z';

export type DropState = 'upcoming' | 'live' | 'ended';

export interface DropInfo {
  state: DropState;
  /** Live for less than NEW_WINDOW_MS. */
  isNew: boolean;
  endingSoon: boolean;
  /** Ms until it goes live (upcoming only). */
  startsInMs: number | null;
  /** Ms until it ends. */
  endsInMs: number | null;
}

type Dated = Pick<BannerMeta, 'start' | 'end' | 'startAt' | 'endAt'>;

function instant(at: string | undefined, date: string | null | undefined): number | null {
  const ms = Date.parse(at ?? (date ? `${date}${SWITCH_TIME}` : ''));
  return Number.isNaN(ms) ? null : ms;
}

export function bannerWindow(b: Dated): { start: number | null; end: number | null } {
  return { start: instant(b.startAt, b.start), end: instant(b.endAt, b.end) };
}

export function dropInfo(b: Dated, now: number): DropInfo {
  const { start, end } = bannerWindow(b);
  if (start != null && now < start) {
    return { state: 'upcoming', isNew: false, endingSoon: false, startsInMs: start - now, endsInMs: end != null ? end - now : null };
  }
  if (end != null && now >= end) {
    return { state: 'ended', isNew: false, endingSoon: false, startsInMs: null, endsInMs: null };
  }
  const endsInMs = end != null ? end - now : null;
  return {
    state: 'live',
    isNew: start != null && now - start < NEW_WINDOW_MS,
    endingSoon: endsInMs != null && endsInMs <= SOON_WINDOW_MS,
    startsInMs: null,
    endsInMs,
  };
}

/** "2d 4h", "7h 52m", "12m 05s", "45s". */
export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const d = Math.floor(total / 86400);
  const h = Math.floor((total % 86400) / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m`;
  if (m > 0) return `${m}m ${String(s).padStart(2, '0')}s`;
  return `${s}s`;
}

/** Countdown to the minute, no seconds: "1d 14h 20m", "7h 05m", "12m". */
export function formatHM(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 60_000));
  const d = Math.floor(total / 1440);
  const h = Math.floor((total % 1440) / 60);
  const m = total % 60;
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m`;
  return m > 0 ? `${m}m` : '<1m';
}

export interface Announcement<T extends Dated> {
  banner: T;
  info: DropInfo;
}

/** Banners worth announcing: just dropped first (newest first), then upcoming (soonest first). */
export function announcements<T extends Dated>(banners: T[], now: number): Array<Announcement<T>> {
  const out = banners
    .map((banner) => ({ banner, info: dropInfo(banner, now) }))
    .filter(({ info }) => (info.state === 'live' && info.isNew) || (info.state === 'upcoming' && info.startsInMs! <= UPCOMING_WINDOW_MS));
  const rank = (a: Announcement<T>) => (a.info.state === 'live' ? 0 : 1);
  return out.sort((a, b) =>
    rank(a) - rank(b)
    || (a.info.state === 'live' ? (a.info.endsInMs ?? 0) - (b.info.endsInMs ?? 0) : a.info.startsInMs! - b.info.startsInMs!));
}

/** Whether an item can be bought right now. The sale window wins over the baked
 *  flag, so a banner archived early still reads live until its end instant, and a
 *  lapsed one reads expired without a redeploy. Banners without dates keep the flag. */
export function attainableNow(attainable: boolean, banner: Dated | undefined, now: number): boolean {
  if (!banner) return attainable;
  const { start, end } = bannerWindow(banner);
  if (start == null && end == null) return attainable;
  const { state } = dropInfo(banner, now);
  return state === 'live' ? true : state === 'ended' ? false : attainable;
}

/** Seen map: banner id → the state the visitor last saw it in, so going live re-announces it. */
export type SeenMap = Record<string, DropState>;
export const SEEN_KEY = 'classic-closet:drops-seen';

export function unseen<T extends Dated & { id: string }>(list: Array<Announcement<T>>, seen: SeenMap): Array<Announcement<T>> {
  return list.filter(({ banner, info }) => seen[banner.id] !== info.state);
}

export function loadSeen(): SeenMap {
  try {
    const raw = JSON.parse(localStorage.getItem(SEEN_KEY) ?? '{}');
    return raw && typeof raw === 'object' ? raw as SeenMap : {};
  } catch {
    return {};
  }
}

export function saveSeen(list: Array<Announcement<{ id: string } & Dated>>): void {
  try {
    const next = { ...loadSeen() };
    for (const { banner, info } of list) next[banner.id] = info.state;
    localStorage.setItem(SEEN_KEY, JSON.stringify(next));
  } catch {
    // Private mode / blocked storage: the modal just shows again next visit.
  }
}
