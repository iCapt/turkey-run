// Turkey Runner — shared constants: lanes, stages, speeds, scoring.
// One job: the numbers every other module reads, so tuning lives in one place.
export const LANES = [-2.4, 0, 2.4];
export const LANE_COUNT = 3;
export const GRAVITY = -26;
export const JUMP_VELOCITY = 9.2;
export const ROLL_SECONDS = 0.55;
export const INVULN_SECONDS = 1.6;
export const BOARD_SECONDS = 8;
export const MAGNET_SECONDS = 8;
export const SLOWMO_SECONDS = 6;
export const SLOWMO_FACTOR = 0.55;
export const START_LIVES = 3;
export const ESCAPE_DISTANCE = 1500;
export const BASE_SPEED = 11;
export const MAX_SPEED = 24;
export const SPEED_PER_100M = 0.35;

// The farmer: our own name + our own shout lines (never the top band's).
export const FARMER_NAME = 'OTIS';
export const FARMER_SHOUTS = [
  'That bird is MINE!',
  "You can't outrun dinner!",
  'Back in the pen, bird!',
];
export const FARMER_SHOUT_RANGE = 7; // metres: shouts only when closer than this
export const FARMER_GAP_MIN = 0.7; // metres: right on the turkey's tail
export const FARMER_GAP_MAX = 16; // metres: far behind and small
export const FARMER_GAP_START = 14;
export const THREAT_RED_BELOW = 3.2; // metres: threat gauge reddens below this
export const LUNGE_RANGE = 3.5; // metres: lunge triggers inside this gap
export const LUNGE_TELEGRAPH_SECONDS = 0.45;
export const LUNGE_FALLBACK = 2.15; // metres the farmer loses when a lunge is dodged
export const CORNER_AFTER_SECONDS = 3.1; // seconds of CHASE before a CORNER cut
export const CORNER_SECONDS = 1.15;
export const SEARCH_SECONDS = 2.5; // seconds the farmer SEARCHes a decoy lane

// Dash (Shift): short burst that shoves the farmer back.
export const DASH_SECONDS = 0.38;
export const DASH_SPEED_MULT = 1.55;
export const DASH_COOLDOWN_SECONDS = 1.1;
export const DASH_STAMINA_COST = 0.42;
export const DASH_FARMER_PUSHBACK = 2.5; // metres
export const STAMINA_REGEN_PER_SECOND = 0.28;
export const NEAR_MISS_POINTS = 40;
export const LUNGE_DODGE_POINTS = 50;

// Decoy (Q): a feather lure that sends the farmer SEARCHing the wrong lane.
export const DECOY_START_STOCK = 2;
export const DECOY_MAX_STOCK = 2;

// Stages: farmyard -> barn -> kitchen. Each stage names its obstacle set,
// its ground/sky palette and how dense the track gets. `skyBands` is the
// 4-band vertical gradient painted behind the scene (top -> horizon), so the
// sky is never one flat fog colour; `floorCheck` makes the kitchen floor a
// cream/terracotta checkerboard instead of dirt.
export const STAGES = [
  {
    name: 'FARMYARD', sub: 'THE GREAT ESCAPE BEGINS',
    from: 0, sky: 0xf7b267, fog: 0xf2a65a, ground: 0x8a6b3a, track: 0x5d4126,
    skyBands: ['#2e4a7a', '#7a6a9a', '#e88a4a', '#f7c873'],
    floorCheck: false,
    obstacles: ['fence', 'hay', 'crate', 'scarecrow'],
    density: 0.62, speedBonus: 0, closeRate: 0.22,
  },
  {
    name: 'THE BARN', sub: 'DUCK THE CARTS, MIND THE BARRELS',
    from: 400, sky: 0xd98e4a, fog: 0xc47f3e, ground: 0x7a5a30, track: 0x4e3520,
    skyBands: ['#3a2a4a', '#8a4a52', '#c65a2e', '#e8a34a'],
    floorCheck: false,
    obstacles: ['cart', 'barrel', 'beam', 'hay'],
    density: 0.78, speedBonus: 1.5, closeRate: 0.3,
  },
  {
    name: 'THE KITCHEN', sub: 'OVENS GLOWING — THE KNIFE IS OUT',
    from: 900, sky: 0xc96f2e, fog: 0xf2ddb8, ground: 0xf2e3c2, track: 0xc65a3a,
    skyBands: ['#f7ead0', '#f2d8a8', '#eec27a', '#e8b878'],
    floorCheck: true,
    obstacles: ['oven', 'knife', 'pot', 'pin', 'cart'],
    density: 0.95, speedBonus: 3, closeRate: 0.38,
  },
];
export const SPAWN_AHEAD = 78;
export const DESPAWN_BEHIND = -12;
export const HIT_Z = 1.0;
export const COLLECT_Z = 1.1;

// Mission templates: three rotate at a time; finishing all three raises the multiplier.
export const MISSION_POOL = [
  { kind: 'corn', text: 'Collect corn', targets: [30, 50, 80] },
  { kind: 'distance', text: 'Run far', targets: [300, 500, 800] },
  { kind: 'dodge', text: 'Dodge obstacles', targets: [8, 12, 20] },
  { kind: 'coins', text: 'Grab coin lines', targets: [4, 6, 10] },
  { kind: 'jump', text: 'Jump obstacles', targets: [5, 8, 12] },
];
export const MULTIPLIERS = [1, 2, 3, 5];

// Small seeded RNG (mulberry32) so screenshot scenes replay exactly.
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function random() {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function pick(random, array) {
  return array[Math.floor(random() * array.length)];
}
export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}
