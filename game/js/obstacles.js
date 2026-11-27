// Turkey Runner — obstacles: what the turkey jumps, rolls under or dodges.
// One job: build each obstacle's mesh, spawn fair rows, move them, test hits.
import * as THREE from 'three';
import { LANES, DESPAWN_BEHIND, HIT_Z } from './config.js';

function std(color, rough = 0.9, metal = 0.02) {
  return new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal });
}

// kind -> { mode: 'jump' (clear it in the air) | 'roll' (pass under it) | 'dodge' (change lane) }
const KINDS = {
  fence: { mode: 'jump', h: 1.15 },
  hay: { mode: 'jump', h: 1.05 },
  barrel: { mode: 'jump', h: 1.0 },
  pot: { mode: 'jump', h: 0.95 },
  crate: { mode: 'dodge', h: 1.7 },
  scarecrow: { mode: 'dodge', h: 2.1 },
  cart: { mode: 'dodge', h: 1.6 },
  oven: { mode: 'dodge', h: 1.9 },
  knife: { mode: 'dodge', h: 2.2 },
  beam: { mode: 'roll', h: 1.7 },
  pin: { mode: 'roll', h: 1.6 },
};


// Shared obstacle materials + geometries (one per part shape): a spawned
// obstacle reuses them, so a spawn allocates only Mesh/Group objects — no new
// GPU buffers per spawn, no per-spawn upload, nothing to dispose on despawn.
const MAT = {
  wood: std(0x7a5a30),
  woodDark: std(0x5d4126),
  hay: std(0xe8c84a),
  steel: std(0xb8c0c8, 0.35, 0.7),
  red: std(0xa63a2a),
  dark: std(0x3a3a3a, 0.5, 0.5),
  green: std(0x4a7c2f),
  cream: std(0xe8d8b0, 0.7),
  ovenGlow: new THREE.MeshStandardMaterial({ color: 0xff6a00, emissive: 0xff5500, emissiveIntensity: 2.2 }),
  ovenDoor: std(0x2a2a2a, 0.5, 0.6),
  ovenFire: new THREE.MeshStandardMaterial({ color: 0xffb020, emissive: 0xff7a00, emissiveIntensity: 3.0, transparent: true, opacity: 0.95 }),
  lamp: new THREE.MeshStandardMaterial({ color: 0xffe9a8, emissive: 0xffc93c, emissiveIntensity: 1.4 }),
};
const GEO = {
  fencePost: new THREE.BoxGeometry(0.16, 1.15, 0.16),
  fenceRail: new THREE.BoxGeometry(2.2, 0.12, 0.08),
  bale: new THREE.CylinderGeometry(0.85, 0.85, 1.3, 14),
  baleBand: new THREE.TorusGeometry(0.86, 0.05, 8, 20),
  barrel: new THREE.CylinderGeometry(0.55, 0.6, 1.0, 14),
  barrelBand: new THREE.TorusGeometry(0.58, 0.04, 8, 20),
  pot: new THREE.CylinderGeometry(0.62, 0.5, 0.95, 14),
  lid: new THREE.CylinderGeometry(0.5, 0.5, 0.1, 14),
  crate: new THREE.BoxGeometry(1.7, 1.7, 1.2),
  crateEdge: new THREE.BoxGeometry(1.76, 0.14, 1.26),
  pole: new THREE.CylinderGeometry(0.08, 0.08, 2.1, 8),
  cross: new THREE.BoxGeometry(1.5, 0.12, 0.12),
  shirt: new THREE.BoxGeometry(1.1, 0.8, 0.3),
  hat: new THREE.ConeGeometry(0.4, 0.4, 10),
  cartBed: new THREE.BoxGeometry(1.9, 0.7, 1.4),
  hayTop: new THREE.SphereGeometry(0.8, 10, 8),
  wheel: new THREE.CylinderGeometry(0.42, 0.42, 0.12, 12),
  ovenBody: new THREE.BoxGeometry(2.0, 1.9, 1.3),
  ovenMouth: new THREE.BoxGeometry(1.4, 0.9, 0.1),
  ovenDoor: new THREE.BoxGeometry(1.4, 0.85, 0.08),
  ovenFire: new THREE.ConeGeometry(0.5, 0.9, 8),
  chimney: new THREE.CylinderGeometry(0.18, 0.22, 0.9, 8),
  knobs: new THREE.BoxGeometry(1.6, 0.18, 0.08),
  knifeStrip: new THREE.PlaneGeometry(2.0, 3.2),
  knifeBlock: new THREE.BoxGeometry(1.8, 0.9, 1.2),
  blade: new THREE.BoxGeometry(0.14, 1.7, 1.1),
  handle: new THREE.BoxGeometry(0.16, 0.5, 0.22),
  beamPost: new THREE.BoxGeometry(0.18, 1.7, 0.18),
  beam: new THREE.BoxGeometry(2.4, 0.28, 0.3),
  lamp: new THREE.SphereGeometry(0.16, 10, 8),
  pinPost: new THREE.BoxGeometry(0.16, 1.6, 0.16),
  pin: new THREE.CylinderGeometry(0.22, 0.22, 2.2, 12),
};

