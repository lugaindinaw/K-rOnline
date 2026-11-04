import { CITY_MISSION, PRACTICE_DISCLAIMER, type PracticeReview } from "../game/cityPractice";
import { LICENSE_MOMENTS } from "../game/licenseMoments";

type PlayMode = "menu" | "free" | "practice" | "review";

type GameShellProps = {
  mode: PlayMode;
  review: PracticeReview | null;
  trafficCount: number;
  onFree: () => void;
  onPractice: () => void;
  onFinish: () => void;
  onAgain: () => void;
  onMenu: () => void;
};

export function GameShell({
  mode,
  review,
  trafficCount,
  onFree,
  onPractice,
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
      <section className="game-hud" aria-label="Uppdrag">
        <p className="game-kicker">Körkortsövning</p>
        <h2>Stadstrafik genom korsningen</h2>
        <p className="game-mission">{CITY_MISSION}</p>
        <p className="game-score">
          <span>{review.score}</span> poäng
        </p>
        <p className="game-live" role="status">
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

  const later = LICENSE_MOMENTS.filter((moment) => !moment.playable);
  return (
    <div className="game-menu">
      <div className="game-card game-card-wide">
        <p className="game-kicker">KörOnline</p>
        <h1>Körkortsspelet</h1>
        <p>
          Öva i Stockholm med bilen, vägarna och de andra bilarna. {PRACTICE_DISCLAIMER}
        </p>
        <div className="game-choices">
          <button type="button" className="game-choice" onClick={onFree}>
            <span>Fri körning</span>
            <small>Kör vart du vill. W gasar, S bromsar, A och D styr, Q och E blinkar.</small>
          </button>
          <button type="button" className="game-choice game-choice-play" onClick={onPractice}>
            <span>Körkortsövning</span>
            <small>Stadstrafik: kör genom korsningen och följ trafikreglerna.</small>
          </button>
        </div>
        <h2>Kommande övningar</h2>
        <ul className="game-later">
          {later.map((moment) => (
            <li key={moment.id}>
              <strong>{moment.title}</strong>
              <span>
                {moment.area}. {moment.summary}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
