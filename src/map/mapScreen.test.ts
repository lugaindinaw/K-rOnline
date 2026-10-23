import { describe, expect, it } from "vitest";
import { publicMapError, resolveMapScreen } from "./mapScreen";

describe("resolveMapScreen", () => {
  it("asks for configuration before any load attempt", () => {
    expect(resolveMapScreen({ apiKey: null, phase: "loading" })).toEqual({
      kind: "missing-key",
    });
  });

  it("reports loading and ready only when a key exists", () => {
    expect(resolveMapScreen({ apiKey: "present", phase: "loading" }).kind).toBe("loading");
    expect(resolveMapScreen({ apiKey: "present", phase: "ready" }).kind).toBe("ready");
  });

  it("prefers an error over a ready phase", () => {
    expect(
      resolveMapScreen({
        apiKey: "present",
        phase: "error",
        errorMessage: "Nyckeln avvisades",
      }),
    ).toEqual({ kind: "error", message: "Nyckeln avvisades" });
  });
});

describe("publicMapError", () => {
  it("removes an API key if a loader error includes the request URL", () => {
    const error = new Error(
      "Could not load https://maps.googleapis.com/maps/api/js?key=secret-value&v=weekly",
    );
    expect(publicMapError(error)).not.toContain("secret-value");
    expect(publicMapError(error)).toContain("key=(dold)");
  });

  it("hides an internal Maps crash behind a Swedish configuration message", () => {
    const message = publicMapError(
      new TypeError("Cannot read properties of undefined (reading 'keys')"),
    );
    expect(message).toContain("Maps JavaScript API");
    expect(message).not.toContain("keys");
  });
});
