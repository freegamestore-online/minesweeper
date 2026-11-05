import { describe, expect, it } from "vitest";
import { TIME_SCORE_BASE, leaderboardId, timeScore } from "./score";

describe("timeScore", () => {
  it("ranks a faster win above a slower one", () => {
    expect(timeScore(30)).toBeGreaterThan(timeScore(90));
  });

  it("is the base minus the seconds", () => {
    expect(timeScore(42)).toBe(TIME_SCORE_BASE - 42);
  });

  it("never goes below zero", () => {
    expect(timeScore(TIME_SCORE_BASE + 5)).toBe(0);
  });
});

describe("leaderboardId", () => {
  it("gives each difficulty its own board", () => {
    expect(new Set([leaderboardId("easy"), leaderboardId("medium"), leaderboardId("hard")]).size).toBe(3);
    expect(leaderboardId("hard")).toBe("minesweeper-hard");
  });
});
