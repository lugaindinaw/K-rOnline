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
import type { OmittedRoad, RoadPoint, RoadSegment, TrafficSignal } from "../roads/drivingRoads";
import type { RoadSign } from "../roads/roadSigns";
import {
  prefetchCenter,
  shouldPrefetch,
  type CoverageCircle,
} from "../roads/roadCoverage";
import {
  attachTrafficSignals,
  explainRoads,
  nearestPlacement,
  placementWithRunway,
  recordOmittedLinks,
  START_SNAP_METERS,
  type RoadNetwork,
} from "../roads/roadNetwork";
import { refreshTraffic, stepTraffic, type TrafficCar } from "../traffic/traffic";
import { placeSignalHeads, signalLampColor } from "./signalPosts";
import { mountSignBoard, mountSignalLamp, syncById, type SignalLamp } from "./streetFurniture";
import type { DriveSample } from "../training/approach";
import { observeDrive } from "../training/driveObservation";
import { driveFactsText, EMPTY_DRIVE_FACTS, noteDriveFrame, yieldAheadNote, type DriveFacts } from "../training/driveFacts";
import { INDICATOR_OFF, stepIndicator, toggleIndicator, type IndicatorMotion } from "../drive/indicators";
import {
  installGoogleMapFailureHook,
  subscribeGoogleMapFailure,
} from "./googleMapFailure";
import { loadMaps3dLibrary } from "./loadMaps3d";
import { publicMapError, resolveMapScreen, type MapPhase } from "./mapScreen";
import type { Map3DViewElement, Maps3dLibrary } from "./maps3dTypes";
import {
  CHASE_TILT_DEGREES,
  CHASE_VERTICAL_FOV_DEGREES,
  DRIVER_LOOK_ABOVE_GROUND_METERS,
  DRIVER_VERTICAL_FOV_DEGREES,
  approachDriverPose,
  claimCameraJob,
  followCameraFromView,
  followCameraStep,
  framedDriverCamera,
  type CameraView,
  type FollowCamera,
} from "./followCamera";
import { createRoadOverlays, type RoadLine } from "./roadOverlays";
import { mountRoadVehicle, mountTrafficVehicle, type RoadVehicle } from "./roadVehicle";
import { mountRoadSurfaces, roadSurfaces, selectSurfaceRoads } from "./roadSurface";
import type { CockpitPose } from "./cockpit";
import { bodyAttitude } from "../drive/driveFeel";
import { clearanceOf } from "../drive/roadGuide";
import { steerFromTilt } from "../drive/tiltSteer";
import { DrivePad } from "../ui/DrivePad";
import { CarInterior } from "./CarInterior";

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
  setIndicator: (side: "left" | "right") => void;
  placeAlong: (edgeId: string, distanceMeters: number) => boolean;
  setCameraView: (view: CameraView) => void;
};

const NO_OMITTED_ROADS: readonly OmittedRoad[] = [];
const NO_SIGNALS: readonly TrafficSignal[] = [];
const NO_SIGNS: readonly RoadSign[] = [];

type CityMapProps = {
  apiKey: string;
  onRetry: () => void;
  roads: RoadSegment[];
  omittedRoads?: readonly OmittedRoad[];
  signals?: readonly TrafficSignal[];
  signs?: readonly RoadSign[];
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
  tiltSteer?: boolean;
  tiltNote?: string | null;
  onToggleTilt?: () => void;
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
  const body = bodyAttitude(state.accelMps2 ?? 0, state.steerApplied ?? 0, state.speedMps);
  return {
    lat: state.position.lat,
    lng: state.position.lng,
    headingDegrees: state.headingDegrees,
    pitchDegrees: body.pitchDegrees,
    rollDegrees: body.rollDegrees,
  };
}

