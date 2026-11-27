// obstacles.js — everything the turkey must not touch: hay, fences, crates, bars,
// plus the kitchen's cyclic hazards, the oven and the carving knife.
// One job: spawn hazards, scroll them, telegraph their danger and test collisions.

import * as THREE from 'three';
import { LANES, TUNING, stageIndexAt, clamp } from './config.js';

function box(w, h, d, color, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(
    new THREE.BoxGeometry(w, h, d),
    new THREE.MeshStandardMaterial({ color, roughness: 0.85 }),
  );
  m.position.set(x, y, z);
  m.castShadow = true;
  return m;
}

const OVEN_LABEL = '220 C';

export class Obstacles {
  constructor(scene, rng) {
    this.scene = scene;
    this.rng = rng;
    this.group = new THREE.Group();
    scene.add(this.group);
    this.items = [];
    this.spawnT = 0;
    this.nextGap = 2;
    this.speed = 11;
    this.distance = 0;
  }

  reset() {
    for (const it of this.items) this.group.remove(it.mesh);
    this.items = [];
    this.spawnT = 0;
    this.nextGap = 1.2;
  }

  makeHay() {
    const g = new THREE.Group();
    const bale = new THREE.Mesh(
      new THREE.CylinderGeometry(0.85, 0.85, 1.4, 14),
      new THREE.MeshStandardMaterial({ color: 0xd9a83a, roughness: 1 }),
    );
    bale.rotation.z = Math.PI / 2;
    bale.position.y = 0.85;
    bale.castShadow = true;
    g.add(bale);
    return { mesh: g, kind: 'hay', height: 1.7, clear: 'jump' };
  }

  makeFence() {
    const g = new THREE.Group();
    g.add(box(0.14, 1.1, 0.14, 0x6b4a2a, -0.9, 0.55, 0));
    g.add(box(0.14, 1.1, 0.14, 0x6b4a2a, 0.9, 0.55, 0));
    g.add(box(2, 0.12, 0.1, 0x8a6a3a, 0, 1.0, 0));
    g.add(box(2, 0.12, 0.1, 0x8a6a3a, 0, 0.6, 0));
    return { mesh: g, kind: 'fence', height: 1.1, clear: 'jump' };
  }

  makeCrate() {
    const g = new THREE.Group();
    g.add(box(1.7, 1.7, 1.7, 0x9a6a35, 0, 0.85, 0));
    g.add(box(1.78, 0.12, 1.78, 0x6b4a2a, 0, 1.7, 0));
    g.add(box(1.78, 0.12, 1.78, 0x6b4a2a, 0, 0.1, 0));
    return { mesh: g, kind: 'crate', height: 1.7, clear: 'lane' };
  }

  makeBar() {
    const g = new THREE.Group();
    g.add(box(0.14, 2.2, 0.14, 0x5a3a1a, -1.05, 1.1, 0));
    g.add(box(0.14, 2.2, 0.14, 0x5a3a1a, 1.05, 1.1, 0));
    g.add(box(2.2, 0.5, 0.3, 0x8a2a1e, 0, 1.9, 0));
    return { mesh: g, kind: 'bar', height: 2.2, clear: 'roll' };
  }

