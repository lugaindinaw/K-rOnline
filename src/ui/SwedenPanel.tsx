import { IDLE_VEHICLE, type VehicleStatus } from "../drive/drive";
import { STOCKHOLM_CANDIDATE } from "../geo/stockholmCandidate";
import { PLACE_EXAMPLES, type SwedishPlace } from "../places/swedishPlaces";
import { highwayLabel, roadSummary, type RoadSegment } from "../roads/drivingRoads";
import {
  EXERCISE_INSTRUCTION,
  EXERCISE_TITLE,
  FEEDBACK_DID_TITLE,
  FEEDBACK_EVENTS_TITLE,
  FEEDBACK_PRACTICE_TITLE,
  approachFeedback,
  idleAttempt,
  type ApproachAttempt,
} from "../training/approach";

function recordedSpeed(kmh: number | null): string {
  return kmh === null ? "Inte uppmätt" : `${kmh} km/h`;
}

function speedChangeFact(attempt: ApproachAttempt): string {
  if (attempt.slowedDown) {
    return "Ja";
  }
  if (attempt.slowdownKnown) {
    return "Nej";
  }
  return "Inte uppmätt";
}

function stopFact(attempt: ApproachAttempt): string {
  if (attempt.stoppedBefore) {
    return "Ja";
  }
  if (attempt.completed) {
    return "Nej, korsningen nåddes utan stopp före den";
  }
  return "Inte fastställt";
}

type SwedenPanelProps = {
  query: string;
  onQueryChange: (value: string) => void;
  onSearch: () => void;
  searching: boolean;
  places: SwedishPlace[];
  placeMessage: string | null;
  onSelectPlace: (place: SwedishPlace) => void;
  onExample: (name: string) => void;
  areaLabel: string;
  radiusMeters: number | null;
  roads: RoadSegment[];
  matched: number;
  truncated: boolean;
  loadingRoads: boolean;
  roadError: string | null;
  extendNote: string | null;
  vehicle: VehicleStatus;
  onChooseBranch: (index: number) => void;
  onPedal: (pedal: "accelerate" | "brake", pressed: boolean) => void;
  onLoadAtCamera: () => void;
  cameraAvailable: boolean;
  trainingOpen: boolean;
  onToggleTraining: () => void;
  trainingError: string | null;
  attempt: ApproachAttempt;
  onStartExercise: () => void;
  onFinishExercise: () => void;
  onRetryExercise: () => void;
};

