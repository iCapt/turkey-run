// config.js — every tuning number, palette and name in one place.
// No other module hard-codes a balance number: change it here, it changes everywhere.

export const ESCAPE_DISTANCE = 1500;
export const LANES = [-2.2, 0, 2.2];
export const LANE_WIDTH = 2.2;

export const STAGES = [
  {
    name: 'FARMYARD',
    from: 0,
    to: 500,
    sky: ['#232a5e', '#6d4a86', '#d96f33', '#f6c569'],
    fog: 0xe8a35c,
    fogNear: 18,
    fogFar: 64,
    ground: 0xb98a4a,
    groundSide: 0x7d9b4a,
    accent: 0xc0392b,
    speed: 11,
    farmerRate: 0.32,
    hazardGap: 2.25,
  },
  {
    name: 'BARN',
    from: 500,
    to: 1000,
    sky: ['#1d1430', '#54264a', '#9c3a2a', '#dd8448'],
    fog: 0xc97a52,
    fogNear: 16,
    fogFar: 58,
    ground: 0x8a5a34,
    groundSide: 0x5f7038,
    accent: 0x7a1f1f,
    speed: 12.4,
    farmerRate: 0.42,
    hazardGap: 1.55,
  },
  {
    name: 'KITCHEN',
    from: 1000,
    to: 1500,
    sky: ['#f2e3c8', '#f2e3c8', '#eed9ae', '#e8c98f'],
    fog: 0xf2e3c8,
    fogNear: 14,
    fogFar: 52,
    ground: 0xb3402e,
    groundSide: 0xf2e3c8,
    accent: 0xb3402e,
    speed: 13.6,
    farmerRate: 0.52,
    hazardGap: 0.94,
  },
];

export function stageAt(distance) {
  for (const s of STAGES) if (distance < s.to) return s;
  return STAGES[STAGES.length - 1];
}

export function stageIndexAt(distance) {
  for (let i = 0; i < STAGES.length; i++) if (distance < STAGES[i].to) return i;
  return STAGES.length - 1;
}

// The farmer. His name, his shouts and his moment lines are ours alone.
export const FARMER_NAME = 'OTIS';
export const FARMER_SHOUTS = [
  'That bird is MINE!',
  "You can't outrun dinner!",
  'Back in the pen, bird!',
];
export const FARMER_SHOUT_CLOSE = 'That bird is MINE!';

export const BANNERS = {
  nearMiss: (n) => `THAT WAS CLOSE! +${n}`,
  lungeDodge: (n) => `SLIPPED THE GRAB! +${n}`,
  decoy: 'WRONG BIRD!',
  hidden: 'OUT OF SIGHT!',
  corner: 'CUT OFF!',
  dash: 'FEATHER DASH!',
  hit: 'CLIPPED!',
  mission: (n) => `MISSION DONE! +${n}`,
  stage: (name) => `${name}!`,
  spotted: 'SPOTTED!',
};

export const TUNING = {
  lives: 3,
  runSpeed: 11,
  speedPerStage: 1.3,
  dashDuration: 0.38,
  dashSpeedMult: 1.55,
  dashCooldown: 1.1,
  dashStaminaCost: 0.42,
  staminaMax: 1,
  staminaRegen: 0.28,
  jumpVelocity: 8.4,
  gravity: -22,
  rollDuration: 0.55,
  invulnAfterHit: 1.2,
  hitFarmerGain: 1.5,
  farmerMinGap: 0.7,
  farmerMaxGap: 16,
  lungeRange: 3.5,
  lungeTelegraph: 0.45,
  lungeDodgeReward: 2.15,
  cornerAfter: 3.1,
  cornerDuration: 1.15,
  searchDuration: 1.2,
  nearMissPoints: 40,
  cornPoints: 50,
  distancePointsPerMetre: 2,
  missionBonus: 250,
  streakForMult: 5,
  maxMultiplier: 5,
  comboTimeout: 4.6,
  ovenCycle: 3.2,
  knifeCycle: 2.6,
  decoyStock: 2,
  bestFallback: 12480,
};

// Deterministic random: same seed, same run. The live game seeds from the clock.
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function pick(rng, arr) {
  return arr[Math.floor(rng() * arr.length)];
}

export function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

// Staged cover shot (shots.js): the farmer sits this far behind the turkey at
// freeze — close enough to read as a threat, far enough to stay out of the lens.
export const COVER_FARMER_GAP = 3.0;
