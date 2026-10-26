import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { IDLE_VEHICLE } from "../drive/drive";
import { beginAttempt, finishAttempt, type ApproachAttempt } from "../training/approach";
import { SwedenPanel } from "./SwedenPanel";

function markup(overrides: Partial<Parameters<typeof SwedenPanel>[0]> = {}): string {
  return renderToStaticMarkup(
    <SwedenPanel
      query=""
      onQueryChange={() => undefined}
      onSearch={() => undefined}
      searching={false}
      places={[]}
      placeMessage={null}
      onSelectPlace={() => undefined}
      onExample={() => undefined}
      areaLabel="Stockholm"
      radiusMeters={600}
      roads={[]}
      matched={0}
      truncated={false}
      loadingRoads={false}
      roadError={null}
      extendNote={null}
      vehicle={IDLE_VEHICLE}
      onChooseBranch={() => undefined}
      onPedal={() => undefined}
      onSteer={() => undefined}
      onLoadAtCamera={() => undefined}
      cameraAvailable={false}
      trainingOpen={false}
      onToggleTraining={() => undefined}
      trainingError={null}
      attempt={finishAttempt(beginAttempt())}
      onStartExercise={() => undefined}
      onFinishExercise={() => undefined}
      onRetryExercise={() => undefined}
      cameraView="chase"
      onToggleCamera={() => undefined}
      {...overrides}
    />,
  );
}

describe("SwedenPanel", () => {
  it("explains how to search, accelerate, brake, and choose a road", () => {
    const html = markup();
    expect(html).toContain("Så börjar du");
    expect(html).toContain("Sök en ort i Sverige");
    expect(html).toContain("Gasa med W, pil upp eller Gas");
    expect(html).toContain("Bromsa med S, pil ned eller Broms");
    expect(html).toContain("1–9");
    expect(html).toContain("Vänster");
    expect(html).toContain("Höger");
    expect(html).toContain("i sidled längs vägen");
    expect(html).not.toContain("fri styrning");
    expect(html).toContain("Förarvy");
    expect(html).toContain("förarens ögonhöjd");
    expect(html).toContain("Stockholm är startposition");
    expect(html).toContain("OpenStreetMap");
    expect(html).not.toContain("Närma dig en korsning");
  });

  it("explains the exercise when training is open", () => {
    const html = markup({ trainingOpen: true, attempt: beginAttempt() });
    expect(html).toContain("Närma dig en korsning");
    expect(html).toContain("Övningen går ut på");
    expect(html).toContain("Starta övning ställer bilen");
    expect(html).toContain("Avsluta övning visar återkopplingen");
    expect(html).toContain("Försök igen nollställer mätningarna");
    expect(html).toContain("Övningen pågår. Gasa och bromsa som vanligt.");
    expect(html).not.toContain("Uppmätta fakta");
  });

  it("shows recorded facts separately from advice", () => {
    const attempt: ApproachAttempt = {
      ...finishAttempt(beginAttempt()),
      speedAt40Kmh: 43,
      speedAt30Kmh: 0,
      speedAt20Kmh: null,
      slowedDown: true,
      slowdownKnown: true,
      stoppedBefore: true,
      completed: false,
    };
    const html = markup({ trainingOpen: true, attempt });
    expect(html).toContain("Uppmätta fakta");
    expect(html).toContain("43 km/h");
    expect(html).toContain("0 km/h");
    expect(html).toContain("Inte uppmätt");
    expect(html).toContain("Hastigheten minskade");
    expect(html).toContain("Stannade före korsningen");
    expect(html).toContain("Korsningen nåddes");
    expect(html).toContain(">Nej<");
    expect(html).toContain("Råd:");
    expect(html).toContain("inte ett godkänt- eller underkäntresultat");
    expect(html).not.toContain("Godkänd");
    expect(html).not.toContain("Underkänd");
  });
});
