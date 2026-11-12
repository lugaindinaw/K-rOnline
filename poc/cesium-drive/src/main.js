import * as Cesium from "cesium";
import "cesium/Build/Cesium/Widgets/widgets.css";
import "./style.css";

const EYE_HEIGHT_METERS = 1.25;
const CHASE_BACK_METERS = 7;
const CHASE_UP_METERS = 2;
const DRIVER_LEFT_METERS = 0.38;
const DRIVER_FORWARD_METERS = 0.45;
const DRIVER_LOOKAHEAD_METERS = 14;

const input = { gas: false, brake: false, left: false, right: false };
let mode = "chase";
let speed = 0;
let heading = 0;
let north = 0;
let east = 0;
let origin = { lat: 59.32944, lng: 18.06861 };
let carModel = null;
let route = [];
let routeIndex = 0;
let followRoute = false;
let demoRunning = false;
let groundHeight = 0;
let meshActive = false;
// Cesium treats the corrected glTF +X axis as forward. Grab3D's nose is glTF +Z.
const MODEL_HEADING_OFFSET = -Math.PI / 2;

const viewer = new Cesium.Viewer("cesium", {
  animation: false,
  timeline: false,
  baseLayerPicker: false,
  geocoder: false,
  homeButton: false,
  sceneModePicker: false,
  navigationHelpButton: false,
  fullscreenButton: false,
  infoBox: false,
  selectionIndicator: false,
  baseLayer: false,
  terrainProvider: new Cesium.EllipsoidTerrainProvider(),
  skyBox: false,
  skyAtmosphere: false,
  orderIndependentTranslucency: false,
  useBrowserRecommendedResolution: false,
  contextOptions: {
    webgl: { antialias: false, powerPreference: "high-performance" },
  },
});
viewer.scene.globe.baseColor = Cesium.Color.fromCssColorString("#8f977f");
viewer.scene.backgroundColor = Cesium.Color.fromCssColorString("#c5d0dc");
viewer.scene.fog.enabled = false;
viewer.scene.globe.showGroundAtmosphere = false;
viewer.scene.highDynamicRange = false;
viewer.scene.msaaSamples = 1;
if (viewer.scene.sun) viewer.scene.sun.show = false;
if (viewer.scene.moon) viewer.scene.moon.show = false;
if (viewer.scene.skyAtmosphere) viewer.scene.skyAtmosphere.show = false;
viewer.scene.postProcessStages.fxaa.enabled = false;
viewer.resolutionScale = 0.6;
const controls = viewer.scene.screenSpaceCameraController;
controls.enableCollisionDetection = false;
controls.enableInputs = false;

const modeLabel = document.querySelector("#mode");
const readout = document.querySelector("#readout");
const street = document.querySelector("#street");

function hold(id, key) {
  const button = document.querySelector(id);
  const down = (event) => {
    event.preventDefault();
    input[key] = true;
  };
  const up = () => {
    input[key] = false;
  };
  button.addEventListener("pointerdown", down);
  button.addEventListener("pointerup", up);
  button.addEventListener("pointerleave", up);
  button.addEventListener("pointercancel", up);
}

hold("#gas", "gas");
hold("#brake", "brake");
hold("#left", "left");
hold("#right", "right");
document.querySelector("#driver").addEventListener("click", () => setMode("driver"));
document.querySelector("#chase").addEventListener("click", () => setMode("chase"));
document.querySelector("#demo").addEventListener("click", () => runDemo());

window.addEventListener("keydown", (event) => {
  if (event.code === "KeyW") input.gas = true;
  if (event.code === "KeyS") input.brake = true;
  if (event.code === "KeyA") input.left = true;
  if (event.code === "KeyD") input.right = true;
  if (event.code === "Digit1") setMode("driver");
  if (event.code === "Digit2") setMode("chase");
});
window.addEventListener("keyup", (event) => {
  if (event.code === "KeyW") input.gas = false;
  if (event.code === "KeyS") input.brake = false;
  if (event.code === "KeyA") input.left = false;
  if (event.code === "KeyD") input.right = false;
});

