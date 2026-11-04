import { describe, expect, it } from "vitest";
import { finishCityReview, reviewCityDrive } from "./cityPractice";

const lines = [
  "Högsta fart: 28 km/h",
  "Broms använd: ja",
  "Styrning: vänster",
  "Största avstånd från mittlinjen: 1.4 m",
  "Blinkers före sväng: använd",
  "Väjningsplikt nod 507946854: bilen stannade",
];

describe("city practice review", () => {
  it("gives a high score when the city checks were done", () => {
    const review = reviewCityDrive({
      lines,
      roadName: "Jakobsgatan",
      startRoad: "Regeringsgatan",
      trafficCount: 3,
    });
    expect(review.score).toBe(100);
    expect(review.points.every((point) => point.mark === "bra")).toBe(true);
    expect(review.points.map((point) => point.title)).toContain("Andra trafikanter");
  });

  it("asks for practice when a turn had no indicator and a yield was passed", () => {
    const review = finishCityReview(
      reviewCityDrive({
        lines: [
          "Högsta fart: 36 km/h",
          "Broms använd: nej",
          "Styrning: höger",
          "Största avstånd från mittlinjen: 6.2 m",
          "Blinkers före sväng: inte använd",
          "Väjningsplikt nod 507946854: passerade utan stopp",
        ],
        roadName: "Regeringsgatan",
        startRoad: "Regeringsgatan",
        trafficCount: 0,
      }),
    );
    expect(review.score).toBeLessThan(50);
    expect(review.points.find((point) => point.title === "Blinkers")?.mark).toBe("träna");
    expect(review.points.find((point) => point.title === "Väjningsplikt")?.mark).toBe("träna");
    expect(review.live).toBe("Övningen är avslutad.");
  });
});
