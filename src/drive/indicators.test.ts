import { describe, expect, it } from "vitest";
import { stepIndicator, toggleIndicator } from "./indicators";

describe("indicators", () => {
  it("toggles one side and cancels after the wheel returns", () => {
    expect(toggleIndicator("off", "left")).toBe("left");
    expect(toggleIndicator("left", "left")).toBe("off");
    expect(toggleIndicator("left", "right")).toBe("right");
    const armed = stepIndicator({ state: "right", armed: false }, 0.6);
    expect(armed).toEqual({ state: "right", armed: true });
    expect(stepIndicator(armed, 0.4).state).toBe("right");
    expect(stepIndicator(armed, 0).state).toBe("off");
    expect(stepIndicator({ state: "left", armed: false }, 0).state).toBe("left");
  });
});