function setMode(next) {
  mode = next;
  modeLabel.textContent = next === "driver" ? "Förarvy" : "Bakifrån";
}

function metersToLatLng(northMeters, eastMeters) {
  const lat = origin.lat + northMeters / 111320;
  const lng = origin.lng + eastMeters / (111320 * Math.cos((origin.lat * Math.PI) / 180));
  return { lat, lng };
}

function place(lat, lng, eastMeters, northMeters, upMeters) {
  const frame = Cesium.Transforms.eastNorthUpToFixedFrame(
    Cesium.Cartesian3.fromDegrees(lng, lat, groundHeight),
  );
  return Cesium.Matrix4.multiplyByPoint(
    frame,
    new Cesium.Cartesian3(eastMeters, northMeters, upMeters),
    new Cesium.Cartesian3(),
  );
}

function sampleGround(lat, lng) {
  if (!meshActive) return;
  const height = viewer.scene.sampleHeight(Cesium.Cartographic.fromDegrees(lng, lat));
  if (Number.isFinite(height) && Math.abs(height - groundHeight) < 4) groundHeight = height;
}

function basis(headingRadians) {
  return {
    east: Math.sin(headingRadians),
    north: Math.cos(headingRadians),
    rightEast: Math.cos(headingRadians),
    rightNorth: -Math.sin(headingRadians),
  };
}

function look(eye, target) {
  const direction = Cesium.Cartesian3.subtract(target, eye, new Cesium.Cartesian3());
  Cesium.Cartesian3.normalize(direction, direction);
  const up = Cesium.Cartesian3.subtract(place(origin.lat, origin.lng, 0, 0, 1), place(origin.lat, origin.lng, 0, 0, 0), new Cesium.Cartesian3());
  Cesium.Cartesian3.normalize(up, up);
  viewer.camera.setView({
    destination: eye,
    orientation: { direction, up },
  });
  viewer.camera.frustum.near = 0.08;
}

function frameCamera(lat, lng, headingRadians) {
  const axes = basis(headingRadians);
  if (mode === "driver") {
    const eye = place(
      lat,
      lng,
      axes.rightEast * -DRIVER_LEFT_METERS + axes.east * DRIVER_FORWARD_METERS,
      axes.rightNorth * -DRIVER_LEFT_METERS + axes.north * DRIVER_FORWARD_METERS,
      EYE_HEIGHT_METERS,
    );
    const target = place(
      lat,
      lng,
      axes.rightEast * -DRIVER_LEFT_METERS + axes.east * DRIVER_LOOKAHEAD_METERS,
      axes.rightNorth * -DRIVER_LEFT_METERS + axes.north * DRIVER_LOOKAHEAD_METERS,
      0.85,
    );
    look(eye, target);
    return;
  }
  const eye = place(lat, lng, axes.east * -CHASE_BACK_METERS, axes.north * -CHASE_BACK_METERS, CHASE_UP_METERS);
  const target = place(lat, lng, axes.east * 1.2, axes.north * 1.2, 0.7);
  look(eye, target);
}

function cameraHeightMeters() {
  return Cesium.Cartographic.fromCartesian(viewer.camera.positionWC).height - groundHeight;
}

