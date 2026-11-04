// Listpriser i kronor. Ändra talen här om skolan tar ett annat pris.

function lesson(id, packageId, title, rule, say, why, teacher, checks, sign = null) {
  return { id, packageId, title, minutes: 10, rule, say, why, teacher, checks, sign };
}

function ask(prompt, yes, no, answer) {
  return { prompt, choices: [yes, no], answer };
}

export const courseLessons = [
  lesson(
    "balte",
    "start",
    "Bältet",
    "Alla i bilen har bälte.",
    "Säg efter mig: Alla har bälte.",
    "Bältet håller kvar dig om det smäller.",
    ["Peka på ditt eget bälte.", "Säg meningen. Han säger den.", "Fråga bara: ska du ha bälte?"],
    [ask("Ska du ha bälte när du kör?", "Ja", "Nej", 0), ask("Vem har bälte?", "Alla i bilen", "Bara den som kör", 0)],
  ),
  lesson(
    "barn",
    "start",
    "Barn i bilen",
    "Ett litet barn sitter i en barnstol.",
    "Säg efter mig: Litet barn sitter i barnstol.",
    "Vuxenbältet tar fel på ett litet barn. Stolen gör att bältet tar på rätt ställe.",
    ["Visa med handen hur litet ett barn är.", "Säg inte mått och centimeter idag.", "En mening räcker."],
    [ask("Var sitter ett litet barn?", "I en barnstol", "På en vanlig sittplats", 0), ask("Räcker en kudde från soffan?", "Nej", "Ja", 0)],
  ),
  lesson(
    "telefon",
    "start",
    "Telefonen",
    "Telefonen ligger ner när du kör.",
    "Säg efter mig: Telefonen ligger ner.",
    "Handen ska ha ratten. Telefonen i handen tar bort blicken från vägen.",
    ["Lägg en telefon på bordet, inte i handen.", "Han behöver inte kunna ordet handsfree idag."],
    [ask("Får du hålla telefonen i handen och köra?", "Nej", "Ja", 0), ask("Var ska telefonen vara?", "Nere", "I handen", 0)],
  ),
  lesson(
    "alkohol",
    "start",
    "Alkohol",
    "Har du druckit kör du inte.",
    "Säg efter mig: Har jag druckit kör jag inte.",
    "Ölen kan finnas kvar i kroppen morgonen efter. Då kör du inte heller.",
    ["Säg inte promille idag.", "En mening. Sen frågan.", "Om han säger ja till att köra: säg meningen igen, lugnt."],
    [ask("Du drack öl i går kväll. Kör du i morse?", "Nej", "Ja, jag känner mig pigg", 0), ask("Kompisarna har druckit och vill åka. Kör du dem?", "Nej", "Ja", 0)],
  ),
  lesson(
    "trott",
    "start",
    "Trött",
    "Är du trött stannar du.",
    "Säg efter mig: Jag är trött. Jag stannar.",
    "En gäspning och tunga ögon betyder stanna. En öppen ruta väcker dig inte.",
    ["Gäspa själv så han ser tecknet.", "Peka på en tänkt rastplats: här stannar vi."],
    [ask("Du gäspar och minns inte vägen. Vad gör du?", "Stannar", "Kör vidare", 0), ask("Räcker det att öppna rutan?", "Nej", "Ja", 0)],
  ),
  lesson(
    "grupp",
    "start",
    "Du bestämmer",
    "Du bestämmer farten. Inte kompisarna.",
    "Säg efter mig: Jag kör. Jag bestämmer.",
    "Det är ditt körkort och din kropp. Du kan säga nej.",
    ["Öva meningen högt två gånger.", "Beröm nej:et, inte farten."],
    [ask("Kompisarna säger: kör fortare. Gör du det?", "Nej", "Ja", 0), ask("Vem bestämmer i bilen?", "Den som kör", "Den som skriker högst", 0)],
  ),
  lesson(
    "hoger",
    "vajning",
    "Bil från höger",
    "Ingen skylt. Bil från höger. Du väntar.",
    "Säg efter mig: Från höger. Jag väntar.",
    "Det här gäller när korsningen inte har en skylt som säger något annat.",
    ["Rita ett kors med fingret på bordet.", "Peka åt hans höger.", "Säg inte alla andra regler i samma träff."],
    [ask("Ingen skylt. En bil kommer från höger. Vad gör du?", "Väntar", "Kör före", 0), ask("Bilen kommer från vänster. Ingen skylt. Vem väntar?", "Den andra", "Du", 0)],
  ),
  lesson(
    "stopp",
    "vajning",
    "Stopp",
    "Stoppskylten betyder: stanna helt.",
    "Säg efter mig: Stopp. Jag stannar helt.",
    "Hjulen ska stå stilla. Sen tittar du. Sen kör du om det är tomt.",
    ["Visa skylten. Han pekar på den och säger stopp.", "Stå stilla tillsammans i två sekunder så ordet helt får en kropp."],
    [ask("Vad gör du vid en stoppskylt?", "Stannar helt", "Rullar sakta förbi", 0), ask("Vägen ser tom ut. Får du rulla förbi utan att stanna?", "Nej", "Ja", 0)],
    "stop",
  ),
  lesson(
    "triangel",
    "vajning",
    "Triangeln",
    "Triangeln betyder: släpp fram de andra.",
    "Säg efter mig: Triangel. Jag släpper fram.",
    "Du måste inte stå kvar om vägen är tom. Kommer någon, väntar du.",
    ["Visa skylten bredvid stoppskylten.", "Säg skillnaden med två ord: stopp stannar, triangel släpper fram."],
    [ask("En bil kommer på den andra vägen. Du har triangeln. Vad gör du?", "Släpper fram bilen", "Kör före", 0), ask("Vad betyder triangeln?", "Släpp fram de andra", "Kör först", 0)],
    "yield",
  ),
  lesson(
    "utfart",
    "vajning",
    "Ut från parkeringen",
    "Du kör ut från en parkering. Du väntar på alla.",
    "Säg efter mig: Ut från parkeringen. Jag väntar.",
    "Det gäller också från en bensinstation eller en gård. Höger och vänster spelar ingen roll här.",
    ["Stå vid en dörr och låtsas att dörren är utfarten.", "Han väntar tills du har gått förbi."],
    [ask("Du kör ut från parkeringen. En bil kommer från vänster. Vad gör du?", "Väntar", "Kör, för den kommer från vänster", 0), ask("En person går på trottoaren framför dig. Vad gör du?", "Väntar", "Tutar och kör", 0)],
  ),
  lesson(
    "huvudled",
    "vajning",
    "Huvudled",
    "Du är på huvudleden. Bilar från sidan väntar.",
    "Säg efter mig: Huvudled. De från sidan väntar.",
    "Den gula skylten visar huvudleden. När du svänger av den gäller den inte längre.",
    ["Visa skylten.", "Idag bara: du är på den, de väntar. Spara avfarten till en annan dag om det blir för mycket."],
    [ask("Du kör på huvudleden. En bil kommer från sidan. Vem väntar?", "Bilen från sidan", "Du", 0), ask("Vilken skylt visar huvudled?", "Den gula", "Stoppskylten", 0)],
    "main-road",
  ),
  lesson(
    "rondell",
    "vajning",
    "Rondellen",
    "De som redan är inne i rondellen kör först.",
    "Säg efter mig: Inne i rondellen. De kör först.",
    "Du väntar innan du kör in. Sen kör du runt motsols.",
    ["Rita en cirkel. En kloss är inne. Hans kloss väntar utanför.", "Ett varv räcker."],
    [ask("En bil är redan inne i rondellen. Vad gör du?", "Väntar", "Kör in före", 0), ask("Vem kör först?", "Den som är inne", "Den som kommer utifrån", 0)],
  ),
  lesson(
    "blinkut",
    "vajning",
    "Ut ur rondellen",
    "När du kör ut ur rondellen blinkar du höger.",
    "Säg efter mig: Jag kör ut. Höger blinkers.",
    "De bakom dig ska se att du lämnar rondellen.",
    ["Han håller upp höger hand när du säger ut.", "Koppla handen till ordet höger."],
    [ask("Du ska lämna rondellen. Vad blinkar du?", "Höger", "Inget", 0), ask("När blinkar du höger?", "När du kör ut", "Hela varvet utan att köra ut", 0)],
  ),
  lesson(
    "gaende",
    "vajning",
    "Övergångsstället",
    "Någon går på övergångsstället. Du stannar.",
    "Säg efter mig: Någon går. Jag stannar.",
    "Stället är där folk går över gatan. Du kör inte förrän personen är över.",
    ["Gå själv två steg och säg: nu går jag. Han säger: jag stannar.", "En mening. Ingen extra regel om cykel idag."],
    [ask("En person går på övergångsstället. Vad gör du?", "Stannar", "Kör om jag tutar", 0), ask("Personen är mitt på gatan. Får du köra tätt förbi?", "Nej", "Ja", 0)],
  ),
  lesson(
    "blaljus",
    "vajning",
    "Blåljus",
    "Blått ljus och ljud. Kör åt sidan och stanna.",
    "Säg efter mig: Blåljus. Jag kör åt sidan.",
    "Ambulans, polis och brandbil ska fram. Du följer inte efter dem.",
    ["Spela inget ljud om det skrämmer. Säg ordet blåljus lugnt.", "Peka åt sidan av vägen."],
    [ask("En ambulans med blått ljus kommer bakom dig. Vad gör du?", "Kör åt sidan och stannar", "Kör fortare", 0), ask("Får du ligga tätt bakom ambulansen?", "Nej", "Ja, då kommer jag också fram", 0)],
  ),
  lesson(
    "fartskylt",
    "skyltar",
    "Fartskylten",
    "Talet i ringen är den högsta farten.",
    "Säg efter mig: Ringen säger högsta farten.",
    "50 betyder högst 50. Du får köra långsammare. Du får inte köra fortare.",
    ["Visa skylten med 50.", "Han säger femtio.", "Fråga: får du köra sextio? Svaret är nej."],
    [ask("Skylten säger 50. Får du köra 70?", "Nej", "Ja", 0), ask("Skylten säger 50. Får du köra 40 om det regnar?", "Ja", "Nej, du måste köra 50", 0)],
    "speed-50",
  ),
  lesson(
    "rode",
    "skyltar",
    "Rött ljus",
    "Rött ljus betyder stanna.",
    "Säg efter mig: Rött. Jag stannar.",
    "Grönt betyder att du får köra om vägen är fri. Du tittar ändå.",
    ["Två lappar: en röd, en grön.", "Börja med röd. Grön är andra frågan."],
    [ask("Ljuset är rött. Vad gör du?", "Stannar", "Kör om det är tomt", 0), ask("Ljuset är grönt och en person är kvar på gatan. Vad gör du?", "Väntar", "Kör, för det är grönt", 0)],
  ),
  lesson(
    "hogerpark",
    "skyltar",
    "Ställa bilen",
    "Du ställer bilen på höger sida.",
    "Säg efter mig: Jag ställer bilen till höger.",
    "På en vanlig gata står bilen längs kanten, i samma riktning som du kör.",
    ["Peka på höger sida av en ritad gata.", "Han ställer en liten bil där."],
    [ask("Var ställer du bilen på en vanlig gata?", "På höger sida", "Mitt i gatan", 0), ask("Får bilen stå kvar mitt i körfältet?", "Nej", "Ja", 0)],
  ),
  lesson(
    "inte-pa-stallet",
    "skyltar",
    "Inte på stället",
    "Ställ inte bilen på övergångsstället.",
    "Säg efter mig: Inte på stället där folk går.",
    "Folk ska se och synas. Bilen ska inte stå i vägen precis före stället heller.",
    ["Lägg en pappersbit som övergångsställe.", "Han får inte ställa bilen på den."],
    [ask("Får bilen stå på övergångsstället?", "Nej", "Ja, en kort stund", 0), ask("Folk ska gå där. Var ställer du bilen?", "En bit ifrån", "Precis framför dem", 0)],
  ),
  lesson(
    "gul-linje",
    "skyltar",
    "Gul linje",
    "Gul linje vid kanten. Ställ inte bilen där.",
    "Säg efter mig: Gul linje. Inte här.",
    "Linjen är målad på gatan. Den säger att platsen ska vara tom.",
    ["Rita ett gult streck.", "Han säger inte här."],
    [ask("Det är en gul linje vid kanten. Ställer du bilen där?", "Nej", "Ja", 0), ask("Vad betyder den gula linjen för bilen?", "Ställ den inte där", "Ställ den där", 0)],
  ),
  lesson(
    "femtio",
    "vagen",
    "Fart i stan",
    "I stan, ingen skylt: högst 50.",
    "Säg efter mig: I stan. Högst 50.",
    "Finns en skylt med ett annat tal gäller skylten. Utan skylt är det 50.",
    ["Säg stan och 50 tillsammans.", "Håll isär den här från landsvägen, den kommer sen."],
    [ask("Du är i stan. Ingen fartskylt. Hur fort får du köra som högst?", "50", "110", 0), ask("En skylt säger 30. Vad gäller?", "30", "50, för du är i stan", 0)],
  ),
  lesson(
    "sjuttio",
    "vagen",
    "Fart på landet",
    "På landet, ingen skylt: högst 70.",
    "Säg efter mig: På landet. Högst 70.",
    "Landsvägen utan skylt är 70. Inte 90 och inte 110.",
    ["Två meningar på tavlan: stan 50, landet 70.", "Han pekar på rätt rad."],
    [ask("Landsväg. Ingen skylt. Högsta fart?", "70", "110", 0), ask("Du är osäker. Vad gör du?", "Kör långsammare", "Gissar på 110", 0)],
    "speed-70",
  ),
  lesson(
    "tre-sek",
    "vagen",
    "Lucka till bilen framför",
    "På landsväg räknar du till tre innan du är framme vid bilen framför.",
    "Säg efter mig: Ett. Två. Tre.",
    "Räkna långsamt när bilen framför passerar en stolpe. Hinner du till tre är luckan bra.",
    ["Räkna högt tillsammans, långsamt.", "Han ska höra att ett-två-tre tar tid."],
    [ask("Du ligger tätt bakom på landsväg. Är det bra?", "Nej", "Ja", 0), ask("Hur räknar du luckan?", "Till tre", "Till noll", 0)],
  ),
  lesson(
    "inte-om",
    "vagen",
    "Köra om",
    "Ser du inte vägen framåt kör du inte om.",
    "Säg efter mig: Jag ser inte. Jag kör inte om.",
    "En backe eller en kurva kan dölja en mötande bil.",
    ["Håll en hand för ögonen: jag ser inte.", "Ta bort handen: nu ser jag, då kan jag titta om det är fritt."],
    [ask("Du ser inte över backen. Kör du om?", "Nej", "Ja, om bilen är långsam", 0), ask("När får du börja titta om omkörningen går?", "När du ser vägen", "När du är stressad", 0)],
  ),
  lesson(
    "motorvag",
    "vagen",
    "Motorväg",
    "På motorväg vänder du inte och ställer inte bilen.",
    "Säg efter mig: Motorväg. Jag vänder inte.",
    "Kör fel? Ta nästa avfart. Stanna bara på en rastplats.",
    ["Visa skylten.", "Säg avfart och peka framåt, inte bakåt."],
    [ask("Du har kört fel på motorvägen. Får du vända?", "Nej", "Ja", 0), ask("Var får du stanna?", "På en rastplats", "På vägrenen för att titta på kartan", 0)],
    "motorway",
  ),
  lesson(
    "morker",
    "vagen",
    "Möte i mörker",
    "Starka ljus möter dig. Titta på höger kant.",
    "Säg efter mig: Jag tittar på höger kant.",
    "Tittar du in i ljuset ser du sämre en stund. Kanten visar var bilen är.",
    ["Peka på en kant till höger.", "Han vänder huvudet dit, inte rakt in i en lampa."],
    [ask("En bil möter dig med starka ljus. Vart tittar du?", "På höger kant", "In i ljuset", 0), ask("Varför tittar du på kanten?", "Så jag håller mig på vägen", "Så jag ser den andra föraren", 0)],
  ),
  lesson(
    "halka",
    "vagen",
    "Is",
    "Det är is. Du kör sakta.",
    "Säg efter mig: Is. Jag kör sakta.",
    "Bromsa mjukt. Ett hårt tryck kan göra att bilen glider.",
    ["Gnid skorna mot golvet och säg halt.", "Ingen fysik. Bara sakta."],
    [ask("Vägen är is. Hur kör du?", "Sakta", "Som vanligt", 0), ask("Bilen glider. Vad gör du med bromsen?", "Bromsar mjukt", "Stampar hårt direkt", 0)],
  ),
  lesson(
    "alg",
    "vagen",
    "Älg",
    "En älg på vägen. Du bromsar. Du svänger inte ut.",
    "Säg efter mig: Älg. Jag bromsar.",
    "Svänger du ut kan du möta en annan bil. Bättre att bromsa rakt.",
    ["Håll händerna rakt fram när han säger bromsar.", "Visa att vänster fil är den andras."],
    [ask("En älg står i din fil. Vad gör du?", "Bromsar", "Svänger ut till vänster", 0), ask("Får du gissa och köra runt älgen i mötande fil?", "Nej", "Ja", 0)],
  ),
  lesson(
    "olycka",
    "vagen",
    "Olycka",
    "Det har smällt. Du stannar och ringer 112.",
    "Säg efter mig: Stanna. Ring 112.",
    "Du lämnar inte platsen. 112 är numret när någon är skadad.",
    ["Skriv 112 stort.", "Han säger siffrorna.", "Nästa träff kan ni öva samtalet. Idag räcker numret och att stanna."],
    [ask("Ni har krockat och någon har ont. Vad ringer du?", "112", "Ett vanligt nummer till en kompis", 0), ask("Får du köra vidare utan att stanna?", "Nej", "Ja, om bilen går", 0)],
  ),
  lesson(
    "dack",
    "bilen",
    "Däck",
    "Däcken ska ha mönster kvar.",
    "Säg efter mig: Slitna däck är dåligt.",
    "Utan mönster greppår bilen dåligt på vatten. Titta i spåren, inte bara på kanten.",
    ["Visa ett spår med fingret.", "Han behöver inte millimetern idag. Läraren tittar på djupet."],
    [ask("Däcken är blanka och slitna. Är det bra?", "Nej", "Ja", 0), ask("Var tittar du?", "I mönstret", "Bara på fälgen", 0)],
  ),
  lesson(
    "vinter",
    "bilen",
    "Vinterdäck",
    "Is eller snö på vägen. Bilen ska ha vinterdäck.",
    "Säg efter mig: Snö. Vinterdäck.",
    "Sommardäck blir hårda och hala i kylan. Fråga innan du byter själv.",
    ["Två ord på lappar: sommar och vinter.", "Han lägger vinter på en bild av snö."],
    [ask("Det är is i januari. Vilka däck ska sitta på?", "Vinterdäck", "Sommardäck", 0), ask("Vägen är snö. Får du strunta i däcken?", "Nej", "Ja", 0)],
  ),
  lesson(
    "ljus",
    "bilen",
    "Lyktor",
    "Lyktorna är på när du kör.",
    "Säg efter mig: Jag kör. Lyktorna är på.",
    "Andra ska se bilen även på dagen.",
    ["Tänd en lampa i rummet.", "Han säger på."],
    [ask("Det är sol. Ska lyktorna vara på?", "Ja", "Nej", 0), ask("När släcker du alla lyktor och kör?", "Aldrig", "På dagen", 0)],
  ),
  lesson(
    "olja",
    "bilen",
    "Röd lampa",
    "Oljelampan tänds. Du stannar och stänger av motorn.",
    "Säg efter mig: Röd lampa. Jag stannar.",
    "Kör du vidare kan motorn gå sönder. Stanna på en säker plats.",
    ["Rita en röd lampa.", "Han säger stanna. Inte verkstad om tio mil."],
    [ask("Oljelampan lyser rött under körning. Vad gör du?", "Stannar och stänger av", "Kör till nästa stad", 0), ask("Får du bara fylla spolarvätska och köra?", "Nej", "Ja", 0)],
  ),
  lesson(
    "slap",
    "bilen",
    "Släp",
    "Koppla inte på ett släp utan att fråga.",
    "Säg efter mig: Släp. Jag frågar först.",
    "Ett litet släp kan vara tillåtet. Ett tungt släp är det ofta inte. Läraren tittar på vikten.",
    ["Säg inte 3 500 kg till honom idag om det rör till det.", "Du kan själv minnas: högst 750 kg är alltid inom B. Tyngre bara om bil och släp tillsammans har högst 3 500 kg i totalvikt."],
    [ask("Ett stort släp står där. Vad gör du?", "Frågar först", "Kopplar på och kör", 0), ask("Vem kollar om släpet får dras?", "Läraren eller en vuxen som kan", "Ingen", 0)],
  ),
  lesson(
    "last",
    "bilen",
    "Saker i bilen",
    "Saker ska sitta fast.",
    "Säg efter mig: Det ska sitta fast.",
    "En lös sak kan flyga fram om du bromsar. Den får inte heller skymma rutan.",
    ["Lägg en penna löst och en penna som du håller fast.", "Bromsa med handen mot pennan."],
    [ask("En lös stege ligger i bilen. Är det bra?", "Nej", "Ja", 0), ask("Vad ska du göra med stegen?", "Spänna fast den", "Låta den ligga", 0)],
  ),
  lesson(
    "jamn",
    "bilen",
    "Jämn fart",
    "Jämn fart drar mindre bensin.",
    "Säg efter mig: Jag kör jämnt.",
    "Gas och broms om vartannat kostar mer. Titta långt fram så du hinner släppa gasen.",
    ["För handen jämnt över bordet.", "Sen ryckigt. Han pekar på den jämna."],
    [ask("Vad drar mindre bensin?", "Jämn fart", "Gas och broms hela tiden", 0), ask("Ljuset längre fram blir rött. Vad gör du?", "Släpper gasen i tid", "Gasar och bromsar sent", 0)],
  ),
];

