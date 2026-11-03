import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CarInterior } from "./CarInterior";

describe("CarInterior", () => {
  it("draws a wheel, a speedometer, the windshield and a mirror", () => {
    const html = renderToStaticMarkup(
      <CarInterior
        library={null}
        poseRef={{
          current: {
            lat: 59.33,
            lng: 18.06,
            headingDegrees: 0,
            speedKmh: 0,
            steer: 0,
            altitude: 25,
            placed: false,
          },
        }}
      />,
    );
    expect(html).toContain("Ratt");
    expect(html).toContain("Hastighetsmätare");
    expect(html).toContain("km/h");
    expect(html).toContain("cockpit-pillar");
    expect(html).toContain("cockpit-door");
    expect(html).toContain("cockpit-mirror");
  });
});
