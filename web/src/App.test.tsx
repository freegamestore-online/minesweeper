import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const submitted: [string, number][] = [];
const leaderboardIds: string[] = [];

vi.mock("@freegamestore/games", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@freegamestore/games")>();
  return {
    ...actual,
    useLeaderboard: (id: string) => {
      leaderboardIds.push(id);
      const submitScore = async (score: number) => {
        submitted.push([id, score]);
        return { ok: true };
      };
      return { topScores: [], recentScores: [], submitScore, loading: false, refresh: () => {} };
    },
  };
});

import App from "./App";
import { DIFFICULTIES, createEmptyGrid, placeMines, type Grid } from "./lib/board";
import { dailyGrid } from "./lib/daily";
import { TIME_SCORE_BASE } from "./lib/score";

const cell = (r: number, c: number) => screen.getByTestId(`cell-${r}-${c}`);
const at = (x: number, y: number) => ({ touches: [{ clientX: x, clientY: y }], changedTouches: [{ clientX: x, clientY: y }] });

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-05T12:00:00Z"));
  localStorage.clear();
  submitted.length = 0;
});

/** Click every safe hidden cell of a known board. */
function clearBoard(grid: Grid) {
  grid.forEach((row, r) => {
    row.forEach((c, col) => {
      if (!c.mine && cell(r, col).getAttribute("aria-label") === "Hidden") fireEvent.click(cell(r, col));
    });
  });
}


afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
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

describe("winning a random game", () => {
  it("submits the inverted time to the difficulty's board and records stats", () => {
    // Make the board predictable: the same sequence for the app and for this test.
    const sequence = () => {
      let x = 0.37;
      return () => (x = (x * 7919 + 0.1234) % 1);
    };
    const app = sequence();
    vi.spyOn(Math, "random").mockImplementation(app);
    render(<App />);
    fireEvent.click(cell(4, 4));
    act(() => vi.advanceTimersByTime(3000));
    const board = placeMines(createEmptyGrid(9, 9), DIFFICULTIES.easy.mines, 4, 4, sequence());
    clearBoard(board);
    expect(screen.getByRole("status")).toHaveTextContent("You win! 3s · New best");
    expect(submitted).toEqual([["minesweeper-easy", TIME_SCORE_BASE - 3]]);
    expect(screen.getByTestId("stats")).toHaveTextContent("Played 1 · Won 1 (100%) · Best 3s");
  });
});

describe("daily board", () => {
  it("is today's seeded board with its safe opening shown, and ranks only the first try", () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: /daily/i }));
    const board = dailyGrid("easy", "2026-11-05");
    board.forEach((row, r) => {
      row.forEach((c, col) => {
        expect(cell(r, col).getAttribute("aria-label") === "Hidden").toBe(!c.revealed);
      });
    });
    expect(screen.getByTestId("stats")).toHaveTextContent("Daily 2026-11-05 (UTC) · Not solved yet");

    act(() => vi.advanceTimersByTime(1000)); // the timer waits for the first move
    clearBoard(board);
    act(() => vi.advanceTimersByTime(0));
    expect(submitted).toEqual([["minesweeper-daily-easy", TIME_SCORE_BASE - 0]]);
    expect(screen.getByTestId("stats")).toHaveTextContent("Solved in 0s");

    // Playing it again doesn't post again.
    fireEvent.click(screen.getByRole("button", { name: "Play Again" }));
    clearBoard(board);
    expect(submitted).toHaveLength(1);
    expect(screen.getByTestId("stats")).toHaveTextContent("Only the first try is ranked");
  });
});

describe("chording in the app", () => {
  it("a tap on a satisfied number opens its neighbours", () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: /daily/i }));
    const board = dailyGrid("easy", "2026-11-05");
    // Find an opened number whose hidden neighbours include a mine and a safe cell.
    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        const n = board[r][c];
        if (!n.revealed || n.adjacentMines === 0) continue;
        const around: [number, number][] = [];
        for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
          if ((dr || dc) && board[r + dr]?.[c + dc] && !board[r + dr][c + dc].revealed) around.push([r + dr, c + dc]);
        }
        const mines = around.filter(([a, b]) => board[a][b].mine);
        const safe = around.filter(([a, b]) => !board[a][b].mine);
        if (mines.length !== n.adjacentMines || safe.length === 0) continue;
        for (const [a, b] of mines) fireEvent.contextMenu(cell(a, b));
        fireEvent.click(cell(r, c));
        for (const [a, b] of safe) expect(cell(a, b)).not.toHaveAttribute("aria-label", "Hidden");
        return;
      }
    }
    throw new Error("no chordable number on this daily board");
  });
});

describe("keyboard play", () => {
  it("has one cell in the tab order and moves focus with the arrow keys", () => {
    render(<App />);
    const tabbable = screen.getAllByRole("gridcell").filter((el) => el.tabIndex === 0);
    expect(tabbable).toEqual([cell(0, 0)]);
    cell(0, 0).focus();
    fireEvent.keyDown(cell(0, 0), { key: "ArrowRight" });
    fireEvent.keyDown(cell(0, 1), { key: "ArrowDown" });
    expect(document.activeElement).toBe(cell(1, 1));
    expect(cell(1, 1).tabIndex).toBe(0);
    expect(cell(0, 0).tabIndex).toBe(-1);
    // The edge stops the focus.
    fireEvent.keyDown(cell(1, 1), { key: "ArrowUp" });
    fireEvent.keyDown(cell(0, 1), { key: "ArrowUp" });
    expect(document.activeElement).toBe(cell(0, 1));
  });

  it("flags with F and reveals with Enter or Space", () => {
    render(<App />);
    fireEvent.keyDown(cell(0, 0), { key: "f" });
    expect(cell(0, 0)).toHaveAttribute("aria-label", "Flag");
    fireEvent.keyDown(cell(0, 0), { key: "F" });
    expect(cell(0, 0)).toHaveAttribute("aria-label", "Hidden");
    fireEvent.keyDown(cell(4, 4), { key: " " });
    expect(cell(4, 4)).not.toHaveAttribute("aria-label", "Hidden");
  });

  it("reveals with Enter", () => {
    render(<App />);
    fireEvent.keyDown(cell(4, 4), { key: "Enter" });
    expect(cell(4, 4)).not.toHaveAttribute("aria-label", "Hidden");
  });

  it("puts the cells in rows, as a grid needs", () => {
    render(<App />);
    const rows = screen.getAllByRole("row");
    expect(rows).toHaveLength(9);
    expect(rows[0].querySelectorAll("[role=gridcell]")).toHaveLength(9);
  });
});

describe("storage", () => {
  it("still plays when localStorage is blocked", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new DOMException("blocked", "SecurityError");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("blocked", "SecurityError");
    });
    render(<App />);
    fireEvent.click(cell(4, 4));
    expect(cell(4, 4)).not.toHaveAttribute("aria-label", "Hidden");
  });
});
