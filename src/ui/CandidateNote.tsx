import { STOCKHOLM_CANDIDATE } from "../geo/stockholmCandidate";

export function CandidateNote() {
  const listing = STOCKHOLM_CANDIDATE.countryProductListing;

  return (
    <section className="panel" aria-labelledby="candidate-title">
      <p className="eyebrow">Prototyp, fas 1</p>
      <h1 id="candidate-title">Stockholm, kandidatvy</h1>
      <p>
        Kameran siktar mot centrala Stockholm. Ingen gata är vald. Fotorealistisk
        yt-täckning för en enskild gata är inte bekräftad.
      </p>
      <dl>
        <div>
          <dt>Land</dt>
          <dd>
            Sverige är markerad med Maps JavaScript 3D i Googles landtabell,
            kontrollerad {listing.checkedOn}.
          </dd>
        </div>
        <div>
          <dt>Gata</dt>
          <dd>Inte låst. Täckningskartan är interaktiv och kunde inte läsas här.</dd>
        </div>
        <div>
          <dt>Den här versionen</dt>
          <dd>Kartvy, laddning, fel och saknad nyckel. Ingen bil, inget vägnät och inget konto.</dd>
        </div>
      </dl>
      <p className="sources">
        <a href={listing.sourceUrl}>Landtäckning</a>
        <a href={listing.surfaceMapUrl}>Yttäckning</a>
      </p>
    </section>
  );
}
