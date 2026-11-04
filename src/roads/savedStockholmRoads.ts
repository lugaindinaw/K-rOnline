import { distanceMeters, type RoadArea, type RoadSegment } from "./drivingRoads";
import { buildRoadNetwork } from "./roadNetwork";
import type { RoadSign } from "./roadSigns";

/**
 * Driving ways from the OpenStreetMap API map call
 * bbox 18.0678,59.3286,18.0712,59.3304 on 4 Nov 2026.
 * None of these ways had a width tag. lanes is copied when the tag was a single integer.
 * Carriageway edges drawn from this copy are class estimates, not surveyed curbs.
 */
const SAVED_CENTER = { lat: 59.3294, lng: 18.0689 };
const SAVED_REACH_METERS = 450;

const SAVED_ROADS: RoadSegment[] = [
  {
    id: "1036340250",
    osmWayId: "1036340250",
    name: "Norrbro",
    highway: "tertiary",
    oneway: "both",
    coordinates: [
      { lat: 59.3291513, lng: 18.0689439 },
      { lat: 59.3290630, lng: 18.0690349 },
      { lat: 59.3290277, lng: 18.0690743 },
    ],
    nodeIds: ["6205990965", "1814125910", "309619881"],
    widthMeters: null,
    lanes: 1,
  },
  {
    id: "1126945062",
    osmWayId: "1126945062",
    name: "Strömgatan",
    highway: "tertiary",
    oneway: "both",
    coordinates: [
      { lat: 59.3291513, lng: 18.0689439 },
      { lat: 59.3292093, lng: 18.0691465 },
    ],
    nodeIds: ["6205990965", "10304683681"],
    widthMeters: null,
    lanes: 2,
  },
  {
    id: "1126945063",
    osmWayId: "1126945063",
    name: "Malmtorgsgatan",
    highway: "unclassified",
    oneway: "forward",
    coordinates: [
      { lat: 59.3299124, lng: 18.0673407 },
      { lat: 59.3298469, lng: 18.0673881 },
      { lat: 59.3294230, lng: 18.0678372 },
    ],
    nodeIds: ["180927", "10304683670", "5712033"],
    widthMeters: null,
    lanes: 1,
  },
  {
    id: "120287587",
    osmWayId: "120287587",
    name: "Norrbro",
    highway: "tertiary",
    oneway: "both",
    coordinates: [
      { lat: 59.3286063, lng: 18.0695850 },
      { lat: 59.3290277, lng: 18.0690743 },
    ],
    nodeIds: ["1349093293", "309619881"],
    widthMeters: null,
    lanes: 2,
  },
  {
    id: "1211507926",
    osmWayId: "1211507926",
    name: "Gustav Adolfs Torg",
    highway: "unclassified",
    oneway: "forward",
    coordinates: [
      { lat: 59.3291746, lng: 18.0683804 },
      { lat: 59.3292402, lng: 18.0683108 },
      { lat: 59.3292746, lng: 18.0682663 },
      { lat: 59.3293084, lng: 18.0682241 },
      { lat: 59.3293393, lng: 18.0682059 },
      { lat: 59.3293675, lng: 18.0681986 },
      { lat: 59.3294030, lng: 18.0682097 },
      { lat: 59.3294404, lng: 18.0682572 },
      { lat: 59.3294748, lng: 18.0683407 },
      { lat: 59.3295161, lng: 18.0684759 },
      { lat: 59.3295697, lng: 18.0686741 },
      { lat: 59.3295841, lng: 18.0687239 },
      { lat: 59.3296003, lng: 18.0687593 },
      { lat: 59.3296181, lng: 18.0687690 },
      { lat: 59.3296334, lng: 18.0687667 },
      { lat: 59.3296706, lng: 18.0687460 },
    ],
    nodeIds: ["1031027176", "13368166795", "13368166794", "11224344995", "13368166793", "11224344997", "11224344996", "11224344998", "11224344992", "11224344994", "11224344993", "13368166792", "13368166791", "13368166790", "13368166785", "180926"],
    widthMeters: null,
    lanes: 1,
  },
  {
    id: "1278724830",
    osmWayId: "1278724830",
    name: "Gustav Adolfs Torg",
    highway: "unclassified",
    oneway: "forward",
    coordinates: [
      { lat: 59.3298564, lng: 18.0693828 },
      { lat: 59.3298213, lng: 18.0692705 },
    ],
    nodeIds: ["11871164967", "11871164966"],
    widthMeters: null,
    lanes: null,
  },
  {
    id: "1278724831",
    osmWayId: "1278724831",
    name: "Gustav Adolfs Torg",
    highway: "unclassified",
    oneway: "forward",
    coordinates: [
      { lat: 59.3298213, lng: 18.0692705 },
      { lat: 59.3297071, lng: 18.0689188 },
      { lat: 59.3296879, lng: 18.0688504 },
      { lat: 59.3296783, lng: 18.0688036 },
      { lat: 59.3296706, lng: 18.0687460 },
    ],
    nodeIds: ["11871164966", "1031027201", "13368166786", "13368166787", "180926"],
    widthMeters: null,
    lanes: 1,
  },
  {
    id: "1278724834",
    osmWayId: "1278724834",
    name: "Jakobsgatan",
    highway: "tertiary",
    oneway: "forward",
    coordinates: [
      { lat: 59.3301263, lng: 18.0682216 },
      { lat: 59.3300390, lng: 18.0678269 },
    ],
    nodeIds: ["11871237171", "11871237170"],
    widthMeters: null,
    lanes: null,
  },
  {
    id: "1278724835",
    osmWayId: "1278724835",
    name: "Jakobsgatan",
    highway: "tertiary",
    oneway: "forward",
    coordinates: [
      { lat: 59.3301969, lng: 18.0685405 },
      { lat: 59.3301263, lng: 18.0682216 },
    ],
    nodeIds: ["180925", "11871237171"],
    widthMeters: null,
    lanes: null,
  },
  {
    id: "1278724836",
    osmWayId: "1278724836",
    name: "Regeringsgatan",
    highway: "tertiary",
    oneway: "both",
    coordinates: [
      { lat: 59.3304295, lng: 18.0684403 },
      { lat: 59.3304161, lng: 18.0684427 },
      { lat: 59.3303718, lng: 18.0684507 },
    ],
    nodeIds: ["11871237172", "5852932059", "11871237173"],
    widthMeters: null,
    lanes: 3,
  },
  {
    id: "1278724837",
    osmWayId: "1278724837",
    name: "Regeringsgatan",
    highway: "tertiary",
    oneway: "both",
    coordinates: [
      { lat: 59.3303718, lng: 18.0684507 },
      { lat: 59.3303241, lng: 18.0684593 },
      { lat: 59.3302991, lng: 18.0684753 },
      { lat: 59.3301969, lng: 18.0685405 },
    ],
    nodeIds: ["11871237173", "1487720674", "11883287254", "180925"],
    widthMeters: null,
    lanes: 3,
  },
  {
    id: "1278866356",
    osmWayId: "1278866356",
    name: "Gustav Adolfs Torg",
    highway: "unclassified",
    oneway: "forward",
    coordinates: [
      { lat: 59.3292208, lng: 18.0682282 },
      { lat: 59.3291746, lng: 18.0683804 },
    ],
    nodeIds: ["11872420251", "1031027176"],
    widthMeters: null,
    lanes: 1,
  },
  {
    id: "1278866357",
    osmWayId: "1278866357",
    name: "Gustav Adolfs Torg",
    highway: "unclassified",
    oneway: "forward",
    coordinates: [
      { lat: 59.3293464, lng: 18.0679811 },
      { lat: 59.3292208, lng: 18.0682282 },
    ],
    nodeIds: ["11872420252", "11872420251"],
    widthMeters: null,
    lanes: 1,
  },
  {
    id: "41568974",
    osmWayId: "41568974",
    name: "Gustav Adolfs Torg",
    highway: "unclassified",
    oneway: "both",
    coordinates: [
      { lat: 59.3291746, lng: 18.0683804 },
      { lat: 59.3291482, lng: 18.0684863 },
      { lat: 59.3291377, lng: 18.0685540 },
      { lat: 59.3291245, lng: 18.0687662 },
    ],
    nodeIds: ["1031027176", "8832601273", "10304683684", "6205990961"],
    widthMeters: null,
    lanes: 2,
  },
  {
    id: "41568985",
    osmWayId: "41568985",
    name: "Regeringsgatan",
    highway: "tertiary",
    oneway: "forward",
    coordinates: [
      { lat: 59.3296706, lng: 18.0687460 },
      { lat: 59.3297275, lng: 18.0687144 },
      { lat: 59.3297629, lng: 18.0686913 },
      { lat: 59.3301106, lng: 18.0686007 },
      { lat: 59.3301400, lng: 18.0685850 },
      { lat: 59.3301969, lng: 18.0685405 },
    ],
    nodeIds: ["180926", "1814125954", "13368166788", "507946854", "13368166789", "180925"],
    widthMeters: null,
    lanes: 1,
  },
  {
    id: "42272250",
    osmWayId: "42272250",
    name: "Jakobs Torg",
    highway: "unclassified",
    oneway: "forward",
    coordinates: [
      { lat: 59.3304286, lng: 18.0699437 },
      { lat: 59.3300778, lng: 18.0699207 },
      { lat: 59.3300082, lng: 18.0699112 },
    ],
    nodeIds: ["180924", "485955923", "180921"],
    widthMeters: null,
    lanes: null,
  },
  {
    id: "42272256",
    osmWayId: "42272256",
    name: "Gustav Adolfs Torg",
    highway: "unclassified",
    oneway: "forward",
    coordinates: [
      { lat: 59.3300082, lng: 18.0699112 },
      { lat: 59.3299826, lng: 18.0698442 },
      { lat: 59.3298945, lng: 18.0695073 },
      { lat: 59.3298564, lng: 18.0693828 },
    ],
    nodeIds: ["180921", "13368166800", "1262177560", "11871164967"],
    widthMeters: null,
    lanes: null,
  },
  {
    id: "42272259",
    osmWayId: "42272259",
    name: "Strömgatan",
    highway: "unclassified",
    oneway: "forward",
    coordinates: [
      { lat: 59.3288618, lng: 18.0682837 },
      { lat: 59.3288916, lng: 18.0683590 },
      { lat: 59.3290358, lng: 18.0686545 },
      { lat: 59.3290758, lng: 18.0687328 },
      { lat: 59.3291245, lng: 18.0687662 },
    ],
    nodeIds: ["527259469", "11841853883", "485888075", "10304683682", "6205990961"],
    widthMeters: null,
    lanes: null,
  },
  {
    id: "4695860",
    osmWayId: "4695860",
    name: "Jakobsgatan",
    highway: "tertiary",
    oneway: "forward",
    coordinates: [
      { lat: 59.3300390, lng: 18.0678269 },
      { lat: 59.3299740, lng: 18.0675332 },
      { lat: 59.3299124, lng: 18.0673407 },
    ],
    nodeIds: ["11871237170", "512538835", "180927"],
    widthMeters: null,
    lanes: null,
  },
  {
    id: "4700213",
    osmWayId: "4700213",
    name: "Strömgatan",
    highway: "tertiary",
    oneway: "both",
    coordinates: [
      { lat: 59.3292093, lng: 18.0691465 },
      { lat: 59.3292299, lng: 18.0692969 },
      { lat: 59.3294647, lng: 18.0716464 },
      { lat: 59.3294773, lng: 18.0717799 },
    ],
    nodeIds: ["10304683681", "9535853550", "160953", "527259459"],
    widthMeters: null,
    lanes: 2,
  },
  {
    id: "62290051",
    osmWayId: "62290051",
    name: "Norrbro",
    highway: "tertiary",
    oneway: "both",
    coordinates: [
      { lat: 59.3286063, lng: 18.0695850 },
      { lat: 59.3285197, lng: 18.0696860 },
      { lat: 59.3282847, lng: 18.0699593 },
      { lat: 59.3277336, lng: 18.0706033 },
    ],
    nodeIds: ["1349093293", "1349100949", "5140052621", "1349100940"],
    widthMeters: null,
    lanes: 2,
  },
  {
    id: "662947697",
    osmWayId: "662947697",
    name: "Strömgatan",
    highway: "tertiary",
    oneway: "both",
    coordinates: [
      { lat: 59.3291245, lng: 18.0687662 },
      { lat: 59.3291513, lng: 18.0689439 },
    ],
    nodeIds: ["6205990961", "6205990965"],
    widthMeters: null,
    lanes: 2,
  },
  {
    id: "954321064",
    osmWayId: "954321064",
    name: "Gustav Adolfs Torg",
    highway: "unclassified",
    oneway: "forward",
    coordinates: [
      { lat: 59.3294230, lng: 18.0678372 },
      { lat: 59.3293729, lng: 18.0679292 },
      { lat: 59.3293464, lng: 18.0679811 },
    ],
    nodeIds: ["5712033", "1814125936", "11872420252"],
    widthMeters: null,
    lanes: 1,
  },
];

