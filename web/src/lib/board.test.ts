import { describe, expect, it } from "vitest";
import {
  DIFFICULTIES,
  MAX_CELL_PX,
  MIN_CELL_PX,
  BOARD_BORDER_PX,
  BOARD_PADDING_PX,
  boardLayout,
  chord,
  createEmptyGrid,
  hitMine,
  isWon,
  lossGrid,
  placeMines,
  revealCell,
  type Grid,
} from "./board";

/** A grid with mines at the given cells and correct neighbour counts. */
function gridWith(rows: number, cols: number, mines: [number, number][]): Grid {
  const mineKeys = new Set(mines.map(([r, c]) => `${r},${c}`));
  const grid = createEmptyGrid(rows, cols);
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) grid[r][c].mine = mineKeys.has(`${r},${c}`);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      let n = 0;
      for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
        if ((dr || dc) && grid[r + dr]?.[c + dc]?.mine) n++;
      }
      grid[r][c].adjacentMines = n;
    }
  }
  return grid;
}

const countMines = (grid: Grid) => grid.flat().filter((cell) => cell.mine).length;

describe("placeMines: first click is always safe", () => {
  for (const [name, { rows, cols, mines }] of Object.entries(DIFFICULTIES)) {
    it(`never puts a mine on or next to the first reveal (${name})`, () => {
      for (let trial = 0; trial < 200; trial++) {
        const row = trial % rows;
        const col = (trial * 7) % cols;
        const grid = placeMines(createEmptyGrid(rows, cols), mines, row, col);
        expect(countMines(grid)).toBe(mines);
        for (let dr = -1; dr <= 1; dr++) {
          for (let dc = -1; dc <= 1; dc++) {
            expect(grid[row + dr]?.[col + dc]?.mine ?? false).toBe(false);
          }
        }
        // The first reveal opens an area and never loses.
        const opened = revealCell(grid, row, col);
        expect(hitMine(opened)).toBe(false);
        expect(grid[row][col].adjacentMines).toBe(0);
      }
    });
  }

  it("places the same board for the same random source", () => {
    const seq = () => {
      let x = 0.123;
      return () => (x = (x * 9301 + 0.49297) % 1);
    };
    const a = placeMines(createEmptyGrid(16, 30), 99, 8, 15, seq());
    const b = placeMines(createEmptyGrid(16, 30), 99, 8, 15, seq());
    expect(a).toEqual(b);
  });

  it("keeps flags placed before the first reveal", () => {
    const grid = createEmptyGrid(9, 9);
    grid[0][0].flagged = true;
    expect(placeMines(grid, 10, 8, 8)[0][0].flagged).toBe(true);
  });
});

describe("revealCell", () => {
  it("floods through empty cells and stops at numbers and flags", () => {
    const grid = gridWith(3, 4, [[0, 3]]);
    grid[2][0].flagged = true;
    const next = revealCell(grid, 2, 1);
    expect(next[2][0].revealed).toBe(false);
    expect(next[0][2].revealed).toBe(true); // a number on the edge of the flood
    expect(next[0][3].revealed).toBe(false);
  });

  it("does not change the grid it was given", () => {
    const grid = gridWith(3, 3, [[0, 0]]);
    revealCell(grid, 2, 2);
    expect(grid[2][2].revealed).toBe(false);
  });
});

describe("win and loss", () => {
  it("is won once every safe cell is open, whatever the flags", () => {
    const grid = gridWith(2, 2, [[0, 0]]);
    expect(isWon(grid)).toBe(false);
    expect(isWon(revealCell(revealCell(revealCell(grid, 0, 1), 1, 0), 1, 1))).toBe(true);
  });

  it("marks the mine that went off, keeps correct flags and leaves wrong flags flagged", () => {
    const grid = gridWith(2, 3, [[0, 0], [0, 2]]);
    grid[0][2].flagged = true; // correct
    grid[1][1].flagged = true; // wrong
    const lost = lossGrid(revealCell(grid, 0, 0));
    expect(lost[0][0]).toMatchObject({ exploded: true, revealed: true });
    expect(lost[0][2]).toMatchObject({ flagged: true, revealed: false, exploded: false });
    expect(lost[1][1]).toMatchObject({ flagged: true, mine: false });
  });

  it("shows unflagged mines after a loss", () => {
    const grid = gridWith(1, 3, [[0, 0], [0, 2]]);
    const lost = lossGrid(revealCell(grid, 0, 0));
    expect(lost[0][2]).toMatchObject({ revealed: true, exploded: false });
  });
});

describe("boardLayout", () => {
  it("fits Easy on a phone", () => {
    const { cellPx, transpose } = boardLayout(390, 700, 9, 9);
    expect(cellPx * 9 + 8 + 20).toBeLessThanOrEqual(390);
    expect(transpose).toBe(false);
  });

  it("turns Hard on its side on an upright phone, so it fits the width", () => {
    const { cellPx, transpose } = boardLayout(390, 728, 16, 30);
    expect(transpose).toBe(true);
    expect(cellPx * 16 + 15 + 20).toBeLessThanOrEqual(390);
    expect(cellPx * 30 + 29 + 20).toBeLessThanOrEqual(728);
  });

  it("fits Hard in the 390x708 board area of a 390x844 phone, with no 1px overflow", () => {
    const { cellPx, transpose } = boardLayout(390, 708, 16, 30);
    expect(transpose).toBe(true);
    const chrome = 2 * BOARD_BORDER_PX + 2 * BOARD_PADDING_PX;
    expect(cellPx * 16 + 15 + chrome).toBeLessThanOrEqual(390);
    expect(cellPx * 30 + 29 + chrome).toBeLessThanOrEqual(708);
  });

  it("keeps Hard the right way up on a wide screen", () => {
    expect(boardLayout(1200, 700, 16, 30).transpose).toBe(false);
  });

  it("never goes below the tap size, so a tiny screen pans instead", () => {
    expect(boardLayout(320, 300, 16, 30).cellPx).toBe(MIN_CELL_PX);
  });

  it("caps the size on a large screen", () => {
    expect(boardLayout(2000, 2000, 9, 9).cellPx).toBe(MAX_CELL_PX);
  });
});

describe("chord", () => {
  // Mine at the top-left; the cell below-right of it shows 1.
  const setup = () => {
    const grid = gridWith(3, 3, [[0, 0]]);
    grid[1][1].revealed = true;
    return grid;
  };

  it("opens the other neighbours of a number whose mines are all flagged", () => {
    const grid = setup();
    grid[0][0].flagged = true;
    const next = chord(grid, 1, 1)!;
    expect(next).not.toBeNull();
    expect(hitMine(next)).toBe(false);
    expect(isWon(next)).toBe(true);
    expect(next[0][0]).toMatchObject({ flagged: true, revealed: false });
  });

  it("does nothing until the flags match the number", () => {
    expect(chord(setup(), 1, 1)).toBeNull();
    const twoFlags = setup();
    twoFlags[0][0].flagged = true;
    twoFlags[0][1].flagged = true;
    expect(chord(twoFlags, 1, 1)).toBeNull();
  });

  it("opens the mine when a flag is wrong, so the game is lost", () => {
    const grid = setup();
    grid[2][2].flagged = true; // wrong flag
    const next = chord(grid, 1, 1)!;
    expect(hitMine(next)).toBe(true);
  });

  it("does nothing on a hidden cell, an empty cell or a fully open neighbourhood", () => {
    const grid = setup();
    expect(chord(grid, 2, 2)).toBeNull();
    const open = gridWith(3, 3, []);
    open[1][1].revealed = true;
    expect(chord(open, 1, 1)).toBeNull();
  });
});
