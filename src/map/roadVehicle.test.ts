// Vitest runs in Node. The app tsconfig does not include @types/node.
// @ts-expect-error node:fs is available at test time.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { CAR_HEIGHT_METERS, CAR_LENGTH_METERS, CAR_SCALE, CAR_WIDTH_METERS, mountRoadVehicle, TRAFFIC_SCALE } from "./roadVehicle";
import { ROAD_CLEARANCE_METERS, TIRE_CONTACT_LOCAL_Y, VEHICLE_ALTITUDE_MODE, vehicleAltitudeMeters } from "./vehicleContact";
import type { Model3DOptions, Model3DView } from "./maps3dTypes";

function lowestTireY(glb: Uint8Array): number {
  const view = new DataView(glb.buffer, glb.byteOffset, glb.byteLength);
  const jsonLength = view.getUint32(12, true);
  const gltf = JSON.parse(new TextDecoder().decode(glb.subarray(20, 20 + jsonLength))) as {
    accessors: Array<{ min?: number[] }>;
    meshes?: Array<{ primitives: Array<{ attributes: { POSITION?: number } }> }>;
    nodes?: Array<{ name?: string; mesh?: number; translation?: number[] }>;
  };
  const names = (gltf.nodes ?? []).map((node) => node.name ?? "");
  expect(names.some((name) => name.includes("wheel"))).toBe(true);
  expect(names.some((name) => name.includes("body") || name.includes("windows"))).toBe(true);
  let lowest = Number.POSITIVE_INFINITY;
  for (const node of gltf.nodes ?? []) {
    if (!node.name?.includes("wheel") || node.mesh == null) {
      continue;
    }
    const lift = node.translation?.[1] ?? 0;
    for (const primitive of gltf.meshes?.[node.mesh]?.primitives ?? []) {
      const index = primitive.attributes.POSITION;
      const y = index == null ? undefined : gltf.accessors[index]?.min?.[1];
      if (typeof y === "number") {
        lowest = Math.min(lowest, y + lift);
      }
    }
  }
  return lowest;
}

describe("car scale", () => {
  it("keeps the mesh at the authored passenger-car size", () => {
    expect(CAR_SCALE).toBe(1);
    expect(TRAFFIC_SCALE).toBe(1);
    expect(CAR_LENGTH_METERS).toBeGreaterThan(3.5);
    expect(CAR_LENGTH_METERS).toBeLessThan(5);
    expect(CAR_WIDTH_METERS).toBeGreaterThan(1.5);
    expect(CAR_WIDTH_METERS).toBeLessThan(2.2);
    expect(CAR_HEIGHT_METERS).toBeGreaterThan(1.3);
    expect(CAR_HEIGHT_METERS).toBeLessThan(1.9);
  });

  it("places the model origin on the visible street at the tire contact", () => {
    const contact = lowestTireY(readFileSync(new URL("../../public/car.glb", import.meta.url)));
    expect(contact).toBeCloseTo(TIRE_CONTACT_LOCAL_Y, 3);
    expect(vehicleAltitudeMeters(contact)).toBeCloseTo(ROAD_CLEARANCE_METERS, 3);
    expect(VEHICLE_ALTITUDE_MODE).toBe("RELATIVE_TO_MESH");
    const created: Model3DOptions[] = [];
    let placedAltitude = Number.NaN;
    const parent = { append() {} };
    const Model = class {
      orientation = { heading: 0, tilt: 0, roll: 0 };
      hidden = false;
      constructor(options?: Model3DOptions) {
        created.push(options ?? {});
      }
      set position(next: { lat: number; lng: number; altitude: number }) {
        placedAltitude = next.altitude;
      }
      remove() {}
    };
    const view = mountRoadVehicle(parent, {
      Map3DElement: class {} as never,
      Model3DElement: Model as unknown as new (options?: Model3DOptions) => Model3DView,
      Marker3DElement: class {
        constructor() {
          throw new Error("pin should not be used when the model mounts");
        }
      } as never,
    });
    view?.update({ lat: 59.33, lng: 18.07, headingDegrees: 10 });
    expect(created).toHaveLength(1);
    expect(created[0]?.altitudeMode).toBe("RELATIVE_TO_MESH");
    expect(view?.kind).toBe("model");
    expect(placedAltitude).toBeCloseTo(ROAD_CLEARANCE_METERS, 3);
  });
});
