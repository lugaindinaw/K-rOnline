/**
 * public/car.glb is the Grab3D electric car. It is Y-up, and the tire
 * bottoms are at world Y = 0 once each wheel node's height is applied. Maps
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

/**
 * Why this lift exists (Maps Model3DElement only):
 * Tire bottoms in car.glb are at local Y 0, so altitude 0 is the authored
 * contact. At Gustav Adolfs torg the photorealistic asphalt still sits about
 * 8.2 m above the RELATIVE_TO_MESH anchor Maps uses for the block, so a model
 * at altitude 0 sinks into the tile. The chase overlay draws the player car in
 * Three.js on the look altitude and does not use this lift. Traffic and any
 * remaining Maps Model3D bodies still need it.
 */
export const ROAD_CLEARANCE_METERS = 8.2;

export function vehicleAltitudeMeters(tireContactLocalY = TIRE_CONTACT_LOCAL_Y): number {
  const contact = tireContactLocalY === 0 ? 0 : -tireContactLocalY;
  return contact + ROAD_CLEARANCE_METERS;
}
