import { importLibrary, setOptions } from "@googlemaps/js-api-loader";
import { isMaps3dLibrary, type Maps3dLibrary } from "./maps3dTypes";

let configuredKey: string | null = null;
let inflight: Promise<Maps3dLibrary> | null = null;

export function loadMaps3dLibrary(apiKey: string): Promise<Maps3dLibrary> {
  const key = apiKey.trim();
  if (!key) {
    return Promise.reject(new Error("API-nyckel saknas."));
  }

  if (configuredKey !== key) {
    setOptions({
      key,
      v: "weekly",
      language: "sv",
      region: "SE",
    });
    configuredKey = key;
    inflight = null;
  }

  if (!inflight) {
    inflight = importLibrary("maps3d")
      .then((library) => {
        if (!isMaps3dLibrary(library)) {
          throw new Error("Maps JavaScript API svarade utan Map3DElement.");
        }
        return library;
      })
      .catch((error: unknown) => {
        inflight = null;
        throw error;
      });
  }

  return inflight;
}
