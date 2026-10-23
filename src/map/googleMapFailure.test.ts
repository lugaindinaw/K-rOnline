import { describe, expect, it } from "vitest";
import {
  messageForGoogleMapsConsole,
  noteGoogleMapFailure,
  subscribeGoogleMapFailure,
} from "./googleMapFailure";

describe("messageForGoogleMapsConsole", () => {
  it("maps the invalid-key console error without keeping the request URL", () => {
    const message = messageForGoogleMapsConsole(
      "Google Maps JavaScript API error: InvalidKeyMapError\nhttps://developers.google.com/maps/documentation/javascript/error-messages#invalid-key-map-error",
    );
    expect(message).toContain("API-nyckeln");
    expect(message).not.toContain("http");
  });

  it("ignores unrelated console output", () => {
    expect(messageForGoogleMapsConsole("vanligt fel")).toBeNull();
  });
});

describe("subscribeGoogleMapFailure", () => {
  it("replays a failure that arrived before the current view subscribed", () => {
    const seen: string[] = [];
    noteGoogleMapFailure("nyckeln avvisades");
    const unsubscribe = subscribeGoogleMapFailure((message) => {
      seen.push(message);
    });

    expect(seen).toEqual(["nyckeln avvisades"]);
    unsubscribe();
  });
});
