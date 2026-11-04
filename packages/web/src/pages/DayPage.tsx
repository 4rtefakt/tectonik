import { useCallback, useEffect, useState } from "react";
import { dayKey, geometry, isComplete, penaltyMs, puzzleNumber, type AddFriendResponse, type BoardResponse, type PuzzleData, type Score } from "@tectonik/shared";
import { useT } from "../i18n/index.js";
import { api, ApiError, links } from "../lib/api.js";
import { formatDay, formatShortDay, formatTime } from "../lib/format.js";
import { shareOrCopy } from "../lib/share.js";
import { getProgress, getTints } from "../lib/storage.js";
import { useApi } from "../hooks/useApi.js";
import { useIdentity } from "../hooks/useIdentity.js";
import { Archive } from "../components/Archive.js";
import { Board } from "../components/Board.js";
import { Game } from "../components/Game.js";
import { Season } from "../components/Season.js";
import { TectonicGrid } from "../components/TectonicGrid.js";
import { ShareIcon, SwordsIcon } from "../components/Icons.js";

export function DayPage({ day: dayParam, duel }: { day?: string; duel?: string }) {
  const t = useT();
  const days = useApi(() => api.days(), []);
  const today = days.data?.today ?? dayKey();
  const day = dayParam ?? today;
  return (
    <main className="page day-page">
      {days.data && <Archive days={days.data.days} today={today} current={day} />}
      {days.error && !days.data && (
        <p className="error" role="alert">
          {t.networkError}{" "}
          <button type="button" onClick={days.reload}>
            {t.retry}
          </button>
        </p>
      )}
      <PuzzleArea key={`${day}/${duel ?? ""}`} day={day} today={today} duel={duel} onProgress={days.reload} />
    </main>
  );
}

interface Started {
  puzzle: PuzzleData;
  startedAt: number;
  offset: number;
}

