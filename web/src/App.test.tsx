import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const submitScore = vi.fn(() => Promise.resolve({ ok: true }));
const leaderboardIds: string[] = [];

vi.mock("@freegamestore/games", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@freegamestore/games")>();
  return {
    ...actual,
    useLeaderboard: (id: string) => {
      leaderboardIds.push(id);
      return { topScores: [], recentScores: [], submitScore, loading: false, refresh: () => {} };
    },
  };
});

import App from "./App";

const cell = (r: number, c: number) => screen.getByTestId(`cell-${r}-${c}`);
const at = (x: number, y: number) => ({ touches: [{ clientX: x, clientY: y }], changedTouches: [{ clientX: x, clientY: y }] });

beforeEach(() => {
  vi.useFakeTimers();
  localStorage.clear();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("touch input", () => {
  it("reveals on a tap", () => {
    render(<App />);
    fireEvent.touchStart(cell(4, 4), at(100, 100));
    fireEvent.touchEnd(cell(4, 4), at(100, 100));
    expect(cell(4, 4)).not.toHaveAttribute("aria-label", "Hidden");
  });

  it("does not reveal when the finger drags (a pan)", () => {
    render(<App />);
    fireEvent.touchStart(cell(4, 4), at(100, 100));
    fireEvent.touchMove(cell(4, 4), at(100, 140));
    fireEvent.touchEnd(cell(4, 4), at(100, 140));
    expect(screen.getAllByRole("gridcell").every((el) => el.getAttribute("aria-label") === "Hidden")).toBe(true);
  });

  it("flags on a long press, once even if the browser also fires contextmenu", () => {
    render(<App />);
    fireEvent.touchStart(cell(0, 0), at(10, 10));
    fireEvent.contextMenu(cell(0, 0));
    act(() => vi.advanceTimersByTime(600));
    fireEvent.touchEnd(cell(0, 0), at(10, 10));
    expect(cell(0, 0)).toHaveAttribute("aria-label", "Flag");
  });

  it("flags with a right click on desktop", () => {
    render(<App />);
    fireEvent.contextMenu(cell(0, 0));
    expect(cell(0, 0)).toHaveAttribute("aria-label", "Flag");
  });
});

describe("leaderboard", () => {
  it("uses one board per difficulty", () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "hard" }));
    expect(leaderboardIds).toContain("minesweeper-easy");
    expect(leaderboardIds).toContain("minesweeper-hard");
    expect(leaderboardIds).not.toContain("minesweeper");
  });
});
