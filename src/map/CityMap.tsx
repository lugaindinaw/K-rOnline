import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import {
  choiceIndexFromKey,
  driveInputFromKeys,
  isTextEntry,
  rejoinVehicle,
  selectBranch,
  stepVehicle,
  vehicleFromPlacement,
  vehicleStatus,
  IDLE_VEHICLE,
  type VehicleState,
  type VehicleStatus,
} from "../drive/drive";
import { formatGeographicPosition, readGeographicPosition, type GeographicPosition } from "../geo/coordinates";
import { readGroundElevation } from "../geo/groundElevation";
import { STOCKHOLM_CANDIDATE } from "../geo/stockholmCandidate";
import type { RoadPoint, RoadSegment } from "../roads/drivingRoads";
import {
  EXTEND_LOADING_MESSAGE,
  prefetchCenter,
  shouldPrefetch,
  type CoverageCircle,
} from "../roads/roadCoverage";
import {
  explainRoads,
  nearestPlacement,
  placementWithRunway,
  START_SNAP_METERS,
  type RoadNetwork,
} from "../roads/roadNetwork";
import {
  installGoogleMapFailureHook,
  subscribeGoogleMapFailure,
} from "./googleMapFailure";
import { loadMaps3dLibrary } from "./loadMaps3d";
import { publicMapError, resolveMapScreen, type MapPhase } from "./mapScreen";
import type { Map3DViewElement, Maps3dLibrary } from "./maps3dTypes";
import { createRoadOverlays, type RoadLine } from "./roadOverlays";
import { mountRoadVehicle, type RoadVehicle } from "./roadVehicle";

export type MapFocus = {
  token: number;
  lat: number;
  lng: number;
};

export type SwedenMapHandle = {
  readCenter: () => { lat: number; lng: number } | null;
  chooseBranch: (index: number) => void;
  setPedal: (pedal: "accelerate" | "brake", pressed: boolean) => void;
};

