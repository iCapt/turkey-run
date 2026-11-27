// farmer.js — Farmer Otis: procedural model plus the four-state chase AI.
// One job: how the farmer looks and how he hunts. The game feeds him the turkey's
// lane and the difficulty; he reports his gap and his state, nothing else.

import * as THREE from 'three';
import { LANES, TUNING, FARMER_SHOUTS, clamp, lerp, pick } from './config.js';

const SHIRT = 0xc0392b;
const OVERALLS = 0x3a4a6b;
const SKIN = 0xe8b88a;
const STRAW = 0xd9b64a;
const BOOT = 0x4a2e1a;

function box(w, h, d, color, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(
    new THREE.BoxGeometry(w, h, d),
    new THREE.MeshStandardMaterial({ color, roughness: 0.9 }),
  );
  m.position.set(x, y, z);
  m.castShadow = true;
  return m;
}

function ball(r, color, x = 0, y = 0, z = 0, sx = 1, sy = 1, sz = 1) {
  const m = new THREE.Mesh(
    new THREE.SphereGeometry(r, 18, 14),
    new THREE.MeshStandardMaterial({ color, roughness: 0.85 }),
  );
  m.position.set(x, y, z);
  m.scale.set(sx, sy, sz);
  m.castShadow = true;
  return m;
}

export const FARMER_STATES = ['CHASE', 'SEARCH', 'CORNER', 'LUNGE'];

export class Farmer {
  constructor(scene, rng) {
    this.rng = rng;
    this.group = new THREE.Group();
    scene.add(this.group);

    // Legs in dark overalls, boots planted for a run.
    this.legL = box(0.22, 0.85, 0.26, OVERALLS, -0.2, 0.45, 0);
    this.legR = box(0.22, 0.85, 0.26, OVERALLS, 0.2, 0.45, 0);
    this.group.add(this.legL, this.legR);
    this.group.add(box(0.24, 0.14, 0.42, BOOT, -0.2, 0.07, 0.06));
    this.group.add(box(0.24, 0.14, 0.42, BOOT, 0.2, 0.07, 0.06));

    // Torso: red shirt, broad shoulders, arms pumping.
    this.torso = box(0.85, 0.8, 0.5, SHIRT, 0, 1.25, 0);
    this.group.add(this.torso);
    this.armL = box(0.2, 0.7, 0.22, SHIRT, -0.55, 1.25, 0);
    this.armR = box(0.2, 0.7, 0.22, SHIRT, 0.55, 1.25, 0);
    this.group.add(this.armL, this.armR);

    // Head: skin, eyes, a nose, a moustache — a face, not a blank ball.
    this.head = new THREE.Group();
    this.head.position.set(0, 1.95, 0);
    this.group.add(this.head);
    this.head.add(ball(0.3, SKIN, 0, 0, 0));
    this.head.add(ball(0.05, 0x1a1a1a, -0.11, 0.05, 0.26));
    this.head.add(ball(0.05, 0x1a1a1a, 0.11, 0.05, 0.26));
    this.head.add(ball(0.06, 0xc98a5a, 0, -0.03, 0.29, 1, 1.2, 1));
    this.head.add(box(0.24, 0.06, 0.05, 0x5a3a1a, 0, -0.14, 0.28));

    // Straw hat: a brim disc and a dented crown.
    const brim = new THREE.Mesh(
      new THREE.CylinderGeometry(0.48, 0.48, 0.05, 20),
      new THREE.MeshStandardMaterial({ color: STRAW, roughness: 0.95 }),
    );
    brim.position.y = 0.22;
    brim.castShadow = true;
    this.head.add(brim);
    const crown = new THREE.Mesh(
      new THREE.ConeGeometry(0.3, 0.34, 16),
      new THREE.MeshStandardMaterial({ color: STRAW, roughness: 0.95 }),
    );
    crown.position.y = 0.4;
    crown.castShadow = true;
    this.head.add(crown);

    // Pitchfork in his right hand: the tool of the trade.
    this.fork = new THREE.Group();
    this.fork.position.set(0.55, 1.25, 0.1);
    this.group.add(this.fork);
    const shaft = new THREE.Mesh(
      new THREE.CylinderGeometry(0.035, 0.035, 1.7, 8),
      new THREE.MeshStandardMaterial({ color: 0x8a6a3a, roughness: 0.9 }),
    );
    shaft.castShadow = true;
    this.fork.add(shaft);
    for (let i = -1; i <= 1; i++) {
      const prong = box(0.05, 0.34, 0.05, 0x9aa0a6, i * 0.11, 0.98, 0);
      this.fork.add(prong);
    }
    this.fork.rotation.z = -0.25;

    // AI state.
    this.state = 'CHASE';
    this.stateT = 0;
    this.gap = 6; // metres behind the turkey
    this.x = 0;
    this.lane = 1;
    this.chaseT = 0;
    this.shout = '';
    this.shoutT = 0;
    this.lungeT = 0;
    this.lungeLane = 1;
    this.lungeHit = false;
    this.runPhase = 0;
    this.searchDir = 1;
    this.group.position.set(0, 0, 6);
  }

