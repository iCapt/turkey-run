// turkey.js — the turkey: procedural model, lane running, jump, roll, dash, decoy.
// One job: how the bird looks and how it moves. It knows nothing about the farmer
// or the track; the game tells it where the lanes are and when it is hit.

import * as THREE from 'three';
import { LANES, TUNING, clamp, lerp } from './config.js';

const BROWN = 0x8a5a2b;
const BROWN_DARK = 0x6b4423;
const BROWN_LIGHT = 0xc98a4a;
const BEAK = 0xe07b1f;
const WATTLE = 0xc0392b;
const SKIN = 0xd98a5a;

function box(w, h, d, color, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(
    new THREE.BoxGeometry(w, h, d),
    new THREE.MeshStandardMaterial({ color, roughness: 0.85 }),
  );
  m.position.set(x, y, z);
  m.castShadow = true;
  return m;
}

function ball(r, color, x = 0, y = 0, z = 0, sx = 1, sy = 1, sz = 1) {
  const m = new THREE.Mesh(
    new THREE.SphereGeometry(r, 18, 14),
    new THREE.MeshStandardMaterial({ color, roughness: 0.8 }),
  );
  m.position.set(x, y, z);
  m.scale.set(sx, sy, sz);
  m.castShadow = true;
  return m;
}

export class Turkey {
  constructor(scene) {
    this.group = new THREE.Group();
    this.group.position.set(0, 0, 0);
    scene.add(this.group);

    // Body: a plump ellipsoid, chest forward.
    this.body = ball(0.55, BROWN, 0, 0.78, 0, 1, 0.88, 1.25);
    this.group.add(this.body);
    this.chest = ball(0.38, BROWN_LIGHT, 0, 0.72, 0.42, 1, 0.9, 0.9);
    this.group.add(this.chest);

    // Head on a short neck, beak pointing forward, wattle under it.
    this.head = ball(0.26, SKIN, 0, 1.42, 0.42);
    this.group.add(this.head);
    const beak = new THREE.Mesh(
      new THREE.ConeGeometry(0.09, 0.34, 10),
      new THREE.MeshStandardMaterial({ color: BEAK, roughness: 0.6 }),
    );
    beak.rotation.x = Math.PI / 2;
    beak.position.set(0, 1.4, 0.78);
    beak.castShadow = true;
    this.group.add(beak);
    this.group.add(ball(0.07, WATTLE, 0, 1.26, 0.62, 1, 1.4, 1));
    this.group.add(ball(0.045, 0x1a1a1a, -0.1, 1.48, 0.62));
    this.group.add(ball(0.045, 0x1a1a1a, 0.1, 1.48, 0.62));

    // Tail fan: five feathers spread behind, the silhouette that reads at a glance.
    this.tail = new THREE.Group();
    this.tail.position.set(0, 0.95, -0.55);
    this.group.add(this.tail);
    const featherColors = [BROWN_DARK, BROWN, 0xa06a2e, BROWN, BROWN_DARK];
    for (let i = 0; i < 5; i++) {
      const f = box(0.22, 0.95, 0.05, featherColors[i], 0, 0.35, 0);
      f.position.x = (i - 2) * 0.24;
      f.rotation.z = (i - 2) * -0.28;
      f.rotation.x = -0.35;
      this.tail.add(f);
      const tip = box(0.2, 0.22, 0.055, BROWN_LIGHT, 0, 0.78, 0);
      tip.position.x = (i - 2) * 0.24;
      tip.rotation.z = (i - 2) * -0.28;
      tip.rotation.x = -0.35;
      this.tail.add(tip);
    }

    // Wings: flat slabs that flap as it runs.
    this.wingL = box(0.12, 0.55, 0.7, BROWN_DARK, -0.58, 0.85, 0);
    this.wingR = box(0.12, 0.55, 0.7, BROWN_DARK, 0.58, 0.85, 0);
    this.wingL.geometry.translate(0, 0, 0);
    this.group.add(this.wingL, this.wingR);

    // Legs: thin orange stilts, mid-stride when running.
    this.legL = new THREE.Mesh(
      new THREE.CylinderGeometry(0.045, 0.045, 0.5, 8),
      new THREE.MeshStandardMaterial({ color: BEAK, roughness: 0.7 }),
    );
    this.legL.position.set(-0.18, 0.25, 0);
    this.legR = this.legL.clone();
    this.legR.position.x = 0.18;
    this.group.add(this.legL, this.legR);

    // State.
    this.lane = 1; // 0 left, 1 centre, 2 right
    this.x = LANES[1];
    this.y = 0;
    this.vy = 0;
    this.airborne = false;
    this.rolling = false;
    this.rollT = 0;
    this.dashing = false;
    this.dashT = 0;
    this.dashCooldown = 0;
    this.stamina = TUNING.staminaMax;
    this.decoys = TUNING.decoyStock;
    this.runPhase = 0;
    this.lookBack = 0; // 0..1, head turned toward the farmer when he is close
    this.decoyFlash = 0;
  }

