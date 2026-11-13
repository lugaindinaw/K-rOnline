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
let routeDone = false;
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
const demoButton = document.querySelector("#demo");
demoButton.disabled = true;
demoButton.addEventListener("click", () => runDemo());

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

function verticalRay(lat, lng) {
  const top = Cesium.Cartesian3.fromDegrees(lng, lat, 2500);
  const bottom = Cesium.Cartesian3.fromDegrees(lng, lat, -50);
  const direction = Cesium.Cartesian3.subtract(bottom, top, new Cesium.Cartesian3());
  Cesium.Cartesian3.normalize(direction, direction);
  return new Cesium.Ray(top, direction);
}

function hitHeights(results) {
  const heights = [];
  for (const hit of results ?? []) {
    if (!hit?.position) continue;
    const height = Cesium.Cartographic.fromCartesian(hit.position).height;
    if (height > -50 && height < 2500) heights.push(height);
  }
  return heights;
}

async function meshHits(lat, lng) {
  if (!meshActive) return [];
  try {
    const hits = await viewer.scene.drillPickFromRayMostDetailed(verticalRay(lat, lng), 6);
    return hitHeights(hits);
  } catch (error) {
    console.error(error);
    return [];
  }
}

const WHEELS = [
  { name: "vänster fram", forward: 1.382, left: 0.77 },
  { name: "höger fram", forward: 1.382, left: -0.77 },
  { name: "vänster bak", forward: -1.398, left: 0.77 },
  { name: "höger bak", forward: -1.398, left: -0.77 },
];
const contactLog = [];
let carPitch = 0;
let carRoll = 0;
let carHeight = 0;
let roadHeight = 0;
let pathDistance = 0;
let contactClosed = false;

async function measureRoadPoint(point, terrainProvider) {
  let terrain = Number.NaN;
  if (terrainProvider) {
    try {
      const [sampled] = await Cesium.sampleTerrainMostDetailed(terrainProvider, [
        Cesium.Cartographic.fromDegrees(point.lon, point.lat),
      ]);
      terrain = sampled.height;
    } catch (error) {
      console.error(error);
    }
  }
  const center = await meshHits(point.lat, point.lon);
  let choice = chooseRoadHeight(center, terrain, point.bridge);
  let mesh = center;
  if (choice.source !== "vägyta") {
    const meters = 3.5 / (111320 * Math.cos((point.lat * Math.PI) / 180));
    const sides = [
      ...(await meshHits(point.lat, point.lon + meters)),
      ...(await meshHits(point.lat, point.lon - meters)),
    ];
    mesh = [...center, ...sides];
    choice = chooseRoadHeight(mesh, terrain, point.bridge);
  }
  point.height = choice.height;
  point.source = choice.source;
  point.terrain = terrain;
  point.mesh = mesh.map((height) => Number(height.toFixed(1)));
  return point;
}

function chooseRoadHeight(meshValues, terrainHeight, bridge) {
  const finite = meshValues.filter((height) => Number.isFinite(height));
  if (!Number.isFinite(terrainHeight) || !finite.length) return { height: Number.NaN, source: "saknas" };
  const nearGround = finite.filter((height) => height <= terrainHeight + (bridge ? 18 : 3) && height >= terrainHeight - 25);
  if (!nearGround.length) return { height: Number.NaN, source: "saknas" };
  nearGround.sort((a, b) => a - b);
  return { height: nearGround[0], source: "vägyta" };
}

function offsetMeters(forward, left) {
  const axes = basis(heading);
  return {
    north: axes.north * forward - axes.rightNorth * left,
    east: axes.east * forward - axes.rightEast * left,
  };
}

function mean(items, pick) {
  return items.reduce((sum, item) => sum + pick(item), 0) / items.length;
}

function fitContact() {
  const samples = WHEELS.map((wheel) => {
    const offset = offsetMeters(wheel.forward, wheel.left);
    const road = heightAlong(north + offset.north, east + offset.east);
    return { ...wheel, road: road.height, lateral: road.distance };
  });
  const pitchSlope = (mean(samples.filter((wheel) => wheel.forward > 0), (wheel) => wheel.road)
    - mean(samples.filter((wheel) => wheel.forward < 0), (wheel) => wheel.road)) / 2.78;
  const rollSlope = (mean(samples.filter((wheel) => wheel.left > 0), (wheel) => wheel.road)
    - mean(samples.filter((wheel) => wheel.left < 0), (wheel) => wheel.road)) / 1.54;
  const height = mean(samples, (wheel) => wheel.road)
    - pitchSlope * mean(samples, (wheel) => wheel.forward)
    - rollSlope * mean(samples, (wheel) => wheel.left);
  return {
    height,
    pitch: Math.atan(pitchSlope),
    roll: Math.atan(rollSlope),
    samples,
  };
}

