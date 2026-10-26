import { useEffect, useRef, useState } from "react";
import { STOCKHOLM_CANDIDATE } from "../geo/stockholmCandidate";
import { CityMap, type MapFocus, type SwedenMapHandle } from "../map/CityMap";
import { searchSwedishPlaces, type SwedishPlace } from "../places/swedishPlaces";
import { IDLE_VEHICLE, type VehicleStatus } from "../drive/drive";
import { buildRoadNetwork } from "../roads/roadNetwork";
import {
  MISSING_JUNCTION_MESSAGE,
  beginAttempt,
  findApproachStart,
  finishAttempt,
  idleAttempt,
  observeApproach,
  type ApproachAttempt,
  type ApproachStart,
  type DriveSample,
} from "../training/approach";
import { fetchDrivingRoads, roadRequestKey } from "../roads/fetchDrivingRoads";
import type { RoadPoint, RoadSegment } from "../roads/drivingRoads";
import {
  EXTEND_EMPTY_MESSAGE,
  EXTEND_LOADING_MESSAGE,
  extendFailureMessage,
  isNearCoverage,
  mergeRoadSegments,
  pruneCoverage,
  type CoverageCircle,
} from "../roads/roadCoverage";
import { ConfigScreen } from "../ui/ConfigScreen";
import { SwedenPanel } from "../ui/SwedenPanel";

const startCenter = STOCKHOLM_CANDIDATE.camera.center;

type StoredArea = CoverageCircle & {
  key: string;
  roads: RoadSegment[];
  truncated: boolean;
  matched: number;
};

