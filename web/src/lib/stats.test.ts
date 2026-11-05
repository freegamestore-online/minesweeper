import { describe, expect, it } from "vitest";
import {
  dailyResult,
  isFirstDailyWin,
  loadStats,
  modeStats,
  recordDailyStart,
  recordDailyWin,
  recordStart,
  recordWin,
  winRate,
} from "./stats";

describe("per-difficulty stats", () => {
  it("counts games, wins, win rate and the best time per difficulty", () => {
    let s = loadStats(null);
    s = recordStart(s, "easy");
    s = recordWin(s, "easy", 40);
    s = recordStart(s, "easy");
    s = recordWin(s, "easy", 25);
    s = recordStart(s, "easy");
    s = recordStart(s, "hard");
    expect(modeStats(s, "easy")).toEqual({ played: 3, won: 2, bestSeconds: 25 });
    expect(winRate(modeStats(s, "easy"))).toBe(67);
    expect(modeStats(s, "hard")).toEqual({ played: 1, won: 0, bestSeconds: null });
    expect(winRate(modeStats(s, "medium"))).toBe(0);
  });

  it("keeps the faster best time", () => {
    const s = recordWin(recordWin(loadStats(null), "medium", 30), "medium", 90);
    expect(modeStats(s, "medium").bestSeconds).toBe(30);
  });

  it("round-trips through JSON and ignores damaged data", () => {
    const s = recordWin(recordStart(loadStats(null), "hard"), "hard", 200);
    expect(loadStats(JSON.stringify(s))).toEqual(s);
    expect(loadStats("{not json")).toEqual({ modes: {}, daily: {} });
    expect(modeStats(loadStats('{"modes":{"easy":{"played":-3,"won":"x","bestSeconds":null}}}'), "easy")).toEqual({
      played: 0,
      won: 0,
      bestSeconds: null,
    });
  });
});

describe("daily results", () => {
  const date = "2026-11-05";

  it("ranks only a win on the first attempt", () => {
    let s = recordDailyStart(loadStats(null), date, "medium");
    expect(isFirstDailyWin(dailyResult(s, date, "medium"))).toBe(true);
    s = recordDailyStart(s, date, "medium"); // a retry after a loss
    expect(isFirstDailyWin(dailyResult(s, date, "medium"))).toBe(false);
  });

  it("keeps the first winning time", () => {
    let s = recordDailyWin(recordDailyStart(loadStats(null), date, "easy"), date, "easy", 50);
    s = recordDailyWin(recordDailyStart(s, date, "easy"), date, "easy", 20);
    expect(dailyResult(s, date, "easy")).toEqual({ attempts: 2, won: true, seconds: 50 });
    expect(isFirstDailyWin(dailyResult(s, date, "easy"))).toBe(false);
  });

  it("keeps difficulties and dates apart", () => {
    const s = recordDailyStart(loadStats(null), date, "easy");
    expect(dailyResult(s, date, "hard").attempts).toBe(0);
    expect(dailyResult(s, "2026-11-06", "easy").attempts).toBe(0);
  });
});
