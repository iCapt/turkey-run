// Turkey Run 3D — obstacles: what the turkey jumps, rolls under or dodges.
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

function buildMesh(kind) {
  const g = new THREE.Group();
  const wood = std(0x7a5a30);
  const woodDark = std(0x5d4126);
  const hay = std(0xe8c84a);
  const steel = std(0xb8c0c8, 0.35, 0.7);
  const red = std(0xa63a2a);
  const dark = std(0x3a3a3a, 0.5, 0.5);
  if (kind === 'fence') {
    for (const dx of [-0.9, 0, 0.9]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.16, 1.15, 0.16), wood);
      post.position.set(dx, 0.58, 0); post.castShadow = true; g.add(post);
    }
    for (const y of [0.4, 0.85]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.12, 0.08), woodDark);
      rail.position.y = y; g.add(rail);
    }
  } else if (kind === 'hay') {
    const bale = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 0.85, 1.3, 14), hay);
    bale.rotation.z = Math.PI / 2; bale.position.y = 0.85; bale.castShadow = true; g.add(bale);
    const band = new THREE.Mesh(new THREE.TorusGeometry(0.86, 0.05, 8, 20), woodDark);
    band.rotation.y = Math.PI / 2; band.position.y = 0.85; g.add(band);
  } else if (kind === 'barrel') {
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.6, 1.0, 14), wood);
    barrel.position.y = 0.5; barrel.castShadow = true; g.add(barrel);
    const band = new THREE.Mesh(new THREE.TorusGeometry(0.58, 0.04, 8, 20), dark);
    band.rotation.x = Math.PI / 2; band.position.y = 0.75; g.add(band);
  } else if (kind === 'pot') {
    const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.5, 0.95, 14), dark);
    pot.position.y = 0.48; pot.castShadow = true; g.add(pot);
    const lid = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.1, 14), steel);
    lid.position.y = 1.0; g.add(lid);
  } else if (kind === 'crate') {
    const crate = new THREE.Mesh(new THREE.BoxGeometry(1.7, 1.7, 1.2), wood);
    crate.position.y = 0.85; crate.castShadow = true; g.add(crate);
    const edge = new THREE.Mesh(new THREE.BoxGeometry(1.76, 0.14, 1.26), woodDark);
    edge.position.y = 1.55; g.add(edge);
  } else if (kind === 'scarecrow') {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 2.1, 8), wood);
    pole.position.y = 1.05; pole.castShadow = true; g.add(pole);
    const cross = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.12, 0.12), wood);
    cross.position.y = 1.6; g.add(cross);
    const shirt = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.8, 0.3), std(0x4a7c2f));
    shirt.position.y = 1.35; g.add(shirt);
    const hat = new THREE.Mesh(new THREE.ConeGeometry(0.4, 0.4, 10), std(0xe8c84a));
    hat.position.y = 2.05; g.add(hat);
  } else if (kind === 'cart') {
    const bed = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.7, 1.4), wood);
    bed.position.y = 0.85; bed.castShadow = true; g.add(bed);
    const hayTop = new THREE.Mesh(new THREE.SphereGeometry(0.8, 10, 8), hay);
    hayTop.scale.set(1.1, 0.5, 0.8); hayTop.position.y = 1.3; g.add(hayTop);
    const wheelGeo = new THREE.CylinderGeometry(0.42, 0.42, 0.12, 12);
    for (const dx of [-0.7, 0.7]) {
      const w = new THREE.Mesh(wheelGeo, woodDark);
      w.rotation.z = Math.PI / 2; w.position.set(dx, 0.42, 0.72); g.add(w);
      const w2 = new THREE.Mesh(wheelGeo, woodDark);
      w2.rotation.z = Math.PI / 2; w2.position.set(dx, 0.42, -0.72); g.add(w2);
    }
  } else if (kind === 'oven') {
    const body = new THREE.Mesh(new THREE.BoxGeometry(2.0, 1.9, 1.3), dark);
    body.position.y = 0.95; body.castShadow = true; g.add(body);
    const glowMat = new THREE.MeshStandardMaterial({ color: 0xff6a00, emissive: 0xff5500, emissiveIntensity: 2.2 });
    const mouth = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.9, 0.1), glowMat);
    mouth.position.set(0, 0.75, 0.68); g.add(mouth);
    const chimney = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.22, 0.9, 8), dark);
    chimney.position.set(0.6, 2.3, 0); g.add(chimney);
    const knobs = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.18, 0.08), steel);
    knobs.position.set(0, 1.75, 0.68); g.add(knobs);
  } else if (kind === 'knife') {
    const block = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.9, 1.2), wood);
    block.position.y = 0.45; block.castShadow = true; g.add(block);
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.14, 1.7, 1.1), steel);
    blade.position.set(0.3, 1.7, 0); blade.rotation.z = -0.5; blade.castShadow = true; g.add(blade);
    const handle = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.5, 0.22), woodDark);
    handle.position.set(0.95, 2.35, 0); handle.rotation.z = -0.5; g.add(handle);
  } else if (kind === 'beam') {
    for (const dx of [-1.0, 1.0]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.18, 1.7, 0.18), wood);
      post.position.set(dx, 0.85, 0); post.castShadow = true; g.add(post);
    }
    const beam = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.28, 0.3), woodDark);
    beam.position.y = 1.55; beam.castShadow = true; g.add(beam);
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), new THREE.MeshStandardMaterial({ color: 0xffe9a8, emissive: 0xffc93c, emissiveIntensity: 1.4 }));
    lamp.position.y = 1.3; g.add(lamp);
  } else if (kind === 'pin') {
    for (const dx of [-1.0, 1.0]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.16, 1.6, 0.16), wood);
      post.position.set(dx, 0.8, 0); post.castShadow = true; g.add(post);
    }
    const pin = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 2.2, 12), std(0xe8d8b0, 0.7));
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
    const obstacle = { mesh, lane, z, kind, mode: KINDS[kind].mode, passed: false, hit: false };
    this.list.push(obstacle);
    return obstacle;
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
      this.list.push({ mesh, lane, z, kind, mode: KINDS[kind].mode, passed: false, hit: false });
    }
    // Occasionally stack a second row just behind, in the free lane.
    if (random() < 0.35) {
      const free = [0, 1, 2].find((l) => !lanes.includes(l));
      const kind = stageKinds[Math.floor(random() * stageKinds.length)];
      const mesh = buildMesh(kind);
      mesh.position.set(LANES[free], 0, 78 + 10 + random() * 4);
      this.scene.add(mesh);
      this.list.push({ mesh, lane: free, z: mesh.position.z, kind, mode: KINDS[kind].mode, passed: false, hit: false });
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
