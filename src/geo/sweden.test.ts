import { describe, expect, it } from "vitest";
import { isInSweden } from "./sweden";

describe("isInSweden", () => {
  it("includes cities, small towns, and the large islands", () => {
    expect(isInSweden(59.3293, 18.0686)).toBe(true);
    expect(isInSweden(57.7089, 11.9746)).toBe(true);
    expect(isInSweden(55.605, 13.0038)).toBe(true);
    expect(isInSweden(67.8558, 20.2253)).toBe(true);
    expect(isInSweden(57.6348, 18.2948)).toBe(true);
    expect(isInSweden(65.258, 19.654)).toBe(true);
    expect(isInSweden(65.835, 24.136)).toBe(true);
    expect(isInSweden(65.584, 22.154)).toBe(true);
    expect(isInSweden(56.661, 16.669)).toBe(true);
    expect(isInSweden(68.349, 18.831)).toBe(true);
  });

  it("rejects places clearly outside Sweden", () => {
    expect(isInSweden(59.9139, 10.7522)).toBe(false);
    expect(isInSweden(55.6761, 12.5683)).toBe(false);
    expect(isInSweden(60.1699, 24.9384)).toBe(false);
    expect(isInSweden(68.438, 17.427)).toBe(false);
    expect(isInSweden(52.52, 13.405)).toBe(false);
    expect(isInSweden(Number.NaN, 18)).toBe(false);
  });
});