// Oven temperature label: a small canvas plate reading "220 C" that sits on
// the oven front, so the oven reads as an oven even at a glance.
let ovenLabelTex = null;
function getOvenLabelTex() {
  if (ovenLabelTex) return ovenLabelTex;
  const c = document.createElement('canvas');
  c.width = 256; c.height = 96;
  const g = c.getContext('2d');
  g.fillStyle = '#f2e3c2'; g.fillRect(0, 0, 256, 96);
  g.strokeStyle = '#b3271e'; g.lineWidth = 8; g.strokeRect(4, 4, 248, 88);
  g.fillStyle = '#b3271e';
  g.font = '900 52px "Trebuchet MS", sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText('220 C', 128, 52);
  ovenLabelTex = new THREE.CanvasTexture(c);
  ovenLabelTex.colorSpace = THREE.SRGBColorSpace;
  return ovenLabelTex;
}

function buildMesh(kind) {
  const g = new THREE.Group();
  const { wood, woodDark, hay, steel, red, dark } = MAT;
  if (kind === 'fence') {
    for (const dx of [-0.9, 0, 0.9]) {
      const post = new THREE.Mesh(GEO.fencePost, wood);
      post.position.set(dx, 0.58, 0); post.castShadow = true; g.add(post);
    }
    for (const y of [0.4, 0.85]) {
      const rail = new THREE.Mesh(GEO.fenceRail, woodDark);
      rail.position.y = y; g.add(rail);
    }
  } else if (kind === 'hay') {
    const bale = new THREE.Mesh(GEO.bale, hay);
    bale.rotation.z = Math.PI / 2; bale.position.y = 0.85; bale.castShadow = true; g.add(bale);
    const band = new THREE.Mesh(GEO.baleBand, woodDark);
    band.rotation.y = Math.PI / 2; band.position.y = 0.85; g.add(band);
  } else if (kind === 'barrel') {
    const barrel = new THREE.Mesh(GEO.barrel, wood);
    barrel.position.y = 0.5; barrel.castShadow = true; g.add(barrel);
    const band = new THREE.Mesh(GEO.barrelBand, dark);
    band.rotation.x = Math.PI / 2; band.position.y = 0.75; g.add(band);
  } else if (kind === 'pot') {
    const pot = new THREE.Mesh(GEO.pot, dark);
    pot.position.y = 0.48; pot.castShadow = true; g.add(pot);
    const lid = new THREE.Mesh(GEO.lid, steel);
    lid.position.y = 1.0; g.add(lid);
  } else if (kind === 'crate') {
    const crate = new THREE.Mesh(GEO.crate, wood);
    crate.position.y = 0.85; crate.castShadow = true; g.add(crate);
    const edge = new THREE.Mesh(GEO.crateEdge, woodDark);
    edge.position.y = 1.55; g.add(edge);
  } else if (kind === 'scarecrow') {
    const pole = new THREE.Mesh(GEO.pole, wood);
    pole.position.y = 1.05; pole.castShadow = true; g.add(pole);
    const cross = new THREE.Mesh(GEO.cross, wood);
    cross.position.y = 1.6; g.add(cross);
    const shirt = new THREE.Mesh(GEO.shirt, MAT.green);
    shirt.position.y = 1.35; g.add(shirt);
    const hat = new THREE.Mesh(GEO.hat, hay);
    hat.position.y = 2.05; g.add(hat);
  } else if (kind === 'cart') {
    const bed = new THREE.Mesh(GEO.cartBed, wood);
    bed.position.y = 0.85; bed.castShadow = true; g.add(bed);
    const hayTop = new THREE.Mesh(GEO.hayTop, hay);
    hayTop.scale.set(1.1, 0.5, 0.8); hayTop.position.y = 1.3; g.add(hayTop);
    for (const dx of [-0.7, 0.7]) {
      const w = new THREE.Mesh(GEO.wheel, woodDark);
      w.rotation.z = Math.PI / 2; w.position.set(dx, 0.42, 0.72); g.add(w);
      const w2 = new THREE.Mesh(GEO.wheel, woodDark);
      w2.rotation.z = Math.PI / 2; w2.position.set(dx, 0.42, -0.72); g.add(w2);
    }
  } else if (kind === 'oven') {
    const body = new THREE.Mesh(GEO.ovenBody, dark);
    body.position.y = 0.95; body.castShadow = true; g.add(body);
    // Glowing mouth behind the door: it reddens as the cycle heats up.
    const mouth = new THREE.Mesh(GEO.ovenMouth, MAT.ovenGlow.clone());
    mouth.position.set(0, 0.75, 0.68); g.add(mouth);
    g.userData.mouth = mouth;
    // The door swings open on its bottom hinge when the oven fires.
    const door = new THREE.Mesh(GEO.ovenDoor, MAT.ovenDoor);
    door.position.set(0, 0.75, 0.74); g.add(door);
    g.userData.door = door;
    // Fire that bursts out when the door opens.
    const fire = new THREE.Mesh(GEO.ovenFire, MAT.ovenFire);
    fire.position.set(0, 1.0, 1.0); fire.visible = false; g.add(fire);
    g.userData.fire = fire;
    const chimney = new THREE.Mesh(GEO.chimney, dark);
    chimney.position.set(0.6, 2.3, 0); g.add(chimney);
    const knobs = new THREE.Mesh(GEO.knobs, steel);
    knobs.position.set(0, 1.75, 0.68); g.add(knobs);
    const label = new THREE.Mesh(
      new THREE.PlaneGeometry(0.9, 0.34),
      new THREE.MeshStandardMaterial({ map: getOvenLabelTex(), roughness: 0.6 }),
    );
    label.position.set(0, 1.35, 0.7); g.add(label);
    // Face the approaching player: mouth, label, door and fire toward -z.
    g.rotation.y = Math.PI;
  } else if (kind === 'knife') {
    const block = new THREE.Mesh(GEO.knifeBlock, wood);
    block.position.y = 0.45; block.castShadow = true; g.add(block);
    const blade = new THREE.Mesh(GEO.blade, steel);
    blade.position.set(0.3, 1.7, 0); blade.rotation.z = -0.5; blade.castShadow = true; g.add(blade);
    g.userData.blade = blade;
    g.userData.bladeUpY = 1.7;
    const handle = new THREE.Mesh(GEO.handle, woodDark);
    handle.position.set(0.95, 2.35, 0); handle.rotation.z = -0.5; g.add(handle);
    g.userData.handle = handle;
    // Pulsing red warning strip on the floor: the telegraph before the slam.
    const strip = new THREE.Mesh(
      GEO.knifeStrip,
      new THREE.MeshBasicMaterial({ color: 0xd23b2e, transparent: true, opacity: 0.0 }),
    );
    strip.rotation.x = -Math.PI / 2;
    strip.position.set(0, 0.03, 1.8); g.add(strip);
    g.userData.strip = strip;
    // Face the approaching player: blade + warning strip toward -z.
    g.rotation.y = Math.PI;
  } else if (kind === 'beam') {
    for (const dx of [-1.0, 1.0]) {
      const post = new THREE.Mesh(GEO.beamPost, wood);
      post.position.set(dx, 0.85, 0); post.castShadow = true; g.add(post);
    }
    const beam = new THREE.Mesh(GEO.beam, woodDark);
    beam.position.y = 1.55; beam.castShadow = true; g.add(beam);
    const lamp = new THREE.Mesh(GEO.lamp, MAT.lamp);
    lamp.position.y = 1.3; g.add(lamp);
  } else if (kind === 'pin') {
    for (const dx of [-1.0, 1.0]) {
      const post = new THREE.Mesh(GEO.pinPost, wood);
      post.position.set(dx, 0.8, 0); post.castShadow = true; g.add(post);
    }
    const pin = new THREE.Mesh(GEO.pin, MAT.cream);
    pin.rotation.z = Math.PI / 2; pin.position.y = 1.45; pin.castShadow = true; g.add(pin);
  }
  return g;
}

