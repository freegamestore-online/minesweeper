export type Difficulty = "easy" | "medium" | "hard";

export interface DifficultyConfig {
  rows: number;
  cols: number;
  mines: number;
}

export const DIFFICULTIES: Record<Difficulty, DifficultyConfig> = {
  easy: { rows: 9, cols: 9, mines: 10 },
  medium: { rows: 16, cols: 16, mines: 40 },
  hard: { rows: 16, cols: 30, mines: 99 },
};

export interface Cell {
  mine: boolean;
  revealed: boolean;
  flagged: boolean;
  adjacentMines: number;
  /** The mine the player set off. Only set when the game is lost. */
  exploded: boolean;
}

export type Grid = Cell[][];

export function createEmptyGrid(rows: number, cols: number): Grid {
  return Array.from({ length: rows }, () =>
    Array.from({ length: cols }, () => ({
      mine: false,
      revealed: false,
      flagged: false,
      adjacentMines: 0,
      exploded: false,
    }))
  );
}

/** The in-bounds neighbours of a cell, not counting the cell itself. */
export function neighbours(rows: number, cols: number, row: number, col: number): [number, number][] {
  const result: [number, number][] = [];
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      if (dr === 0 && dc === 0) continue;
      const r = row + dr;
      const c = col + dc;
      if (r >= 0 && r < rows && c >= 0 && c < cols) result.push([r, c]);
    }
  }
  return result;
}

/**
 * Place mines anywhere except the safe cell and its neighbours, so the first reveal
 * always opens an area. `random` returns values in [0, 1); a seeded one gives the
 * same board every time.
 */
export function placeMines(
  grid: Grid,
  mines: number,
  safeRow: number,
  safeCol: number,
  random: () => number = Math.random
): Grid {
  const rows = grid.length;
  const cols = grid[0].length;
  const newGrid = grid.map((row) => row.map((cell) => ({ ...cell })));
  const candidates: [number, number][] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (Math.abs(r - safeRow) > 1 || Math.abs(c - safeCol) > 1) candidates.push([r, c]);
    }
  }
  // Partial Fisher-Yates: the first `mines` candidates become mines.
  for (let i = 0; i < mines; i++) {
    const j = i + Math.floor(random() * (candidates.length - i));
    [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
    const [r, c] = candidates[i];
    newGrid[r][c].mine = true;
  }
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      newGrid[r][c].adjacentMines = neighbours(rows, cols, r, c).filter(([nr, nc]) => newGrid[nr][nc].mine).length;
    }
  }
  return newGrid;
}

/** Reveal a cell, flooding outwards through cells with no adjacent mines. Flagged cells stay shut. */
export function revealCell(grid: Grid, row: number, col: number): Grid {
  const rows = grid.length;
  const cols = grid[0].length;
  const newGrid = grid.map((r) => r.map((c) => ({ ...c })));
  const stack: [number, number][] = [[row, col]];
  while (stack.length > 0) {
    const [r, c] = stack.pop()!;
    const cell = newGrid[r][c];
    if (cell.revealed || cell.flagged) continue;
    cell.revealed = true;
    if (cell.adjacentMines === 0 && !cell.mine) stack.push(...neighbours(rows, cols, r, c));
  }
  return newGrid;
}

export function hitMine(grid: Grid): boolean {
  return grid.some((row) => row.some((cell) => cell.mine && cell.revealed));
}

export function isWon(grid: Grid): boolean {
  return grid.every((row) => row.every((cell) => cell.mine || cell.revealed));
}

/**
 * The board shown after a loss: the mines the player opened are marked as exploded,
 * the other unflagged mines are shown, and flags stay put so wrong ones can be marked.
 */
export function lossGrid(grid: Grid): Grid {
  return grid.map((row) =>
    row.map((cell) =>
      cell.mine
        ? { ...cell, exploded: cell.revealed, revealed: cell.revealed || !cell.flagged }
        : cell
    )
  );
}

/** Put a flag on a hidden cell, or take it off. */
export function toggleFlag(grid: Grid, row: number, col: number): Grid {
  return grid.map((cells, r) => cells.map((cell, c) => (r === row && c === col ? { ...cell, flagged: !cell.flagged } : cell)));
}

export function countFlags(grid: Grid): number {
  return grid.reduce((n, row) => n + row.filter((cell) => cell.flagged).length, 0);
}

/** On a win every mine is flagged, so the counter reads zero. */
export function winGrid(grid: Grid): Grid {
  return grid.map((row) => row.map((cell) => (cell.mine ? { ...cell, flagged: true } : cell)));
}

/** Smallest cell that is still easy to tap. A board that needs smaller cells pans instead. */
export const MIN_CELL_PX = 22;
export const MAX_CELL_PX = 40;

/** Space kept clear around the board inside its scrolling area. */
export const BOARD_PADDING_PX = 4;
/** The board's border width. */
export const BOARD_BORDER_PX = 2;

/** The largest whole-pixel cell that fits, allowing for the 1px gaps, the border and the padding on each side. */
function rawFit(width: number, height: number, rows: number, cols: number): number {
  const chrome = 2 * BOARD_BORDER_PX + 2 * BOARD_PADDING_PX;
  return Math.floor(Math.min((width - chrome - (cols - 1)) / cols, (height - chrome - (rows - 1)) / rows));
}

/**
 * How to draw a board in a `width` by `height` area. A wide board on a tall screen
 * (Hard on a phone held upright) is drawn on its side when that gives bigger cells;
 * the board is the same, only turned. Cells never go below MIN_CELL_PX: the area pans instead.
 */
export function boardLayout(width: number, height: number, rows: number, cols: number): { cellPx: number; transpose: boolean } {
  const upright = rawFit(width, height, rows, cols);
  const turned = rawFit(width, height, cols, rows);
  const transpose = turned > upright;
  const fit = transpose ? turned : upright;
  return { cellPx: Math.min(MAX_CELL_PX, Math.max(MIN_CELL_PX, fit)), transpose };
}

/**
 * Chording: on a revealed number with exactly that many flags around it, open every
 * other hidden neighbour. Returns null when the cell can't be chorded. A wrong flag
 * means a mine is opened, which loses the game as usual.
 */
export function chord(grid: Grid, row: number, col: number): Grid | null {
  const cell = grid[row][col];
  if (!cell.revealed || cell.mine || cell.adjacentMines === 0) return null;
  const around = neighbours(grid.length, grid[0].length, row, col);
  const flags = around.filter(([r, c]) => grid[r][c].flagged).length;
  const hidden = around.filter(([r, c]) => !grid[r][c].flagged && !grid[r][c].revealed);
  if (flags !== cell.adjacentMines || hidden.length === 0) return null;
  return hidden.reduce((next, [r, c]) => revealCell(next, r, c), grid);
}
