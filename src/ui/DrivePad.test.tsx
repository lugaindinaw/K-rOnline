import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DrivePad } from "./DrivePad";

describe("DrivePad", () => {
  it("offers the in-car view, the outside view and tilt steering", () => {
    const inside = renderToStaticMarkup(
      <DrivePad
        cameraView="driver"
        tiltOn={false}
        tiltNote={null}
        onGas={() => undefined}
        onBrake={() => undefined}
        onSteer={() => undefined}
        onIndicator={() => undefined}
        onCamera={() => undefined}
        onTilt={() => undefined}
      />,
    );
    expect(inside).toContain("Utanför bilen");
    expect(inside).toContain("Styr med lutning");
    expect(inside).toContain("Gas");
    expect(inside).toContain("Broms");
    const outside = renderToStaticMarkup(
      <DrivePad
        cameraView="chase"
        tiltOn
        tiltNote="Luta mobilen i sidled för att styra."
        onGas={() => undefined}
        onBrake={() => undefined}
        onSteer={() => undefined}
        onIndicator={() => undefined}
        onCamera={() => undefined}
        onTilt={() => undefined}
      />,
    );
    expect(outside).toContain("I bilen");
    expect(outside).toContain("Lutning på");
    expect(outside).toContain("Luta mobilen");
  });
});
