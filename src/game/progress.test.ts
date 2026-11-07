import { describe, expect, it } from "vitest";
import { PASS_SCORE, readProgress, recordAttempt, type ProgressStore } from "./progress";

function memory(): ProgressStore {
  const values = new Map<string, string>();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => {
      values.set(key, value);
    },
  };
}

describe("exercise progress", () => {
  it("keeps the best score and marks a pass from 70 points", () => {
    const store = memory();
    expect(readProgress(store)).toEqual({});
    recordAttempt("night", 50, store);
    const passed = recordAttempt("night", 80, store);
    expect(passed.night).toEqual({ best: 80, attempts: 2, passed: true });
    expect(PASS_SCORE).toBe(70);
    recordAttempt("night", 40, store);
    expect(readProgress(store).night?.best).toBe(80);
    expect(readProgress(store).night?.attempts).toBe(3);
  });
});
