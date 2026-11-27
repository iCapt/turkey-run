// Turkey Run 3D — shared constants: lanes, stages, speeds, scoring.
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
export const SPAWN_AHEAD = 78;
export const DESPAWN_BEHIND = -12;
export const HIT_Z = 1.0;
export const COLLECT_Z = 1.1;

// Stages: farmyard -> barn -> kitchen. Each stage names its obstacle set,
// its ground/sky palette and how dense the track gets.
export const STAGES = [
  {
    name: 'FARMYARD', sub: 'THE GREAT ESCAPE BEGINS',
    from: 0, sky: 0xf7b267, fog: 0xf2a65a, ground: 0x8a6b3a, track: 0x5d4126,
    obstacles: ['fence', 'hay', 'crate', 'scarecrow'],
    density: 0.62, speedBonus: 0,
  },
  {
    name: 'THE BARN', sub: 'DUCK THE CARTS, MIND THE BARRELS',
    from: 400, sky: 0xd98e4a, fog: 0xc47f3e, ground: 0x7a5a30, track: 0x4e3520,
    obstacles: ['cart', 'barrel', 'beam', 'hay'],
    density: 0.78, speedBonus: 1.5,
  },
  {
    name: 'THE KITCHEN', sub: 'OVENS GLOWING — THE KNIFE IS OUT',
    from: 900, sky: 0xc96f2e, fog: 0xb85c22, ground: 0x9a7a52, track: 0x6b4a2a,
    obstacles: ['oven', 'knife', 'pot', 'pin', 'cart'],
    density: 0.95, speedBonus: 3,
  },
];

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
