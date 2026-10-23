import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { App } from "./App";

describe("App", () => {
  it("shows setup instructions and no map when the key is missing", () => {
    const html = renderToStaticMarkup(<App apiKey={null} />);
    expect(html).toContain("Google-nyckel saknas");
    expect(html).toContain("VITE_GOOGLE_MAPS_API_KEY");
    expect(html).toContain("Ingen gata är vald");
    expect(html).not.toContain("gmp-map-3d");
    expect(html).not.toContain("AIza");
  });
});
