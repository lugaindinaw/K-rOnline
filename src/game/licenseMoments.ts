/** Trafikverket-style practice areas. Only moments marked playable can be started. */
export type LicenseMoment = {
  id: string;
  title: string;
  area: string;
  playable: boolean;
  summary: string;
};

export const LICENSE_MOMENTS: readonly LicenseMoment[] = [
  {
    id: "safety",
    title: "Säkerhetskontroll och reglage",
    area: "Fordonskännedom",
    playable: true,
    summary: "Prova blinkers, broms och gas innan du kör.",
  },
  {
    id: "city",
    title: "Stadstrafik genom korsningen",
    area: "Körning i tätort",
    playable: true,
    summary: "Korsning, blinkers, väjningsplikt och placering tillsammans med annan trafik.",
  },
  {
    id: "roundabout",
    title: "Rondell",
    area: "Körning i tätort",
    playable: true,
    summary: "Förenklad rondell: blinka höger, sakta in och sväng ut.",
  },
  {
    id: "parking",
    title: "Parkering",
    area: "Manövrering",
    playable: true,
    summary: "Kör en kort bit och stanna vid vägkanten.",
  },
  {
    id: "handling",
    title: "Grundläggande bilhantering",
    area: "Fordonskännedom",
    playable: true,
    summary: "Växel 1, drive och back, sedan stanna.",
  },
  {
    id: "hill",
    title: "Start i backe",
    area: "Manövrering",
    playable: true,
    summary: "Håll bromsen i en simulerad backe och kör iväg.",
  },
  {
    id: "reverse",
    title: "Backning",
    area: "Manövrering",
    playable: true,
    summary: "Backa minst 8 meter och stanna.",
  },
  {
    id: "turn",
    title: "Vändning",
    area: "Manövrering",
    playable: true,
    summary: "Backa, vänd minst 120 grader och stanna.",
  },
  {
    id: "lanes",
    title: "Körfält och filbyte",
    area: "Körning i tätort",
    playable: true,
    summary: "Byt sida på gatan och stanna på körbanan.",
  },
  {
    id: "lights",
    title: "Trafikljus",
    area: "Körning i tätort",
    playable: true,
    summary: "Stanna vid övningssignalen och kör när den blir grön.",
  },
  {
    id: "crossing",
    title: "Gående och cyklister",
    area: "Körning i tätort",
    playable: true,
    summary: "Stanna för den gående och lämna lucka till cyklisten.",
  },
  {
    id: "rural",
    title: "Landsväg och möte",
    area: "Körning på landsväg",
    playable: true,
    summary: "Färentunavägen, 70 km/h: höger sida, möte, kurva och omkörning.",
  },
  {
    id: "motorway",
    title: "Motorväg och omkörning",
    area: "Körning på motorväg",
    playable: true,
    summary: "Arlandaleden: påfart, omkring 100 km/h, körfältsbyte, avstånd och avfart.",
  },
  {
    id: "works",
    title: "Vägarbete",
    area: "Körning i trafik",
    playable: true,
    summary: "Sakta ner och håll ut vid övningsmärket.",
  },
  {
    id: "railway",
    title: "Järnvägskorsning",
    area: "Körning i trafik",
    playable: true,
    summary: "Stanna före övningsmärket och kör sedan vidare.",
  },
  {
    id: "hazard",
    title: "Regn och dimma",
    area: "Riskmedvetenhet",
    playable: true,
    summary: "Sämre grepp och sikt. Håll 12–36 km/h.",
  },
  {
    id: "ice",
    title: "Halka",
    area: "Riskmedvetenhet",
    playable: true,
    summary: "Lägre grepp och längre bromssträcka. Håll 8–22 km/h.",
  },
  {
    id: "night",
    title: "Mörkerkörning",
    area: "Riskmedvetenhet",
    playable: true,
    summary: "Kör en kort bit i mörker och håll körfältet.",
  },
  {
    id: "independent",
    title: "Körning mot mål",
    area: "Självständig körning",
    playable: true,
    summary: "Kör från Regeringsgatan till en annan namngiven gata.",
  },
  {
    id: "exam",
    title: "Simulerat körprov",
    area: "Sammanfattning",
    playable: true,
    summary: "En sammanhängande körning i korsningen. Inte Trafikverkets prov.",
  },
];
