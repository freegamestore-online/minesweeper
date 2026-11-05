import { DIFFICULTIES, createEmptyGrid, placeMines, revealCell, type Difficulty, type Grid } from "./board";

/** The calendar day in UTC, as `YYYY-MM-DD`. Every player gets the same daily board on the same UTC day. */
export function dateKey(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

/** FNV-1a, 32-bit: a small, stable hash of a seed string. */
export function hashSeed(seed: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** Mulberry32: a small seeded generator. Returns values in [0, 1), the same sequence for the same seed. */
export function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function dailySeed(difficulty: Difficulty, date: string): string {
  return `minesweeper:${difficulty}:${date}`;
}

/**
 * The daily board for a difficulty and UTC date. Mines and a safe starting cell come
 * from the seed, and the start is already opened, so everyone begins from the same
 * fair position. Computed on the client, no server.
 */
export function dailyGrid(difficulty: Difficulty, date: string): Grid {
  const { rows, cols, mines } = DIFFICULTIES[difficulty];
  const random = seededRandom(hashSeed(dailySeed(difficulty, date)));
  // Start away from the edges, so the opening is a real area rather than a corner.
  const row = 1 + Math.floor(random() * (rows - 2));
  const col = 1 + Math.floor(random() * (cols - 2));
  const grid = placeMines(createEmptyGrid(rows, cols), mines, row, col, random);
  return revealCell(grid, row, col);
}