type CityMapProps = {
  apiKey: string;
  onRetry: () => void;
  roads: RoadSegment[];
  areas: CoverageCircle[];
  anchor: RoadPoint | null;
  focus: MapFocus | null;
  extendHint: string | null;
  onReadyChange: (ready: boolean) => void;
  onVehicleChange: (status: VehicleStatus) => void;
  onExtendRoads: (center: RoadPoint) => void;
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

function poseOf(state: VehicleState) {
  return {
    lat: state.position.lat,
    lng: state.position.lng,
    headingDegrees: state.headingDegrees,
  };
}

export const CityMap = forwardRef<SwedenMapHandle, CityMapProps>(function CityMap(
  { apiKey, onRetry, roads, areas, anchor, focus, extendHint, onReadyChange, onVehicleChange, onExtendRoads },
  ref,
) {
  const hostRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<Map3DViewElement | null>(null);
  const libraryRef = useRef<Maps3dLibrary | null>(null);
  const linesRef = useRef<RoadLine[]>([]);
  const onReadyChangeRef = useRef(onReadyChange);
  const onVehicleChangeRef = useRef(onVehicleChange);
  const onExtendRef = useRef(onExtendRoads);
  const areasRef = useRef(areas);
  const extendHintRef = useRef(extendHint);
  const carryRef = useRef<VehicleState | null>(null);
  const vehicleRef = useRef<VehicleState | null>(null);
  const networkRef = useRef<RoadNetwork | null>(null);
  const vehicleViewRef = useRef<RoadVehicle | null>(null);
  const keysRef = useRef(new Set<string>());
  const pedalsRef = useRef({ accelerate: false, brake: false });
  const followRef = useRef(false);
  const lookAltitudeRef = useRef(25);
  const cameraJobRef = useRef(0);
  const signatureRef = useRef("");
  const [phase, setPhase] = useState<MapPhase>("loading");
  const [mapVersion, setMapVersion] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | undefined>();
  const [steady, setSteady] = useState(false);
  const [click, setClick] = useState<GeographicPosition | null>(null);
  const [lineNote, setLineNote] = useState<string | null>(null);
  const [snapNote, setSnapNote] = useState<string | null>(null);
  const [hud, setHud] = useState<VehicleStatus>(IDLE_VEHICLE);
  const screen = resolveMapScreen({ apiKey, phase, errorMessage });

  onReadyChangeRef.current = onReadyChange;
  onVehicleChangeRef.current = onVehicleChange;
  onExtendRef.current = onExtendRoads;
  areasRef.current = areas;
  extendHintRef.current = extendHint;

  const publishRef = useRef<(state: VehicleState | null, message?: string | null) => void>(() => undefined);
  publishRef.current = (state, message) => {
    const status = vehicleStatus(state, message);
    const signature = JSON.stringify(status);
    if (signature === signatureRef.current) {
      return;
    }
    signatureRef.current = signature;
    setHud(status);
    onVehicleChangeRef.current(status);
  };

  const chooseRef = useRef<(index: number) => void>(() => undefined);
  chooseRef.current = (index) => {
    const network = networkRef.current;
    const vehicle = vehicleRef.current;
    if (!network || !vehicle) {
      return;
    }
    const next = selectBranch(network, vehicle, index);
    if (next === vehicle) {
      return;
    }
    vehicleRef.current = next;
    vehicleViewRef.current?.update(poseOf(next));
    publishRef.current(next);
  };

  const flyToCarRef = useRef<(lat: number, lng: number, heading: number) => void>(() => undefined);
  flyToCarRef.current = (lat, lng, heading) => {
    const map = mapRef.current;
    if (!map) {
      return;
    }
    const job = cameraJobRef.current + 1;
    cameraJobRef.current = job;
    const currentAltitude = typeof map.center?.altitude === "number" ? map.center.altitude : lookAltitudeRef.current;
    lookAltitudeRef.current = currentAltitude;
    const show = (altitude: number, carLat: number, carLng: number, carHeading: number) => {
      const endCamera = {
        center: { lat: carLat, lng: carLng, altitude },
        range: 90,
        tilt: 67,
        heading: carHeading,
      };
      if (typeof map.flyCameraTo === "function") {
        map.flyCameraTo({ endCamera, durationMillis: 900 });
        return;
      }
      map.center = endCamera.center;
      map.range = endCamera.range;
      map.tilt = endCamera.tilt;
      map.heading = carHeading;
    };
    show(currentAltitude, lat, lng, heading);
    void readGroundElevation(lat, lng).then((ground) => {
      if (job !== cameraJobRef.current || mapRef.current !== map || ground == null) {
        return;
      }
      lookAltitudeRef.current = ground + 2;
      const position = vehicleRef.current?.position ?? { lat, lng };
      const carHeading = vehicleRef.current?.headingDegrees ?? heading;
      show(lookAltitudeRef.current, position.lat, position.lng, carHeading);
    });
  };

  useImperativeHandle(ref, () => ({
    readCenter() {
      const center = mapRef.current?.center;
      if (!center || typeof center.lat !== "number" || typeof center.lng !== "number") {
        return null;
      }
      return { lat: center.lat, lng: center.lng };
    },
    chooseBranch(index: number) {
      chooseRef.current(index);
    },
    setPedal(pedal, pressed) {
      pedalsRef.current[pedal] = pressed;
    },
  }));

  useEffect(() => {
    const keys = keysRef.current;
    const onKeyDown = (event: KeyboardEvent) => {
      if (isTextEntry(event.target)) {
        return;
      }
      const code =
        event.code ||
        (event.key === "w" || event.key === "W"
          ? "KeyW"
          : event.key === "s" || event.key === "S"
            ? "KeyS"
            : event.key === "ArrowUp"
              ? "ArrowUp"
              : event.key === "ArrowDown"
                ? "ArrowDown"
                : event.key >= "1" && event.key <= "9"
                  ? `Digit${event.key}`
                  : "");
      if (code === "ArrowUp" || code === "ArrowDown") {
        event.preventDefault();
      }
      if (!code) {
        return;
      }
      keys.add(code);
      const index = choiceIndexFromKey(code);
      if (index !== null) {
        chooseRef.current(index);
      }
    };
    const onKeyUp = (event: KeyboardEvent) => {
      keys.delete(event.code);
      if (event.key === "w" || event.key === "W") {
        keys.delete("KeyW");
      }
      if (event.key === "s" || event.key === "S") {
        keys.delete("KeyS");
      }
      if (event.key === "ArrowUp") {
        keys.delete("ArrowUp");
      }
      if (event.key === "ArrowDown") {
        keys.delete("ArrowDown");
      }
    };
    const clearKeys = () => {
      keys.clear();
    };
    window.addEventListener("keydown", onKeyDown, true);
    window.addEventListener("keyup", onKeyUp, true);
    window.addEventListener("blur", clearKeys);
    return () => {
      window.removeEventListener("keydown", onKeyDown, true);
      window.removeEventListener("keyup", onKeyUp, true);
      window.removeEventListener("blur", clearKeys);
      keys.clear();
    };
  }, []);

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
      if (!position) {
        return;
      }
      setClick(position);
      const network = networkRef.current;
      if (!network || network.edges.length === 0) {
        setSnapNote("Det finns inget körbart vägnät att placera bilen på.");
        return;
      }
      const nearest = nearestPlacement(network, position, START_SNAP_METERS);
      const placement = nearest ? placementWithRunway(nearest) : null;
      if (!placement) {
        setSnapNote(`Ingen körbar väg inom ${START_SNAP_METERS} m från klicket.`);
        return;
      }
      setSnapNote(null);
      followRef.current = false;
      const placed = vehicleFromPlacement(placement);
      vehicleRef.current = placed;
      vehicleViewRef.current?.update(poseOf(placed));
      publishRef.current(placed);
      flyToCarRef.current(placed.position.lat, placed.position.lng, placed.headingDegrees);
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
      vehicleViewRef.current?.remove();
      vehicleViewRef.current = null;
      vehicleRef.current = null;
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
    const carried = carryRef.current;
    carryRef.current = null;
    const map = mapRef.current;
    const library = libraryRef.current;
    if (!map || !library || phase !== "ready" || roads.length === 0) {
      if (roads.length === 0) {
        carryRef.current = null;
        vehicleViewRef.current?.remove();
        vehicleViewRef.current = null;
        vehicleRef.current = null;
        followRef.current = false;
        networkRef.current = null;
        publishRef.current(null, null);
      }
      return;
    }

    const explained = explainRoads(roads, anchor);
    networkRef.current = explained.network;
    if (carried) {
      const rejoined = rejoinVehicle(carried, explained.network);
      vehicleRef.current = rejoined;
      const view = vehicleViewRef.current ?? mountRoadVehicle(map, library);
      vehicleViewRef.current = view;
      view?.update(poseOf(rejoined));
      publishRef.current(rejoined);
      return () => {
        carryRef.current = vehicleRef.current;
        vehicleViewRef.current?.remove();
        vehicleViewRef.current = null;
        vehicleRef.current = null;
      };
    }

    followRef.current = false;
    const placement = explained.placement ? placementWithRunway(explained.placement) : null;
    if (!placement) {
      vehicleViewRef.current?.remove();
      vehicleViewRef.current = null;
      vehicleRef.current = null;
      publishRef.current(null, explained.message);
      return;
    }

    const placed = vehicleFromPlacement(placement);
    if (explained.message) {
      placed.message = explained.message;
    }
    vehicleRef.current = placed;
    const view = mountRoadVehicle(map, library);
    vehicleViewRef.current = view;
    if (!view) {
      placed.message = "Bilen kan inte ritas i den här 3D-vyn. Vägnätet är ändå redo.";
    } else {
      view.update(poseOf(placed));
    }
    publishRef.current(placed);
    lookAltitudeRef.current = typeof map.center?.altitude === "number" ? map.center.altitude : 25;
    flyToCarRef.current(placed.position.lat, placed.position.lng, placed.headingDegrees);

    return () => {
      carryRef.current = vehicleRef.current;
      vehicleViewRef.current?.remove();
      vehicleViewRef.current = null;
      vehicleRef.current = null;
    };
  }, [roads, anchor, phase, mapVersion]);

  useEffect(() => {
    if (phase !== "ready") {
      return;
    }
    let frame = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      const network = networkRef.current;
      const vehicle = vehicleRef.current;
      if (network && vehicle) {
        const input = driveInputFromKeys(keysRef.current);
        input.accelerate = input.accelerate || pedalsRef.current.accelerate;
        input.brake = input.brake || pedalsRef.current.brake;
        if (input.accelerate) {
          followRef.current = true;
        }
        let next = stepVehicle(network, vehicle, input, dt);
        if (next.mode === "ended" && shouldPrefetch(next.position, areasRef.current)) {
          const hint = extendHintRef.current;
          const message = hint && hint.length > 0 ? hint : EXTEND_LOADING_MESSAGE;
          if (next.message !== message) {
            next = { ...next, message };
          }
        }
        if (shouldPrefetch(next.position, areasRef.current)) {
          onExtendRef.current(prefetchCenter(next.position, next.headingDegrees));
        }
        if (next !== vehicle) {
          vehicleRef.current = next;
          vehicleViewRef.current?.update(poseOf(next));
          publishRef.current(next);
        }
        const map = mapRef.current;
        if (followRef.current && map) {
          const current = vehicleRef.current ?? next;
          map.center = {
            lat: current.position.lat,
            lng: current.position.lng,
            altitude: lookAltitudeRef.current,
          };
          map.range = 85;
          map.tilt = 64;
          map.heading = current.headingDegrees;
        }
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
    };
  }, [phase, mapVersion]);

  useEffect(() => {
    const map = mapRef.current;
    if (!focus || !map || phase !== "ready") {
      return;
    }
    const job = cameraJobRef.current + 1;
    cameraJobRef.current = job;
    let cancelled = false;
    void (async () => {
      const ground = await readGroundElevation(focus.lat, focus.lng);
      if (cancelled || mapRef.current !== map || job !== cameraJobRef.current) {
        return;
      }
      const altitude = (ground ?? 600) + 20;
      lookAltitudeRef.current = altitude;
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

  const hudText = snapNote
    ? snapNote
    : hud.message
      ? hud.message
      : hud.placed
        ? `${hud.speedKmh} km/h${hud.roadName ? ` · ${hud.roadName}` : ""}`
        : "Klicka nära en väglinje för att flytta bilen.";

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
          {hudText}
          {click ? ` Senaste klick: ${formatGeographicPosition(click)}.` : ""}
        </p>
      ) : null}
    </section>
  );
});