function step(dt) {
  if (followRoute && route.length > 1) {
    let target = route[routeIndex];
    let deltaNorth = target.north - north;
    let deltaEast = target.east - east;
    let distance = Math.hypot(deltaNorth, deltaEast);
    while (distance < 5 && routeIndex < route.length - 1) {
      routeIndex += 1;
      target = route[routeIndex];
      deltaNorth = target.north - north;
      deltaEast = target.east - east;
      distance = Math.hypot(deltaNorth, deltaEast);
    }
    const desired = Math.atan2(deltaEast, deltaNorth);
    let error = desired - heading;
    while (error > Math.PI) error -= Math.PI * 2;
    while (error < -Math.PI) error += Math.PI * 2;
    const maxTurn = Cesium.Math.toRadians(42) * dt;
    heading += Math.max(-maxTurn, Math.min(maxTurn, error));
    if (routeIndex >= route.length - 1 && distance < 6) {
      input.gas = false;
      input.brake = true;
    } else {
      input.gas = true;
      input.brake = false;
    }
  }
  const steer = (input.left ? -1 : 0) + (input.right ? 1 : 0);
  if (input.gas) speed = Math.min(8, speed + 3.2 * dt);
  else if (input.brake) speed = Math.max(0, speed - 6 * dt);
  else speed = Math.max(0, speed - 1.1 * dt);
  if (!followRoute && speed > 0.2) heading += steer * Cesium.Math.toRadians(42) * dt;
  const axes = basis(heading);
  north += axes.north * speed * dt;
  east += axes.east * speed * dt;
}

function updateCar(lat, lng) {
  if (!carModel) return;
  carModel.modelMatrix = Cesium.Transforms.headingPitchRollToFixedFrame(
    Cesium.Cartesian3.fromDegrees(lng, lat, groundHeight),
    new Cesium.HeadingPitchRoll(heading + MODEL_HEADING_OFFSET, 0, 0),
  );
}

let last = performance.now();
function tick(now) {
  const dt = Math.min(0.25, Math.max(0, (now - last) / 1000));
  last = now;
  step(dt);
  const { lat, lng } = metersToLatLng(north, east);
  sampleGround(lat, lng);
  updateCar(lat, lng);
  frameCamera(lat, lng, heading);
  const height = cameraHeightMeters();
  const course = (Cesium.Math.toDegrees(heading) + 360) % 360;
  readout.textContent = `${Math.round(speed * 3.6)} km/h · kurs ${Math.round(course)}° · kameran ${height.toFixed(2)} m över marken`;
  requestAnimationFrame(tick);
}

function approachIndex() {
  let corner = 1;
  let sharpest = 0;
  for (let index = 1; index < route.length - 1; index += 1) {
    const before = Math.atan2(route[index].east - route[index - 1].east, route[index].north - route[index - 1].north);
    const after = Math.atan2(route[index + 1].east - route[index].east, route[index + 1].north - route[index].north);
    let change = Math.abs(after - before);
    if (change > Math.PI) change = Math.PI * 2 - change;
    if (change > sharpest) {
      sharpest = change;
      corner = index;
    }
  }
  let index = corner;
  let remaining = 32;
  while (index > 0 && remaining > 0) {
    remaining -= Math.hypot(route[index].east - route[index - 1].east, route[index].north - route[index - 1].north);
    index -= 1;
  }
  return index;
}

function placeOnRoute(index) {
  const point = route[index];
  const next = route[Math.min(route.length - 1, index + 1)];
  north = point.north;
  east = point.east;
  heading = Math.atan2(next.east - point.east, next.north - point.north);
  routeIndex = Math.min(route.length - 1, index + 1);
  speed = 0;
}

