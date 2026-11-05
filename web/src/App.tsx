import { useState, useCallback, useRef, useEffect } from "react";
import { GameShell, GameTopbar, GameAuth, useGameSounds } from "@freegamestore/games";
import { useLeaderboard } from '@freegamestore/games';
import {
  DIFFICULTIES,
  boardLayout,
  createEmptyGrid,
  hitMine,
  isWon,
  lossGrid,
  placeMines,
  revealCell,
  winGrid,
  type Cell,
  type Difficulty,
  type Grid,
} from "./lib/board";
import { leaderboardId, timeScore } from "./lib/score";

type SoundsApi = ReturnType<typeof useGameSounds>;

function AudioBridge({ apiRef }: { apiRef: React.MutableRefObject<SoundsApi | null> }) {
  const sounds = useGameSounds();
  apiRef.current = sounds;
  return null;
}

type GameState = "playing" | "won" | "lost";

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

export default function App() {
  const [difficulty, setDifficulty] = useState<Difficulty>("easy");
  const [grid, setGrid] = useState<Grid>(() =>
    createEmptyGrid(DIFFICULTIES.easy.rows, DIFFICULTIES.easy.cols)
  );
  const [gameState, setGameState] = useState<GameState>("playing");
  const [firstClick, setFirstClick] = useState(true);
  const [time, setTime] = useState(0);
  const [timerRunning, setTimerRunning] = useState(false);
  const [area, setArea] = useState({ width: 0, height: 0 });
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const touchRef = useRef<TouchState | null>(null);
  const boardAreaRef = useRef<HTMLDivElement>(null);
  const { submitScore } = useLeaderboard(leaderboardId(difficulty));
  const submittedRef = useRef(false);
  const audioRef = useRef<SoundsApi | null>(null);

  const config = DIFFICULTIES[difficulty];
  const { cellPx, transpose } = boardLayout(area.width, area.height, config.rows, config.cols);
  // A turned board is drawn column by column; play still uses the grid's own coordinates.
  const viewRows = transpose ? config.cols : config.rows;
  const viewCols = transpose ? config.rows : config.cols;

  const flagCount = grid.reduce(
    (acc, row) => acc + row.reduce((a, cell) => a + (cell.flagged ? 1 : 0), 0),
    0
  );

  useEffect(() => {
    const el = boardAreaRef.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => {
      setArea({ width: entry.contentRect.width, height: entry.contentRect.height });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (timerRunning) {
      timerRef.current = setInterval(() => {
        setTime((t) => t + 1);
      }, 1000);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [timerRunning]);

  // Submit time on win. The board ranks higher scores first, so the time is inverted.
  useEffect(() => {
    if (gameState === "won" && !submittedRef.current) {
      submittedRef.current = true;
      submitScore(timeScore(time));
    }
    if (gameState === "playing") {
      submittedRef.current = false;
    }
  }, [gameState, time, submitScore]);

  const resetGame = useCallback(
    (diff?: Difficulty) => {
      const d = diff || difficulty;
      const c = DIFFICULTIES[d];
      setGrid(createEmptyGrid(c.rows, c.cols));
      setGameState("playing");
      setFirstClick(true);
      setTime(0);
      setTimerRunning(false);
      if (timerRef.current) clearInterval(timerRef.current);
    },
    [difficulty]
  );

  /** Show the result of a reveal: a loss, a win, or the opened cells. */
  const settle = useCallback((next: Grid) => {
    if (hitMine(next)) {
      setGrid(lossGrid(next));
      setGameState("lost");
      setTimerRunning(false);
      audioRef.current?.playError();
      navigator.vibrate?.([60, 80, 120]);
      return;
    }
    audioRef.current?.playTick();
    if (isWon(next)) {
      setGrid(winGrid(next));
      setGameState("won");
      setTimerRunning(false);
      audioRef.current?.playLevelUp();
      return;
    }
    setGrid(next);
  }, []);

  const handleReveal = useCallback(
    (row: number, col: number) => {
      if (gameState !== "playing") return;
      const cell = grid[row][col];
      if (cell.flagged || cell.revealed) return;

      let currentGrid = grid;
      if (firstClick) {
        currentGrid = placeMines(grid, config.mines, row, col);
        setFirstClick(false);
        setTimerRunning(true);
      }
      settle(revealCell(currentGrid, row, col));
    },
    [grid, gameState, firstClick, config, settle]
  );

  const handleFlag = useCallback(
    (row: number, col: number) => {
      if (gameState !== "playing") return;
      const cell = grid[row][col];
      if (cell.revealed) return;
      const newGrid = grid.map((r) => r.map((c) => ({ ...c })));
      newGrid[row][col].flagged = !newGrid[row][col].flagged;
      setGrid(newGrid);
      audioRef.current?.playMove();
      navigator.vibrate?.(15);
    },
    [grid, gameState]
  );

  const handleContextMenu = useCallback(
    (e: React.MouseEvent, row: number, col: number) => {
      e.preventDefault();
      // On Android a long press also fires contextmenu. The long-press timer already flags it.
      if (touchRef.current) return;
      handleFlag(row, col);
    },
    [handleFlag]
  );

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
      handleFlag(row, col);
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
    if (state && !state.moved && !state.longPressed) handleReveal(state.row, state.col);
  };

  const changeDifficulty = (d: Difficulty) => {
    setDifficulty(d);
    resetGame(d);
  };

  const statusLabel =
    gameState === "won" ? `You win! ${time}s` : gameState === "lost" ? "Boom! Game over" : "";

  return (
    <GameShell
      topbar={
        <GameTopbar
          title="Minesweeper"
          stats={[
            { label: "Mines", value: config.mines - flagCount },
            { label: "Time", value: `${time}s` },
          ]}
          rules={
            <div>
              <h3 style={{marginBottom:'0.5rem',fontWeight:700}}>Minesweeper</h3>
              <p>Clear the board without hitting a mine.</p>
              <h4 style={{marginTop:'0.75rem',fontWeight:600}}>Controls</h4>
              <ul style={{paddingLeft:'1.2rem',marginTop:'0.25rem'}}>
                <li>Click or tap to reveal a cell</li>
                <li>Right click or long press to flag</li>
                <li>Drag to move around a large board</li>
              </ul>
              <h4 style={{marginTop:'0.75rem',fontWeight:600}}>Rules</h4>
              <ul style={{paddingLeft:'1.2rem',marginTop:'0.25rem'}}>
                <li>Numbers show adjacent mines</li>
                <li>Your first reveal is never a mine</li>
                <li>Reveal all non-mine cells to win</li>
                <li>Three difficulties: Easy, Medium, Hard</li>
              </ul>
            </div>
          }
          actions={<GameAuth />}
        />
      }
    >
      <AudioBridge apiRef={audioRef} />
      <div className="flex flex-col w-full h-full">
        <div className="flex flex-wrap items-center gap-2 px-3 pt-3 pb-2">
          {(["easy", "medium", "hard"] as Difficulty[]).map((d) => (
            <button
              key={d}
              onClick={() => changeDifficulty(d)}
              aria-pressed={difficulty === d}
              className="rounded-md px-3 min-h-[2.75rem] capitalize"
              style={{
                border: "1px solid var(--line)",
                background: difficulty === d ? "var(--accent)" : "var(--panel)",
                color: difficulty === d ? "#fff" : "var(--ink)",
                fontWeight: difficulty === d ? 600 : 400,
              }}
            >
              {d}
            </button>
          ))}
          {statusLabel && (
            <>
              <span
                role="status"
                className="font-semibold"
                style={{ color: gameState === "won" ? "var(--success)" : "var(--error)" }}
              >
                {statusLabel}
              </span>
              <button
                onClick={() => resetGame()}
                className="rounded-md px-4 min-h-[2.75rem] font-semibold"
                style={{ border: "1px solid var(--line)", background: "var(--accent)", color: "#fff" }}
              >
                Play Again
              </button>
            </>
          )}
        </div>

        {/* The board area pans when the board is wider or taller than the screen. */}
        <div
          ref={boardAreaRef}
          data-testid="board-area"
          className="flex-1 min-h-0 overflow-auto"
          style={{ touchAction: "pan-x pan-y" }}
        >
          <div className="flex w-max min-w-full min-h-full p-2">
            <div
              role="grid"
              aria-label={`${viewRows} by ${viewCols} minefield`}
              className="m-auto"
              style={{
                display: "inline-grid",
                gridTemplateColumns: `repeat(${viewCols}, ${cellPx}px)`,
                gridTemplateRows: `repeat(${viewRows}, ${cellPx}px)`,
                gap: "1px",
                background: "var(--line)",
                border: "2px solid var(--line)",
                borderRadius: "4px",
              }}
            >
              {Array.from({ length: viewRows }, (_, vr) =>
                Array.from({ length: viewCols }, (_, vc) => {
                  const r = transpose ? vc : vr;
                  const c = transpose ? vr : vc;
                  const cell = grid[r][c];
                  const face = cellFace(cell, gameState === "lost");
                  return (
                    <div
                      key={`${r}-${c}`}
                      role="gridcell"
                      aria-label={face.label}
                      data-testid={`cell-${r}-${c}`}
                      onClick={() => handleReveal(r, c)}
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
                        cursor: gameState === "playing" ? "pointer" : "default",
                        background: cell.exploded
                          ? "var(--error)"
                          : cell.revealed
                            ? "var(--panel)"
                            : "var(--muted)",
                        color: cell.revealed && !cell.mine
                          ? NUMBER_COLORS[cell.adjacentMines] || "var(--ink)"
                          : "var(--ink)",
                        transition: "background 0.1s",
                      }}
                    >
                      {face.text}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </div>
    </GameShell>
  );
}
