import { PRACTICE_DISCLAIMER, type PracticeReview } from "../game/cityPractice";
import { LICENSE_MOMENTS } from "../game/licenseMoments";
import { PASS_SCORE, type MomentProgress } from "../game/progress";
import {
  momentJudged,
  momentMission,
  momentTitle,
  type MomentId,
  type SafetyChecks,
} from "../game/simpleMoments";

type PlayMode = "menu" | "free" | "brief" | "practice" | "review";

type GameShellProps = {
  mode: PlayMode;
  review: PracticeReview | null;
  trafficCount: number;
  goal: "left" | "right" | null;
  moment: MomentId | null;
  checks: SafetyChecks;
  targetRoad: string | null;
  progress: Record<string, MomentProgress>;
  onFree: () => void;
  onPractice: () => void;
  onStartMoment: (moment: MomentId) => void;
  onBegin: () => void;
  onChooseTurn: (goal: "left" | "right") => void;
  onSafety: (step: keyof SafetyChecks) => void;
  onFinish: () => void;
  onAgain: () => void;
  onMenu: () => void;
};

export function GameShell({
  mode,
  review,
  trafficCount,
  goal,
  moment,
  checks,
  targetRoad,
  progress,
  onFree,
  onPractice,
  onStartMoment,
  onBegin,
  onChooseTurn,
  onSafety,
  onFinish,
  onAgain,
  onMenu,
}: GameShellProps) {
  if (mode === "free") {
    return (
      <button type="button" className="game-return" onClick={onMenu}>
        Meny
      </button>
    );
  }

  if (mode === "practice" && review) {
    return (
      <>
        <section className="game-hud" aria-label="Uppdrag">
        <p className="game-kicker">Körkortsövning</p>
        <h2>{moment ? momentTitle(moment, goal) : "Övning"}</h2>
        <p className="game-mission">{moment ? momentMission(moment, goal, targetRoad) : ""}</p>
        {moment === "city" && !goal ? (
          <div className="game-hud-actions">
            <button type="button" onClick={() => onChooseTurn("left")}>
              Sväng vänster
            </button>
            <button type="button" onClick={() => onChooseTurn("right")}>
              Sväng höger
            </button>
          </div>
        ) : null}
        {moment === "safety" ? (
          <div className="game-hud-actions">
            <button type="button" aria-pressed={checks.left} onClick={() => onSafety("left")}>
              Blinkers vänster
            </button>
            <button type="button" aria-pressed={checks.right} onClick={() => onSafety("right")}>
              Blinkers höger
            </button>
            <button type="button" aria-pressed={checks.brake} onClick={() => onSafety("brake")}>
              Prova broms
            </button>
            <button type="button" aria-pressed={checks.gas} onClick={() => onSafety("gas")}>
              Prova gas
            </button>
          </div>
        ) : null}
        <p className="game-score">
          <span>{review.score}</span> poäng
        </p>
        <p className="game-cue" role="status">
          {review.live}
        </p>
        <p className="game-traffic">
          {trafficCount > 0 ? `${trafficCount} andra bilar kör i området.` : "Trafiken laddas med vägarna."}
        </p>
        <div className="game-hud-actions">
          <button type="button" onClick={onFinish}>
            Avsluta övning
          </button>
          <button type="button" className="game-quiet" onClick={onMenu}>
            Meny
          </button>
        </div>
      </section>
      </>
    );
  }

  if (mode === "brief" && moment) {
    const saved = progress[moment];
    return (
      <div className="game-menu">
        <div className="game-card game-card-wide">
          <p className="game-kicker">Innan du kör</p>
          <h1>{momentTitle(moment, goal)}</h1>
          <p>{momentMission(moment, goal, targetRoad)}</p>
          <h2>Det här bedöms</h2>
          <ul className="game-results">
            {momentJudged(moment).map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
          <p>
            {PASS_SCORE} poäng eller mer räknas som godkänd övning i spelet. Det är inte Trafikverkets körprov.
            {saved ? ` Bästa resultat hittills: ${saved.best} poäng.` : ""}
          </p>
          <div className="game-actions">
            <button type="button" onClick={onBegin}>
              Starta övning
            </button>
            <button type="button" className="game-quiet" onClick={onMenu}>
              Meny
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (mode === "review" && review) {
    const good = review.points.filter((point) => point.mark === "bra");
    const practice = review.points.filter((point) => point.mark !== "bra");
    return (
      <div className="game-menu">
        <div className="game-card game-card-wide">
          <p className="game-kicker">Övningen är klar</p>
          <h1>{review.score} poäng</h1>
          <p>{PRACTICE_DISCLAIMER}</p>
          <h2>Det här gick bra</h2>
          {good.length > 0 ? (
            <ul className="game-results">
              {good.map((point) => (
                <li key={point.title}>
                  <strong>{point.title}.</strong> {point.detail}
                </li>
              ))}
            </ul>
          ) : (
            <p>Inget är markerat som klart ännu. Kör övningen en gång till.</p>
          )}
          <h2>Det här kan du träna på</h2>
          {practice.length > 0 ? (
            <ul className="game-results">
              {practice.map((point) => (
                <li key={point.title}>
                  <strong>{point.title}.</strong> {point.detail}
                </li>
              ))}
            </ul>
          ) : (
            <p>Inget särskilt att ta om just nu.</p>
          )}
          <div className="game-actions">
            <button type="button" onClick={onAgain}>
              Kör igen
            </button>
            <button type="button" className="game-quiet" onClick={onFree}>
              Fri körning
            </button>
            <button type="button" className="game-quiet" onClick={onMenu}>
              Meny
            </button>
          </div>
        </div>
      </div>
    );
  }

  const playable = LICENSE_MOMENTS.filter((item) => item.playable && item.id !== "city");
  const later = LICENSE_MOMENTS.filter((item) => !item.playable);
  return (
    <div className="game-menu">
      <div className="game-card game-card-wide">
        <p className="game-kicker">KörOnline</p>
        <h1>Körkortsspelet</h1>
        <p>
          Välj en svensk ort och kör på vägar från OpenStreetMap. Stockholm är först. 3D-byggnader följer
          kartans täckning och saknas på många platser. {PRACTICE_DISCLAIMER}
        </p>
        <div className="game-choices">
          <button type="button" className="game-choice" onClick={onFree}>
            <span>Fri körning</span>
            <small>
              Kör vart du vill i Sverige. W gasar, S bromsar, A och D styr, Q och E blinkar, R backar, F är drive
              och G växlar. Väderknappen byter regn, dimma och halka.
            </small>
          </button>
          <button type="button" className="game-choice game-choice-play" onClick={onPractice}>
            <span>Körkortsövning</span>
            <small>
              Stadstrafik: kör fram till korsningen och sväng vänster eller höger.
              {progress.city ? ` Bästa: ${progress.city.best} poäng.` : ""}
            </small>
          </button>
        </div>
        <h2>Övningar</h2>
        <div className="game-moment-list">
          {playable.map((item) => (
            <button key={item.id} type="button" className="game-moment" onClick={() => onStartMoment(item.id as MomentId)}>
              <strong>{item.title}</strong>
              <span>
                {item.summary}
                {progress[item.id] ? ` Bästa: ${progress[item.id].best} poäng${progress[item.id].passed ? ", godkänd i spelet" : ""}.` : " Inte körd ännu."}
              </span>
            </button>
          ))}
        </div>
        {later.length > 0 ? (
          <>
            <h2>Inte med i den här versionen</h2>
            <ul className="game-later">
              {later.map((item) => (
                <li key={item.id}>
                  <strong>{item.title}</strong>
                  <span>
                    {item.area}. {item.summary}
                  </span>
                </li>
              ))}
            </ul>
          </>
        ) : null}
      </div>
    </div>
  );
}