export function SwedenSession({ apiKey }: { apiKey: string | null }) {
  const mapRef = useRef<SwedenMapHandle>(null);
  const requestRef = useRef(0);
  const [query, setQuery] = useState("");
  const [places, setPlaces] = useState<SwedishPlace[]>([]);
  const [placeMessage, setPlaceMessage] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);
  const [roads, setRoads] = useState<RoadSegment[]>([]);
  const [areas, setAreas] = useState<CoverageCircle[]>([]);
  const [anchor, setAnchor] = useState<RoadPoint | null>(startCenter);
  const [vehicle, setVehicle] = useState<VehicleStatus>(IDLE_VEHICLE);
  const [matched, setMatched] = useState(0);
  const [truncated, setTruncated] = useState(false);
  const [radiusMeters, setRadiusMeters] = useState<number | null>(null);
  const [areaLabel, setAreaLabel] = useState("Stockholm, startposition");
  const [roadError, setRoadError] = useState<string | null>(null);
  const [extendNote, setExtendNote] = useState<string | null>(null);
  const [loadingRoads, setLoadingRoads] = useState(true);
  const coverageRef = useRef<StoredArea[]>([]);
  const loadedKeys = useRef(new Set<string>());
  const failureKeys = useRef(new Set<string>());
  const pendingKeys = useRef(new Set<string>());
  const [focus, setFocus] = useState<MapFocus | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const [trainingOpen, setTrainingOpen] = useState(false);
  const [trainingError, setTrainingError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState<ApproachAttempt>(idleAttempt());
  const attemptRef = useRef(attempt);
  const startRef = useRef<ApproachStart | null>(null);

  function commitAttempt(next: ApproachAttempt) {
    attemptRef.current = next;
    setAttempt(next);
  }

  function startExercise() {
    setTrainingOpen(true);
    if (loadingRoads) {
      setTrainingError("Vänta tills vägdata har hämtats.");
      startRef.current = null;
      commitAttempt(idleAttempt());
      return;
    }
    const start = findApproachStart(buildRoadNetwork(roads));
    if (!start) {
      setTrainingError(MISSING_JUNCTION_MESSAGE);
      startRef.current = null;
      commitAttempt(idleAttempt());
      return;
    }
    const placed = mapRef.current?.placeAlong(start.edgeId, start.distanceMeters) ?? false;
    if (!placed) {
      setTrainingError("Bilen kan inte ställas vid korsningen just nu.");
      startRef.current = null;
      commitAttempt(idleAttempt());
      return;
    }
    mapRef.current?.setPedal("accelerate", false);
    mapRef.current?.setPedal("brake", false);
    setTrainingError(null);
    startRef.current = start;
    commitAttempt(beginAttempt());
  }

  function onDriveSample(sample: DriveSample) {
    const current = attemptRef.current;
    const start = startRef.current;
    if (current.status !== "running" || !start) {
      return;
    }
    const next = observeApproach(current, start, sample);
    if (next === current) {
      return;
    }
    commitAttempt(next);
  }

  function applyCoverage(stored: StoredArea[], focus: RoadPoint) {
    const kept = pruneCoverage(stored, focus);
    const keepKeys = new Set(kept.map((area) => area.key));
    for (const key of loadedKeys.current) {
      if (!keepKeys.has(key) && !failureKeys.current.has(key)) {
        loadedKeys.current.delete(key);
      }
    }
    for (const area of kept) {
      loadedKeys.current.add(area.key);
    }
    coverageRef.current = kept;
    setAreas(kept.map((area) => ({ center: area.center, radiusMeters: area.radiusMeters })));
    setRoads(mergeRoadSegments(kept.flatMap((area) => area.roads)));
    setTruncated(kept.some((area) => area.truncated));
    setMatched(kept.reduce((sum, area) => sum + area.matched, 0));
    setRadiusMeters(kept[0]?.radiusMeters ?? null);
  }

  async function loadRoads(center: { lat: number; lng: number }, label: string) {
    const requestId = requestRef.current + 1;
    requestRef.current = requestId;
    setLoadingRoads(true);
    setRoadError(null);
    setExtendNote(null);
    setAreaLabel(label);
    setRoads([]);
    setAreas([]);
    setAnchor(center);
    setMatched(0);
    setTruncated(false);
    coverageRef.current = [];
    loadedKeys.current = new Set();
    failureKeys.current = new Set();
    pendingKeys.current = new Set();
    const result = await fetchDrivingRoads({ lat: center.lat, lng: center.lng });
    if (requestId !== requestRef.current) {
      return;
    }
    setLoadingRoads(false);
    if (!result.ok) {
      setRoads([]);
      setAreas([]);
      setAnchor(null);
      setMatched(0);
      setTruncated(false);
      setRadiusMeters(null);
      setRoadError(result.message);
      return;
    }
    const key = roadRequestKey(result.area.center, result.area.radiusMeters);
    applyCoverage(
      [
        {
          key,
          center: result.area.center,
          radiusMeters: result.area.radiusMeters,
          roads: result.area.roads,
          truncated: result.area.truncated,
          matched: result.area.matched,
        },
      ],
      center,
    );
  }

  async function extendRoads(center: RoadPoint) {
    const requestId = requestRef.current;
    if (!isNearCoverage(center, coverageRef.current)) {
      return;
    }
    const key = roadRequestKey(center);
    if (loadedKeys.current.has(key) || pendingKeys.current.has(key) || failureKeys.current.has(key)) {
      return;
    }
    pendingKeys.current.add(key);
    setExtendNote(EXTEND_LOADING_MESSAGE);
    const result = await fetchDrivingRoads(center);
    pendingKeys.current.delete(key);
    if (requestId !== requestRef.current || !isNearCoverage(center, coverageRef.current)) {
      if (requestId === requestRef.current) {
        setExtendNote(null);
      }
      return;
    }
    if (!result.ok) {
      failureKeys.current.add(key);
      setExtendNote(extendFailureMessage(result.message));
      return;
    }
    if (result.area.roads.length === 0) {
      failureKeys.current.add(key);
      setExtendNote(EXTEND_EMPTY_MESSAGE);
      return;
    }
    const areaKey = roadRequestKey(result.area.center, result.area.radiusMeters);
    applyCoverage(
      [
        ...coverageRef.current.filter((area) => area.key !== areaKey),
        {
          key: areaKey,
          center: result.area.center,
          radiusMeters: result.area.radiusMeters,
          roads: result.area.roads,
          truncated: result.area.truncated,
          matched: result.area.matched,
        },
      ],
      center,
    );
    setExtendNote(null);
  }

  function selectPlace(place: SwedishPlace) {
    setPlaces([]);
    setPlaceMessage(null);
    setFocus({ token: Date.now(), lat: place.lat, lng: place.lng });
    void loadRoads(place, place.label);
  }

  async function runSearch(text: string, selectFirst: boolean) {
    setSearching(true);
    setPlaceMessage(null);
    const result = await searchSwedishPlaces(text);
    setSearching(false);
    if (result.message) {
      setPlaces([]);
      setPlaceMessage(result.message);
      return;
    }
    if (selectFirst && result.places[0]) {
      selectPlace(result.places[0]);
      return;
    }
    setPlaces(result.places);
  }

  useEffect(() => {
    void loadRoads(startCenter, "Stockholm, startposition");
  }, []);

  return (
    <>
      <SwedenPanel
        query={query}
        onQueryChange={setQuery}
        onSearch={() => {
          void runSearch(query, false);
        }}
        searching={searching}
        places={places}
        placeMessage={placeMessage}
        onSelectPlace={selectPlace}
        onExample={(name) => {
          setQuery(name);
          void runSearch(name, true);
        }}
        areaLabel={areaLabel}
        radiusMeters={radiusMeters}
        roads={roads}
        matched={matched}
        truncated={truncated}
        loadingRoads={loadingRoads}
        roadError={roadError}
        extendNote={extendNote}
        vehicle={vehicle}
        onChooseBranch={(index) => {
          mapRef.current?.chooseBranch(index);
        }}
        onPedal={(pedal, pressed) => {
          mapRef.current?.setPedal(pedal, pressed);
        }}
        cameraAvailable={Boolean(apiKey) && mapReady}
        trainingOpen={trainingOpen}
        onToggleTraining={() => setTrainingOpen((open) => !open)}
        trainingError={trainingError}
        attempt={attempt}
        onStartExercise={startExercise}
        onFinishExercise={() => commitAttempt(finishAttempt(attemptRef.current))}
        onRetryExercise={startExercise}
        onLoadAtCamera={() => {
          const center = mapRef.current?.readCenter() ?? null;
          if (!center) {
            setRoadError("Kartan är inte redo. Vänta tills vyn har laddats, eller sök en plats.");
            return;
          }
          void loadRoads(center, "Kamerans position");
        }}
      />
      {apiKey ? (
        <CityMap
          ref={mapRef}
          apiKey={apiKey}
          roads={roads}
          areas={areas}
          anchor={anchor}
          focus={focus}
          extendHint={extendNote}
          onReadyChange={setMapReady}
          onVehicleChange={setVehicle}
          onDriveSample={onDriveSample}
          onExtendRoads={(center) => {
            void extendRoads(center);
          }}
          onRetry={() => {
            window.location.reload();
          }}
        />
      ) : (
        <ConfigScreen />
      )}
    </>
  );
}
