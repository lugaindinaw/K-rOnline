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

När vägarna har noder från OpenStreetMap placeras en enkel bil på närmaste mittlinje, högst 100 meter från den valda punkten. Håll W eller pil upp för att gasa, och S eller pil ned för att bromsa. Knapparna Gas och Broms ligger kvar tills du byter. Bilen följer vägens mittlinje och vrider sig gradvis när vägen svänger. Gas och broms ändrar farten mjukt. Några mindre trafikbilar följer samma mittlinjer, saktar in där vägen delar sig i två eller fler val och håller avstånd innan de kör vidare. Vid en korsning där flera vägar delar en nod bromsar den in och stannar, och du väljer fortsatt väg med 1–9 eller knapparna i panelen. Klicka nära en väglinje för att flytta bilen. Kameran följer bakom bilen efter första gaspådraget och tittar framåt längs vägen. Träningsläge har övningen Närma dig en korsning, om det laddade vägnätet innehåller en förgrening eller korsning.

När bilen är mindre än 200 meter från kanten hämtas nästa cirkel, med centrum 400 meter längre fram. Samma avrundade område hämtas inte igen. Högst åtta områden behålls. En misslyckad hämtning visas i panelen i stället för att bilen stannar utan förklaring.

## Kontroller

```bash
npm test
npm run typecheck
npm run build
```

## Avgränsning

Det här är inte körträning. Bilen har enkel gas och broms längs mittlinjen. Trafikbilarna följer mittlinjen, saktar in vid en förgrening eller korsning och håller avstånd. Hämtade vägdata har enkelriktning när taggen finns. Stopplikt, väjningsplikt och trafiksignaler ingår inte, så de används inte. Vägarna är mittlinjer från OpenStreetMap, inte NVDB. Bara vägar som delar en OSM-nod kopplas ihop. Fotorealistisk 3D varierar över landet och är inte ett krav för att vägdata ska visas. Startvyn över centrala Stockholm ritade fotorealistisk 3D-yta 2026-10-25.

En offentlig Overpass-server kan vara upptagen. Prototypen provar då en andra server. Sverige avgränsas med en förenklad kustlinje och en buffert på 8 km, så enstaka gränsorter kan hamna fel.
