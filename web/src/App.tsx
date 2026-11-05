import { useState, useCallback, useRef, useEffect } from "react";
import { GameShell, GameTopbar, GameAuth, useGameSounds } from "@freegamestore/games";
import { useLeaderboard } from '@freegamestore/games';
import { Board } from "./components/Board";
import {
  BOARD_PADDING_PX,
  DIFFICULTIES,
  boardLayout,
  chord,
  countFlags,
  createEmptyGrid,
  hitMine,
  isWon,
  lossGrid,
  placeMines,
  revealCell,
  toggleFlag,
  winGrid,
  type Difficulty,
  type Grid,
} from "./lib/board";
import { dailyLeaderboardId, leaderboardId, timeScore } from "./lib/score";
import { dailyGrid, dateKey } from "./lib/daily";
import { readStore, writeStore } from "./lib/storage";
import {
  STATS_KEY,
  dailyResult,
  isFirstDailyWin,
  loadStats,
  modeStats,
  recordDailyStart,
  recordDailyWin,
  recordStart,
  recordWin,
  winRate,
} from "./lib/stats";

type SoundsApi = ReturnType<typeof useGameSounds>;

function AudioBridge({ apiRef }: { apiRef: React.MutableRefObject<SoundsApi | null> }) {
  const sounds = useGameSounds();
  apiRef.current = sounds;
  return null;
}

type GameState = "playing" | "won" | "lost";

/** A difficulty or Daily button: filled with the accent while selected. */
const toggleStyle = (on: boolean): React.CSSProperties => ({
  border: "1px solid var(--line)",
  background: on ? "var(--accent)" : "var(--panel)",
  color: on ? "#fff" : "var(--ink)",
  fontWeight: on ? 600 : 400,
});