export const packages = [
  {
    id: "start",
    name: "Trygg start",
    price: 1800,
    blurb: "Sex träffar. Bälte, barn, telefon, alkohol, trötthet och att säga nej.",
    lessonIds: ["balte", "barn", "telefon", "alkohol", "trott", "grupp"],
  },
  {
    id: "vajning",
    name: "Vem kör först",
    price: 2700,
    blurb: "Nio träffar. En regel i taget: höger, stopp, triangel, parkering, huvudled, rondell, gående och blåljus.",
    lessonIds: ["hoger", "stopp", "triangel", "utfart", "huvudled", "rondell", "blinkut", "gaende", "blaljus"],
  },
  {
    id: "skyltar",
    name: "Skyltar och att stanna",
    price: 1500,
    blurb: "Fem träffar. Fartskylt, rött ljus och var bilen får stå.",
    lessonIds: ["fartskylt", "rode", "hogerpark", "inte-pa-stallet", "gul-linje"],
  },
  {
    id: "vagen",
    name: "På vägen",
    price: 2700,
    blurb: "Nio träffar. Fart, lucka, omkörning, motorväg, mörker, is, älg och 112.",
    lessonIds: ["femtio", "sjuttio", "tre-sek", "inte-om", "motorvag", "morker", "halka", "alg", "olycka"],
  },
  {
    id: "bilen",
    name: "Bilen",
    price: 2100,
    blurb: "Sju träffar. Däck, vinter, lyktor, röd lampa, släp, last och jämn fart.",
    lessonIds: ["dack", "vinter", "ljus", "olja", "slap", "last", "jamn"],
  },
  {
    id: "hela",
    name: "Hela kursen",
    price: 7900,
    blurb: "Alla träffar, i den här ordningen. Ett paket i stället för fem.",
    includes: ["start", "vajning", "skyltar", "vagen", "bilen"],
    lessonIds: [],
  },
];

