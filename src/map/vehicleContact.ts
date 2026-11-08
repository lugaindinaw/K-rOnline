/**
 * public/car.glb is the packed Kenney sedan. It is Y-up, and the tire
 * bottoms are at local Y = 0 after the wheel nodes are baked in. Maps
 * anchors that origin. Altitude 0 keeps the tires on the chosen surface.
 * A non-zero value is only the measured contact height, negated, if the
 * mesh origin ever moves off the tires.
 */
export const TIRE_CONTACT_LOCAL_Y = 0;

/**
 * The photographed street is the 3D mesh. CLAMP_TO_GROUND uses the bare-earth
 * terrain instead, so the same origin can sit above or inside the asphalt
 * the camera shows. Relative-to-mesh follows that surface when the tiles update.
 */
export const VEHICLE_ALTITUDE_MODE = "RELATIVE_TO_MESH" as const;

export function vehicleAltitudeMeters(tireContactLocalY = TIRE_CONTACT_LOCAL_Y): number {
  return tireContactLocalY === 0 ? 0 : -tireContactLocalY;
}
