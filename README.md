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

När vägarna har noder från OpenStreetMap placeras en enkel bil på närmaste mittlinje, högst 100 meter från den valda punkten. Håll W eller pil upp för att gasa, och S eller pil ned för att bromsa. Knapparna Gas och Broms ligger kvar tills du byter. Bilen följer vägens mittlinje och vrider sig gradvis när vägen svänger. A, D och pilarna vänster och höger flyttar bilen i sidled längs samma väg, högst några meter från mittlinjen. Det är inte fri styrning, och bilen byter inte väg av sig själv. Gas och broms ändrar farten mjukt. Några trafikbilar följer samma mittlinjer, saktar in där vägen delar sig i två eller fler val och håller avstånd innan de kör vidare. Vid en korsning där flera vägar delar en nod bromsar den in och stannar, och du väljer fortsatt väg med 1–9 eller knapparna i panelen. Klicka nära en väglinje för att flytta bilen. Bilmodellen är i personbilsstorlek. C eller knappen växlar mellan vy bakifrån och förarvy. Förarvyn tittar framåt i 3D-kartan från ungefär förarens höjd, strax framför hytten. Startsidan förklarar hur du söker en ort, gasar, bromsar och väljer väg. Träningsläge har övningen Närma dig en korsning, om det laddade vägnätet innehåller en förgrening eller korsning. Under körningen visas en kort instruktion under kartan. Mätningen följer korsningens nod även om vägsegmentets id ändras. Efteråt visas registrerad hastighet, om farten minskade, om bilen stannade före korsningen och om den nåddes. Tipsen är råd, inte ett godkäntresultat.

När bilen är mindre än 200 meter från kanten hämtas nästa cirkel, med centrum 400 meter längre fram. Samma avrundade område hämtas inte igen. Högst åtta områden behålls. En misslyckad hämtning visas i panelen i stället för att bilen stannar utan förklaring.

## Kontroller

```bash
npm test
npm run typecheck
npm run build
```

## Körmodell som ännu inte styr kartan

`stepFreeVehicle` i `src/drive/freeDrive.ts` räknar en egen position, kurs och fart i kartans plan. Gas, broms och styrning använder samma enheter som den inkopplade bilen. Funktionen läser inget vägnät och flyttar inte positionen till en mittlinje. Kartan, ortssökningen, trafiken, kamerorna och körkortsövningen använder fortfarande `stepVehicle`. Fri körning är därför inte igång i webbläsaren.

Så är den tänkt att kopplas in senare, utan att byta ut de delarna i ett svep:

- OpenStreetMap-vägnätet används som en fråga efter steget. Närmaste kanter kan begränsa rörelsen. Positionen skrivs inte över med mittlinjens punkt. Bredd används bara när en `width`- eller `lanes`-tagg finns. Annars är asfaltkanten okänd.
- Vid en korsning jämförs kursen med kanter som delar en nod. Den riktning som ligger närmast blir fortsatt väg. Den fria körningen ska inte stanna och kräva 1–9. Övningen kan behålla det stoppet tills mätningen ändras för sig.
- Kamerans förarvy och vy bakifrån tar redan latitud, longitud och kurs. Den fria posen kan skickas dit utan en ny kameramodell.
- Trafikbilarna fortsätter på mittlinjen. Spelarens fria punkt är bara en position de kan mäta avstånd till.
- Övningen ”Närma dig en korsning” behöver en separat projektion från den fria positionen till `edgeId` och `distanceMeters` mot den sparade noden. `observeApproach` ska vara oförändrad tills den projektionen finns och är testad.

## Avgränsning

Det här är inte körträning. Bilen har enkel gas och broms längs mittlinjen, och styrningen är en sidoförskjutning på högst några meter. Den kan inte lämna vägen. Trafikbilarna följer mittlinjen, saktar in vid en förgrening eller korsning och håller avstånd. Hämtade vägdata har enkelriktning när taggen finns. Stopplikt, väjningsplikt och trafiksignaler ingår inte, så de används inte. Vägarna är mittlinjer från OpenStreetMap, inte NVDB. Bara vägar som delar en OSM-nod kopplas ihop. Fotorealistisk 3D varierar över landet och är inte ett krav för att vägdata ska visas. Startvyn över centrala Stockholm ritade fotorealistisk 3D-yta 2026-10-25.

En offentlig Overpass-server kan vara upptagen. Prototypen provar då en andra server. Sverige avgränsas med en förenklad kustlinje och en buffert på 8 km, så enstaka gränsorter kan hamna fel.