export function formatPrice(amount) {
  return `${new Intl.NumberFormat("sv-SE").format(amount)} kr`;
}

export function lessonById(id) {
  return courseLessons.find((item) => item.id === id) || null;
}

export function packageById(id) {
  return packages.find((item) => item.id === id) || null;
}

export function lessonsInPackage(pack) {
  if (pack.includes) {
    return pack.includes.flatMap((id) => lessonsInPackage(packageById(id)));
  }
  return pack.lessonIds.map((id) => lessonById(id));
}

export function unlockedIds(orders) {
  const ids = new Set();
  orders.forEach((order) => {
    const pack = packageById(order.packageId);
    if (!pack) return;
    if (pack.includes) pack.includes.forEach((id) => ids.add(id));
    else ids.add(pack.id);
  });
  return [...ids];
}

export function isLessonOpen(lesson, orders) {
  if (lesson.id === "balte") return true;
  const open = unlockedIds(orders);
  if (open.includes("hela")) return true;
  return open.includes(lesson.packageId);
}

export function orderedLessons() {
  return ["start", "vajning", "skyltar", "vagen", "bilen"].flatMap((id) => lessonsInPackage(packageById(id)));
}

export function nextOpenLesson(orders, done) {
  return orderedLessons().find((lesson) => isLessonOpen(lesson, orders) && !done[lesson.id]) || null;
}

export function packageProgress(pack, done) {
  const list = lessonsInPackage(pack);
  const finished = list.filter((lesson) => done[lesson.id]).length;
  return { total: list.length, finished };
}