  reset() {
    this.state = 'CHASE';
    this.stateT = 0;
    this.gap = 6;
    this.x = 0;
    this.lane = 1;
    this.chaseT = 0;
    this.shout = '';
    this.shoutT = 0;
    this.lungeT = 0;
    this.lungeHit = false;
    this.runPhase = 0;
    this.group.position.set(0, 0, 6);
    this.group.rotation.set(0, 0, 0);
  }

  toState(next, events) {
    if (this.state === next) return;
    this.state = next;
    this.stateT = 0;
    if (events) events.push({ type: 'farmer', state: next });
  }

  forceSearch(events) {
    this.toState('SEARCH', events);
    this.stateT = 0;
  }

  update(dt, turkey, difficulty, events) {
    this.stateT += dt;
    const turkeyX = LANES[turkey.lane];

    if (this.state === 'CHASE') {
      this.chaseT += dt;
      // He shadows the turkey's lane and closes the gap as the stages get harder.
      this.x = lerp(this.x, turkeyX, Math.min(1, dt * 2.2));
      this.gap -= difficulty.farmerRate * dt * (turkey.dashing ? 0.4 : 1);
      if (this.gap < TUNING.farmerMinGap) this.gap = TUNING.farmerMinGap;
      // Corner: after a long chase he cuts across to trap the bird.
      if (this.chaseT > TUNING.cornerAfter && difficulty.stageIndex >= 1) {
        this.chaseT = 0;
        this.toState('CORNER', events);
        if (events) events.push({ type: 'banner', key: 'corner' });
      } else if (this.gap < TUNING.lungeRange && Math.abs(this.x - turkeyX) < 1.1) {
        this.toState('LUNGE', events);
        this.lungeT = TUNING.lungeTelegraph;
        this.lungeLane = turkey.lane;
        this.lungeHit = false;
      }
    } else if (this.state === 'SEARCH') {
      // He lost the bird: sweeps lane to lane, head turning, then gives up and chases.
      this.searchDir = this.stateT % 1.6 < 0.8 ? 1 : -1;
      this.x = lerp(this.x, clamp(this.x + this.searchDir * dt * 1.6, LANES[0], LANES[2]), 0.5);
      this.gap += dt * 0.8;
      if (this.gap > TUNING.farmerMaxGap) this.gap = TUNING.farmerMaxGap;
      if (this.stateT > TUNING.searchDuration) {
        this.toState('CHASE', events);
        if (events) events.push({ type: 'banner', key: 'spotted' });
      }
    } else if (this.state === 'CORNER') {
      // He steps to the trapping lane and holds it, cutting the escape off.
      const trapLane = turkey.lane === 1 ? 0 : 1;
      this.x = lerp(this.x, LANES[trapLane], Math.min(1, dt * 4));
      if (this.stateT > TUNING.cornerDuration) this.toState('CHASE', events);
    } else if (this.state === 'LUNGE') {
      // Telegraph, then a thrust at the turkey's lane. A dodge pushes him back.
      if (this.lungeT > 0) {
        this.lungeT -= dt;
        this.group.rotation.x = -0.18;
        if (this.lungeT <= 0) {
          const dodged = turkey.lane !== this.lungeLane || turkey.airborne || turkey.rolling;
          if (dodged) {
            this.gap = Math.min(TUNING.farmerMaxGap, this.gap + TUNING.lungeDodgeReward);
            if (events) events.push({ type: 'lungeDodged' });
          } else if (!this.lungeHit) {
            this.lungeHit = true;
            if (events) events.push({ type: 'hit', cause: 'lunge' });
          }
          this.toState('CHASE', events);
          this.group.rotation.x = 0;
        }
      }
    }

    // Shouts: he only yells when he is close enough to be heard.
    if (this.shoutT > 0) this.shoutT -= dt;
    if (this.gap < 7 && this.shoutT <= 0 && this.state !== 'SEARCH') {
      this.shout = pick(this.rng, FARMER_SHOUTS);
      this.shoutT = 2.4;
    } else if (this.gap >= 7) {
      this.shout = '';
    }

    // Run cycle: legs and arms pump, hat stays put, fork bobs.
    this.runPhase += dt * (this.state === 'LUNGE' ? 8 : 13);
    const p = this.runPhase;
    this.legL.rotation.x = Math.sin(p) * 0.8;
    this.legR.rotation.x = -Math.sin(p) * 0.8;
    this.armL.rotation.x = -Math.sin(p) * 0.7;
    this.armR.rotation.x = Math.sin(p) * 0.7;
    if (this.state === 'LUNGE') {
      // Telegraph: the pitchfork goes up before the thrust, so the dodge reads.
      this.fork.rotation.x = -0.9;
    } else {
      this.fork.rotation.x = Math.sin(p * 0.5) * 0.08;
    }
    if (this.state === 'SEARCH') {
      this.head.rotation.y = Math.sin(this.stateT * 3) * 0.9;
    } else {
      this.head.rotation.y = lerp(this.head.rotation.y, 0, Math.min(1, dt * 5));
    }

    this.group.position.set(this.x, 0, this.gap);
  }
}
