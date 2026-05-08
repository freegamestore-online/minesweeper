import { useState, useCallback, useRef, useEffect } from "react";
import { GameShell, GameTopbar, GameAuth } from "@freegamestore/games";
import { useLeaderboard } from "./hooks/useLeaderboard";

type Difficulty = "easy" | "medium" | "hard";

interface DifficultyConfig {
  rows: number;
  cols: number;
  mines: number;
}

const DIFFICULTIES: Record<Difficulty, DifficultyConfig> = {
  easy: { rows: 9, cols: 9, mines: 10 },
  medium: { rows: 16, cols: 16, mines: 40 },
  hard: { rows: 16, cols: 30, mines: 99 },
};

interface Cell {
  mine: boolean;
  revealed: boolean;
  flagged: boolean;
  adjacentMines: number;
}

type GameState = "playing" | "won" | "lost";

const NUMBER_COLORS: Record<number, string> = {
  1: "#2563eb",
  2: "#16a34a",
  3: "#dc2626",
  4: "#7c3aed",
  5: "#92400e",
  6: "#0891b2",
  7: "#000000",
  8: "#6b7280",
};

function createEmptyGrid(rows: number, cols: number): Cell[][] {
  return Array.from({ length: rows }, () =>
    Array.from({ length: cols }, () => ({
      mine: false,
      revealed: false,
      flagged: false,
      adjacentMines: 0,
    }))
  );
}

function placeMines(
  grid: Cell[][],
  rows: number,
  cols: number,
  mines: number,
  safeRow: number,
  safeCol: number
): Cell[][] {
  const newGrid = grid.map((row) => row.map((cell) => ({ ...cell })));
  let placed = 0;
  while (placed < mines) {
    const r = Math.floor(Math.random() * rows);
    const c = Math.floor(Math.random() * cols);
    if (
      !newGrid[r][c].mine &&
      !(Math.abs(r - safeRow) <= 1 && Math.abs(c - safeCol) <= 1)
    ) {
      newGrid[r][c].mine = true;
      placed++;
    }
  }
  // Calculate adjacent mines
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (newGrid[r][c].mine) continue;
      let count = 0;
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          const nr = r + dr;
          const nc = c + dc;
          if (nr >= 0 && nr < rows && nc >= 0 && nc < cols && newGrid[nr][nc].mine) {
            count++;
          }
        }
      }
      newGrid[r][c].adjacentMines = count;
    }
  }
  return newGrid;
}

function revealCell(
  grid: Cell[][],
  rows: number,
  cols: number,
  row: number,
  col: number
): Cell[][] {
  const newGrid = grid.map((r) => r.map((c) => ({ ...c })));
  const stack: [number, number][] = [[row, col]];
  while (stack.length > 0) {
    const [r, c] = stack.pop()!;
    if (r < 0 || r >= rows || c < 0 || c >= cols) continue;
    if (newGrid[r][c].revealed || newGrid[r][c].flagged) continue;
    newGrid[r][c].revealed = true;
    if (newGrid[r][c].adjacentMines === 0 && !newGrid[r][c].mine) {
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          if (dr === 0 && dc === 0) continue;
          stack.push([r + dr, c + dc]);
        }
      }
    }
  }
  return newGrid;
}