export class Obstacles {
  constructor(scene) {
    this.scene = scene;
    this.list = [];
    this.spawnClock = 0;
  }

  reset() {
    for (const o of this.list) this.scene.remove(o.mesh);
    this.list = [];
    this.spawnClock = 1.2;
  }

  // Place one obstacle by hand (screenshot staging / tests).
  spawnAt(kind, lane, z) {
    const mesh = buildMesh(kind);
    mesh.position.set(LANES[lane], 0, z);
    this.scene.add(mesh);
    const obstacle = { mesh, lane, z, kind, mode: KINDS[kind].mode, passed: false, hit: false, cycleT: Math.random() * 3 };
    this.list.push(obstacle);
    return obstacle;
  }

  // Telegraph cycles: oven 3.2 s (door reddens -> opens + fire), knife 2.6 s
  // (red floor strip pulses -> blade slams). One pose function, driven by the
  // obstacle's own clock, so staging can set the phase and pose it directly.
  _poseCycle(o) {
    const u = o.mesh.userData;
    if (o.kind === 'oven' && u.door) {
      const phase = o.cycleT % 3.2;
      const heating = phase < 2.0 ? phase / 2.0 : 1; // door reddens
      u.mouth.material.emissiveIntensity = 0.6 + heating * 2.2;
      const hot = phase >= 2.0;
      u.door.rotation.x = hot ? -1.15 : 0; // swings open on its hinge
      u.fire.visible = hot;
      if (hot) u.fire.scale.set(1 + Math.sin(o.cycleT * 9) * 0.15, 1, 1);
    } else if (o.kind === 'knife' && u.blade) {
      const phase = o.cycleT % 2.6;
      const warn = phase < 1.6;
      // Telegraph: strip pulses red while the blade hangs up.
      u.strip.material.opacity = warn ? 0.25 + 0.2 * Math.sin(o.cycleT * 10) : 0;
      const slammed = !warn;
      u.blade.position.y = slammed ? 0.9 : u.bladeUpY;
      u.blade.rotation.z = slammed ? -0.15 : -0.5;
      u.handle.position.y = slammed ? 1.55 : 2.35;
      u.handle.rotation.z = slammed ? -0.15 : -0.5;
    }
  }

