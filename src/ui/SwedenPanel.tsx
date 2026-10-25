import { STOCKHOLM_CANDIDATE } from "../geo/stockholmCandidate";
import { PLACE_EXAMPLES, type SwedishPlace } from "../places/swedishPlaces";
import { highwayLabel, roadSummary, type RoadSegment } from "../roads/drivingRoads";

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
  onLoadAtCamera: () => void;
  cameraAvailable: boolean;
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
  onLoadAtCamera,
  cameraAvailable,
}: SwedenPanelProps) {
  const summary = roadSummary(roads);
  const visibleNames = summary.names.slice(0, 8);
  const hiddenNames = summary.names.length - visibleNames.length;

  return (
    <section className="panel" aria-labelledby="sweden-title">
      <p className="eyebrow">Prototyp</p>
      <h1 id="sweden-title">Hela Sverige</h1>
      <p>
        Stockholm är startposition och exempelområde. Sök en stad, en mindre ort
        eller flytta kameran. Vägar hämtas bara för området runt den valda punkten.
      </p>
      <form
        className="place-search"
        onSubmit={(event) => {
          event.preventDefault();
          onSearch();
        }}
      >
        <label htmlFor="place-query">Plats i Sverige</label>
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
          Ingen bil, ingen rutt och ingen koppling mellan vägarna. Linjerna är
          mittlinjer från OpenStreetMap, inte NVDB, körfält eller trafikregler.
          Bara ett område i taget hämtas. En offentlig vägtjänst kan vara långsam.
        </p>
      </details>
    </section>
  );
}
