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

När vägarna har noder från OpenStreetMap placeras en enkel bil på närmaste mittlinje, högst 100 meter från den valda punkten. Håll W eller pil upp för att gasa, och S eller pil ned för att bromsa. Knapparna Gas och Broms ligger kvar tills du byter. Den synliga bilen använder `stepFreeVehicle`. A, D, pilarna och knapparna Vänster och Höger svänger bilen i kartans plan. Under körning flyttas den inte tillbaka till mittlinjen. Utan styrning vrider `followRoadCurve` kursen mjukt mot vägen där bilen är, så en kurva kan följas utan att bilen låses till mittlinjen. En preliminär körgräns följer vägen: taggen `width` används när den är i meter. Annars används en uppskattning per vägklass, och `lanes` får bara göra uppskattningen bredare. Ett ensamt körfält gör alltså inte gatan till en 3,5-metersremsa. Gränsen är inte en uppmätt vägkant, och byggnader känns inte av. Vid en korsning kan styrningen leda in på en väg som delar samma nod. Bilen stannar inte av sig själv där, och vägval med 1–9 används inte. En väg som bara ligger nära väljs inte. Gas och broms ändrar farten mjukt. Några trafikbilar följer samma mittlinjer, saktar in där vägen delar sig i två eller fler val och håller avstånd innan de kör vidare. Klicka nära en väglinje för att ställa bilen på den vägen igen. Bilmodellen är i personbilsstorlek. C eller knappen växlar mellan vy bakifrån och förarvy. Förarvyn tittar framåt i 3D-kartan från ungefär förarens höjd, strax framför hytten. Startsidan förklarar hur du söker en ort, gasar, bromsar och svänger. Träningsläge har övningen Närma dig en korsning, om det laddade vägnätet innehåller en förgrening eller korsning. Avstånd registreras bara när bilen är kvar i körbanan på vägen mot korsningen. Saknade värden förblir Inte uppmätt. Tipsen är råd, inte ett godkäntresultat.

När bilen är mindre än 200 meter från kanten hämtas nästa cirkel, med centrum 400 meter längre fram. Samma avrundade område hämtas inte igen. Högst åtta områden behålls. En misslyckad hämtning visas i panelen i stället för att bilen stannar utan förklaring.

## Kontroller

```bash
npm test
npm run typecheck
npm run build
```

## Körmodell i kartan

Den synliga bilen steg tas av `advanceFreeVehicle`. `stepFreeVehicle` räknar nästa position, och `guideFreePose` behåller den om den ligger i körbanan för den aktuella vägen eller en väg som delar dess nod. Positionen skrivs inte över med mittlinjens punkt. Närliggande kanter söks i ett rutnät på 40 meter, inte genom hela vägnätet i varje bildruta.

`width` och `lanes` sparas från OpenStreetMap. Saknas bredd används en uppskattning per vägklass, från 7 meter på en gårdsgata till 20 meter på en motorväg. `lanes` gör uppskattningen bredare när körfälten kräver det, men ett körfält får inte göra den smalare. Texten i körningen kallar gränsen preliminär. Byggnadsytor hämtas inte, så hus kan inte träffas var för sig. `followRoadCurve` vrider bara kursen, aldrig positionen, mot vägen vid bilen. En sidoförskjutning inom ett par meter lämnas kvar. Först när bilen driver längre ut vrids kursen några grader tillbaka, utan att positionen flyttas. Vid en nod följer den en anslutning som ligger inom 45 grader när spelaren inte styr. En tvär sväng kräver styrning, och bara vägar som delar noden kan väljas.

Övningens `observeApproach` är oförändrad. Ett prov registreras bara när bilen är inne i körbanan på den följda vägen. Ligger den bara i korsningens utvidgning, eller utanför, registreras inget avstånd.

Trafikbilarna följer fortfarande mittlinjen. De ser spelarens fria position.

## Avgränsning

Det här är inte körträning. Den synliga bilen gasar, bromsar och svänger i kartans plan. En preliminär körgräns ersätter byggnadskollision. Trafikbilarna följer mittlinjen, saktar in vid en förgrening eller korsning och håller avstånd. Hämtade vägdata har enkelriktning när taggen finns. Stopplikt, väjningsplikt och trafiksignaler ingår inte, så de används inte. Vägarna är mittlinjer från OpenStreetMap, inte NVDB. Bara vägar som delar en OSM-nod kopplas ihop. Fotorealistisk 3D varierar över landet och är inte ett krav för att vägdata ska visas. Startvyn över centrala Stockholm ritade fotorealistisk 3D-yta 2026-10-25.

En offentlig Overpass-server kan vara upptagen. Prototypen provar då en andra server. Sverige avgränsas med en förenklad kustlinje och en buffert på 8 km, så enstaka gränsorter kan hamna fel.