  poseCycles() {
    for (const o of this.list) this._poseCycle(o);
  }

  // Screenshot staging: find the nearest oven + knife, move them into frame,
  // enlarge them, and set their cycles to the "hot" moment at freeze.
  primeShotHazards() {
    let oven = null; let knife = null;
    for (const o of this.list) {
      if (o.kind === 'oven' && o.z > 0 && o.z < 40 && (!oven || o.z < oven.z)) oven = o;
      if (o.kind === 'knife' && o.z > 0 && o.z < 40 && (!knife || o.z < knife.z)) knife = o;
    }
    if (oven) {
      oven.mesh.position.x = LANES[0]; oven.lane = 0;
      oven.z = 14; oven.mesh.position.z = 14;
      oven.mesh.scale.set(1.45, 1.45, 1.45);
      oven.cycleT = 2.4; // door open + fire out
      this._poseCycle(oven);
    }
    if (knife) {
      knife.mesh.position.x = LANES[2]; knife.lane = 2;
      knife.z = 12; knife.mesh.position.z = 12;
      knife.mesh.scale.set(1.4, 1.4, 1.4);
      knife.cycleT = 1.0; // telegraph: red strip pulsing, blade raised
      this._poseCycle(knife);
    }
    return { oven: !!oven, knife: !!knife };
  }