export default function App() {
  const [difficulty, setDifficulty] = useState<Difficulty>("easy");
  const [grid, setGrid] = useState<Cell[][]>(() =>
    createEmptyGrid(DIFFICULTIES.easy.rows, DIFFICULTIES.easy.cols)
  );
  const [gameState, setGameState] = useState<GameState>("playing");
  const [firstClick, setFirstClick] = useState(true);
  const [time, setTime] = useState(0);
  const [timerRunning, setTimerRunning] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const longPressRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressTriggered = useRef(false);
  const { submitScore } = useLeaderboard("minesweeper");
  const submittedRef = useRef(false);

  const config = DIFFICULTIES[difficulty];

  const flagCount = grid.reduce(
    (acc, row) => acc + row.reduce((a, cell) => a + (cell.flagged ? 1 : 0), 0),
    0
  );

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

  // Submit time on win
  useEffect(() => {
    if (gameState === "won" && !submittedRef.current) {
      submittedRef.current = true;
      submitScore(time);
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

  const checkWin = useCallback(
    (g: Cell[][]) => {
      for (let r = 0; r < config.rows; r++) {
        for (let c = 0; c < config.cols; c++) {
          if (!g[r][c].mine && !g[r][c].revealed) return false;
        }
      }
      return true;
    },
    [config]
  );

  const handleReveal = useCallback(
    (row: number, col: number) => {
      if (gameState !== "playing") return;
      const cell = grid[row][col];
      if (cell.flagged || cell.revealed) return;

      let currentGrid = grid;
      if (firstClick) {
        currentGrid = placeMines(grid, config.rows, config.cols, config.mines, row, col);
        setFirstClick(false);
        setTimerRunning(true);
      }

      if (currentGrid[row][col].mine) {
        // Reveal all mines
        const lostGrid = currentGrid.map((r) =>
          r.map((c) => (c.mine ? { ...c, revealed: true } : c))
        );
        setGrid(lostGrid);
        setGameState("lost");
        setTimerRunning(false);
        return;
      }

      const newGrid = revealCell(currentGrid, config.rows, config.cols, row, col);
      setGrid(newGrid);
      if (checkWin(newGrid)) {
        setGameState("won");
        setTimerRunning(false);
      }
    },
    [grid, gameState, firstClick, config, checkWin]
  );

  const handleFlag = useCallback(
    (row: number, col: number) => {
      if (gameState !== "playing") return;
      const cell = grid[row][col];
      if (cell.revealed) return;
      const newGrid = grid.map((r) => r.map((c) => ({ ...c })));
      newGrid[row][col].flagged = !newGrid[row][col].flagged;
      setGrid(newGrid);
    },
    [grid, gameState]
  );

  const handleContextMenu = useCallback(
    (e: React.MouseEvent, row: number, col: number) => {
      e.preventDefault();
      handleFlag(row, col);
    },
    [handleFlag]
  );

  const handleTouchStart = useCallback(
    (row: number, col: number) => {
      longPressTriggered.current = false;
      longPressRef.current = setTimeout(() => {
        longPressTriggered.current = true;
        handleFlag(row, col);
      }, 500);
    },
    [handleFlag]
  );

  const handleTouchEnd = useCallback(
    (row: number, col: number) => {
      if (longPressRef.current) {
        clearTimeout(longPressRef.current);
        longPressRef.current = null;
      }
      if (!longPressTriggered.current) {
        handleReveal(row, col);
      }
    },
    [handleReveal]
  );

  const handleTouchMove = useCallback(() => {
    if (longPressRef.current) {
      clearTimeout(longPressRef.current);
      longPressRef.current = null;
    }
  }, []);

  const changeDifficulty = (d: Difficulty) => {
    setDifficulty(d);
    resetGame(d);
  };

  const cellSize = difficulty === "hard" ? "clamp(18px, 4vw, 28px)" : "clamp(24px, 6vw, 36px)";

  const statusLabel =
    gameState === "won" ? "You Win!" : gameState === "lost" ? "Game Over" : "";

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
                <li>Left click to reveal a cell</li>
                <li>Right click or long press to flag</li>
              </ul>
              <h4 style={{marginTop:'0.75rem',fontWeight:600}}>Rules</h4>
              <ul style={{paddingLeft:'1.2rem',marginTop:'0.25rem'}}>
                <li>Numbers show adjacent mines</li>
                <li>Reveal all non-mine cells to win</li>
                <li>Three difficulties: Easy, Medium, Hard</li>
              </ul>
            </div>
          }
          actions={<><button className="min-h-[2.75rem] min-w-[2.75rem]" onClick={() => resetGame()}>New Game</button><GameAuth /></>}
        />
      }
    >
      <div className="relative w-full h-full" style={{ overflowY: "auto" }}>
        <div style={{ maxWidth: "100%", padding: "0.75rem" }}>
          {/* Difficulty Selector */}
          <div style={{ display: "flex", gap: "0.5rem", marginBottom: "0.75rem", flexWrap: "wrap" }}>
            {(["easy", "medium", "hard"] as Difficulty[]).map((d) => (
              <button
                key={d}
                onClick={() => changeDifficulty(d)}
                style={{
                  padding: "0.4rem 0.8rem",
                  minHeight: "2.75rem",
                  borderRadius: "6px",
                  border: "1px solid var(--line)",
                  background: difficulty === d ? "var(--accent)" : "var(--panel)",
                  color: difficulty === d ? "#fff" : "var(--ink)",
                  cursor: "pointer",
                  fontWeight: difficulty === d ? 600 : 400,
                  textTransform: "capitalize",
                }}
              >
                {d}
              </button>
            ))}
          </div>

          {/* Status + Reset */}
          {statusLabel && (
            <div style={{ textAlign: "center", marginBottom: "0.75rem" }}>
              <span
                style={{
                  fontWeight: 600,
                  color: gameState === "won" ? "var(--success)" : "var(--error)",
                }}
              >
                {statusLabel}
              </span>
              <div style={{ marginTop: "0.5rem" }}>
                <button
                  onClick={() => resetGame()}
                  style={{
                    padding: "0.4rem 1rem",
                    minHeight: "2.75rem",
                    borderRadius: "6px",
                    border: "1px solid var(--line)",
                    background: "var(--accent)",
                    color: "#fff",
                    cursor: "pointer",
                    fontWeight: 600,
                  }}
                >
                  Play Again
                </button>
              </div>
            </div>
          )}

          {/* Grid */}
          <div
            style={{
              display: "inline-grid",
              gridTemplateColumns: `repeat(${config.cols}, ${cellSize})`,
              gridTemplateRows: `repeat(${config.rows}, ${cellSize})`,
              gap: "1px",
              background: "var(--line)",
              border: "2px solid var(--line)",
              borderRadius: "4px",
              userSelect: "none",
              touchAction: "manipulation",
            }}
          >
            {grid.map((row, r) =>
              row.map((cell, c) => (
                <div
                  key={`${r}-${c}`}
                  onClick={() => {
                    if (!cell.flagged) handleReveal(r, c);
                  }}
                  onContextMenu={(e) => handleContextMenu(e, r, c)}
                  onTouchStart={(e) => {
                    e.preventDefault();
                    handleTouchStart(r, c);
                  }}
                  onTouchEnd={(e) => {
                    e.preventDefault();
                    handleTouchEnd(r, c);
                  }}
                  onTouchMove={handleTouchMove}
                  style={{
                    width: cellSize,
                    height: cellSize,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: difficulty === "hard" ? "clamp(10px, 2.5vw, 14px)" : "clamp(12px, 3vw, 16px)",
                    fontWeight: 700,
                    cursor: gameState === "playing" ? "pointer" : "default",
                    background: cell.revealed
                      ? cell.mine
                        ? "var(--error)"
                        : "var(--panel)"
                      : "var(--muted)",
                    color: cell.revealed && !cell.mine
                      ? NUMBER_COLORS[cell.adjacentMines] || "var(--ink)"
                      : "var(--ink)",
                    transition: "background 0.1s",
                  }}
                >
                  {cell.revealed && cell.mine && "X"}
                  {cell.revealed && !cell.mine && cell.adjacentMines > 0 && cell.adjacentMines}
                  {!cell.revealed && cell.flagged && "F"}
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </GameShell>
  );
}
