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
import { cycleGear, gearFromKey, gearOf, type Gear } from "../drive/gears";
import { surfaceGrip, surfaceLabel, type Surface } from "../drive/surface";
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
  CHASE_VERTICAL_FOV_DEGREES,
  DRIVER_LOOK_ABOVE_GROUND_METERS,
  DRIVER_VERTICAL_FOV_DEGREES,
  approachDriverPose,
  cameraLookAltitude,
  chaseAim,
  claimCameraJob,
  followCameraFromView,
  followCameraStep,
  settledChase,
  framedDriverCamera,
  smoothAltitude,
  type CameraView,
  type ChaseTune,
  type FollowCamera,
} from "./followCamera";
import type { RoadLine } from "./roadOverlays";
import { mountPracticeMarker, mountRoadVehicle, mountTrafficVehicle, type RoadVehicle } from "./roadVehicle";
import { EMPTY_SCENE, updatePracticeScene, type PracticeSceneState, type SceneActor } from "./practiceScene";
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
  /** Exercise that places practice figures. Null during free driving. */
  practiceMoment?: string | null;
  /** Dry, rain, fog or ice. Dry leaves the car unchanged. */
  surface?: Surface;
  /** Simulated uphill, in m/s². Zero on a flat exercise. */
  gradeMps2?: number;
  weatherLabel?: string | null;
  onWeather?: () => void;
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
    practiceMoment = null,
    surface = "clear",
    gradeMps2 = 0,
    weatherLabel = null,
    onWeather,
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
  const actorViewsRef = useRef<Map<string, RoadVehicle>>(new Map());
  const gearRef = useRef<Gear>("D");
  const sceneRef = useRef<PracticeSceneState>(EMPTY_SCENE);
  const surfaceRef = useRef<Surface>(surface);
  const gradeRef = useRef(gradeMps2);
  const practiceMomentRef = useRef<string | null>(practiceMoment);
  surfaceRef.current = surface;
  gradeRef.current = gradeMps2;
  practiceMomentRef.current = practiceMoment;
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
  const smoothedAltitudeRef = useRef<number | null>(null);
  const chaseTuneRef = useRef<ChaseTune>({ distance: 1, heightDegrees: 0 });
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

  const clearActors = () => {
    for (const view of actorViewsRef.current.values()) {
      view.remove();
    }
    actorViewsRef.current.clear();
  };

  const clearTraffic = () => {
    for (const view of trafficViewsRef.current.values()) {
      view.remove();
    }
    trafficViewsRef.current.clear();
    trafficRef.current = [];
    clearActors();
  };

  const syncPracticeActors = (actors: readonly SceneActor[]) => {
    const map = mapRef.current;
    const library = libraryRef.current;
    const views = actorViewsRef.current;
    const ids = new Set(actors.map((actor) => actor.id));
    for (const [id, view] of views) {
      if (!ids.has(id)) {
        view.remove();
        views.delete(id);
      }
    }
    if (!map || !library) {
      return;
    }
    for (const actor of actors) {
      let view = views.get(actor.id);
      if (!view) {
        const mounted = mountPracticeMarker(map, library, actor.label);
        if (!mounted) {
          continue;
        }
        view = mounted;
        views.set(actor.id, view);
      }
      view.update({
        lat: actor.position.lat,
        lng: actor.position.lng,
        headingDegrees: actor.headingDegrees,
      });
    }
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
      gear: state ? gearRef.current : undefined,
      surface: state ? surfaceRef.current : undefined,
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

  const beginOutsideView = () => {
    const vehicle = vehicleRef.current;
    const map = mapRef.current;
    if (!vehicle || !map) {
      restoreOverview();
      return;
    }
    followRef.current = true;
    cameraJobRef.current += 1;
    const pose = settledChase(
      {
        lat: vehicle.position.lat,
        lng: vehicle.position.lng,
        headingDegrees: vehicle.headingDegrees,
      },
      chaseTuneRef.current,
    );
    followCameraRef.current = pose;
    const altitude = smoothedAltitudeRef.current ?? groundAltitudeRef.current ?? lookAltitudeRef.current;
    const endCamera = {
      center: { lat: pose.lat, lng: pose.lng, altitude },
      range: pose.rangeMeters,
      tilt: pose.tiltDegrees,
      heading: pose.headingDegrees,
    };
    if (typeof map.flyCameraTo === "function") {
      map.flyCameraTo({ endCamera, durationMillis: 0 });
    }
    map.center = endCamera.center;
    map.range = endCamera.range;
    map.tilt = endCamera.tilt;
    map.heading = endCamera.heading;
    vehicleViewRef.current?.setVisible(true);
  };

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
    const currentAltitude =
      groundAltitudeRef.current ??
      (typeof map.center?.altitude === "number" ? map.center.altitude : lookAltitudeRef.current);
    lookAltitudeRef.current = currentAltitude;
    smoothedAltitudeRef.current = currentAltitude;
    const show = (altitude: number, carLat: number, carLng: number, carHeading: number) => {
      const endCamera = {
        center: { lat: carLat, lng: carLng, altitude },
        range: chaseAim(chaseTuneRef.current).rangeMeters,
        tilt: chaseAim(chaseTuneRef.current).tiltDegrees,
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
      if (job !== cameraJobRef.current) {
        return;
      }
      groundAltitudeRef.current = ground;
      lookAltitudeRef.current = ground;
      // A second fly resets range and heading. Only drop the orbit point onto
      // the road while the chase is not already following the car.
      if (followRef.current) {
        return;
      }
      const position = vehicleRef.current?.position ?? { lat, lng };
      const carHeading = vehicleRef.current?.headingDegrees ?? heading;
      smoothedAltitudeRef.current = ground;
      map.center = { lat: position.lat, lng: position.lng, altitude: ground };
      const aim = chaseAim(chaseTuneRef.current);
      map.range = aim.rangeMeters;
      map.tilt = aim.tiltDegrees;
      map.heading = carHeading;
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
        vehicleViewRef.current?.setVisible(false);
      } else {
        beginOutsideView();
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
      gearRef.current = "D";
      sceneRef.current = EMPTY_SCENE;
      clearActors();
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
      const gearKey = gearFromKey(event.code, event.key);
      if (gearKey) {
        event.preventDefault();
        if (!event.repeat) {
          gearRef.current = gearKey === "cycle" ? cycleGear(gearRef.current) : gearKey;
          publishRef.current(vehicleRef.current);
        }
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
            vehicleViewRef.current?.setVisible(false);
          } else {
            beginOutsideView();
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
    // The photographed street is the driving picture. A second ribbon and
    // centerline sit on a different surface and make the tiles look warped.
    setLineNote("Gatan är kartans 3D-bild. Vägnätet styr bilen.");
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
    const drivingSigns = signs.filter((sign) => sign.kind === "stop" || sign.kind === "give_way");
    syncById(signViewsRef.current, drivingSigns, (sign) => mountSignBoard(map, library, sign));
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
        input.gear = gearRef.current;
        input.gradeMps2 = gradeRef.current;
        const feel = surfaceGrip(surfaceRef.current);
        input.grip = feel.grip;
        input.brakeScale = feel.brakeScale;
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
          gear: gearRef.current,
          accelerating: input.accelerate,
          braking: input.brake,
          altitude: lookAltitudeRef.current,
          placed: true,
          pitchDegrees: body.pitchDegrees,
          rollDegrees: body.rollDegrees,
          viewTiltDegrees: cockpitRef.current.viewTiltDegrees,
        };
        try {
          vehicleViewRef.current?.setVisible(cameraViewRef.current !== "driver");
        } catch {
          // Hiding the body must not stop the driving loop.
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
            chaseTuneRef.current,
          );
          followCameraRef.current = camera;
          const claim = claimCameraJob(followJobRef.current, cameraJobRef.current);
          followJobRef.current = claim.ownedJob;
          const driverView = cameraViewRef.current === "driver";
          const framed = driverView
            ? framedDriverCamera(camera, camera.tiltDegrees)
            : { rangeMeters: camera.rangeMeters, tiltDegrees: camera.tiltDegrees, lookOnRoad: false };
          const frameDt = Math.min(Math.max(dt, 0), MAX_FRAME_SECONDS);
          const targetAltitude = cameraLookAltitude(
            driverView ? "driver" : "chase",
            groundAltitudeRef.current,
            lookAltitudeRef.current,
            framed.lookOnRoad,
          );
          const previousAltitude =
            smoothedAltitudeRef.current ??
            (typeof map.center?.altitude === "number" ? map.center.altitude : targetAltitude);
          const altitude = smoothAltitude(previousAltitude, targetAltitude, frameDt);
          smoothedAltitudeRef.current = altitude;
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
            const planted = cameraLookAltitude("driver", groundAltitudeRef.current, lookAltitudeRef.current, true);
            const eased = smoothAltitude(altitude, planted, frameDt);
            smoothedAltitudeRef.current = eased;
            map.center = {
              lat: endCamera.center.lat,
              lng: endCamera.center.lng,
              altitude: eased,
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
            headingDegrees: current.headingDegrees,
          },
          dt,
          signalTime.seconds,
        );
        syncTrafficViews();
        const edge = network.edgesById.get(current.edgeId);
        const scene = updatePracticeScene(sceneRef.current, {
          moment: practiceMomentRef.current,
          edgeId: current.edgeId,
          distanceMeters: current.distanceMeters,
          edgeLengthMeters: edge?.lengthMeters ?? 0,
          position: current.position,
          headingDegrees: current.headingDegrees,
          speedMps: current.speedMps,
          timeSeconds: signalTime.seconds,
        });
        sceneRef.current = scene.state;
        syncPracticeActors(scene.actors);
        onSampleRef.current?.({
          speedMps: current.speedMps,
          edgeId: current.edgeId,
          distanceMeters: current.distanceMeters,
          position: current.position,
          headingDegrees: current.headingDegrees,
          offsetMeters: current.offsetMeters,
          highway: edge?.highway ?? null,
          gear: gearRef.current,
          rollMps: current.rollMps ?? 0,
          dtSeconds: Math.min(Math.max(dt, 0), MAX_FRAME_SECONDS),
          brake: input.brake,
          indicator: indicatorRef.current.state,
          signal: scene.signal,
          roadName: current.roadName,
          actors: scene.actors.map((actor) => ({
            kind: actor.kind,
            gapMeters: actor.gapMeters,
            ahead: actor.ahead,
          })),
          mode: current.mode,
          traffic: trafficRef.current.map((car) => ({
            id: car.id,
            position: car.position,
            headingDegrees: car.headingDegrees,
          })),
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

  const surfaceBit = hud.surface && hud.surface !== "clear" ? ` · ${surfaceLabel(hud.surface)}` : "";
  const hudText = snapNote
    ? `${snapNote}${surfaceBit}`
    : hud.message
      ? `${hud.message}${surfaceBit}`
      : hud.placed
        ? `${hud.speedKmh} km/h · växel ${hud.gear ?? "D"}${surfaceBit}${hud.roadName ? ` · ${hud.roadName}` : ""}`
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
          gear={gearOf(hud.gear)}
          onGear={(next) => {
            gearRef.current = next;
            publishRef.current(vehicleRef.current);
          }}
          weatherLabel={weatherLabel}
          onWeather={onWeather}
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
          onCameraDistance={(direction) => {
            const next = {
              ...chaseTuneRef.current,
              distance: Math.min(1.8, Math.max(0.65, chaseTuneRef.current.distance + direction * 0.15)),
            };
            chaseTuneRef.current = next;
          }}
          onCameraHeight={(direction) => {
            const next = {
              ...chaseTuneRef.current,
              heightDegrees: Math.min(12, Math.max(-8, chaseTuneRef.current.heightDegrees + direction * 3)),
            };
            chaseTuneRef.current = next;
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
              vehicleViewRef.current?.setVisible(false);
            } else {
              beginOutsideView();
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
