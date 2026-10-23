# KörOnline

Webbprototyp för en svensk körvy. Den här versionen visar bara en 3D-karta över centrala Stockholm. Ingen gata är låst, och det finns ingen bil, inget vägnät och inget konto.

## Starta

```bash
npm install
cp .env.example .env.local
npm run dev
```

Öppna `http://localhost:5173`. Sätt `VITE_GOOGLE_MAPS_API_KEY` i `.env.local` och starta om dev-servern. Nyckeln hör hemma i webbläsaren, så begränsa den i Google Cloud till Maps JavaScript API och till `http://localhost:5173/*`.

Utan nyckel visar sidan konfigurationsläget. Med nyckel laddas Maps JavaScript API, biblioteket `maps3d`, och en `Map3DElement` i läget `HYBRID`.

## Kontroller

```bash
npm test
npm run typecheck
npm run build
```

## Avgränsning

Fotorealistisk yt-täckning för en enskild stockholmsgata är inte verifierad. Sverige är markerad för Maps JavaScript 3D i [Googles landtabell](https://developers.google.com/maps/coverage). Gatans yta måste kontrolleras på [täckningskartan](https://developers.google.com/maps/documentation/javascript/3d/coverage) och i den här vyn när en nyckel finns.

NVDB och OSM är inte inlästa. De ska hållas åtskilda när vägnätet läggs till senare, i egna moduler bredvid `src/geo` och `src/map`. Bil, körfysik och kameror för första- och tredjeperson ska också bli egna moduler. De finns inte i den här versionen.