function tireHeight(fit, wheel) {
  return fit.height + Math.sin(fit.pitch) * wheel.forward + Math.sin(fit.roll) * Math.cos(fit.pitch) * wheel.left;
}

function wheelContact() {
  const fit = fitContact();
  return {
    fit,
    wheels: fit.samples.map((wheel) => {
      const tire = tireHeight(fit, wheel);
      return {
        name: wheel.name,
        road: wheel.road,
        tire,
        gap: tire - wheel.road,
        lateral: wheel.lateral,
      };
    }),
  };
}

function heightAlong(northMeters, eastMeters) {
  if (route.length < 2) return { height: groundHeight, name: "Regeringsgatan", source: "saknas" };
  let bestDistance = Infinity;
  let chosen = route[0];
  let chosenHeight = route[0].height ?? 0;
  for (let index = 0; index < route.length - 1; index += 1) {
    const start = route[index];
    const end = route[index + 1];
    const spanNorth = end.north - start.north;
    const spanEast = end.east - start.east;
    const lengthSquared = spanNorth * spanNorth + spanEast * spanEast || 1;
    let t = ((northMeters - start.north) * spanNorth + (eastMeters - start.east) * spanEast) / lengthSquared;
    t = Math.max(0, Math.min(1, t));
    const nearNorth = start.north + spanNorth * t;
    const nearEast = start.east + spanEast * t;
    const distance = Math.hypot(northMeters - nearNorth, eastMeters - nearEast);
    if (distance < bestDistance) {
      bestDistance = distance;
      chosen = t < 0.5 ? start : end;
      chosenHeight = (start.height ?? 0) + ((end.height ?? 0) - (start.height ?? 0)) * t;
    }
  }
  return { height: chosenHeight, name: chosen.name, source: chosen.source, distance: bestDistance };
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
  let turnError = 0;
  if (followRoute && route.length > 1) {
    let target = route[routeIndex];
    let deltaNorth = target.north - north;
    let deltaEast = target.east - east;
    let distance = Math.hypot(deltaNorth, deltaEast);
    while (distance < 3 && routeIndex < route.length - 1) {
      routeIndex += 1;
      target = route[routeIndex];
      deltaNorth = target.north - north;
      deltaEast = target.east - east;
      distance = Math.hypot(deltaNorth, deltaEast);
    }
    const desired = Math.atan2(deltaEast, deltaNorth);
    turnError = desired - heading;
    while (turnError > Math.PI) turnError -= Math.PI * 2;
    while (turnError < -Math.PI) turnError += Math.PI * 2;
    const maxTurn = Cesium.Math.toRadians(42) * dt;
    heading += Math.max(-maxTurn, Math.min(maxTurn, turnError));
    if (routeIndex >= route.length - 1 && distance < 6) {
      input.gas = false;
      input.brake = true;
      if (speed < 0.3) routeDone = true;
    } else {
      input.gas = true;
      input.brake = false;
    }
  }
  const steer = (input.left ? -1 : 0) + (input.right ? 1 : 0);
  const cornering = followRoute && Math.abs(turnError) > Cesium.Math.toRadians(8);
  const targetSpeed = cornering ? 3.5 : 8;
  if (input.gas) {
    speed = speed < targetSpeed
      ? Math.min(targetSpeed, speed + 3.2 * dt)
      : Math.max(targetSpeed, speed - 4 * dt);
  } else if (input.brake) speed = Math.max(0, speed - 6 * dt);
  else speed = Math.max(0, speed - 1.1 * dt);
  if (!followRoute && speed > 0.2) heading += steer * Cesium.Math.toRadians(42) * dt;
  const axes = basis(heading);
  const moved = speed * dt;
  pathDistance += moved;
  north += axes.north * moved;
  east += axes.east * moved;
}

function updateCar(lat, lng) {
  if (!carModel) return;
  const fit = fitContact();
  carPitch = fit.pitch;
  carRoll = fit.roll;
  carHeight = fit.height;
  const matrix = Cesium.Transforms.headingPitchRollToFixedFrame(
    Cesium.Cartesian3.fromDegrees(lng, lat, carHeight),
    new Cesium.HeadingPitchRoll(heading + MODEL_HEADING_OFFSET, carPitch, carRoll),
  );
  carModel.modelMatrix = matrix;
}

