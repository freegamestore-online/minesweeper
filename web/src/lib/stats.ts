import type { Difficulty } from "./board";

/** Local stats, saved as one JSON object in localStorage. */
export const STATS_KEY = "minesweeper-stats";

export interface DifficultyStats {
  played: number;
  won: number;
  /** Fastest win in seconds, or null if none yet. */
  bestSeconds: number | null;
}

export interface DailyResult {
  /** Games started on this daily board. Only the first one goes to the leaderboard. */
  attempts: number;
  won: boolean;
  /** Time of the first win, or null. */
  seconds: number | null;
}

export interface Stats {
  modes: Partial<Record<Difficulty, DifficultyStats>>;
  /** Keyed by `dailyKey(date, difficulty)`. */
  daily: Record<string, DailyResult>;
}

const count = (v: unknown): number => (typeof v === "number" && Number.isInteger(v) && v >= 0 ? v : 0);
const seconds = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : null);

export const dailyKey = (date: string, difficulty: Difficulty) => `${date}:${difficulty}`;

/** Load saved stats. Missing or damaged data reads as empty, so it never breaks the page. */
export function loadStats(raw: string | null): Stats {
  const stats: Stats = { modes: {}, daily: {} };
  if (!raw) return stats;
  try {
    const parsed = JSON.parse(raw) as { modes?: Record<string, Record<string, unknown>>; daily?: Record<string, Record<string, unknown>> };
    for (const d of ["easy", "medium", "hard"] as Difficulty[]) {
      const m = parsed.modes?.[d];
      if (m && typeof m === "object") stats.modes[d] = { played: count(m.played), won: count(m.won), bestSeconds: seconds(m.bestSeconds) };
    }
    for (const [key, r] of Object.entries(parsed.daily ?? {})) {
      if (r && typeof r === "object") stats.daily[key] = { attempts: count(r.attempts), won: r.won === true, seconds: seconds(r.seconds) };
    }
  } catch {
    // Treat damaged JSON as no stats.
  }
  return stats;
}

export function modeStats(stats: Stats, difficulty: Difficulty): DifficultyStats {
  return stats.modes[difficulty] ?? { played: 0, won: 0, bestSeconds: null };
}

/** Win rate as a whole percentage. */
export function winRate({ played, won }: DifficultyStats): number {
  return played === 0 ? 0 : Math.round((won / played) * 100);
}

/** Count a game as played once its first cell is opened. */
export function recordStart(stats: Stats, difficulty: Difficulty): Stats {
  const m = modeStats(stats, difficulty);
  return { ...stats, modes: { ...stats.modes, [difficulty]: { ...m, played: m.played + 1 } } };
}

export function recordWin(stats: Stats, difficulty: Difficulty, time: number): Stats {
  const m = modeStats(stats, difficulty);
  const bestSeconds = m.bestSeconds === null ? time : Math.min(m.bestSeconds, time);
  return { ...stats, modes: { ...stats.modes, [difficulty]: { ...m, won: m.won + 1, bestSeconds } } };
}

export function dailyResult(stats: Stats, date: string, difficulty: Difficulty): DailyResult {
  return stats.daily[dailyKey(date, difficulty)] ?? { attempts: 0, won: false, seconds: null };
}

export function recordDailyStart(stats: Stats, date: string, difficulty: Difficulty): Stats {
  const r = dailyResult(stats, date, difficulty);
  return { ...stats, daily: { ...stats.daily, [dailyKey(date, difficulty)]: { ...r, attempts: r.attempts + 1 } } };
}

/** Keeps the first win's time: a replay of a learnt board doesn't replace it. */
export function recordDailyWin(stats: Stats, date: string, difficulty: Difficulty, time: number): Stats {
  const r = dailyResult(stats, date, difficulty);
  if (r.won) return stats;
  return { ...stats, daily: { ...stats.daily, [dailyKey(date, difficulty)]: { ...r, won: true, seconds: time } } };
}

/** Only the first attempt at a daily board, if it is won, goes to the daily leaderboard. */
export function isFirstDailyWin(result: DailyResult): boolean {
  return result.attempts === 1 && !result.won;
}
