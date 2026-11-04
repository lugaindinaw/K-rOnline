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

Sök en ort i Sverige, eller hämta vägar där kameran står. Platssökningen går till Nominatim. Kameran höjs till marknivån för platsen. Vägfrågan går via utvecklingsservern till Overpass, med en radie på 600 meter. Fler än 500 vägsträckor beskärs så att högre vägklasser behålls. En senare bit av samma gata behålls, och en väg som delar nod med en gata som redan är hämtad behålls när nästa område laddas. En fortsättning vid en lös ändnod prioriteras framför en väg som bara korsar nätet. Nästa nod en kort bit utanför cirkeln följer med, så att gatan inte kapas mellan två noder. Hämtningen framåt börjar medan det fortfarande finns marginal kvar i området. Om en anslutning ändå väljs bort syns väg, OSM-id, nod och orsak i konsolen när bilen stannar.

När vägarna har noder från OpenStreetMap placeras en enkel bil på närmaste mittlinje, högst 100 meter från den valda punkten. Håll W eller pil upp för att gasa, och S eller pil ned för att bromsa. Knapparna Gas och Broms ligger kvar tills du byter. Den synliga bilen använder `stepFreeVehicle`. A, D, pilarna och knapparna Vänster och Höger svänger bilen i kartans plan. Under körning flyttas den inte tillbaka till mittlinjen. Utan styrning vrider `followRoadCurve` kursen mjukt mot vägen där bilen är, så en kurva kan följas utan att bilen låses till mittlinjen. En preliminär körgräns följer vägen: taggen `width` används när den är i meter. Annars används en uppskattning per vägklass, och `lanes` får bara göra uppskattningen bredare. Ett ensamt körfält gör alltså inte gatan till en 3,5-metersremsa. Gränsen är inte en uppmätt vägkant, och byggnader känns inte av. Vid en korsning håller en vänster- eller högerstyrning kursen längs den anslutna väg som delar samma nod, även i låg fart, så bilen inte genar över trottoaren. Q och E tänder blinkers, som slocknar när ratten har vridits åt det hållet och sedan rätats. Väjningsplikt registreras bara vid noder med give_way, som fakta och inte som ett förarprov. Vid en korsning kan styrningen leda in på en väg som delar samma nod. Bilen stannar inte av sig själv där, och vägval med 1–9 används inte. En väg som bara ligger nära väljs inte. Gas och broms ändrar farten mjukt. Några trafikbilar följer samma mittlinjer, saktar in där vägen delar sig i två eller fler val och håller avstånd innan de kör vidare. Klicka nära en väglinje för att ställa bilen på den vägen igen. Bilmodellen är i personbilsstorlek. C eller knappen växlar mellan vy bakifrån och förarvy. Förarvyn sänker kartkameran till sittande ögonhöjd och tittar framåt längs vägen, med en hytt runt rutan: ratt, mätare, tunna A-stolpar, huv och backspegel. Ögonhöjden ligger kvar när bilen gasar eller svänger. Den egna bilmodellen döljs i förarvyn. Ratten och framhjulen byggs upp mot styrningen. Gas och broms rampar kraften, och karossen lutar lite. Hastighetsmätaren visar den aktuella farten i hela km/h. Förarvyn är en tredimensionell hytt ritad framför kartan, med samma synfält, så att ratt, instrument, stolpar, dörrar, huv, torkare, växelväljare och pedaler sitter i ett stycke. En modell i kartans egen scen försvinner i fotogrammetrin på det här avståndet. Kameran sitter i ögonhöjd. Backspegel och sidospeglar är små kartvyer. Kartans 3D-yta är fortfarande Google Maps fotogrammetri. Nära fasader, trädklumpar och ojämn mark kommer från den ytan. Vägytor är polygoner som läggs på terrängen från hämtade mittlinjer: uppmätt OSM-bredd när den finns, annars en klassuppskattning, med trottoar och vita linjer. De är inte inmätta vägkanter, och fotogrammetrin kan fortfarande synas igenom. Sväng i fart begränsas av ett sidogrepp på 5,5 m/s². `observeDrive` samlar fart, sidoläge, skylt, signal och avstånd till trafik för ett senare prov. Det är inget prov och ingen poäng. Spegelblick och oskyddade trafikanter saknas fortfarande. Startsidan förklarar hur du söker en ort, gasar, bromsar och svänger. Träningsläge har övningen Närma dig en korsning, om det laddade vägnätet innehåller en förgrening eller korsning. Avstånd registreras bara när bilen är kvar i körbanan på vägen mot korsningen. Saknade värden förblir Inte uppmätt. Tipsen är råd, inte ett godkäntresultat.