  // Spawn one row: 1-2 lanes blocked, always leaving a way through
  // (a free lane, or a jumpable / rollable obstacle in the turkey's path).
  spawnRow(random, stageKinds, density) {
    const blockedCount = random() < 0.55 ? 1 : 2;
    const lanes = [0, 1, 2].sort(() => random() - 0.5).slice(0, blockedCount);
    for (const lane of lanes) {
      const kind = stageKinds[Math.floor(random() * stageKinds.length)];
      const mesh = buildMesh(kind);
      const z = 78 + random() * 6;
      mesh.position.set(LANES[lane], 0, z);
      this.scene.add(mesh);
      this.list.push({ mesh, lane, z, kind, mode: KINDS[kind].mode, passed: false, hit: false, cycleT: random() * 3 });
    }
    // Occasionally stack a second row just behind, in the free lane.
    if (random() < 0.35) {
      const free = [0, 1, 2].find((l) => !lanes.includes(l));
      const kind = stageKinds[Math.floor(random() * stageKinds.length)];
      const mesh = buildMesh(kind);
      mesh.position.set(LANES[free], 0, 78 + 10 + random() * 4);
      this.scene.add(mesh);
      this.list.push({ mesh, lane: free, z: mesh.position.z, kind, mode: KINDS[kind].mode, passed: false, hit: false, cycleT: random() * 3 });
    }
    return density;
  }

  update(dt, speed, random, stageKinds, density, distance) {
    this.spawnClock -= dt * speed;
    const gap = 26 - Math.min(9, distance / 120);
    if (this.spawnClock <= 0) {
      this.spawnRow(random, stageKinds, density);
      this.spawnClock = gap * (0.85 + random() * 0.4) / Math.max(0.5, density);
    }
    for (let i = this.list.length - 1; i >= 0; i -= 1) {
      const o = this.list[i];
      o.z -= speed * dt;
      o.mesh.position.z = o.z;
      o.cycleT += dt;
      this._poseCycle(o);
      if (o.z < DESPAWN_BEHIND) {
        this.scene.remove(o.mesh);
        this.list.splice(i, 1);
      }
    }
  }

  // Returns 'hit' | 'jumped' | 'rolled' | null for the turkey's current state.
  // turkey: { lane, y, rolling }
  checkHit(turkey) {
    for (const o of this.list) {
      if (o.hit || Math.abs(o.z) > HIT_Z) continue;
      if (o.lane !== turkey.lane) continue;
      if (o.mode === 'jump' && turkey.y > 0.95) { o.hit = true; return { type: 'jumped', obstacle: o }; }
      if (o.mode === 'roll' && turkey.rolling) { o.hit = true; return { type: 'rolled', obstacle: o }; }
      if (o.mode === 'dodge') { o.hit = true; return { type: 'hit', obstacle: o }; }
      if (o.mode === 'jump' || o.mode === 'roll') { o.hit = true; return { type: 'hit', obstacle: o }; }
    }
    return null;
  }

  // Obstacles the turkey has safely passed (for the dodge mission + score).
  passedCount(turkey) {
    let n = 0;
    for (const o of this.list) {
      if (!o.passed && o.z < -HIT_Z) {
        o.passed = true;
        if (o.lane !== turkey.lane || o.mode !== 'dodge') n += 1;
      }
    }
    return n;
  }
}