async function runDemo() {
  if (demoRunning) return;
  demoRunning = true;
  placeOnRoute(approachIndex());
  setMode("chase");
  followRoute = true;
  input.left = false;
  input.right = false;
  await wait(2400);
  setMode("driver");
  await wait(1800);
  followRoute = false;
  input.gas = true;
  input.brake = false;
  input.left = true;
  await wait(1100);
  input.left = false;
  setMode("chase");
  await wait(1600);
  input.gas = false;
  input.brake = true;
  await wait(700);
  input.brake = false;
  demoRunning = false;
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function ring(points) {
  const flat = [];
  for (const point of points) flat.push(point.lon, point.lat);
  const first = points[0];
  const last = points[points.length - 1];
  if (first.lat !== last.lat || first.lon !== last.lon) flat.push(first.lon, first.lat);
  return flat;
}

function heightOf(tags) {
  const meters = Number.parseFloat(tags.height);
  if (Number.isFinite(meters) && meters > 2 && meters < 120) return meters;
  const levels = Number.parseFloat(tags["building:levels"]);
  if (Number.isFinite(levels) && levels > 0) return Math.min(90, levels * 3.1);
  return 14;
}

function roadWidth(tags) {
  const lanes = Number.parseFloat(tags.lanes);
  if (Number.isFinite(lanes) && lanes > 0) return Math.min(22, lanes * 3.4);
  if (tags.highway === "secondary") return 12;
  if (tags.highway === "tertiary") return 9;
  return 7;
}

function addCity(data) {
  const lats = [];
  const lngs = [];
  for (const item of data.elements) {
    for (const point of item.geometry) {
      lats.push(point.lat);
      lngs.push(point.lon);
    }
  }
  viewer.entities.add({
    polygon: {
      hierarchy: Cesium.Cartesian3.fromDegreesArray([
        Math.min(...lngs) - 0.001,
        Math.min(...lats) - 0.001,
        Math.max(...lngs) + 0.001,
        Math.min(...lats) - 0.001,
        Math.max(...lngs) + 0.001,
        Math.max(...lats) + 0.001,
        Math.min(...lngs) - 0.001,
        Math.max(...lats) + 0.001,
      ]),
      height: 0,
      material: Cesium.Color.fromCssColorString("#6d726c"),
    },
  });
  for (const item of data.elements) {
    const tags = item.tags ?? {};
    if (tags.building) {
      viewer.entities.add({
        polygon: {
          hierarchy: Cesium.Cartesian3.fromDegreesArray(ring(item.geometry)),
          height: 0,
          extrudedHeight: heightOf(tags),
          material: Cesium.Color.fromCssColorString(tags["building:levels"] ? "#d7c7b2" : "#c3b39a"),
        },
      });
      continue;
    }
    if (!tags.highway) continue;
    const flat = [];
    for (const point of item.geometry) flat.push(point.lon, point.lat);
    viewer.entities.add({
      corridor: {
        positions: Cesium.Cartesian3.fromDegreesArray(flat),
        width: roadWidth(tags),
        height: 0.08,
        material: Cesium.Color.fromCssColorString("#3e444c"),
      },
    });
  }
}

function endpointDistance(a, b) {
  const northMeters = (a.lat - b.lat) * 111320;
  const eastMeters = (a.lon - b.lon) * 111320 * Math.cos((a.lat * Math.PI) / 180);
  return Math.hypot(northMeters, eastMeters);
}

function stitch(parts) {
  const segments = parts.map((part) => part.geometry.map((point) => ({ lat: point.lat, lon: point.lon })));
  let startIndex = 0;
  let startLat = Infinity;
  let reverseStart = false;
  segments.forEach((segment, index) => {
    if (segment[0].lat < startLat) {
      startLat = segment[0].lat;
      startIndex = index;
      reverseStart = false;
    }
    if (segment[segment.length - 1].lat < startLat) {
      startLat = segment[segment.length - 1].lat;
      startIndex = index;
      reverseStart = true;
    }
  });
  const used = new Set([startIndex]);
  const chain = reverseStart ? [...segments[startIndex]].reverse() : [...segments[startIndex]];
  while (used.size < segments.length) {
    const end = chain[chain.length - 1];
    let best = -1;
    let bestDistance = 35;
    let reverseBest = false;
    segments.forEach((segment, index) => {
      if (used.has(index)) return;
      const forward = endpointDistance(end, segment[0]);
      const backward = endpointDistance(end, segment[segment.length - 1]);
      if (forward < bestDistance) {
        bestDistance = forward;
        best = index;
        reverseBest = false;
      }
      if (backward < bestDistance) {
        bestDistance = backward;
        best = index;
        reverseBest = true;
      }
    });
    if (best < 0) break;
    used.add(best);
    const segment = reverseBest ? [...segments[best]].reverse() : segments[best];
    chain.push(...segment.slice(1));
  }
  return chain;
}

function toLocal(point) {
  return {
    north: (point.lat - origin.lat) * 111320,
    east: (point.lon - origin.lng) * 111320 * Math.cos((origin.lat * Math.PI) / 180),
  };
}

function startOn(data) {
  const named = (name) => data.elements.filter((item) => item.tags?.name === name && item.geometry?.length > 1);
  const regeringsgatan = stitch(named("Regeringsgatan"));
  const jakobsgatan = stitch(named("Jakobsgatan"));
  const turnFrom = regeringsgatan[Math.floor(regeringsgatan.length * 0.45)] ?? regeringsgatan[0];
  let turnIndex = 0;
  let turnDistance = Infinity;
  jakobsgatan.forEach((point, index) => {
    const distance = endpointDistance(turnFrom, point);
    if (distance < turnDistance) {
      turnDistance = distance;
      turnIndex = index;
    }
  });
  const way = [...regeringsgatan];
  if (jakobsgatan.length > turnIndex + 1) way.push(...jakobsgatan.slice(turnIndex));
  origin = { lat: way[0].lat, lng: way[0].lon };
  route = way.map(toLocal);
  routeIndex = 1;
  north = 0;
  east = 0;
  heading = Math.atan2(route[1].east - route[0].east, route[1].north - route[0].north);
  placeOnRoute(approachIndex());
  street.textContent = "Regeringsgatan";
}

const city = await fetch("/gustav.json").then((response) => response.json());
startOn(city);
try {
  const tileset = await Cesium.createGooglePhotorealistic3DTileset(undefined, {
    maximumScreenSpaceError: 16,
  });
  viewer.scene.primitives.add(tileset);
  viewer.scene.globe.show = false;
  viewer.resolutionScale = 1;
  meshActive = true;
  street.textContent = "Regeringsgatan · Google Photorealistic 3D Tiles via Cesium ion";
  viewer.camera.setView({
    destination: Cesium.Cartesian3.fromDegrees(origin.lng, origin.lat - 0.001, 80),
    orientation: { heading: 0, pitch: Cesium.Math.toRadians(-35), roll: 0 },
  });
  await new Promise((resolve) => setTimeout(resolve, 4000));
  const samples = [];
  for (let northMeters = -15; northMeters <= 45; northMeters += 15) {
    for (let eastMeters = -10; eastMeters <= 10; eastMeters += 10) {
      const point = metersToLatLng(northMeters, eastMeters);
      samples.push(Cesium.Cartographic.fromDegrees(point.lng, point.lat));
    }
  }
  await viewer.scene.sampleHeightMostDetailed(samples);
  const heights = samples.map((sample) => sample.height).filter((height) => height > 0 && height < 80).sort((a, b) => a - b);
  if (heights.length > 0) groundHeight = heights[Math.floor((heights.length - 1) * 0.2)];
  street.textContent = `Regeringsgatan · översta träff ${Math.round(groundHeight)} m · Google Photorealistic 3D Tiles via Cesium ion`;
  viewer.camera.setView({
    destination: Cesium.Cartesian3.fromDegrees(origin.lng, origin.lat - 0.0007, groundHeight + 36),
    orientation: { heading: 0, pitch: Cesium.Math.toRadians(-30), roll: 0 },
  });
  await new Promise((resolve) => setTimeout(resolve, 5000));
} catch (error) {
  console.error(error);
  addCity(city);
  street.textContent = "Regeringsgatan · schematiska OSM-volymer, fotogrammetrin gick inte att läsa";
}
try {
  carModel = await Cesium.Model.fromGltfAsync({
    url: "/car.glb",
    scale: 1,
  });
  viewer.scene.primitives.add(carModel);
} catch (error) {
  console.error(error);
  street.textContent = "Bilmodellen gick inte att läsa. Kameran följer fortfarande bilens punkt.";
}
requestAnimationFrame(tick);
