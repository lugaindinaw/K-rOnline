import type { GeographicPosition } from "./coordinates";

/**
 * Stockholm is the candidate city. Country-level availability of Maps
 * JavaScript 3D for Sweden was listed on Google's coverage table on
 * 2026-10-23. Street-level photorealistic surface coverage could not be
 * read from the interactive coverage map, so no street is selected.
 */
export const STOCKHOLM_CANDIDATE = {
  city: "Stockholm",
  countryCode: "SE",
  streetName: null,
  surfaceCoverage: "unverified",
  countryProductListing: {
    mapsJavaScript3d: "available",
    mapTiles3d: "available",
    sourceUrl: "https://developers.google.com/maps/coverage",
    surfaceMapUrl: "https://developers.google.com/maps/documentation/javascript/3d/coverage",
    checkedOn: "2026-10-23",
  },
  camera: {
    center: {
      lat: 59.3293,
      lng: 18.0686,
      altitudeMeters: 25,
    } satisfies GeographicPosition,
    rangeMeters: 700,
    tiltDegrees: 68,
    headingDegrees: 25,
    mode: "HYBRID",
  },
} as const;

export type MapModeName = "HYBRID" | "SATELLITE";
