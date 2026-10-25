import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { formatGeographicPosition, readGeographicPosition, type GeographicPosition } from "../geo/coordinates";
import { readGroundElevation } from "../geo/groundElevation";
import { STOCKHOLM_CANDIDATE } from "../geo/stockholmCandidate";
import type { RoadSegment } from "../roads/drivingRoads";
import {
  installGoogleMapFailureHook,
  subscribeGoogleMapFailure,
} from "./googleMapFailure";
import { loadMaps3dLibrary } from "./loadMaps3d";
import { publicMapError, resolveMapScreen, type MapPhase } from "./mapScreen";
import type { Map3DViewElement, Maps3dLibrary } from "./maps3dTypes";
import { createRoadOverlays, type RoadLine } from "./roadOverlays";

export type MapFocus = {
  token: number;
  lat: number;
  lng: number;
};

export type SwedenMapHandle = {
  readCenter: () => { lat: number; lng: number } | null;
};

type CityMapProps = {
  apiKey: string;
  onRetry: () => void;
  roads: RoadSegment[];
  focus: MapFocus | null;
  onReadyChange: (ready: boolean) => void;
};

function moveCamera(map: Map3DViewElement, lat: number, lng: number, altitude: number): void {
  const heading = typeof map.heading === "number" ? map.heading : STOCKHOLM_CANDIDATE.camera.headingDegrees;
  const endCamera = {
    center: { lat, lng, altitude },
    range: 900,
    tilt: 65,
    heading,
  };
  if (typeof map.flyCameraTo === "function") {
    map.flyCameraTo({ endCamera, durationMillis: 1600 });
    return;
  }
  map.center = endCamera.center;
  map.range = endCamera.range;
  map.tilt = endCamera.tilt;
  map.heading = heading;
}

