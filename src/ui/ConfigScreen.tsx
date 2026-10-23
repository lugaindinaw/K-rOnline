export function ConfigScreen() {
  return (
    <section className="panel panel-config" aria-labelledby="config-title">
      <p className="eyebrow">Konfiguration krävs</p>
      <h1 id="config-title">Google-nyckel saknas</h1>
      <p>
        3D-kartan kan inte laddas förrän Maps JavaScript API har en nyckel.
        Lägg den i en lokal miljöfil. Den ska inte skrivas in i källkoden.
      </p>
      <ol>
        <li>Öppna Google Cloud och välj ett projekt med betalkonto.</li>
        <li>Aktivera Maps JavaScript API. 3D Maps faktureras som Immersive Maps.</li>
        <li>Skapa en API-nyckel och begränsa den till Maps JavaScript API.</li>
        <li>
          Lägg till HTTP-referer <code>http://localhost:5173/*</code> för lokal
          utveckling.
        </li>
        <li>
          Kopiera <code>.env.example</code> till <code>.env.local</code> och sätt{" "}
          <code>VITE_GOOGLE_MAPS_API_KEY</code>.
        </li>
        <li>Starta om <code>npm run dev</code>.</li>
      </ol>
      <p>
        Ett nytt projekt med fakturaadress i EES får inte Photorealistic 3D Tiles
        via Map Tiles API. Den här prototypen använder i stället 3D Maps i Maps
        JavaScript API.
      </p>
    </section>
  );
}