När bilen är mindre än 200 meter från kanten hämtas nästa cirkel, med centrum 400 meter längre fram. Samma avrundade område hämtas inte igen. Högst åtta områden behålls. En misslyckad hämtning visas i panelen i stället för att bilen stannar utan förklaring.

## Kontroller

```bash
npm test
npm run typecheck
npm run build
```

## Körmodell i kartan

Den synliga bilen steg tas av `advanceFreeVehicle`. `stepFreeVehicle` räknar nästa position, och `guideFreePose` behåller den om den ligger i körbanan för den aktuella vägen eller en väg som delar dess nod. Positionen skrivs inte över med mittlinjens punkt. Närliggande kanter söks i ett rutnät på 40 meter, inte genom hela vägnätet i varje bildruta.

`width` och `lanes` sparas från OpenStreetMap. Saknas bredd används en uppskattning per vägklass, från 7 meter på en gårdsgata till 20 meter på en motorväg. `lanes` gör uppskattningen bredare när körfälten kräver det, men ett körfält får inte göra den smalare. Texten i körningen kallar gränsen preliminär. Byggnadsytor hämtas inte, så hus kan inte träffas var för sig. `followRoadCurve` vrider bara kursen, aldrig positionen, mot vägen vid bilen. Sidoförskjutningen lämnas kvar tills bilens kropp närmar sig kanten. Gränsen jämför körbanans bredd med bilens bredd, cirka 2 meter, inte bara med mittpunkten. En liten marginal tar upp ryck i projektionen. Den läggs inte på som extra vägbredd. Är den uppmätta bredden smalare än bilen kallas gränsen osäker. Vid en nod följer gas utan styrning en rak eller mjuk anslutning inom 45 grader, och en tydligt rakare fortsättning upp till 70 grader. Styrning kan välja en skarpare väg som delar samma nod. En uppskattad körgräns ger lite mer spelrum än en uppmätt bredd. Positionen flyttas inte till den nya mittlinjen.

Övningens `observeApproach` är oförändrad. Ett prov registreras bara när bilen är inne i körbanan på den följda vägen. Ligger den bara i korsningens utvidgning, eller utanför, registreras inget avstånd.

Trafikbilarna följer mittlinjen i körriktningen. I en korsning tar de den fortsättning som ligger närmast den egna kursen. Lika skarpa utfarter väljs efter gatunamn, vägklass och högersväng, inte efter OSM-id. De bromsar tills de står stilla bakom en bil framför. En nod med `highway=traffic_signals` som ingår i en väg är ett trafikljus. Saknas noden hittas inget ljus. OpenStreetMap har inte färgen, så rött, gult och grönt simuleras i en fast cykel bara för de här noderna, och samma färg visas på ljuset i förarvyn. Ljuset står kvar på sin nod när fler vägar hämtas. Spelarens bil stannar inte för ljuset. Stopplikt, väjningsplikt, en sifferhastighet och enkelriktat visas bara när taggen finns.

## Avgränsning

Det här är inte körträning. Den synliga bilen gasar, bromsar och svänger i kartans plan. En preliminär körgräns ersätter byggnadskollision. Trafikbilarna följer mittlinjen, tar den rakaste fortsättningen i en korsning och håller avstånd genom att bromsa in bakom bilen framför. Hämtade vägdata har enkelriktning när taggen finns. Trafiksignaler används bara när en OSM-nod med `highway=traffic_signals` ligger på en hämtad väg. Färgen finns inte i kartan och simuleras då, och samma färg visas på ljuset. Stopp- och väjningsskyltar visas när noden är taggad, men övningen bedömer dem inte. Spelarens bil bedöms inte mot trafikljusen. Vägarna är mittlinjer från OpenStreetMap, inte NVDB. Bara vägar som delar en OSM-nod kopplas ihop. Fotorealistisk 3D varierar över landet och är inte ett krav för att vägdata ska visas. Startvyn över centrala Stockholm ritade fotorealistisk 3D-yta 2026-10-25.

En offentlig Overpass-server kan vara upptagen. Prototypen provar då en andra server. Om starten över Gustav Adolfs torg ändå inte får svar används en sparad OpenStreetMap-kopia av vägarna där. Den kopian har inga width-taggar, så körbanans bredd och korsningsytan är en klassuppskattning. Sverige avgränsas med en förenklad kustlinje och en buffert på 8 km, så enstaka gränsorter kan hamna fel.