export function SwedenPanel({
  query,
  onQueryChange,
  onSearch,
  searching,
  places,
  placeMessage,
  onSelectPlace,
  onExample,
  areaLabel,
  radiusMeters,
  roads,
  matched,
  truncated,
  loadingRoads,
  roadError,
  extendNote,
  vehicle = IDLE_VEHICLE,
  onChooseBranch,
  onPedal,
  onLoadAtCamera,
  cameraAvailable,
  trainingOpen,
  onToggleTraining,
  trainingError,
  attempt = idleAttempt(),
  onStartExercise,
  onFinishExercise,
  onRetryExercise,
}: SwedenPanelProps) {
  const summary = roadSummary(roads);
  const feedback = attempt.status === "finished" ? approachFeedback(attempt) : null;
  const visibleNames = summary.names.slice(0, 8);
  const hiddenNames = summary.names.length - visibleNames.length;

  return (
    <section className="panel" aria-labelledby="sweden-title">
      <p className="eyebrow">Prototyp</p>
      <h1 id="sweden-title">Hela Sverige</h1>
      <p>
        3D-kartan är igång. Stockholm är startposition. Vägar från OpenStreetMap
        hämtas för området runt den valda punkten. När vägarna har laddats står
        bilen på en väg och du kan köra direkt.
      </p>
      <h2>Så börjar du</h2>
      <ol className="start-steps">
        <li>Sök en ort i Sverige, eller stanna kvar i Stockholm.</li>
        <li>Gasa med W, pil upp eller Gas. Bromsa med S, pil ned eller Broms.</li>
        <li>Vid en korsning väljer du väg med 1–9 eller knapparna som visas.</li>
      </ol>
      <form
        className="place-search"
        onSubmit={(event) => {
          event.preventDefault();
          onSearch();
        }}
      >
        <label htmlFor="place-query">Sök en ort i Sverige</label>
        <div className="place-search-row">
          <input
            id="place-query"
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder="Till exempel Kiruna eller en mindre ort"
            autoComplete="off"
          />
          <button type="submit" disabled={searching}>
            {searching ? "Söker…" : "Sök"}
          </button>
        </div>
      </form>
      <div className="examples">
        {PLACE_EXAMPLES.map((name) => (
          <button key={name} type="button" className="chip" onClick={() => onExample(name)}>
            {name}
          </button>
        ))}
      </div>
      {placeMessage ? <p role="status">{placeMessage}</p> : null}
      {places.length > 0 ? (
        <ul className="place-results">
          {places.map((place) => (
            <li key={place.id}>
              <button type="button" className="place-choice" onClick={() => onSelectPlace(place)}>
                {place.label}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <div className="drive-block">
        <h2>Köra</h2>
        <p>
          Håll W eller pil upp för att gasa, och S eller pil ned för att bromsa. Knapparna Gas och
          Broms ligger kvar tills du byter. Vid en korsning väljer du väg med 1–9. Några mindre
          bilar märkta Trafik följer samma vägar, saktar in där vägen delar sig och håller avstånd.
        </p>
        <div className="drive-pedals">
          <button
            type="button"
            onClick={() => {
              onPedal("brake", false);
              onPedal("accelerate", true);
            }}
          >
            Gas
          </button>
          <button
            type="button"
            onClick={() => {
              onPedal("accelerate", false);
              onPedal("brake", true);
            }}
          >
            Broms
          </button>
        </div>
        {vehicle.placed ? (
          <p className="drive-speed" role="status">
            {vehicle.speedKmh} km/h
            {vehicle.roadName ? ` · ${vehicle.roadName}` : ""}
          </p>
        ) : (
          <p>Bilen visas på kartan när en körbar väg har laddats.</p>
        )}
        {extendNote ? <p role="status">{extendNote}</p> : null}
        {vehicle.message ? <p role="status">{vehicle.message}</p> : null}
        {vehicle.choices.length > 0 ? (
          <div className="drive-choices">
            {vehicle.choices.map((choice) => (
              <button key={choice.edgeId} type="button" onClick={() => onChooseBranch(choice.index)}>
                {choice.index}. {choice.label}
              </button>
            ))}
          </div>
        ) : null}
      </div>
      <div className="training-block">
        <h2>Träning</h2>
        <button type="button" onClick={onToggleTraining} aria-pressed={trainingOpen}>
          Träningsläge
        </button>
        {trainingOpen ? (
          <>
            <h3>{EXERCISE_TITLE}</h3>
            <p>
              Övningen går ut på att köra fram mot en korsning i det laddade vägnätet och observera
              trafiken.
            </p>
            <ol className="training-steps">
              <li>Starta övning ställer bilen på en väg som leder till korsningen.</li>
              <li>Använd Gas och Broms, eller W och S.</li>
              <li>Avsluta övning visar återkopplingen. Försök igen nollställer mätningarna.</li>
            </ol>
            <p>{EXERCISE_INSTRUCTION}</p>
            {trainingError ? (
              <p className="road-error" role="alert">
                {trainingError}
              </p>
            ) : null}
            {attempt.status === "running" ? (
              <p role="status">Övningen pågår. Gasa och bromsa som vanligt.</p>
            ) : null}
            <div className="training-actions">
              <button type="button" onClick={onStartExercise} disabled={loadingRoads}>
                Starta övning
              </button>
              <button type="button" onClick={onFinishExercise} disabled={attempt.status !== "running"}>
                Avsluta övning
              </button>
              <button type="button" onClick={onRetryExercise} disabled={loadingRoads}>
                Försök igen
              </button>
            </div>
            {feedback ? (
              <div className="training-feedback">
                <h3>Återkoppling</h3>
                <h4>Uppmätta fakta</h4>
                <dl className="training-facts">
                  <div>
                    <dt>Ungefär 40 meter</dt>
                    <dd>{recordedSpeed(attempt.speedAt40Kmh)}</dd>
                  </div>
                  <div>
                    <dt>Ungefär 30 meter</dt>
                    <dd>{recordedSpeed(attempt.speedAt30Kmh)}</dd>
                  </div>
                  <div>
                    <dt>Ungefär 20 meter</dt>
                    <dd>{recordedSpeed(attempt.speedAt20Kmh)}</dd>
                  </div>
                  <div>
                    <dt>Hastigheten minskade</dt>
                    <dd>{speedChangeFact(attempt)}</dd>
                  </div>
                  <div>
                    <dt>Stannade före korsningen</dt>
                    <dd>{stopFact(attempt)}</dd>
                  </div>
                  <div>
                    <dt>Korsningen nåddes</dt>
                    <dd>{attempt.completed ? "Ja" : "Nej"}</dd>
                  </div>
                </dl>
                <p className="training-advice-note">
                  Tabellen visar bara registrerade prov. Inte uppmätt betyder att bilen inte
                  passerade den punkten. Råden är inte ett godkänt- eller underkäntresultat.
                </p>
                <h4>{FEEDBACK_DID_TITLE}</h4>
                <ul>
                  {feedback.did.map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
                <h4>{FEEDBACK_PRACTICE_TITLE}</h4>
                <p className="training-advice-note">{feedback.adviceNote}</p>
                <ul>
                  {feedback.practice.map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
                <h4>{FEEDBACK_EVENTS_TITLE}</h4>
                <ul>
                  {feedback.events.map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
              </div>
            ) : null}
          </>
        ) : null}
      </div>
      <div className="road-block">
        <h2>Vägar i området</h2>
        <p>
          {areaLabel}
          {radiusMeters ? ` · ${radiusMeters} m` : ""}
        </p>
        {loadingRoads ? <p role="status">Hämtar vägdata…</p> : null}
        {roadError ? (
          <p className="road-error" role="alert">
            {roadError}
          </p>
        ) : null}
        {!loadingRoads && !roadError && matched === 0 ? (
          <p>Inga körbara vägar hittades i det här området.</p>
        ) : null}
        {!loadingRoads && !roadError && matched > 0 ? (
          <p>
            {truncated
              ? `Visar ${roads.length} av ${matched} vägsträckor, högre vägklasser först.`
              : `${roads.length} vägsträckor.`}{" "}
            Källa: OpenStreetMap.
          </p>
        ) : null}
        {visibleNames.length > 0 ? (
          <ul className="road-names">
            {visibleNames.map((name) => {
              const road = roads.find((item) => item.name === name);
              return (
                <li key={name}>
                  {name}
                  {road ? ` · ${highwayLabel(road.highway)}` : ""}
                </li>
              );
            })}
          </ul>
        ) : null}
        {hiddenNames > 0 ? <p>Och {hiddenNames} namngivna vägar till.</p> : null}
        {summary.unnamed > 0 ? <p>{summary.unnamed} vägsträckor saknar namn.</p> : null}
        <button type="button" onClick={onLoadAtCamera} disabled={!cameraAvailable || loadingRoads}>
          Hämta vägar vid kameran
        </button>
      </div>
      <p>
        Startvyn över Stockholm visade fotorealistisk 3D{" "}
        {STOCKHOLM_CANDIDATE.viewObservation.checkedOn}. Täckningen varierar i landet.
        Vägarna ritas ändå, eftersom de inte kommer från 3D-bilderna.
      </p>
      <details>
        <summary>Vad som saknas för körträning</summary>
        <p>
          Övningen använder det laddade vägnätet och de trafikbilar som redan finns. Mätningen
          följer samma korsningsnod om vägsegmentet byts. Försvinner noden blir senare värden
          okända. Återkopplingen
          beskriver registrerad hastighet, om farten minskade, om bilen stannade före korsningen och
          om korsningen nåddes. Tipsen är råd. Väjningsplikt och stopplikt bedöms inte, och försöket
          får inget godkänt- eller underkäntresultat. Bilen följer
          mittlinjen. Nästa vägavsnitt hämtas automatiskt nära kanten av området. Modellen är
          förstorad så att den syns. Det finns inga körfält, ingen NVDB och ingen realistisk
          bilfysik. Om listan beskärs kan en korsning saknas.
          Kameran följer bakom bilen efter första gaspådraget och tittar framåt längs vägen.
        </p>
      </details>
    </section>
  );
}