export const CityMap = forwardRef<SwedenMapHandle, CityMapProps>(function CityMap(
  { apiKey, onRetry, roads, focus, onReadyChange },
  ref,
) {
  const hostRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<Map3DViewElement | null>(null);
  const libraryRef = useRef<Maps3dLibrary | null>(null);
  const linesRef = useRef<RoadLine[]>([]);
  const onReadyChangeRef = useRef(onReadyChange);
  const [phase, setPhase] = useState<MapPhase>("loading");
  const [mapVersion, setMapVersion] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | undefined>();
  const [steady, setSteady] = useState(false);
  const [click, setClick] = useState<GeographicPosition | null>(null);
  const [lineNote, setLineNote] = useState<string | null>(null);
  const screen = resolveMapScreen({ apiKey, phase, errorMessage });

  onReadyChangeRef.current = onReadyChange;

  useImperativeHandle(ref, () => ({
    readCenter() {
      const center = mapRef.current?.center;
      if (!center || typeof center.lat !== "number" || typeof center.lng !== "number") {
        return null;
      }
      return { lat: center.lat, lng: center.lng };
    },
  }));

  useEffect(() => {
    const host = hostRef.current;
    if (!host) {
      return;
    }

    let cancelled = false;
    let failed = false;

    const fail = (message: string) => {
      if (cancelled) {
        return;
      }
      failed = true;
      setErrorMessage(message);
      setPhase("error");
      onReadyChangeRef.current(false);
    };

    installGoogleMapFailureHook();
    const unsubscribeAuthFailure = subscribeGoogleMapFailure((message) => {
      fail(message);
    });

    const onError = () => {
      fail("3D-kartan kunde inte initieras. Kontrollera nyckeln, faktureringen och att Maps JavaScript API är aktiverat.");
    };

    const onSteady = (event: Event) => {
      if (cancelled) {
        return;
      }
      const steadyEvent = event as Event & { isSteady?: boolean };
      if (steadyEvent.isSteady === true) {
        setSteady(true);
      }
    };

    const onClick = (event: Event) => {
      const position = readGeographicPosition(
        (event as Event & { position?: unknown }).position,
      );
      if (position) {
        setClick(position);
      }
    };

    loadMaps3dLibrary(apiKey)
      .then((library) => {
        if (cancelled) {
          return;
        }

        const camera = STOCKHOLM_CANDIDATE.camera;
        const mapElement = new library.Map3DElement({
          center: {
            lat: camera.center.lat,
            lng: camera.center.lng,
            altitude: camera.center.altitudeMeters ?? 0,
          },
          range: camera.rangeMeters,
          tilt: camera.tiltDegrees,
          heading: camera.headingDegrees,
          mode: camera.mode,
        });
        mapElement.addEventListener("gmp-error", onError);
        mapElement.addEventListener("gmp-steadychange", onSteady);
        mapElement.addEventListener("gmp-click", onClick);
        host.replaceChildren(mapElement);
        mapRef.current = mapElement;
        libraryRef.current = library;
        if (!cancelled && !failed) {
          setPhase("ready");
          setMapVersion((version) => version + 1);
          onReadyChangeRef.current(true);
        }
      })
      .catch((error: unknown) => {
        fail(publicMapError(error));
      });

    return () => {
      cancelled = true;
      unsubscribeAuthFailure();
      const mapElement = mapRef.current;
      mapElement?.removeEventListener("gmp-error", onError);
      mapElement?.removeEventListener("gmp-steadychange", onSteady);
      mapElement?.removeEventListener("gmp-click", onClick);
      for (const line of linesRef.current) {
        line.remove();
      }
      linesRef.current = [];
      mapElement?.remove();
      mapRef.current = null;
      libraryRef.current = null;
      onReadyChangeRef.current(false);
    };
  }, [apiKey]);

  useEffect(() => {
    const map = mapRef.current;
    const library = libraryRef.current;
    if (!map || !library || phase !== "ready") {
      return;
    }
    for (const line of linesRef.current) {
      line.remove();
    }
    linesRef.current = [];
    if (roads.length === 0) {
      setLineNote(null);
      return;
    }
    if (typeof library.Polyline3DElement !== "function") {
      setLineNote("Vägdata är hämtad. 3D-linjerna kunde inte skapas.");
      return;
    }
    try {
      linesRef.current = createRoadOverlays(map, library.Polyline3DElement, roads);
      setLineNote(`${linesRef.current.length} väglinjer ligger på marken i vyn.`);
    } catch {
      setLineNote("Vägdata är hämtad. 3D-linjerna kunde inte ritas.");
    }
  }, [roads, phase, mapVersion]);

  useEffect(() => {
    const map = mapRef.current;
    if (!focus || !map || phase !== "ready") {
      return;
    }
    let cancelled = false;
    void (async () => {
      const ground = await readGroundElevation(focus.lat, focus.lng);
      if (cancelled || mapRef.current !== map) {
        return;
      }
      const altitude = (ground ?? 600) + 20;
      try {
        moveCamera(map, focus.lat, focus.lng, altitude);
      } catch {
        map.center = { lat: focus.lat, lng: focus.lng, altitude };
        map.range = 900;
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [focus, phase, mapVersion]);

  return (
    <section className="map-stage" aria-label="3D-karta över Sverige">
      <div ref={hostRef} className="map-host" />
      {screen.kind === "loading" ? (
        <div className="map-overlay" role="status">
          Laddar 3D-kartan…
        </div>
      ) : null}
      {screen.kind === "error" ? (
        <div className="map-overlay map-overlay-error" role="alert">
          <p>{screen.message}</p>
          <button type="button" onClick={onRetry}>
            Försök igen
          </button>
        </div>
      ) : null}
      {screen.kind === "ready" && !steady ? (
        <p className="map-pending" role="status">
          Kartbiblioteket är laddat. Väntar på att vyn ska bli stadig.
        </p>
      ) : null}
      {screen.kind === "ready" ? (
        <p className="click-readout">
          {lineNote ? `${lineNote} ` : ""}
          {click
            ? `Senaste klick: ${formatGeographicPosition(click)}. Klicket snäpps inte till en väg.`
            : "Klicka i kartan för att läsa en geografisk position. Klicket snäpps inte till en väg."}
        </p>
      ) : null}
    </section>
  );
});