  makeOven() {
    const g = new THREE.Group();
    // Dark oven body with a door that glows as the cycle heats up.
    const body = box(1.9, 2.2, 1.2, 0x2a2a2e, 0, 1.1, 0);
    g.add(body);
    const doorMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.4, metalness: 0.5 });
    const door = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.2, 0.1), doorMat);
    door.position.set(0, 1.0, 0.62);
    g.add(door);
    const glowMat = new THREE.MeshBasicMaterial({ color: 0xff6a00, transparent: true, opacity: 0 });
    const glow = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 0.9), glowMat);
    glow.position.set(0, 0.85, 0.68);
    g.add(glow);
    // Temperature label, drawn on a small canvas so it reads in the shot.
    const labelCanvas = document.createElement('canvas');
    labelCanvas.width = 256;
    labelCanvas.height = 96;
    const lg = labelCanvas.getContext('2d');
    lg.fillStyle = '#f2e3c8';
    lg.fillRect(0, 0, 256, 96);
    lg.fillStyle = '#1a1a1a';
    lg.font = 'bold 56px Arial, sans-serif';
    lg.textAlign = 'center';
    lg.textBaseline = 'middle';
    lg.fillText(OVEN_LABEL, 128, 50);
    const labelTex = new THREE.CanvasTexture(labelCanvas);
    const label = new THREE.Mesh(
      new THREE.PlaneGeometry(1.1, 0.42),
      new THREE.MeshBasicMaterial({ map: labelTex }),
    );
    label.position.set(0, 1.95, 0.66);
    g.add(label);
    const fire = new THREE.PointLight(0xff6a00, 0, 12, 1.6);
    fire.position.set(0, 1.2, 1.6);
    g.add(fire);
    return { mesh: g, kind: 'oven', height: 2.2, clear: 'lane', doorMat, glowMat, fire, phase: 0 };
  }

  makeKnife() {
    const g = new THREE.Group();
    // A carving knife on a pivot: it hangs, warns, then slams down.
    const pivot = new THREE.Group();
    pivot.position.set(0, 3.1, 0);
    g.add(pivot);
    const blade = box(0.28, 2.4, 0.06, 0xc8ccd2, 0, -1.1, 0);
    blade.material = new THREE.MeshStandardMaterial({ color: 0xc8ccd2, roughness: 0.25, metalness: 0.85 });
    pivot.add(blade);
    const edge = box(0.3, 0.2, 0.07, 0x8a2a1e, 0, -2.2, 0);
    pivot.add(edge);
    const handle = box(0.16, 0.7, 0.12, 0x3a1a10, 0, 0.35, 0);
    pivot.add(handle);
    // The red warning strip on the floor, pulsing before the slam.
    const stripMat = new THREE.MeshBasicMaterial({ color: 0xe02020, transparent: true, opacity: 0 });
    const strip = new THREE.Mesh(new THREE.PlaneGeometry(2.0, 1.2), stripMat);
    strip.rotation.x = -Math.PI / 2;
    strip.position.set(0, 0.03, 0);
    g.add(strip);
    return { mesh: g, kind: 'knife', height: 3.1, clear: 'time', pivot, stripMat, phase: 0, down: false };
  }

  spawn(kind, lane, z) {
    const makers = {
      hay: () => this.makeHay(),
      fence: () => this.makeFence(),
      crate: () => this.makeCrate(),
      bar: () => this.makeBar(),
      oven: () => this.makeOven(),
      knife: () => this.makeKnife(),
    };
    const it = makers[kind]();
    it.lane = lane;
    it.z = z;
    it.mesh.position.set(LANES[lane], 0, z);
    it.passed = false;
    it.counted = false;
    this.group.add(it.mesh);
    this.items.push(it);
    return it;
  }

  spawnForStage(distance) {
    const stage = stageIndexAt(distance);
    const roll = this.rng();
    const lane = Math.floor(this.rng() * 3);
    if (stage === 2) {
      if (roll < 0.3) this.spawn('oven', lane, -70);
      else if (roll < 0.55) this.spawn('knife', lane, -70);
      else if (roll < 0.75) this.spawn('crate', lane, -70);
      else if (roll < 0.9) this.spawn('bar', lane, -70);
      else this.spawn('hay', lane, -70);
    } else if (stage === 1) {
      if (roll < 0.35) this.spawn('hay', lane, -70);
      else if (roll < 0.6) this.spawn('fence', lane, -70);
      else if (roll < 0.85) this.spawn('crate', lane, -70);
      else this.spawn('bar', lane, -70);
    } else {
      if (roll < 0.4) this.spawn('hay', lane, -70);
      else if (roll < 0.7) this.spawn('fence', lane, -70);
      else this.spawn('crate', lane, -70);
    }
  }

  // Put the nearest oven and knife where the camera can see them, mid-cycle hot.
  primeShotHazards() {
    const report = { oven: false, knife: false };
    const ovens = this.items.filter((i) => i.kind === 'oven');
    const knives = this.items.filter((i) => i.kind === 'knife');
    if (ovens.length === 0) this.spawn('oven', 1, -9);
    if (knives.length === 0) this.spawn('knife', 2, -7);
    for (const o of this.items.filter((i) => i.kind === 'oven')) {
      o.lane = 1;
      o.z = -9;
      o.mesh.position.set(LANES[1], 0, -9);
      o.phase = TUNING.ovenCycle * 0.72; // hot phase: door glowing, fire lit
      report.oven = true;
    }
    for (const k of this.items.filter((i) => i.kind === 'knife')) {
      k.lane = 2;
      k.z = -7;
      k.mesh.position.set(LANES[2], 0, -7);
      k.phase = TUNING.knifeCycle * 0.8; // mid-slam: blade down, strip lit
      report.knife = true;
    }
    return report;
  }

  update(dt, speed, distance, events, turkey) {
    this.speed = speed;
    this.distance = distance;
    this.spawnT += dt;
    const stage = stageIndexAt(distance);
    const gap = stage === 0 ? 2.25 : stage === 1 ? 1.55 : 0.94;
    if (this.spawnT > gap) {
      this.spawnT = 0;
      this.spawnForStage(distance);
    }
    for (const it of this.items) {
      it.z += speed * dt;
      it.mesh.position.z = it.z;
      if (it.kind === 'oven') {
        it.phase = (it.phase + dt) % TUNING.ovenCycle;
        const hot = it.phase / TUNING.ovenCycle;
        it.glowMat.opacity = hot > 0.55 ? (hot - 0.55) * 1.8 : 0;
        it.doorMat.color.setHex(hot > 0.55 ? 0x7a2a10 : 0x1a1a1a);
        // The fire flickers while it is hot, so the oven reads as lit, not painted.
        it.fire.intensity = hot > 0.55 ? (hot - 0.55) * 14 * (0.85 + 0.15 * Math.sin(it.phase * 9)) : 0;
      } else if (it.kind === 'knife') {
        it.phase = (it.phase + dt) % TUNING.knifeCycle;
        const c = it.phase / TUNING.knifeCycle;
        if (c < 0.55) {
          it.pivot.rotation.x = 0;
          it.stripMat.opacity = 0;
          it.down = false;
        } else if (c < 0.8) {
          // Telegraph: the strip pulses red, the blade trembles.
          it.stripMat.opacity = 0.35 + 0.35 * Math.sin(it.phase * 22);
          it.pivot.rotation.x = 0.08 * Math.sin(it.phase * 30);
          it.down = false;
        } else {
          it.pivot.rotation.x = 1.15;
          it.stripMat.opacity = 0.7;
          it.down = true;
        }
      }
      // Near-miss: an obstacle slips past in the next lane while the bird moves.
      if (!it.counted && it.z > 1.2) {
        it.counted = true;
        if (Math.abs(it.lane - turkey.lane) === 1 && it.kind !== 'knife') {
          if (events) events.push({ type: 'nearMiss' });
        }
      }
      // Collision: same lane, same depth, and the bird is not clearing it.
      if (!it.passed && Math.abs(it.z) < 0.95 && it.lane === turkey.lane) {
        let cleared = false;
        if (it.clear === 'jump' && turkey.y > 0.9) cleared = true;
        if (it.clear === 'roll' && turkey.rolling) cleared = true;
        if (it.kind === 'knife' && !it.down) cleared = true;
        if (!cleared) {
          it.passed = true;
          if (events) events.push({ type: 'hit', cause: it.kind });
        }
      }
      if (it.z > 0.9 && it.z < 1.4 && it.lane === turkey.lane && it.clear === 'lane') {
        // Tall solid obstacle the bird is about to run into: already handled above.
      }
    }
    // Recycle anything that has run past the camera.
    for (let i = this.items.length - 1; i >= 0; i--) {
      if (this.items[i].z > 16) {
        this.group.remove(this.items[i].mesh);
        this.items.splice(i, 1);
      }
    }
    void clamp;
  }
}