export default function App() {
  const [difficulty, setDifficulty] = useState<Difficulty>("easy");
  const [grid, setGrid] = useState<Grid>(() =>
    createEmptyGrid(DIFFICULTIES.easy.rows, DIFFICULTIES.easy.cols)
  );
  const [gameState, setGameState] = useState<GameState>("playing");
  /** False until the player first opens a cell; the timer and stats start then. */
  const [started, setStarted] = useState(false);
  /** The UTC date of the daily board being played, or null for a random board. Captured at start, so midnight doesn't change it. */
  const [daily, setDaily] = useState<string | null>(null);
  const [stats, setStats] = useState(() => loadStats(readStore(STATS_KEY)));
  const [newBest, setNewBest] = useState(false);
  const [time, setTime] = useState(0);
  const [timerRunning, setTimerRunning] = useState(false);
  const [area, setArea] = useState({ width: 0, height: 0 });
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const boardAreaRef = useRef<HTMLDivElement>(null);
  /** Changes for every new game, so the board starts afresh (keyboard focus back on the first cell). */
  const [gameId, setGameId] = useState(0);
  const { submitScore } = useLeaderboard(leaderboardId(difficulty));
  const { submitScore: submitDailyScore } = useLeaderboard(dailyLeaderboardId(difficulty));
  const submittedRef = useRef(false);
  const audioRef = useRef<SoundsApi | null>(null);

  const config = DIFFICULTIES[difficulty];
  const { cellPx, transpose } = boardLayout(area.width, area.height, config.rows, config.cols);
  const flagCount = countFlags(grid);

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

  useEffect(() => {
    writeStore(STATS_KEY, JSON.stringify(stats));
  }, [stats]);

  // Record a win and submit its time. Leaderboards rank higher scores first, so the time is inverted.
  // A daily board goes to its own leaderboard, and only when the first attempt that day is won.
  useEffect(() => {
    if (gameState === "won" && !submittedRef.current) {
      submittedRef.current = true;
      if (daily) {
        if (isFirstDailyWin(dailyResult(stats, daily, difficulty))) submitDailyScore(timeScore(time));
        setStats((s) => recordDailyWin(s, daily, difficulty, time));
      } else {
        const best = modeStats(stats, difficulty).bestSeconds;
        setNewBest(best === null || time < best);
        setStats((s) => recordWin(s, difficulty, time));
        submitScore(timeScore(time));
      }
    }
    if (gameState === "playing") {
      submittedRef.current = false;
    }
  }, [gameState, time, submitScore, submitDailyScore, daily, difficulty, stats]);

  /** Start a new game: today's daily board when `dailyBoard` is set, otherwise an empty random one. */
  const resetGame = useCallback(
    (diff: Difficulty = difficulty, dailyBoard = daily !== null) => {
      const c = DIFFICULTIES[diff];
      const date = dailyBoard ? dateKey() : null;
      setDaily(date);
      setGrid(date ? dailyGrid(diff, date) : createEmptyGrid(c.rows, c.cols));
      setGameState("playing");
      setStarted(false);
      setNewBest(false);
      setTime(0);
      setTimerRunning(false);
      setGameId((id) => id + 1);
      if (timerRef.current) clearInterval(timerRef.current);
    },
    [difficulty, daily]
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

  /** A tap on a hidden cell opens it; a tap on a number chords. */
  const handleReveal = useCallback(
    (row: number, col: number) => {
      if (gameState !== "playing") return;
      const cell = grid[row][col];
      if (cell.flagged) return;
      const next = cell.revealed ? chord(grid, row, col) : null;
      if (cell.revealed && !next) return;

      let currentGrid = grid;
      if (!started) {
        // A random board's mines are placed now, away from the first cell. A daily board already has them.
        if (!daily) currentGrid = placeMines(grid, config.mines, row, col);
        setStarted(true);
        setTimerRunning(true);
        setStats((s) => (daily ? recordDailyStart(s, daily, difficulty) : recordStart(s, difficulty)));
      }
      settle(next ?? revealCell(currentGrid, row, col));
    },
    [grid, gameState, started, daily, difficulty, config, settle]
  );

  const handleFlag = useCallback(
    (row: number, col: number) => {
      if (gameState !== "playing") return;
      if (grid[row][col].revealed) return;
      setGrid(toggleFlag(grid, row, col));
      audioRef.current?.playMove();
      navigator.vibrate?.(15);
    },
    [grid, gameState]
  );

  const changeDifficulty = (d: Difficulty) => {
    setDifficulty(d);
    resetGame(d);
  };

  const statusLabel =
    gameState === "won" ? `You win! ${time}s${newBest ? " · New best" : ""}` : gameState === "lost" ? "Boom! Game over" : "";

  const mode = modeStats(stats, difficulty);
  const today = daily ? dailyResult(stats, daily, difficulty) : null;
  const statsLine = daily
    ? `Daily ${daily} (UTC) · ${today?.won ? `Solved in ${today.seconds}s` : "Not solved yet"}${(today?.attempts ?? 0) > 1 ? " · Only the first try is ranked" : ""}`
    : `Played ${mode.played} · Won ${mode.won} (${winRate(mode)}%)${mode.bestSeconds !== null ? ` · Best ${mode.bestSeconds}s` : ""}`;

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
                <li>Tap a number with all its mines flagged to open its other neighbours</li>
                <li>Drag to move around a large board</li>
                <li>Keyboard: Tab to the board, arrow keys to move, Enter or Space to reveal, F to flag</li>
              </ul>
              <h4 style={{marginTop:'0.75rem',fontWeight:600}}>Rules</h4>
              <ul style={{paddingLeft:'1.2rem',marginTop:'0.25rem'}}>
                <li>Numbers show adjacent mines</li>
                <li>Your first reveal is never a mine</li>
                <li>Reveal all non-mine cells to win</li>
                <li>Three difficulties: Easy, Medium, Hard</li>
                <li>Daily is the same board for everyone on a UTC day, with a safe start already open. Only your first try goes to the daily leaderboard</li>
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
              type="button"
              key={d}
              onClick={() => changeDifficulty(d)}
              aria-pressed={difficulty === d}
              className="rounded-md px-3 min-h-[2.75rem] capitalize"
              style={toggleStyle(difficulty === d)}
            >
              {d}
            </button>
          ))}
          <button
            type="button"
            onClick={() => resetGame(difficulty, daily === null)}
            aria-pressed={daily !== null}
            className="rounded-md px-3 min-h-[2.75rem]"
            style={toggleStyle(daily !== null)}
          >
            📅 Daily
          </button>
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
                type="button"
                onClick={() => resetGame()}
                className="rounded-md px-4 min-h-[2.75rem] font-semibold"
                style={{ border: "1px solid var(--line)", background: "var(--accent)", color: "#fff" }}
              >
                Play Again
              </button>
            </>
          )}
        </div>
        <p data-testid="stats" className="px-3 pb-1 text-xs font-semibold" style={{ color: "var(--muted)" }}>
          {statsLine}
        </p>

        {/* The board area pans when the board is wider or taller than the screen. */}
        <div
          ref={boardAreaRef}
          data-testid="board-area"
          className="flex-1 min-h-0 overflow-auto"
          style={{ touchAction: "pan-x pan-y" }}
        >
          <div className="flex w-max min-w-full min-h-full" style={{ padding: BOARD_PADDING_PX }}>
            <Board
              key={gameId}
              grid={grid}
              cellPx={cellPx}
              transpose={transpose}
              playing={gameState === "playing"}
              lost={gameState === "lost"}
              onReveal={handleReveal}
              onFlag={handleFlag}
            />
          </div>
        </div>
      </div>
    </GameShell>
  );
}