function recordContact(force) {
  if (contactClosed) return;
  if (!force && contactLog.length > 0 && pathDistance - contactLog[contactLog.length - 1].distance < 8) return;
  const contact = wheelContact();
  contactLog.push({
    distance: Number(pathDistance.toFixed(1)),
    speedKmh: Number((speed * 3.6).toFixed(1)),
    course: Number(((Cesium.Math.toDegrees(heading) + 360) % 360).toFixed(1)),
    carHeight: Number(carHeight.toFixed(3)),
    roadHeight: Number(roadHeight.toFixed(3)),
    wheels: contact.wheels.map((wheel) => ({
      name: wheel.name,
      road: Number(wheel.road.toFixed(3)),
      tire: Number(wheel.tire.toFixed(3)),
      gap: Number(wheel.gap.toFixed(3)),
      lateral: Number(wheel.lateral.toFixed(2)),
    })),
  });
  if (force) contactClosed = true;
  globalThis.driveReport = contactLog;
}

let last = performance.now();
function tick(now) {
  const dt = Math.min(0.5, Math.max(0, (now - last) / 1000));
  last = now;
  step(dt);
  const { lat, lng } = metersToLatLng(north, east);
  const along = heightAlong(north, east);
  roadHeight = along.height;
  updateCar(lat, lng);
  groundHeight = carHeight;
  street.textContent = `${along.name} · vägbana ${roadHeight.toFixed(1)} m · ${along.source}`;
  frameCamera(lat, lng, heading);
  recordContact(speed < 0.05 && pathDistance > 20);
  const height = cameraHeightMeters();
  const course = (Cesium.Math.toDegrees(heading) + 360) % 360;
  const worstGap = Math.max(...wheelContact().wheels.map((wheel) => Math.abs(wheel.gap)));
  readout.textContent = `${Math.round(speed * 3.6)} km/h · kurs ${Math.round(course)}° · ${Math.round(pathDistance)} m · kameran ${height.toFixed(2)} m · däck ${Math.round(worstGap * 1000)} mm`;
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
  pathDistance = 0;
}