  get z() {
    return this.group.position.z;
  }

  moveLeft() {
    if (this.lane > 0) this.lane -= 1;
  }

  moveRight() {
    if (this.lane < LANES.length - 1) this.lane += 1;
  }

  jump() {
    if (this.airborne || this.rolling) return false;
    this.airborne = true;
    this.vy = TUNING.jumpVelocity;
    return true;
  }

  roll() {
    if (this.airborne || this.rolling) return false;
    this.rolling = true;
    this.rollT = TUNING.rollDuration;
    return true;
  }

  dash() {
    if (this.dashing || this.dashCooldown > 0) return false;
    if (this.stamina < TUNING.dashStaminaCost) return false;
    this.stamina -= TUNING.dashStaminaCost;
    this.dashing = true;
    this.dashT = TUNING.dashDuration;
    this.dashCooldown = TUNING.dashCooldown;
    return true;
  }

  useDecoy() {
    if (this.decoys <= 0) return false;
    this.decoys -= 1;
    this.decoyFlash = 0.5;
    return true;
  }

  reset() {
    this.lane = 1;
    this.x = LANES[1];
    this.y = 0;
    this.vy = 0;
    this.airborne = false;
    this.rolling = false;
    this.dashing = false;
    this.dashT = 0;
    this.dashCooldown = 0;
    this.stamina = TUNING.staminaMax;
    this.decoys = TUNING.decoyStock;
    this.runPhase = 0;
    this.lookBack = 0;
    this.group.rotation.set(0, 0, 0);
    this.group.position.set(0, 0, 0);
    this.group.scale.set(1, 1, 1);
  }

  update(dt, speed, farmerGap) {
    // Lane glide: the bird eases toward its lane, never snaps.
    const targetX = LANES[this.lane];
    this.x = lerp(this.x, targetX, Math.min(1, dt * 11));
    this.group.position.x = this.x;

    // Jump physics.
    if (this.airborne) {
      this.vy += TUNING.gravity * dt;
      this.y += this.vy * dt;
      if (this.y <= 0) {
        this.y = 0;
        this.vy = 0;
        this.airborne = false;
      }
    }
    this.group.position.y = this.y;

    // Roll: squash and tuck for a beat.
    if (this.rolling) {
      this.rollT -= dt;
      const k = 1 - this.rollT / TUNING.rollDuration;
      this.group.scale.set(1.15, 0.55, 1.25);
      this.group.rotation.x = -0.5 * Math.sin(k * Math.PI);
      if (this.rollT <= 0) {
        this.rolling = false;
        this.group.scale.set(1, 1, 1);
        this.group.rotation.x = 0;
      }
    }

    // Dash: lean forward, stretch out, cool down afterwards.
    if (this.dashing) {
      this.dashT -= dt;
      this.group.rotation.x = -0.28;
      if (this.dashT <= 0) {
        this.dashing = false;
        this.group.rotation.x = 0;
      }
    }
    if (this.dashCooldown > 0) this.dashCooldown -= dt;
    this.stamina = clamp(this.stamina + TUNING.staminaRegen * dt, 0, TUNING.staminaMax);
    if (this.decoyFlash > 0) this.decoyFlash -= dt;

    // Run cycle: bob, legs, wings, tail sway. Faster when dashing.
    this.runPhase += dt * (this.dashing ? 26 : 15);
    const p = this.runPhase;
    const bob = this.airborne ? 0 : Math.abs(Math.sin(p)) * 0.07;
    this.body.position.y = 0.78 + bob;
    this.legL.rotation.x = Math.sin(p) * 0.9;
    this.legR.rotation.x = -Math.sin(p) * 0.9;
    if (this.rolling) {
      // Tucked for the roll: wings folded flat against the body.
      this.wingL.rotation.z = 0.05;
      this.wingR.rotation.z = -0.05;
    } else {
      this.wingL.rotation.z = 0.25 + Math.sin(p) * 0.35;
      this.wingR.rotation.z = -0.25 - Math.sin(p) * 0.35;
    }
    this.tail.rotation.y = Math.sin(p * 0.5) * 0.08;

    // Look back: the head turns toward the farmer as he closes in.
    const targetLook = clamp(1 - farmerGap / 7, 0, 1);
    this.lookBack = lerp(this.lookBack, targetLook, Math.min(1, dt * 4));
    this.head.rotation.y = this.lookBack * 0.9;
  }
}
