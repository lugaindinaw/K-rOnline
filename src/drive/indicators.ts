export type IndicatorState = "off" | "left" | "right";

export type IndicatorMotion = {
  state: IndicatorState;
  /** True after the wheel has turned toward the lit side. */
  armed: boolean;
};

export const INDICATOR_OFF: IndicatorMotion = { state: "off", armed: false };

export function toggleIndicator(current: IndicatorState, side: "left" | "right"): IndicatorState {
  return current === side ? "off" : side;
}

/**
 * A lit indicator goes out after the wheel has turned that way and come back
 * near the middle. Indicating without turning leaves it on.
 */
export function stepIndicator(motion: IndicatorMotion, steer: number): IndicatorMotion {
  if (motion.state === "off") {
    return INDICATOR_OFF;
  }
  const command = Number.isFinite(steer) ? Math.max(-1, Math.min(1, steer)) : 0;
  const toward = motion.state === "left" ? command < -0.28 : command > 0.28;
  const armed = motion.armed || toward;
  if (armed && Math.abs(command) < 0.12) {
    return INDICATOR_OFF;
  }
  return { state: motion.state, armed };
}