async function runDemo() {
  if (demoRunning || route.length < 2) return;
  demoRunning = true;
  try {
    placeOnRoute(0);
    routeDone = false;
    contactLog.length = 0;
    contactClosed = false;
    setMode("chase");
    followRoute = true;
    input.left = false;
    input.right = false;
    input.gas = false;
    input.brake = false;
    while (!routeDone && pathDistance < 40) await wait(200);
    setMode("driver");
    while (!routeDone && routeIndex < Math.max(1, route.length - 4)) await wait(200);
    setMode("chase");
    while (!routeDone) await wait(200);
  } finally {
    followRoute = false;
    input.gas = false;
    input.brake = false;
    demoRunning = false;
  }
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

function drivePoints(data) {
  const named = (name) => data.elements.filter((item) => item.tags?.name === name && item.geometry?.length > 1);
  const boras = named("Nils Jakobsonsgatan");
  if (boras.length > 0) {
    const way = stitch(boras).map((point) => ({ ...point, name: "Nils Jakobsonsgatan", bridge: false }));
    return { way, checks: [way[0], way[Math.floor(way.length / 2)], way[way.length - 1]] };
  }
  const regeringsgatan = stitch(named("Regeringsgatan"));
  const jakobsgatan = stitch(named("Jakobsgatan"));
  const malmtorgsgatan = stitch(named("Malmtorgsgatan"));
  const way = regeringsgatan.slice(0, 6).map((point) => ({ ...point, name: "Regeringsgatan", bridge: false }));
  for (let index = jakobsgatan.length - 2; index >= 9; index -= 1) {
    way.push({ ...jakobsgatan[index], name: "Jakobsgatan", bridge: false });
  }
  for (const point of malmtorgsgatan.slice(3)) {
    way.push({ ...point, name: "Malmtorgsgatan", bridge: false });
  }
  return { way, checks: [way[0], way[4], way[8], way[way.length - 1]] };
}

function addRoadSurface(points) {
  for (let index = 0; index < points.length - 1; index += 1) {
    const start = points[index];
    const end = points[index + 1];
    if (!Number.isFinite(start.height) || !Number.isFinite(end.height)) continue;
    viewer.entities.add({
      corridor: {
        positions: Cesium.Cartesian3.fromDegreesArray([start.lng, start.lat, end.lng, end.lat]),
        width: start.name === "Jakobsgatan" ? 8 : 9,
        height: (start.height + end.height) / 2 + 0.04,
        material: Cesium.Color.fromCssColorString("#2f343c").withAlpha(0.28),
      },
    });
  }
}

function startOn(points) {
  origin = { lat: points[0].lat, lng: points[0].lon };
  route = points.map((point) => ({
    ...toLocal(point),
    lat: point.lat,
    lng: point.lon,
    name: point.name,
    bridge: Boolean(point.bridge),
    height: point.height,
    source: point.source,
  }));
  routeIndex = 1;
  placeOnRoute(0);
  let routeLength = 0;
  for (let index = 1; index < route.length; index += 1) {
    routeLength += Math.hypot(route[index].north - route[index - 1].north, route[index].east - route[index - 1].east);
  }
  console.info(`rutt ${route.length} punkter, ${routeLength.toFixed(1)} m`);
  street.textContent = route[0]?.name || "Körbana";
}

const placeName = new URLSearchParams(location.search).get("place");
const city = await fetch(placeName === "stockholm" ? "/gustav.json" : "/boras.json").then((response) => response.json());
const drive = drivePoints(city);
street.textContent = `Mäter vägbanan under ${drive.way[0]?.name || "körbanan"}`;
let terrainProvider = null;
try {
  terrainProvider = await Cesium.CesiumTerrainProvider.fromIonAssetId(1);
} catch (error) {
  console.error(error);
}
try {
  const tileset = await Cesium.createGooglePhotorealistic3DTileset(undefined, {
    maximumScreenSpaceError: 8,
  });
  tileset.dynamicScreenSpaceError = true;
  tileset.dynamicScreenSpaceErrorFactor = 4;
  viewer.scene.primitives.add(tileset);
  viewer.scene.globe.show = false;
  viewer.resolutionScale = 1;
  meshActive = true;
  const terrainCartographic = Cesium.Cartographic.fromDegrees(drive.way[0].lon, drive.way[0].lat);
  if (terrainProvider) {
    try {
      const [sampled] = await Cesium.sampleTerrainMostDetailed(terrainProvider, [terrainCartographic]);
      terrainCartographic.height = sampled.height;
    } catch (error) {
      console.error(error);
    }
  }
  const lookHeight = (Number.isFinite(terrainCartographic.height) ? terrainCartographic.height : 30) + 18;
  viewer.camera.setView({
    destination: Cesium.Cartesian3.fromDegrees(drive.way[0].lon, drive.way[0].lat - 0.00035, lookHeight),
    orientation: { heading: 0, pitch: Cesium.Math.toRadians(-18), roll: 0 },
  });
  await new Promise((resolve) => setTimeout(resolve, 6000));
} catch (error) {
  console.error(error);
  street.textContent = "Fotogrammetrin laddades inte. Körningen är blockerad eftersom vägbanan inte kan mätas.";
}

if (meshActive) {
  const measured = [];
  for (const point of drive.way) measured.push(await measureRoadPoint(point, terrainProvider));
  for (let index = 1; index < drive.way.length - 1; index += 1) {
    if (!Number.isFinite(drive.way[index - 1].height) || !Number.isFinite(drive.way[index + 1].height)) continue;
    const neighbors = (drive.way[index - 1].height + drive.way[index + 1].height) / 2;
    if (drive.way[index].height > neighbors + 4) {
      drive.way[index].height = neighbors;
      drive.way[index].source = "utjämnad vägbana";
    }
  }
  console.info(measured.map((point) => `${point.name} ${Number.isFinite(point.height) ? point.height.toFixed(1) : "saknas"} ${point.source} träffar ${point.mesh.join("/")}`).join(" || "));
  const missing = drive.way.filter((point) => point.source !== "vägyta" && point.source !== "utjämnad vägbana");
  if (missing.length > 0) {
    street.textContent = `Vägbanan kunde inte mätas vid ${missing[0].name}. Körningen är blockerad.`;
  } else {
    startOn(drive.way);
    demoButton.disabled = false;
    groundHeight = route[0].height;
    try {
      carModel = await Cesium.Model.fromGltfAsync({
        url: "/car.glb",
        scale: 1,
      });
      viewer.scene.primitives.add(carModel);
    } catch (error) {
      console.error(error);
      if (!carModel) {
        street.textContent = "Bilmodellen gick inte att läsa. Körningen är blockerad.";
        demoButton.disabled = true;
      }
    }
    if (carModel) requestAnimationFrame(tick);
  }
}
