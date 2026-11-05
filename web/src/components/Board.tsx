import { useRef, useState } from "react";
import { BOARD_BORDER_PX, type Cell, type Grid } from "../lib/board";

/** Mid-tone number colours that read on both the light and the dark panel. */
const NUMBER_COLORS: Record<number, string> = {
  1: "#3b82f6",
  2: "#16a34a",
  3: "#ef4444",
  4: "#8b5cf6",
  5: "#d97706",
  6: "#0891b2",
  7: "var(--ink)",
  8: "var(--muted)",
};

/** How far a finger can move before a touch counts as a pan rather than a tap. */
const TAP_SLOP_PX = 10;
const LONG_PRESS_MS = 450;

/** Arrow keys move the keyboard focus by one cell on the board as drawn. */
const ARROWS: Record<string, [number, number]> = {
  ArrowUp: [-1, 0],
  ArrowDown: [1, 0],
  ArrowLeft: [0, -1],
  ArrowRight: [0, 1],
};

/** What a cell shows, and how a screen reader names it. */
function cellFace(cell: Cell, lost: boolean): { text: string; label: string } {
  if (cell.exploded) return { text: "💥", label: "Exploded mine" };
  if (lost && cell.flagged && !cell.mine) return { text: "❌", label: "Wrong flag" };
  if (cell.flagged) return { text: "🚩", label: "Flag" };
  if (!cell.revealed) return { text: "", label: "Hidden" };
  if (cell.mine) return { text: "💣", label: "Mine" };
  if (cell.adjacentMines > 0) return { text: String(cell.adjacentMines), label: `${cell.adjacentMines} adjacent mines` };
  return { text: "", label: "Empty" };
}

interface TouchState {
  row: number;
  col: number;
  x: number;
  y: number;
  moved: boolean;
  longPressed: boolean;
  timer: ReturnType<typeof setTimeout> | null;
}

interface BoardProps {
  grid: Grid;
  cellPx: number;
  /** Draw the board turned on its side; play still uses the grid's own coordinates. */
  transpose: boolean;
  playing: boolean;
  lost: boolean;
  onReveal: (row: number, col: number) => void;
  onFlag: (row: number, col: number) => void;
}

/** The minefield: mouse, touch and keyboard input on a grid of cells. */
export function Board({ grid, cellPx, transpose, playing, lost, onReveal, onFlag }: BoardProps) {
  const rows = grid.length;
  const cols = grid[0].length;
  const viewRows = transpose ? cols : rows;
  const viewCols = transpose ? rows : cols;
  const touchRef = useRef<TouchState | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  /** The cell that takes keyboard focus (grid coordinates). Only it is in the tab order. */
  const [focusCell, setFocusCell] = useState<[number, number]>([0, 0]);

  const handleContextMenu = (e: React.MouseEvent, row: number, col: number) => {
    e.preventDefault();
    // On Android a long press also fires contextmenu. The long-press timer already flags it.
    if (touchRef.current) return;
    onFlag(row, col);
  };

  const clearTouch = () => {
    if (touchRef.current?.timer) clearTimeout(touchRef.current.timer);
    touchRef.current = null;
  };

  const handleTouchStart = (e: React.TouchEvent, row: number, col: number) => {
    clearTouch();
    const touch = e.touches[0];
    const state: TouchState = { row, col, x: touch.clientX, y: touch.clientY, moved: false, longPressed: false, timer: null };
    state.timer = setTimeout(() => {
      state.timer = null;
      state.longPressed = true;
      onFlag(row, col);
    }, LONG_PRESS_MS);
    touchRef.current = state;
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    const state = touchRef.current;
    if (!state || state.moved) return;
    const touch = e.touches[0];
    if (Math.hypot(touch.clientX - state.x, touch.clientY - state.y) > TAP_SLOP_PX) {
      // A drag is a pan, not a tap: neither flag nor reveal.
      state.moved = true;
      if (state.timer) clearTimeout(state.timer);
      state.timer = null;
    }
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    const state = touchRef.current;
    clearTouch();
    // Stop the browser's follow-up mouse click, so a tap acts once.
    e.preventDefault();
    if (state && !state.moved && !state.longPressed) onReveal(state.row, state.col);
  };

  /** Arrows move between cells; Enter or Space reveals (or chords), F flags. */
  const handleKeyDown = (e: React.KeyboardEvent, row: number, col: number) => {
    const step = ARROWS[e.key];
    if (step) {
      e.preventDefault();
      // Move on the board as drawn, which is turned when `transpose` is set.
      const [dr, dc] = transpose ? [step[1], step[0]] : step;
      const r = Math.min(rows - 1, Math.max(0, row + dr));
      const c = Math.min(cols - 1, Math.max(0, col + dc));
      setFocusCell([r, c]);
      gridRef.current?.querySelector<HTMLElement>(`[data-testid="cell-${r}-${c}"]`)?.focus();
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onReveal(row, col);
    } else if (e.key === "f" || e.key === "F") {
      e.preventDefault();
      onFlag(row, col);
    }
  };

  return (
    <div
      ref={gridRef}
      role="grid"
      aria-label={`${viewRows} by ${viewCols} minefield`}
      className="m-auto"
      style={{
        display: "inline-grid",
        gridTemplateColumns: `repeat(${viewCols}, ${cellPx}px)`,
        gridTemplateRows: `repeat(${viewRows}, ${cellPx}px)`,
        gap: "1px",
        background: "var(--line)",
        border: `${BOARD_BORDER_PX}px solid var(--line)`,
        borderRadius: "4px",
      }}
    >
      {Array.from({ length: viewRows }, (_, vr) => (
        <div key={vr} role="row" style={{ display: "contents" }}>
          {Array.from({ length: viewCols }, (_, vc) => {
            const r = transpose ? vc : vr;
            const c = transpose ? vr : vc;
            const cell = grid[r][c];
            const face = cellFace(cell, lost);
            return (
              <div
                key={`${r}-${c}`}
                role="gridcell"
                aria-label={face.label}
                data-testid={`cell-${r}-${c}`}
                tabIndex={r === focusCell[0] && c === focusCell[1] ? 0 : -1}
                onFocus={() => setFocusCell([r, c])}
                onKeyDown={(e) => handleKeyDown(e, r, c)}
                onClick={() => onReveal(r, c)}
                onContextMenu={(e) => handleContextMenu(e, r, c)}
                onTouchStart={(e) => handleTouchStart(e, r, c)}
                onTouchMove={handleTouchMove}
                onTouchEnd={handleTouchEnd}
                onTouchCancel={clearTouch}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: `${Math.round(cellPx * 0.55)}px`,
                  lineHeight: 1,
                  fontWeight: 700,
                  cursor: playing ? "pointer" : "default",
                  background: cell.exploded ? "var(--error)" : cell.revealed ? "var(--panel)" : "var(--muted)",
                  color: cell.revealed && !cell.mine ? NUMBER_COLORS[cell.adjacentMines] || "var(--ink)" : "var(--ink)",
                  transition: "background 0.1s",
                }}
              >
                {face.text}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
