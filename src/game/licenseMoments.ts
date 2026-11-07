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
    title: "Parkering, backning och vändning",
    area: "Manövrering",
    playable: true,
    summary: "Kör en kort bit och stanna vid vägkanten.",
  },
  {
    id: "lanes",
    title: "Körfält och filbyte",
    area: "Körning i tätort",
    playable: false,
    summary: "Placering, filbyte och samspel med andra trafikanter.",
  },
  {
    id: "rural",
    title: "Landsväg och möte",
    area: "Körning på landsväg",
    playable: true,
    summary: "Håll en jämn fart och stanna i körfältet.",
  },
  {
    id: "motorway",
    title: "Motorväg och omkörning",
    area: "Körning på landsväg",
    playable: true,
    summary: "Håll jämn fart och körfält. Toppfarten i prototypen är begränsad.",
  },
  {
    id: "works",
    title: "Vägarbete och järnväg",
    area: "Körning i trafik",
    playable: false,
    summary: "Tillfällig skyltning och korsande spår.",
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
    title: "Övningsprov",
    area: "Sammanfattning",
    playable: false,
    summary: "En simulerad genomgång i spelet. Inte Trafikverkets körprov.",
  },
];
