import { describe, expect, it } from "vitest";
import { PLACE_EXAMPLES, buildNominatimSearchUrl, parseNominatimPlaces } from "./swedishPlaces";

describe("buildNominatimSearchUrl", () => {
  it("limits search to Sweden and ignores a too-short query", () => {
    const url = buildNominatimSearchUrl("  Kiruna ");
    expect(url).toContain("countrycodes=se");
    expect(url).toContain("q=Kiruna");
    expect(buildNominatimSearchUrl(" ")).toBeNull();
  });
});

describe("parseNominatimPlaces", () => {
  it("keeps Swedish results and drops other countries", () => {
    const places = parseNominatimPlaces([
      {
        place_id: 1,
        lat: "67.8496111",
        lon: "20.3062500",
        display_name: "Kiruna, Kiruna kommun, Norrbottens län, Sverige",
        addresstype: "town",
        address: { country_code: "se" },
      },
      {
        place_id: 2,
        lat: "60.1699",
        lon: "24.9384",
        display_name: "Helsingfors, Finland",
        address: { country_code: "fi" },
      },
    ]);
    expect(places).toEqual([
      {
        id: "1",
        label: "Kiruna, Kiruna kommun, Norrbottens län",
        lat: 67.8496111,
        lng: 20.30625,
        kind: "town",
      },
    ]);
  });
});

describe("PLACE_EXAMPLES", () => {
  it("are search phrases, not road geometries", () => {
    expect(PLACE_EXAMPLES).toContain("Glommersträsk");
    expect(PLACE_EXAMPLES.join(" ")).not.toMatch(/\d+\.\d+/);
  });
});
