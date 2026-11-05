import type { Difficulty } from "./board";

/** Leaderboards rank higher scores first, so a time goes up as this base minus the seconds taken. */
export const TIME_SCORE_BASE = 100000;

/** The leaderboard score for a win in `seconds`: faster wins score higher. */
export function timeScore(seconds: number): number {
  return Math.max(0, TIME_SCORE_BASE - Math.max(0, Math.round(seconds)));
}

/** One board per difficulty, so Easy times are never ranked against Hard ones. */
export function leaderboardId(difficulty: Difficulty): string {
  return `minesweeper-${difficulty}`;
}
