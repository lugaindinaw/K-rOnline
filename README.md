# K-rOnline

Kurs i små steg för körkortsbehörighet B. En träff tar tio minuter och lär en mening. Den som sitter bredvid läser, eleven säger efter och väljer mellan två stora svar.

Paketen går att beställa på sidan. Priserna står i `js/packages.js`. Betalningen görs med skolan. När ett paket beställs öppnas träffarna på den datorn.

Första träffen, om bältet, går att prova utan beställning. Övningsprovet med 65 frågor ligger under Läraren och är till för senare.

## Kör kursen

```bash
npm start
```

Öppna sedan `http://localhost:4173`.

## Test

```bash
npm test
```

Testet kontrollerar att varje fråga är entydig, att övningsprovet får rätt fördelning och att gränsen 52 rätt fungerar.
