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
    playable: false,
    summary: "Belysning, reglage och kontroll före körning.",
  },
  {
    id: "city",
    title: "Stadstrafik genom korsningen",
    area: "Körning i tätort",
    playable: true,
    summary: "Korsning, blinkers, väjningsplikt och placering tillsammans med annan trafik.",
  },
  {
    id: "signals",
    title: "Trafikljus och rondell",
    area: "Körning i tätort",
    playable: false,
    summary: "Ljusreglerade korsningar och cirkulationsplatser.",
  },
  {
    id: "parking",
    title: "Parkering, backning och vändning",
    area: "Manövrering",
    playable: false,
    summary: "Fickparkering, backning, vändning och start i lutning.",
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
    playable: false,
    summary: "Hastighet, möte och sikt utanför stan.",
  },
  {
    id: "motorway",
    title: "Motorväg och omkörning",
    area: "Körning på landsväg",
    playable: false,
    summary: "Påfart, omkörning och avfart.",
  },
  {
    id: "works",
    title: "Vägarbete och järnväg",
    area: "Körning i trafik",
    playable: false,
    summary: "Tillfällig skyltning och korsande spår.",
  },
  {
    id: "risk",
    title: "Mörker, regn och halka",
    area: "Riskmedvetenhet",
    playable: false,
    summary: "Sikt, avstånd och halt underlag.",
  },
  {
    id: "independent",
    title: "Körning mot mål",
    area: "Självständig körning",
    playable: false,
    summary: "Välj väg och kör fram till ett mål.",
  },
  {
    id: "exam",
    title: "Övningsprov",
    area: "Sammanfattning",
    playable: false,
    summary: "En simulerad genomgång i spelet. Inte Trafikverkets körprov.",
  },
];
