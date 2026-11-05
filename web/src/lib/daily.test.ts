import { describe, expect, it } from "vitest";
import { DIFFICULTIES, hitMine, type Difficulty } from "./board";
import { dailyGrid, dailySeed, dateKey, hashSeed, seededRandom } from "./daily";

describe("dateKey", () => {
  it("uses the UTC date, so every time zone gets the same board", () => {
    expect(dateKey(new Date("2026-11-05T23:30:00-05:00"))).toBe("2026-11-06");
    expect(dateKey(new Date("2026-11-05T00:10:00+10:00"))).toBe("2026-11-04");
  });
});

describe("seededRandom", () => {
  it("repeats for the same seed and differs for another", () => {
    const a = seededRandom(hashSeed("x"));
    const b = seededRandom(hashSeed("x"));
    const c = seededRandom(hashSeed("y"));
    const seqA = [a(), a(), a()];
    expect([b(), b(), b()]).toEqual(seqA);
    expect([c(), c(), c()]).not.toEqual(seqA);
    for (const v of seqA) expect(v >= 0 && v < 1).toBe(true);
  });
});

describe("dailyGrid", () => {
  const difficulties = Object.keys(DIFFICULTIES) as Difficulty[];

  it("is the same board for the same date and difficulty", () => {
    for (const d of difficulties) expect(dailyGrid(d, "2026-11-05")).toEqual(dailyGrid(d, "2026-11-05"));
  });

  it("differs by date and by difficulty", () => {
    const mines = (d: Difficulty, date: string) =>
      dailyGrid(d, date).flatMap((row, r) => row.flatMap((cell, c) => (cell.mine ? [`${r},${c}`] : []))).join(" ");
    expect(mines("medium", "2026-11-05")).not.toBe(mines("medium", "2026-11-06"));
    expect(dailySeed("easy", "2026-11-05")).not.toBe(dailySeed("hard", "2026-11-05"));
  });

  it("has the right mine count and starts with a safe opening already revealed", () => {
    for (const d of difficulties) {
      for (const date of ["2026-01-01", "2026-06-15", "2026-11-05", "2027-02-28"]) {
        const grid = dailyGrid(d, date);
        expect(grid.flat().filter((cell) => cell.mine).length).toBe(DIFFICULTIES[d].mines);
        const open = grid.flat().filter((cell) => cell.revealed);
        expect(open.length).toBeGreaterThanOrEqual(9);
        expect(hitMine(grid)).toBe(false);
      }
    }
  });
});