export const CityMap = forwardRef<SwedenMapHandle, CityMapProps>(function CityMap(
  {
    apiKey,
    onRetry,
    roads,
    omittedRoads = NO_OMITTED_ROADS,
    signals = NO_SIGNALS,
    signs = NO_SIGNS,
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
    tiltSteer = false,
    tiltNote = null,
    onToggleTilt,
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
  const lampsRef = useRef<Map<string, SignalLamp>>(new Map());
  const signViewsRef = useRef<Map<string, { remove: () => void }>>(new Map());
  const keysRef = useRef(new Set<string>());
  const pedalsRef = useRef({ accelerate: false, brake: false });
  const steerHoldRef = useRef({ left: false, right: false });
  const tiltRef = useRef(0);
  const followRef = useRef(false);
  const followCameraRef = useRef<FollowCamera | null>(null);
  const cameraViewRef = useRef<CameraView>(cameraView);
  const onCameraViewChangeRef = useRef(onCameraViewChange);
  cameraViewRef.current = cameraView;
  onCameraViewChangeRef.current = onCameraViewChange;
  const followJobRef = useRef(0);
  const lookAltitudeRef = useRef(25);
  const groundAltitudeRef = useRef<number | null>(null);
  const overviewRef = useRef<{
    lat: number;
    lng: number;
    altitude: number;
    range: number;
    tilt: number;
    heading: number;
  } | null>(null);
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
  const [mapsLibrary, setMapsLibrary] = useState<Maps3dLibrary | null>(null);
  const surfacesRef = useRef<Array<{ remove: () => void }>>([]);
  const observationRef = useRef<ReturnType<typeof observeDrive> | null>(null);
  const indicatorRef = useRef<IndicatorMotion>(INDICATOR_OFF);
  const factsRef = useRef<DriveFacts>(EMPTY_DRIVE_FACTS);
  const signsRef = useRef(signs);
  const signalsRef = useRef(signals);
  signsRef.current = signs;
  signalsRef.current = signals;
  const cockpitRef = useRef<CockpitPose>({
    lat: STOCKHOLM_CANDIDATE.camera.center.lat,
    lng: STOCKHOLM_CANDIDATE.camera.center.lng,
    headingDegrees: STOCKHOLM_CANDIDATE.camera.headingDegrees,
    speedKmh: 0,
    steer: 0,
    altitude: STOCKHOLM_CANDIDATE.camera.center.altitudeMeters ?? 25,
    placed: false,
    pitchDegrees: 0,
    rollDegrees: 0,
    viewTiltDegrees: 86,
  });
  const screen = resolveMapScreen({ apiKey, phase, errorMessage });

  onReadyChangeRef.current = onReadyChange;
  onVehicleChangeRef.current = onVehicleChange;
  onExtendRef.current = onExtendRoads;
  onSampleRef.current = onDriveSample;
  areasRef.current = areas;

  const clearFurniture = () => {
    for (const lamp of lampsRef.current.values()) {
      lamp.remove();
    }
    lampsRef.current.clear();
    for (const sign of signViewsRef.current.values()) {
      sign.remove();
    }
    signViewsRef.current.clear();
  };

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
    const status = {
      ...vehicleStatus(state, message),
      indicator: indicatorRef.current.state,
      yieldNote: yieldAheadNote(factsRef.current),
      driveFactLines: state ? driveFactsText(factsRef.current) : [],
    };
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

  const rememberStreetGround = () => {
    const map = mapRef.current;
    const center = map?.center;
    if (!map || !center || typeof center.lat !== "number" || typeof center.lng !== "number") {
      return;
    }
    if (!vehicleRef.current && !overviewRef.current && typeof map.range === "number" && typeof map.tilt === "number") {
      overviewRef.current = {
        lat: center.lat,
        lng: center.lng,
        altitude: typeof center.altitude === "number" ? center.altitude : lookAltitudeRef.current,
        range: map.range,
        tilt: map.tilt,
        heading: typeof map.heading === "number" ? map.heading : 0,
      };
    }
    void readGroundElevation(center.lat, center.lng).then((ground) => {
      if (ground != null) {
        groundAltitudeRef.current = ground;
      }
    });
  };

  useEffect(() => {
    if (!tiltSteer) {
      tiltRef.current = 0;
      return;
    }
    const onTilt = (event: DeviceOrientationEvent) => {
      const landscape = window.matchMedia("(orientation: landscape)").matches;
      tiltRef.current = steerFromTilt({ beta: event.beta, gamma: event.gamma }, landscape);
    };
    window.addEventListener("deviceorientation", onTilt);
    return () => {
      window.removeEventListener("deviceorientation", onTilt);
      tiltRef.current = 0;
    };
  }, [tiltSteer]);

  const restoreOverview = () => {
    const saved = overviewRef.current;
    const map = mapRef.current;
    overviewRef.current = null;
    if (!saved || !map || vehicleRef.current) {
      return;
    }
    map.center = { lat: saved.lat, lng: saved.lng, altitude: saved.altitude };
    map.range = saved.range;
    map.tilt = saved.tilt;
    map.heading = saved.heading;
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
      groundAltitudeRef.current = ground;
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
    setIndicator(side) {
      indicatorRef.current = { state: toggleIndicator(indicatorRef.current.state, side), armed: false };
    },
    setCameraView(view) {
      cameraViewRef.current = view;
      cameraJobRef.current += 1;
      onCameraViewChangeRef.current?.(view);
      if (vehicleRef.current) {
        followRef.current = true;
      }
      if (view === "driver") {
        rememberStreetGround();
      } else {
        restoreOverview();
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
      indicatorRef.current = INDICATOR_OFF;
      factsRef.current = EMPTY_DRIVE_FACTS;
      pedalsRef.current = { accelerate: false, brake: false };
      steerHoldRef.current = { left: false, right: false };
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
            : event.key === "q" || event.key === "Q"
              ? "KeyQ"
              : event.key === "e" || event.key === "E"
                ? "KeyE"
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
      if (code === "KeyQ" || code === "KeyE") {
        event.preventDefault();
        if (!event.repeat) {
          const side = code === "KeyQ" ? "left" : "right";
          indicatorRef.current = { state: toggleIndicator(indicatorRef.current.state, side), armed: false };
        }
        return;
      }
      if (code === "KeyC") {
        if (!event.repeat) {
          const next = cameraViewRef.current === "driver" ? "chase" : "driver";
          cameraViewRef.current = next;
          onCameraViewChangeRef.current?.(next);
          if (vehicleRef.current) {
            followRef.current = true;
          }
          if (next === "driver") {
            rememberStreetGround();
          } else {
            restoreOverview();
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
        setMapsLibrary(library);
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
      for (const surface of surfacesRef.current) {
        surface.remove();
      }
      surfacesRef.current = [];
      vehicleViewRef.current?.remove();
      vehicleViewRef.current = null;
      vehicleRef.current = null;
      clearTraffic();
      clearFurniture();
      mapElement?.remove();
      mapRef.current = null;
      libraryRef.current = null;
      setMapsLibrary(null);
      onReadyChangeRef.current(false);
    };
  }, [apiKey]);

  useEffect(() => {
    const map = mapRef.current;
    const library = libraryRef.current;
    if (!map || !library || phase !== "ready") {
      return;
    }
    for (const surface of surfacesRef.current) {
      surface.remove();
    }
    surfacesRef.current = [];
    for (const line of linesRef.current) {
      line.remove();
    }
    linesRef.current = [];
    if (roads.length === 0) {
      setLineNote(null);
      return;
    }
    if (typeof library.Polygon3DElement === "function") {
      try {
        const surfaces = roadSurfaces(roads, anchor);
        surfacesRef.current = mountRoadSurfaces(map, library.Polygon3DElement, surfaces);
      } catch {
        surfacesRef.current = [];
      }
    }
    const covered = new Set(surfacesRef.current.length > 0 ? selectSurfaceRoads(roads, anchor).map((road) => road.id) : []);
    const stroked = covered.size > 0 ? roads.filter((road) => !covered.has(road.id)) : roads;
    if (typeof library.Polyline3DElement === "function" && stroked.length > 0) {
      try {
        linesRef.current = createRoadOverlays(map, library.Polyline3DElement, stroked);
      } catch {
        linesRef.current = [];
      }
    }
    if (surfacesRef.current.length > 0) {
      setLineNote(`${covered.size} vägytor med körbana och vägmarkering ligger på terrängen.`);
    } else if (linesRef.current.length > 0) {
      setLineNote(`${linesRef.current.length} väglinjer ligger på marken i vyn.`);
    } else if (typeof library.Polyline3DElement !== "function") {
      setLineNote("Vägdata är hämtad. 3D-linjerna kunde inte skapas.");
    } else {
      setLineNote("Vägdata är hämtad. 3D-linjerna kunde inte ritas.");
    }
  }, [roads, anchor, phase, mapVersion]);

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
    attachTrafficSignals(explained.network, signals);
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
      indicatorRef.current = INDICATOR_OFF;
      factsRef.current = EMPTY_DRIVE_FACTS;
      publishRef.current(null, explained.message);
      bindTraffic(anchor);
      return;
    }

    const placed = vehicleFromPlacement(placement);
    if (explained.message) {
      placed.message = explained.message;
    }
    indicatorRef.current = INDICATOR_OFF;
    factsRef.current = EMPTY_DRIVE_FACTS;
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
  }, [roads, omittedRoads, signals, anchor, phase, mapVersion]);

  useEffect(() => {
    const map = mapRef.current;
    const library = libraryRef.current;
    if (!map || !library || phase !== "ready") {
      return;
    }
    syncById(lampsRef.current, placeSignalHeads(signals, roads), (head) => mountSignalLamp(map, library, head));
    syncById(signViewsRef.current, signs, (sign) => mountSignBoard(map, library, sign));
  }, [signals, signs, roads, phase, mapVersion]);

  useEffect(() => {
    if (phase !== "ready") {
      return;
    }
    let frame = 0;
    let last = performance.now();
    const signalTime = { seconds: performance.now() / 1000 };
    const tick = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      signalTime.seconds += dt;
      for (const lamp of lampsRef.current.values()) {
        lamp.setColor(signalLampColor(lamp.facingDegrees, signalTime.seconds, lamp.kind));
      }
      const network = networkRef.current;
      const vehicle = vehicleRef.current;
      const streetMap = mapRef.current;
      if (streetMap && cameraViewRef.current === "driver" && !vehicle) {
        const range = typeof streetMap.range === "number" ? streetMap.range : 700;
        const tilt = typeof streetMap.tilt === "number" ? streetMap.tilt : 67;
        const nextPose = approachDriverPose(
          { rangeMeters: range, tiltDegrees: tilt },
          Math.min(Math.max(dt, 0), MAX_FRAME_SECONDS),
        );
        streetMap.tilt = nextPose.tiltDegrees;
        const applied = typeof streetMap.tilt === "number" ? streetMap.tilt : nextPose.tiltDegrees;
        const framed = framedDriverCamera(nextPose, applied);
        streetMap.range = framed.rangeMeters;
        const lat = streetMap.center?.lat;
        const lng = streetMap.center?.lng;
        if (typeof lat === "number" && typeof lng === "number") {
          streetMap.center = {
            lat,
            lng,
            altitude: (groundAltitudeRef.current ?? 20) + (framed.lookOnRoad ? 0.35 : DRIVER_LOOK_ABOVE_GROUND_METERS),
          };
        }
      }
      if (network && vehicle) {
        const input = driveInputFromKeys(keysRef.current);
        const held = steerHoldRef.current;
        const buttonSteer = held.left === held.right ? 0 : held.left ? -1 : 1;
        input.accelerate = input.accelerate || pedalsRef.current.accelerate;
        input.brake = input.brake || pedalsRef.current.brake;
        input.steer = Math.max(-1, Math.min(1, (input.steer ?? 0) + buttonSteer + tiltRef.current));
        if (input.accelerate || input.steer) {
          followRef.current = true;
        }
        const next = advanceFreeVehicle(vehicle, input, dt, network);
        indicatorRef.current = stepIndicator(indicatorRef.current, next.steerApplied ?? 0);
        factsRef.current = noteDriveFrame(factsRef.current, {
          position: next.position,
          headingDegrees: next.headingDegrees,
          speedMps: next.speedMps,
          brake: input.brake,
          steer: next.steerApplied ?? 0,
          offsetMeters: next.offsetMeters,
          indicator: indicatorRef.current.state,
          giveWay: signsRef.current
            .filter((sign) => sign.kind === "give_way")
            .map((sign) => ({ id: sign.id, position: sign.position })),
        });
        const body = bodyAttitude(next.accelMps2 ?? 0, next.steerApplied ?? 0, next.speedMps);
        cockpitRef.current = {
          lat: next.position.lat,
          lng: next.position.lng,
          headingDegrees: next.headingDegrees,
          speedKmh: next.speedMps * 3.6,
          steer: next.steerApplied ?? 0,
          indicator: indicatorRef.current.state,
          altitude: lookAltitudeRef.current,
          placed: true,
          pitchDegrees: body.pitchDegrees,
          rollDegrees: body.rollDegrees,
          viewTiltDegrees: cockpitRef.current.viewTiltDegrees,
        };
        vehicleViewRef.current?.setVisible(cameraViewRef.current !== "driver");
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
          const driverView = cameraViewRef.current === "driver";
          const framed = driverView
            ? framedDriverCamera(camera, camera.tiltDegrees)
            : { rangeMeters: camera.rangeMeters, tiltDegrees: camera.tiltDegrees, lookOnRoad: false };
          const ground = groundAltitudeRef.current;
          const altitude = driverView
            ? (ground ?? 20) + (framed.lookOnRoad ? 0.35 : DRIVER_LOOK_ABOVE_GROUND_METERS)
            : lookAltitudeRef.current;
          const endCamera = {
            center: {
              lat: camera.lat,
              lng: camera.lng,
              altitude,
            },
            range: framed.rangeMeters,
            tilt: framed.tiltDegrees,
            heading: camera.headingDegrees,
          };
          if (claim.interrupt) {
            cameraJobRef.current = claim.ownedJob;
            if (typeof map.flyCameraTo === "function") {
              map.flyCameraTo({ endCamera, durationMillis: 0 });
            }
          }
          map.center = endCamera.center;
          map.tilt = endCamera.tilt;
          const appliedTilt = typeof map.tilt === "number" ? map.tilt : endCamera.tilt;
          const settled = driverView
            ? framedDriverCamera({ rangeMeters: endCamera.range, tiltDegrees: camera.tiltDegrees }, appliedTilt)
            : { rangeMeters: endCamera.range, tiltDegrees: appliedTilt, lookOnRoad: false };
          map.range = settled.rangeMeters;
          if (driverView && settled.lookOnRoad && map.center) {
            map.center = {
              lat: endCamera.center.lat,
              lng: endCamera.center.lng,
              altitude: (groundAltitudeRef.current ?? 20) + 0.35,
            };
          }
          map.heading = endCamera.heading;
          followCameraRef.current = {
            ...camera,
            rangeMeters: settled.rangeMeters,
            tiltDegrees: appliedTilt,
          };
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
          signalTime.seconds,
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
      const liveMap = mapRef.current;
      if (liveMap) {
        liveMap.fov = cameraViewRef.current === "driver" ? DRIVER_VERTICAL_FOV_DEGREES : CHASE_VERTICAL_FOV_DEGREES;
        if (cameraViewRef.current === "driver" && typeof liveMap.tilt === "number") {
          cockpitRef.current = { ...cockpitRef.current, viewTiltDegrees: liveMap.tilt };
        }
      }
      const observed = vehicleRef.current;
      const observedEdge = observed ? networkRef.current?.edgesById.get(observed.edgeId) : undefined;
      if (observed) {
        observationRef.current = observeDrive({
          position: observed.position,
          headingDegrees: observed.headingDegrees,
          speedMps: observed.speedMps,
          offsetMeters: observed.offsetMeters,
          roadHalfMeters: observedEdge ? clearanceOf(observedEdge).roadHalf : null,
          traffic: trafficRef.current.map((car) => car.position),
          signs: signsRef.current,
          signals: signalsRef.current.map((signal) => signal.position),
          indicator: indicatorRef.current.state,
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
      if (ground != null) {
        groundAltitudeRef.current = ground;
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
      <div className="map-view">
        <div ref={hostRef} className="map-host" />
        {cameraView === "driver" ? (
          <CarInterior poseRef={cockpitRef} library={mapsLibrary} />
        ) : null}
        <DrivePad
          cameraView={cameraView}
          tiltOn={tiltSteer}
          tiltNote={tiltNote}
          onGas={(pressed) => {
            pedalsRef.current.accelerate = pressed;
            if (pressed) {
              pedalsRef.current.brake = false;
            }
          }}
          onBrake={(pressed) => {
            pedalsRef.current.brake = pressed;
            if (pressed) {
              pedalsRef.current.accelerate = false;
            }
          }}
          onSteer={(side, pressed) => {
            steerHoldRef.current[side] = pressed;
          }}
          onIndicator={(side) => {
            indicatorRef.current = { state: toggleIndicator(indicatorRef.current.state, side), armed: false };
          }}
          onCamera={() => {
            const next = cameraViewRef.current === "driver" ? "chase" : "driver";
            cameraViewRef.current = next;
            cameraJobRef.current += 1;
            onCameraViewChangeRef.current?.(next);
            if (vehicleRef.current) {
              followRef.current = true;
            }
            if (next === "driver") {
              rememberStreetGround();
            } else {
              restoreOverview();
            }
          }}
          onTilt={() => onToggleTilt?.()}
        />
      </div>
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
