import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import {
  choiceIndexFromKey,
  driveInputFromKeys,
  isTextEntry,
  selectBranch,
  vehicleFromPlacement,
  vehicleStatus,
  IDLE_VEHICLE,
  MAX_FRAME_SECONDS,
  type VehicleState,
  type VehicleStatus,
} from "../drive/drive";
import { advanceFreeVehicle, describeFreeVehicle } from "../drive/freeDrive";
import { formatGeographicPosition, readGeographicPosition, type GeographicPosition } from "../geo/coordinates";
import { readGroundElevation } from "../geo/groundElevation";
import { STOCKHOLM_CANDIDATE } from "../geo/stockholmCandidate";
import type { OmittedRoad, RoadPoint, RoadSegment } from "../roads/drivingRoads";
import {
  prefetchCenter,
  shouldPrefetch,
  type CoverageCircle,
} from "../roads/roadCoverage";
import {
  explainRoads,
  nearestPlacement,
  placementWithRunway,
  recordOmittedLinks,
  START_SNAP_METERS,
  type RoadNetwork,
} from "../roads/roadNetwork";
import { refreshTraffic, stepTraffic, type TrafficCar } from "../traffic/traffic";
import type { DriveSample } from "../training/approach";
import {
  installGoogleMapFailureHook,
  subscribeGoogleMapFailure,
} from "./googleMapFailure";
import { loadMaps3dLibrary } from "./loadMaps3d";
import { publicMapError, resolveMapScreen, type MapPhase } from "./mapScreen";
import type { Map3DViewElement, Maps3dLibrary } from "./maps3dTypes";
import {
  CHASE_TILT_DEGREES,
  claimCameraJob,
  followCameraFromView,
  followCameraStep,
  type CameraView,
  type FollowCamera,
} from "./followCamera";
import { createRoadOverlays, type RoadLine } from "./roadOverlays";
import { mountRoadVehicle, mountTrafficVehicle, type RoadVehicle } from "./roadVehicle";

export type MapFocus = {
  token: number;
  lat: number;
  lng: number;
};

export type SwedenMapHandle = {
  readCenter: () => { lat: number; lng: number } | null;
  chooseBranch: (index: number) => void;
  setPedal: (pedal: "accelerate" | "brake", pressed: boolean) => void;
  setSteer: (side: "left" | "right", pressed: boolean) => void;
  placeAlong: (edgeId: string, distanceMeters: number) => boolean;
  setCameraView: (view: CameraView) => void;
};

const NO_OMITTED_ROADS: readonly OmittedRoad[] = [];

