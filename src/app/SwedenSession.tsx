import { useEffect, useRef, useState } from "react";
import { STOCKHOLM_CANDIDATE } from "../geo/stockholmCandidate";
import { CityMap, type MapFocus, type SwedenMapHandle } from "../map/CityMap";
import { searchSwedishPlaces, type SwedishPlace } from "../places/swedishPlaces";
import { fetchDrivingRoads } from "../roads/fetchDrivingRoads";
import type { RoadSegment } from "../roads/drivingRoads";
import { ConfigScreen } from "../ui/ConfigScreen";
import { SwedenPanel } from "../ui/SwedenPanel";

const startCenter = STOCKHOLM_CANDIDATE.camera.center;

export function SwedenSession({ apiKey }: { apiKey: string | null }) {
  const mapRef = useRef<SwedenMapHandle>(null);
  const requestRef = useRef(0);
  const [query, setQuery] = useState("");
  const [places, setPlaces] = useState<SwedishPlace[]>([]);
  const [placeMessage, setPlaceMessage] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);
  const [roads, setRoads] = useState<RoadSegment[]>([]);
  const [matched, setMatched] = useState(0);
  const [truncated, setTruncated] = useState(false);
  const [radiusMeters, setRadiusMeters] = useState<number | null>(null);
  const [areaLabel, setAreaLabel] = useState("Stockholm, startposition");
  const [roadError, setRoadError] = useState<string | null>(null);
  const [loadingRoads, setLoadingRoads] = useState(true);
  const [focus, setFocus] = useState<MapFocus | null>(null);
  const [mapReady, setMapReady] = useState(false);

  async function loadRoads(center: { lat: number; lng: number }, label: string) {
    const requestId = requestRef.current + 1;
    requestRef.current = requestId;
    setLoadingRoads(true);
    setRoadError(null);
    setAreaLabel(label);
    setRoads([]);
    setMatched(0);
    setTruncated(false);
    const result = await fetchDrivingRoads({ lat: center.lat, lng: center.lng });
    if (requestId !== requestRef.current) {
      return;
    }
    setLoadingRoads(false);
    if (!result.ok) {
      setRoads([]);
      setMatched(0);
      setTruncated(false);
      setRadiusMeters(null);
      setRoadError(result.message);
      return;
    }
    setRoads(result.area.roads);
    setMatched(result.area.matched);
    setTruncated(result.area.truncated);
    setRadiusMeters(result.area.radiusMeters);
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
        cameraAvailable={Boolean(apiKey) && mapReady}
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
          focus={focus}
          onReadyChange={setMapReady}
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