function PuzzleArea({ day, today, duel, onProgress }: { day: string; today: string; duel?: string; onProgress: () => void }) {
  const t = useT();
  const { profile } = useIdentity();
  const challenge = useShare();
  const info = useApi(() => api.puzzle(day).then((p) => ({ ...p, offset: p.now - Date.now() })), [day]);
  const board = useApi(() => api.board(day), [day]);
  const season = useApi(() => api.season(day), [day]);
  const [started, setStarted] = useState<Started | null>(null);
  const [solved, setSolved] = useState<{ score: Score; values: number[] } | null>(null);
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState(false);

  const reloadBoard = board.reload;
  const reloadSeason = season.reload;
  const onSolved = useCallback(
    (score: Score, values: number[]) => {
      setSolved({ score, values });
      reloadBoard();
      reloadSeason();
      onProgress();
    },
    [reloadBoard, reloadSeason, onProgress],
  );

  // on revient sur l'onglet : les amis ont peut-être fini entre-temps
  useEffect(() => {
    const onFocus = () => document.visibilityState === "visible" && reloadBoard();
    document.addEventListener("visibilitychange", onFocus);
    return () => document.removeEventListener("visibilitychange", onFocus);
  }, [reloadBoard]);

  const start = async () => {
    setStarting(true);
    setStartError(false);
    try {
      const r = await api.start(day);
      setStarted({ puzzle: r.puzzle, startedAt: r.startedAt, offset: r.now - Date.now() });
      onProgress();
      requestAnimationFrame(showWholeGame);
    } catch {
      setStartError(true);
    } finally {
      setStarting(false);
    }
  };

  const p = info.data;
  const score = solved?.score ?? p?.score ?? null;
  const puzzle = started?.puzzle ?? p?.puzzle ?? null;
  const hasFriends = !!board.data && board.data.entries.length + board.data.waiting.length > 1;

  let main: React.ReactNode;
  if (info.error) {
    const code = info.error.code;
    main =
      code === "not_yet" || code === "not_found" ? (
        <p className="card">{code === "not_yet" ? t.notYet : t.noPuzzle}</p>
      ) : (
        <p className="error" role="alert">
          {t.networkError}{" "}
          <button type="button" onClick={info.reload}>
            {t.retry}
          </button>
        </p>
      );
  } else if (!p) {
    main = <p className="muted">{t.loading}</p>;
  } else if (score) {
    const local = puzzle ? (solved?.values ?? getProgress(day, puzzle.width * puzzle.height)?.values) : null;
    main = (
      <>
        <Result day={day} difficulty={t.difficulty[p.difficulty]} score={score} fresh={!!solved} board={board.data} />
        {puzzle && local && isComplete(geometry(puzzle), local) && (
          <TectonicGrid
            width={puzzle.width}
            height={puzzle.height}
            regions={puzzle.regions}
            givens={puzzle.grid}
            values={local}
            notes={[]}
            selected={null}
            conflicts={null}
            solved
            tints={getTints()}
          />
        )}
      </>
    );
  } else if (puzzle) {
    const startedAt = started?.startedAt ?? p.startedAt!;
    const offset = started?.offset ?? p.offset;
    main = <Game day={day} puzzle={puzzle} startedAt={startedAt} offset={offset} onSolved={onSolved} />;
  } else {
    const cells = p.width * p.height;
    main = (
      <div className="intro">
        <TectonicGrid width={p.width} height={p.height} regions={null} givens={"0".repeat(cells)} values={new Array<number>(cells).fill(0)} notes={[]} selected={null} conflicts={null} />
        <div className="intro-card card">
          <h2>{t.startTitle}</h2>
          <p className="muted">{t.startHint}</p>
          <button type="button" className="primary big" onClick={start} disabled={starting} aria-busy={starting}>
            {starting ? t.starting : t.start}
          </button>
          {startError && (
            <p className="error" role="alert">
              {t.networkError}
            </p>
          )}
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="day-head">
        <h1>{day === today ? t.today : formatDay(day, t.locale)}</h1>
        <p className="muted">
          {day === today && <span>{formatDay(day, t.locale)} · </span>}
          {t.puzzleNumber(puzzleNumber(day))}
          {p && (
            <>
              {" · "}
              <span className={`diff ${p.difficulty}`}>{t.difficulty[p.difficulty]}</span>
              {" · "}
              {t.dimensions(p.width, p.height)}
            </>
          )}
        </p>
        {day < today && !score && <p className="muted small">{t.pastDayNote}</p>}
        {p && !score && (
          <p className="day-actions">
            <button type="button" className="subtle icon-btn" onClick={() => void challenge.share(t.challengeOpen(puzzleNumber(day)), links.duel(day, profile.friendCode))}>
              <SwordsIcon />
              {t.challenge}
            </button>
            {challenge.note && <span className="muted small">{challenge.note}</span>}
          </p>
        )}
      </div>
      {duel && <DuelBanner code={duel} day={day} board={board.data} myScore={score} onAdded={reloadBoard} />}
      <div className="play">
        <div className="play-main" id="play">
          {main}
        </div>
        <aside className="side">
          <Board board={board.data} hasFriends={hasFriends} />
          <Season season={season.data} today={today} />
        </aside>
      </div>
    </>
  );
}

/**
 * Sur un téléphone, l'en-tête pousse le pavé sous le bord de l'écran : au départ,
 * on fait défiler jusqu'au chrono pour que la grille, les outils et le pavé
 * soient tous visibles (la partie entière tient dans l'écran).
 */
function showWholeGame() {
  const play = document.getElementById("play");
  const keypad = play?.querySelector(".keypad");
  if (!play || !keypad || keypad.getBoundingClientRect().bottom <= window.innerHeight) return;
  const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  play.scrollIntoView({ block: "start", behavior: reduce ? "auto" : "smooth" });
}

function useShare() {
  const t = useT();
  const [note, setNote] = useState<string | null>(null);
  useEffect(() => {
    if (!note) return;
    const id = setTimeout(() => setNote(null), 2500);
    return () => clearTimeout(id);
  }, [note]);
  const share = async (text: string, url: string) => {
    const r = await shareOrCopy({ text, url });
    if (r === "copied") setNote(t.linkCopied);
  };
  return { note, share };
}

function Result({ day, difficulty, score, fresh, board }: { day: string; difficulty: string; score: Score; fresh: boolean; board: BoardResponse | null }) {
  const t = useT();
  const { profile } = useIdentity();
  const { note, share } = useShare();
  const me = board?.entries.find((e) => e.me);
  const n = puzzleNumber(day);
  const time = formatTime(score.timeMs);
  return (
    <section className={`result card${fresh ? " fresh" : ""}`} aria-live="polite">
      {fresh && <h2>{t.solvedTitle}</h2>}
      <p className="result-label muted">{t.yourTime}</p>
      <p className="result-time">{time}</p>
      {score.mistakes + score.wrong > 0 && <p className="muted small">{t.withPenalty(penaltyMs(score.mistakes, score.wrong), score.mistakes + score.wrong)}</p>}
      {me && board && <p className="result-rank">{t.rankAmong(me.rank, board.entries.length)}</p>}
      <div className="result-actions">
        <button type="button" className="primary icon-btn" onClick={() => void share(t.challengeText(n, time), links.duel(day, profile.friendCode))}>
          <SwordsIcon />
          {t.challenge}
        </button>
        <button type="button" className="icon-btn" onClick={() => void share(t.resultText(n, formatShortDay(day, t.locale), time, difficulty.toLowerCase()), links.day(day))}>
          <ShareIcon />
          {t.shareResult}
        </button>
      </div>
      <p className="muted small" aria-live="polite">
        {note ?? " "}
      </p>
    </section>
  );
}

/** Une seule requête d'ajout par code, même si React monte le composant deux fois. */
const adding = new Map<string, Promise<AddFriendResponse>>();

function DuelBanner({ code, day, board, myScore, onAdded }: { code: string; day: string; board: BoardResponse | null; myScore: Score | null; onAdded: () => void }) {
  const t = useT();
  const { profile } = useIdentity();
  const { note, share } = useShare();
  const [state, setState] = useState<{ kind: "ok"; pseudo: string; added: boolean } | { kind: "self" } | { kind: "bad" } | null>(null);

  useEffect(() => {
    if (code === profile.friendCode) return setState({ kind: "self" });
    let p = adding.get(code);
    if (!p) adding.set(code, (p = api.addFriend(code)));
    let alive = true;
    p.then(
      (r) => {
        if (!alive) return;
        setState({ kind: "ok", pseudo: r.friend.pseudo, added: !r.already });
        onAdded();
      },
      (e) => alive && setState(e instanceof ApiError && (e.status === 404 || e.status === 400) ? { kind: "bad" } : null),
    );
    return () => {
      alive = false;
    };
  }, [code, profile.friendCode, onAdded]);

  if (!state) return null;
  if (state.kind !== "ok") return <p className="card duel muted">{state.kind === "self" ? t.duelSelf : t.duelUnknown}</p>;

  const them = board?.entries.find((e) => e.friendCode === code);
  const name = them?.pseudo ?? state.pseudo;
  let verdict: string | null = null;
  if (them && myScore) verdict = myScore.timeMs < them.timeMs ? t.duelWin : myScore.timeMs > them.timeMs ? t.duelLose(name) : t.duelTie;
  const n = puzzleNumber(day);
  return (
    <section className="card duel" aria-labelledby="duel-title">
      <h2 id="duel-title">
        <SwordsIcon /> {t.duelTitle(name)}
      </h2>
      {!myScore && <p>{t.duelIntro(name)}</p>}
      {state.added && <p className="muted small">{t.duelAdded(name)}</p>}
      <p className="duel-times">
        {them ? t.duelTheirTime(name, formatTime(them.timeMs)) : t.duelNotYet(name)}
        {myScore && (
          <>
            {" · "}
            <strong>{t.duelTheirTime(t.you, formatTime(myScore.timeMs))}</strong>
          </>
        )}
      </p>
      {verdict && <p className="duel-verdict">{verdict}</p>}
      {myScore && (
        <>
          <p className="muted small">{t.duelReplyHint(name)}</p>
          <button type="button" className="icon-btn" onClick={() => void share(t.challengeText(n, formatTime(myScore.timeMs)), links.duel(day, profile.friendCode))}>
            <SwordsIcon />
            {t.duelReply}
          </button>
          {note && <p className="muted small">{note}</p>}
        </>
      )}
    </section>
  );
}