const SAVED_SIGNS: RoadSign[] = [
  { id: "yield:507946854", kind: "give_way", position: { lat: 59.3301106, lng: 18.0686007 }, label: "VÄJ", facingDegrees: null },
  { id: "yield:6205990970", kind: "give_way", position: { lat: 59.3296123, lng: 18.0686686 }, label: "VÄJ", facingDegrees: null },
  { id: "yield:10304683682", kind: "give_way", position: { lat: 59.3290758, lng: 18.0687328 }, label: "VÄJ", facingDegrees: null },
];

export function savedStockholmRoads(center: { lat: number; lng: number }): RoadArea | null {
  if (distanceMeters(center, SAVED_CENTER) > SAVED_REACH_METERS) {
    return null;
  }
  return {
    center: SAVED_CENTER,
    radiusMeters: 220,
    roads: SAVED_ROADS,
    matched: SAVED_ROADS.length,
    truncated: false,
    omitted: [],
    signals: [],
    signs: SAVED_SIGNS,
    source: "saved-openstreetmap",
  };
}

/** A point on a saved way with a junction ahead, so a short drive can turn. */
export function savedCourseStart(roads: readonly RoadSegment[]): { edgeId: string; distanceMeters: number } | null {
  const network = buildRoadNetwork([...roads]);
  let best: { edgeId: string; distanceMeters: number; lengthMeters: number } | null = null;
  for (const edge of network.edges) {
    const onward = network.outgoing.get(edge.toNode) ?? [];
    if (onward.length < 2 || edge.lengthMeters < 28) {
      continue;
    }
    if (!best || edge.lengthMeters > best.lengthMeters) {
      best = {
        edgeId: edge.id,
        distanceMeters: Math.max(8, edge.lengthMeters - 26),
        lengthMeters: edge.lengthMeters,
      };
    }
  }
  return best ? { edgeId: best.edgeId, distanceMeters: best.distanceMeters } : null;
}