type CityMapProps = {
  apiKey: string;
  onRetry: () => void;
  roads: RoadSegment[];
  omittedRoads?: readonly OmittedRoad[];
  areas: CoverageCircle[];
  anchor: RoadPoint | null;
  focus: MapFocus | null;
  onReadyChange: (ready: boolean) => void;
  onVehicleChange: (status: VehicleStatus) => void;
  onExtendRoads: (center: RoadPoint) => void;
  onDriveSample?: (sample: DriveSample) => void;
  rideHint?: string | null;
  cameraView?: CameraView;
  onCameraViewChange?: (view: CameraView) => void;
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
  {
    apiKey,
    onRetry,
    roads,
    omittedRoads = NO_OMITTED_ROADS,
    areas,
    anchor,
    focus,
    onReadyChange,
    onVehicleChange,
    onExtendRoads,
    onDriveSample,
    rideHint = null,
    cameraView = "chase",
    onCameraViewChange,
  },
  ref,
) {
  const hostRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<Map3DViewElement | null>(null);
  const libraryRef = useRef<Maps3dLibrary | null>(null);
  const linesRef = useRef<RoadLine[]>([]);
  const onReadyChangeRef = useRef(onReadyChange);
  const onVehicleChangeRef = useRef(onVehicleChange);
  const onExtendRef = useRef(onExtendRoads);
  const onSampleRef = useRef(onDriveSample);
  const areasRef = useRef(areas);
  const carryRef = useRef<VehicleState | null>(null);
  const vehicleRef = useRef<VehicleState | null>(null);
  const networkRef = useRef<RoadNetwork | null>(null);
  const vehicleViewRef = useRef<RoadVehicle | null>(null);
  const trafficRef = useRef<TrafficCar[]>([]);
  const trafficViewsRef = useRef<Map<string, RoadVehicle>>(new Map());
  const keysRef = useRef(new Set<string>());
  const pedalsRef = useRef({ accelerate: false, brake: false });
  const steerHoldRef = useRef({ left: false, right: false });
  const followRef = useRef(false);
  const followCameraRef = useRef<FollowCamera | null>(null);
  const cameraViewRef = useRef<CameraView>(cameraView);
  const onCameraViewChangeRef = useRef(onCameraViewChange);
  cameraViewRef.current = cameraView;
  onCameraViewChangeRef.current = onCameraViewChange;
  const followJobRef = useRef(0);
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
  onSampleRef.current = onDriveSample;
  areasRef.current = areas;

  const clearTraffic = () => {
    for (const view of trafficViewsRef.current.values()) {
      view.remove();
    }
    trafficViewsRef.current.clear();
    trafficRef.current = [];
  };

  const syncTrafficViews = () => {
    const map = mapRef.current;
    const library = libraryRef.current;
    const views = trafficViewsRef.current;
    const ids = new Set(trafficRef.current.map((car) => car.id));
    for (const [id, view] of views) {
      if (!ids.has(id)) {
        view.remove();
        views.delete(id);
      }
    }
    if (!map || !library) {
      return;
    }
    for (const car of trafficRef.current) {
      let view = views.get(car.id);
      if (!view) {
        const mounted = mountTrafficVehicle(map, library);
        if (!mounted) {
          continue;
        }
        view = mounted;
        views.set(car.id, view);
      }
      view.update({
        lat: car.position.lat,
        lng: car.position.lng,
        headingDegrees: car.headingDegrees,
      });
    }
  };

  const bindTraffic = (player: { lat: number; lng: number } | null) => {
    const network = networkRef.current;
    if (!network || network.edges.length === 0) {
      clearTraffic();
      return;
    }
    trafficRef.current = refreshTraffic(trafficRef.current, network, player);
    syncTrafficViews();
  };
  const bindTrafficRef = useRef(bindTraffic);
  bindTrafficRef.current = bindTraffic;

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
        range: 42,
        tilt: CHASE_TILT_DEGREES,
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
      if (mapRef.current !== map || ground == null) {
        return;
      }
      lookAltitudeRef.current = ground + 2;
      if (job !== cameraJobRef.current) {
        return;
      }
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
    setSteer(side, pressed) {
      steerHoldRef.current[side] = pressed;
    },
    setCameraView(view) {
      cameraViewRef.current = view;
      onCameraViewChangeRef.current?.(view);
      if (vehicleRef.current) {
        followRef.current = true;
      }
    },
    placeAlong(edgeId, distanceMeters) {
      const network = networkRef.current;
      const edge = network?.edgesById.get(edgeId);
      const map = mapRef.current;
      const library = libraryRef.current;
      if (!network || !edge || !map || !library) {
        return false;
      }
      const distance = Math.min(edge.lengthMeters, Math.max(0, distanceMeters));
      const placed = vehicleFromPlacement({ edge, distanceMeters: distance, gapMeters: 0 });
      followRef.current = false;
      vehicleRef.current = placed;
      if (!vehicleViewRef.current) {
        vehicleViewRef.current = mountRoadVehicle(map, library);
      }
      vehicleViewRef.current?.update(poseOf(placed));
      publishRef.current(placed);
      bindTrafficRef.current(placed.position);
      flyToCarRef.current(placed.position.lat, placed.position.lng, placed.headingDegrees);
      return true;
    },
  }));

  useEffect(() => {
    const keys = keysRef.current;
    const onKeyDown = (event: KeyboardEvent) => {
      if (isTextEntry(event.target) || isTextEntry(document.activeElement)) {
        return;
      }
      const code =
        event.code ||
        (event.key === "w" || event.key === "W"
          ? "KeyW"
          : event.key === "s" || event.key === "S"
            ? "KeyS"
            : event.key === "a" || event.key === "A"
              ? "KeyA"
              : event.key === "d" || event.key === "D"
                ? "KeyD"
                : event.key === "ArrowUp"
                  ? "ArrowUp"
                  : event.key === "ArrowDown"
                    ? "ArrowDown"
                    : event.key === "ArrowLeft"
                      ? "ArrowLeft"
                      : event.key === "ArrowRight"
                        ? "ArrowRight"
                        : event.key === "c" || event.key === "C"
                          ? "KeyC"
                          : event.key >= "1" && event.key <= "9"
                            ? `Digit${event.key}`
                            : "");
      if (
        code === "ArrowUp" ||
        code === "ArrowDown" ||
        code === "ArrowLeft" ||
        code === "ArrowRight" ||
        code === "KeyC"
      ) {
        event.preventDefault();
      }
      if (code === "KeyC") {
        if (!event.repeat) {
          const next = cameraViewRef.current === "driver" ? "chase" : "driver";
          cameraViewRef.current = next;
          onCameraViewChangeRef.current?.(next);
          if (vehicleRef.current) {
            followRef.current = true;
          }
        }
        return;
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
      if (event.key === "a" || event.key === "A") {
        keys.delete("KeyA");
      }
      if (event.key === "d" || event.key === "D") {
        keys.delete("KeyD");
      }
      if (event.key === "ArrowUp") {
        keys.delete("ArrowUp");
      }
      if (event.key === "ArrowDown") {
        keys.delete("ArrowDown");
      }
      if (event.key === "ArrowLeft") {
        keys.delete("ArrowLeft");
      }
      if (event.key === "ArrowRight") {
        keys.delete("ArrowRight");
      }
    };
    const clearKeys = () => {
      keys.clear();
      steerHoldRef.current.left = false;
      steerHoldRef.current.right = false;
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
      const map = mapRef.current;
      const library = libraryRef.current;
      if (!vehicleViewRef.current && map && library) {
        vehicleViewRef.current = mountRoadVehicle(map, library);
      }
      vehicleViewRef.current?.update(poseOf(placed));
      publishRef.current(placed);
      bindTrafficRef.current(placed.position);
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
      clearTraffic();
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
        followCameraRef.current = null;
        networkRef.current = null;
        publishRef.current(null, null);
        clearTraffic();
      }
      return;
    }

    const explained = explainRoads(roads, anchor);
    recordOmittedLinks(explained.network, omittedRoads);
    networkRef.current = explained.network;
    if (carried) {
      const kept = describeFreeVehicle(carried, explained.network);
      vehicleRef.current = kept;
      const view = vehicleViewRef.current ?? mountRoadVehicle(map, library);
      vehicleViewRef.current = view;
      view?.update(poseOf(kept));
      publishRef.current(kept);
      bindTraffic(kept.position);
      return () => {
        carryRef.current = vehicleRef.current;
        vehicleViewRef.current?.remove();
        vehicleViewRef.current = null;
        vehicleRef.current = null;
      };
    }

    followRef.current = false;
    followCameraRef.current = null;
    const placement = explained.placement ? placementWithRunway(explained.placement) : null;
    if (!placement) {
      vehicleViewRef.current?.remove();
      vehicleViewRef.current = null;
      vehicleRef.current = null;
      publishRef.current(null, explained.message);
      bindTraffic(anchor);
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
    bindTraffic(placed.position);
    lookAltitudeRef.current = typeof map.center?.altitude === "number" ? map.center.altitude : 25;
    flyToCarRef.current(placed.position.lat, placed.position.lng, placed.headingDegrees);

    return () => {
      carryRef.current = vehicleRef.current;
      vehicleViewRef.current?.remove();
      vehicleViewRef.current = null;
      vehicleRef.current = null;
    };
  }, [roads, omittedRoads, anchor, phase, mapVersion]);

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
        const held = steerHoldRef.current;
        const buttonSteer = held.left === held.right ? 0 : held.left ? -1 : 1;
        input.accelerate = input.accelerate || pedalsRef.current.accelerate;
        input.brake = input.brake || pedalsRef.current.brake;
        input.steer = Math.max(-1, Math.min(1, (input.steer ?? 0) + buttonSteer));
        if (input.accelerate || input.steer) {
          followRef.current = true;
        }
        const next = advanceFreeVehicle(vehicle, input, dt, network);
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
          const car = {
            lat: current.position.lat,
            lng: current.position.lng,
            headingDegrees: current.headingDegrees,
          };
          const previous = followCameraRef.current ?? followCameraFromView(map, car);
          const camera = followCameraStep(
            previous,
            car,
            Math.min(Math.max(dt, 0), MAX_FRAME_SECONDS),
            cameraViewRef.current,
          );
          followCameraRef.current = camera;
          const claim = claimCameraJob(followJobRef.current, cameraJobRef.current);
          followJobRef.current = claim.ownedJob;
          const endCamera = {
            center: {
              lat: camera.lat,
              lng: camera.lng,
              altitude: lookAltitudeRef.current,
            },
            range: camera.rangeMeters,
            tilt: camera.tiltDegrees,
            heading: camera.headingDegrees,
          };
          if (claim.interrupt) {
            cameraJobRef.current = claim.ownedJob;
            if (typeof map.flyCameraTo === "function") {
              map.flyCameraTo({ endCamera, durationMillis: 0 });
            }
          }
          map.center = endCamera.center;
          map.range = endCamera.range;
          map.tilt = endCamera.tilt;
          map.heading = endCamera.heading;
        }
        const current = vehicleRef.current ?? next;
        trafficRef.current = stepTraffic(
          network,
          trafficRef.current,
          {
            edgeId: current.edgeId,
            distanceMeters: current.distanceMeters,
            position: current.position,
          },
          dt,
        );
        syncTrafficViews();
        onSampleRef.current?.({
          speedMps: current.speedMps,
          edgeId: current.edgeId,
          distanceMeters: current.distanceMeters,
          position: current.position,
          mode: current.mode,
          traffic: trafficRef.current.map((car) => ({ position: car.position })),
          network,
          roadDistanceReliable: current.measurementReliable === true,
        });
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
      const groundAltitude = (ground ?? 600) + 2;
      lookAltitudeRef.current = groundAltitude;
      if (vehicleRef.current) {
        return;
      }
      const altitude = groundAltitude + 18;
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
      {screen.kind === "ready" && rideHint ? (
        <p className="ride-hint" role="status">
          {rideHint}
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
