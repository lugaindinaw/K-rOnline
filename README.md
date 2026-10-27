# KörOnline

Webbprototyp för en svensk körvy. Google Maps 3D är kartan. Stockholm är bara startposition. Vägar för det valda området hämtas från OpenStreetMap när de behövs, inte som ett färdigt utdrag av hela Sverige.

## Starta

```bash
npm install
cp .env.example .env.local
npm run dev
```

Öppna `http://localhost:5173`. Sätt `VITE_GOOGLE_MAPS_API_KEY` i `.env.local` eller i processens miljö och starta om dev-servern. Nyckeln hör hemma i webbläsaren, så begränsa den i Google Cloud till Maps JavaScript API och till `http://localhost:5173/*`.

Utan nyckel kan platser och väglistor fortfarande sökas. Själva 3D-kartan kräver nyckeln. Med nyckel laddas Maps JavaScript API, biblioteket `maps3d`, och en `Map3DElement` i läget `HYBRID`.

Sök en ort i Sverige, eller hämta vägar där kameran står. Platssökningen går till Nominatim. Kameran höjs till marknivån för platsen. Vägfrågan går via utvecklingsservern till Overpass, med en radie på 600 meter. Fler än 500 vägsträckor beskärs så att högre vägklasser behålls.

När vägarna har noder från OpenStreetMap placeras en enkel bil på närmaste mittlinje, högst 100 meter från den valda punkten. Håll W eller pil upp för att gasa, och S eller pil ned för att bromsa. Knapparna Gas och Broms ligger kvar tills du byter. Den synliga bilen använder `stepFreeVehicle`: A, D, pilarna och knapparna Vänster och Höger svänger bilen i kartans plan. Under körning flyttas den inte tillbaka till mittlinjen. Närmaste väg inom 40 meter ger bara vägnamnet. Korsningar och vägkanter är inte färdiga, och vägval med 1–9 används inte av den här bilen. Gas och broms ändrar farten mjukt. Några trafikbilar följer samma mittlinjer, saktar in där vägen delar sig i två eller fler val och håller avstånd innan de kör vidare. Klicka nära en väglinje för att ställa bilen på den vägen igen. Bilmodellen är i personbilsstorlek. C eller knappen växlar mellan vy bakifrån och förarvy. Förarvyn tittar framåt i 3D-kartan från ungefär förarens höjd, strax framför hytten. Startsidan förklarar hur du söker en ort, gasar, bromsar och svänger. Träningsläge har övningen Närma dig en korsning, om det laddade vägnätet innehåller en förgrening eller korsning. Starta övning ställer bilen på vägen, men avstånd längs vägen mäts inte från den fria positionen. Efteråt visas bara värden som faktiskt registrerats. Saknade värden förblir Inte uppmätt. Tipsen är råd, inte ett godkäntresultat.

När bilen är mindre än 200 meter från kanten hämtas nästa cirkel, med centrum 400 meter längre fram. Samma avrundade område hämtas inte igen. Högst åtta områden behålls. En misslyckad hämtning visas i panelen i stället för att bilen stannar utan förklaring.

## Kontroller

```bash
npm test
npm run typecheck
npm run build
```

## Körmodell i kartan

Den synliga bilen steg tas av `advanceFreeVehicle`, som bara låter `stepFreeVehicle` ändra position, kurs och fart. `stepVehicle` används inte för den bilen. Kameran följer den posen. `associateFreePosition` pekar ut närmaste mittlinje inom 40 meter och sparar kant, avstånd och gap. Den punkten skrivs inte tillbaka till bilen.

Det som ännu saknas:

- Ingen vägkant stoppar bilen. `width` och `lanes` hämtas inte, så asfaltkanten är okänd.
- Kursen väljer inte automatiskt anslutande väg i en korsning, och bilen stannar inte för vägval med 1–9.
- Trafikbilarna följer fortfarande mittlinjen. De ser spelarens fria position.
- Övningens `observeApproach` är oförändrad. Prover från den fria bilen markeras `roadDistanceReliable: false` och registreras inte. Saknade hastigheter och avstånd förblir Inte uppmätt.

## Avgränsning

Det här är inte körträning. Den synliga bilen gasar, bromsar och svänger i kartans plan och kan lämna mittlinjen. Vägkant och korsningsval är inte färdiga. Trafikbilarna följer mittlinjen, saktar in vid en förgrening eller korsning och håller avstånd. Hämtade vägdata har enkelriktning när taggen finns. Stopplikt, väjningsplikt och trafiksignaler ingår inte, så de används inte. Vägarna är mittlinjer från OpenStreetMap, inte NVDB. Bara vägar som delar en OSM-nod kopplas ihop. Fotorealistisk 3D varierar över landet och är inte ett krav för att vägdata ska visas. Startvyn över centrala Stockholm ritade fotorealistisk 3D-yta 2026-10-25.

En offentlig Overpass-server kan vara upptagen. Prototypen provar då en andra server. Sverige avgränsas med en förenklad kustlinje och en buffert på 8 km, så enstaka gränsorter kan hamna fel.
