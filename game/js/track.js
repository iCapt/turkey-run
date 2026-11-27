// Turkey Runner — the world the turkey runs through: track, rails, sky and scenery.
// One job: the ground under the run and the stage dressing that scrolls past.
import * as THREE from 'three';
import { STAGES, LANES, mulberry32 } from './config.js';

function groundTexture(baseColor, speckleColor, opts = {}) {
  const { tile = false, checker = null, random = Math.random, repeatX = 6, repeatY = 24 } = opts;
  const c = document.createElement('canvas');
  c.width = 256; c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = baseColor;
  g.fillRect(0, 0, 256, 256);
  if (checker) {
    // Kitchen floor: cream vs terracotta-red checkerboard (4x4 per tile).
    for (let x = 0; x < 4; x += 1) {
      for (let y = 0; y < 4; y += 1) {
        if ((x + y) % 2 === 0) continue;
        g.fillStyle = checker;
        g.fillRect(x * 64, y * 64, 64, 64);
      }
    }
    g.strokeStyle = 'rgba(0,0,0,0.18)';
    g.lineWidth = 3;
    for (let i = 0; i <= 4; i += 1) {
      g.beginPath(); g.moveTo(i * 64, 0); g.lineTo(i * 64, 256); g.stroke();
      g.beginPath(); g.moveTo(0, i * 64); g.lineTo(256, i * 64); g.stroke();
    }
  } else if (tile) {
    g.strokeStyle = 'rgba(0,0,0,0.25)';
    g.lineWidth = 4;
    for (let i = 0; i <= 4; i += 1) {
      g.beginPath(); g.moveTo(i * 64, 0); g.lineTo(i * 64, 256); g.stroke();
      g.beginPath(); g.moveTo(0, i * 64); g.lineTo(256, i * 64); g.stroke();
    }
  }
  // Speckles so the ground is not a flat sheet.
  for (let i = 0; i < 420; i += 1) {
    g.fillStyle = speckleColor;
    g.globalAlpha = 0.05 + random() * 0.07;
    const r = 1 + random() * 2.5;
    g.beginPath(); g.arc(random() * 256, random() * 256, r, 0, Math.PI * 2); g.fill();
  }
  g.globalAlpha = 1;
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping; tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeatX, repeatY);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// A 4-band vertical sky gradient (top -> horizon) painted on a tiny canvas,
// so the sky is never one flat fog colour. One texture per stage, cached.
function skyTexture(bands) {
  const c = document.createElement('canvas');
  c.width = 4; c.height = 256;
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, bands[0]);
  grad.addColorStop(0.45, bands[1]);
  grad.addColorStop(0.75, bands[2]);
  grad.addColorStop(1, bands[3]);
  g.fillStyle = grad;
  g.fillRect(0, 0, 4, 256);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}


// Shared scenery materials + geometries (one per part shape): a spawned prop
// reuses them, so spawning allocates only Mesh/Group objects — no new GPU
// buffers per prop and nothing to dispose on despawn.
const MAT = {
  wood: new THREE.MeshStandardMaterial({ color: 0x7a5a30, roughness: 1 }),
  leaf: new THREE.MeshStandardMaterial({ color: 0x4a7c2f, roughness: 1 }),
  leaf2: new THREE.MeshStandardMaterial({ color: 0xd98e2b, roughness: 1 }),
  hay: new THREE.MeshStandardMaterial({ color: 0xe8c84a, roughness: 1 }),
  red: new THREE.MeshStandardMaterial({ color: 0xa63a2a, roughness: 0.9 }),
  counter: new THREE.MeshStandardMaterial({ color: 0x8a6b4a, roughness: 0.8 }),
  pot: new THREE.MeshStandardMaterial({ color: 0x3a3a3a, roughness: 0.4, metalness: 0.6 }),
  pumpkin: new THREE.MeshStandardMaterial({ color: 0xe8722a, roughness: 0.7 }),
  creamWall: new THREE.MeshStandardMaterial({ color: 0xf2e3c2, roughness: 0.95 }),
  cabinetRed: new THREE.MeshStandardMaterial({ color: 0xb3271e, roughness: 0.7 }),
  tray: new THREE.MeshStandardMaterial({ color: 0xc8a24a, roughness: 0.4, metalness: 0.5 }),
};
const GEO = {
  trunk: new THREE.CylinderGeometry(0.22, 0.3, 1.6, 8),
  crown: new THREE.ConeGeometry(1.5, 3.2, 8),
  bale: new THREE.CylinderGeometry(0.9, 0.9, 1.4, 12),
  post: new THREE.BoxGeometry(0.16, 1.1, 0.16),
  rail: new THREE.BoxGeometry(3.2, 0.12, 0.08),
  wall: new THREE.BoxGeometry(3.4, 4.2, 0.3),
  roof: new THREE.ConeGeometry(2.6, 1.4, 4),
  counter: new THREE.BoxGeometry(2.6, 1.1, 1.2),
  pot: new THREE.CylinderGeometry(0.35, 0.3, 0.5, 12),
  pumpkin: new THREE.SphereGeometry(0.55, 12, 10),
  stem: new THREE.CylinderGeometry(0.07, 0.09, 0.35, 6),
  kitchenWall: new THREE.BoxGeometry(4.4, 4.4, 0.3),
  kitchenSideWall: new THREE.BoxGeometry(0.3, 6.5, 80),
  kitchenTrim: new THREE.BoxGeometry(0.08, 0.3, 80),
  kitchenDoor: new THREE.BoxGeometry(1.2, 2.6, 0.1),
  cabinet: new THREE.BoxGeometry(2.4, 2.0, 1.0),
  cabinetDoor: new THREE.BoxGeometry(1.0, 1.6, 0.08),
  tray: new THREE.CylinderGeometry(0.55, 0.45, 0.18, 14),
};

export class Track {
  constructor(scene) {
    this.scene = scene;
    this.stageIndex = 0;
    this.sleeperOffset = 0;
    this.scenery = [];
    this.spawnClock = 0;
    this.random = Math.random;
    this.skyRandom = mulberry32(20261127); // fixed seed: same clouds every load
    this.skyTextures = {};
    this._buildLights();
    this._buildGround();
    this._buildRails();
    this._buildSky();
    this._buildKitchenRoom();
  }

  // Permanent kitchen interior: cream side walls + red doors + cabinet runs
  // flanking the track, so the kitchen reads as a room, not an open field.
  // Built once, visible only in the kitchen stage (toggled in setStage) —
  // the farmyard and barn never see it.
  _buildKitchenRoom() {
    this.kitchenRoom = new THREE.Group();
    for (const side of [-1, 1]) {
      const wall = new THREE.Mesh(GEO.kitchenSideWall, MAT.creamWall);
      wall.position.set(side * 6.4, 3.25, 26);
      wall.castShadow = true; wall.receiveShadow = true;
      this.kitchenRoom.add(wall);
      // Red border stripe along the inner face, near the top.
      const trim = new THREE.Mesh(GEO.kitchenTrim, MAT.cabinetRed);
      trim.position.set(side * (6.4 - 0.19), 5.6, 26);
      this.kitchenRoom.add(trim);
      // Red doors set into the wall, staggered per side.
      const doorZs = side < 0 ? [8, 28] : [18, 38];
      for (const z of doorZs) {
        const door = new THREE.Mesh(GEO.kitchenDoor, MAT.cabinetRed);
        door.position.set(side * (6.4 - 0.2), 1.3, z);
        door.rotation.y = side < 0 ? Math.PI / 2 : -Math.PI / 2;
        this.kitchenRoom.add(door);
        const knob = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), MAT.tray);
        knob.position.set(side * (6.4 - 0.32), 1.3, z + (side < 0 ? -0.4 : 0.4));
        this.kitchenRoom.add(knob);
      }
      // Cabinet run: cream cabinets with red doors facing the track,
      // trays and pots on top (reuses the kitchen scenery cabinet).
      for (const z of [4, 14, 24, 34]) {
        const cab = this._makeSceneryProp('cabinet');
        cab.rotation.y = side < 0 ? Math.PI / 2 : -Math.PI / 2;
        cab.position.set(side * 5.2, 0, z);
        this.kitchenRoom.add(cab);
      }
    }
    this.kitchenRoom.visible = false;
    this.scene.add(this.kitchenRoom);
  }

  _buildSky() {
    // Puffy clouds and distant hills, so the horizon is not a flat void.
    this.clouds = new THREE.Group();
    const cloudMat = new THREE.MeshStandardMaterial({ color: 0xfff6e0, roughness: 1, transparent: true, opacity: 0.92 });
    const cloudSpots = [
      [-26, 17, 55], [-12, 20, 72], [4, 15, 48], [18, 19, 66], [30, 16, 52], [-34, 14, 80],
    ];
    for (const [x, y, z] of cloudSpots) {
      const puff = new THREE.Group();
      for (let i = 0; i < 3; i += 1) {
        const s = new THREE.Mesh(new THREE.SphereGeometry(2.2 + this.skyRandom() * 1.6, 10, 8), cloudMat);
        s.scale.y = 0.45;
        s.position.set(i * 2.6 - 2.6, (this.skyRandom() - 0.5) * 0.6, (this.skyRandom() - 0.5) * 1.2);
        puff.add(s);
      }
      puff.position.set(x, y, z);
      puff.userData.baseX = x;
      this.clouds.add(puff);
    }
    this.scene.add(this.clouds);
    // Hills at the fog line.
    this.hills = new THREE.Group();
    const hillMat = new THREE.MeshStandardMaterial({ color: 0x9a6b35, roughness: 1 });
    const hillMat2 = new THREE.MeshStandardMaterial({ color: 0x7d5a2e, roughness: 1 });
    const hillSpots = [[-32, 78, 24, 7, hillMat], [0, 86, 30, 9, hillMat2], [30, 80, 22, 6, hillMat]];
    for (const [x, z, r, h, m] of hillSpots) {
      const hill = new THREE.Mesh(new THREE.ConeGeometry(r, h, 12), m);
      hill.position.set(x, h / 2 - 0.5, z);
      this.hills.add(hill);
    }
    this.scene.add(this.hills);
    // Fence posts lining both sides of the track, scrolling with the world.
    const postGeo = new THREE.BoxGeometry(0.16, 1.15, 0.16);
    const postMat = new THREE.MeshStandardMaterial({ color: 0x7a5a30, roughness: 1 });
    this.fenceCount = 22;
    this.fence = new THREE.InstancedMesh(postGeo, postMat, this.fenceCount * 2);
    this.fence.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.fence.castShadow = true;
    this.scene.add(this.fence);
    this._layoutFence(0);
  }

  _layoutFence(offset) {
    const m = new THREE.Matrix4();
    const span = this.fenceCount * 4;
    let i = 0;
    for (const side of [-1, 1]) {
      for (let s = 0; s < this.fenceCount; s += 1) {
        const z = 34 - (((s * 4 + offset) % span) + span) % span;
        m.makeTranslation(side * 6.2, 0.58, z);
        this.fence.setMatrixAt(i, m);
        i += 1;
      }
    }
    this.fence.instanceMatrix.needsUpdate = true;
  }

  _buildLights() {
    this.hemi = new THREE.HemisphereLight(0xfff2cc, 0x6b4a2a, 0.95);
    this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xffe0a0, 1.6);
    this.sun.position.set(-6, 12, -4);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(1024, 1024);
    this.sun.shadow.bias = -0.0005; // plain PCF needs a small bias to avoid acne
    this.sun.shadow.camera.left = -12; this.sun.shadow.camera.right = 12;
    this.sun.shadow.camera.top = 12; this.sun.shadow.camera.bottom = -30;
    this.sun.shadow.camera.far = 60;
    this.scene.add(this.sun);
    // Kitchen ovens add their own warm glow (kept dim elsewhere).
    this.ovenGlow = new THREE.PointLight(0xff6a00, 0, 30);
    this.ovenGlow.position.set(0, 2.5, 12);
    this.scene.add(this.ovenGlow);
  }

  _buildGround() {
    this.groundMat = new THREE.MeshStandardMaterial({ roughness: 1, metalness: 0 });
    this.ground = new THREE.Mesh(new THREE.PlaneGeometry(90, 220), this.groundMat);
    this.ground.rotation.x = -Math.PI / 2;
    this.ground.position.set(0, -0.02, 30);
    this.ground.receiveShadow = true;
    this.scene.add(this.ground);
    // The dirt track bed the lanes sit on.
    this.bedMat = new THREE.MeshStandardMaterial({ roughness: 1, metalness: 0 });
    this.bed = new THREE.Mesh(new THREE.PlaneGeometry(9.5, 220), this.bedMat);
    this.bed.rotation.x = -Math.PI / 2;
    this.bed.position.set(0, 0.0, 30);
    this.bed.receiveShadow = true;
    this.scene.add(this.bed);
  }

  _buildRails() {
    // Two steel rails per lane, running away into the distance.
    const railMat = new THREE.MeshStandardMaterial({ color: 0x8f9aa3, roughness: 0.35, metalness: 0.8 });
    this.rails = new THREE.Group();
    for (const laneX of LANES) {
      for (const dx of [-0.55, 0.55]) {
        const rail = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.09, 220), railMat);
        rail.position.set(laneX + dx, 0.05, 30);
        this.rails.add(rail);
      }
    }
    this.scene.add(this.rails);
    // Sleepers: one instanced set that scrolls toward the camera and wraps.
    const sleeperGeo = new THREE.BoxGeometry(2.9, 0.07, 0.5);
    const sleeperMat = new THREE.MeshStandardMaterial({ color: 0x5d4126, roughness: 1 });
    this.sleeperCount = 46;
    this.sleepers = new THREE.InstancedMesh(sleeperGeo, sleeperMat, this.sleeperCount * LANES.length);
    this.sleepers.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.sleepers.receiveShadow = true;
    this.scene.add(this.sleepers);
    this._layoutSleepers(0);
  }

  _layoutSleepers(offset) {
    const m = new THREE.Matrix4();
    let i = 0;
    for (let lane = 0; lane < LANES.length; lane += 1) {
      for (let s = 0; s < this.sleeperCount; s += 1) {
        const z = 34 - (((s * 1.9 + offset) % (this.sleeperCount * 1.9)) + this.sleeperCount * 1.9) % (this.sleeperCount * 1.9);
        m.makeTranslation(LANES[lane], 0.035, z);
        this.sleepers.setMatrixAt(i, m);
        i += 1;
      }
    }
    this.sleepers.instanceMatrix.needsUpdate = true;
  }

  setStage(index, random) {
    this.stageIndex = index;
    this.random = random || Math.random;
    const st = STAGES[index];
    if (!this.skyTextures[index]) this.skyTextures[index] = skyTexture(st.skyBands);
    this.scene.background = this.skyTextures[index];
    this.scene.fog = new THREE.Fog(st.fog, 26, 95);
    const groundHex = `#${st.ground.toString(16).padStart(6, '0')}`;
    const trackHex = `#${st.track.toString(16).padStart(6, '0')}`;
    if (st.floorCheck) {
      // Kitchen: cream/terracotta checkerboard on the ground AND the track bed.
      this.groundMat.map = groundTexture(groundHex, '#000000', { checker: trackHex, random: this.random, repeatX: 10, repeatY: 40 });
      this.bedMat.map = groundTexture(groundHex, '#ffffff', { checker: trackHex, random: this.random, repeatX: 3, repeatY: 24 });
    } else {
      this.groundMat.map = groundTexture(groundHex, '#000000', { random: this.random });
      this.bedMat.map = groundTexture(trackHex, '#ffffff', { random: this.random });
    }
    this.groundMat.needsUpdate = true;
    this.bedMat.needsUpdate = true;
    // Kitchen is indoors: the room walls/cabinets show, and the outdoor
    // dressing (clouds, hills, fence) hides. Farmyard/barn keep it all.
    const kitchen = index === 2;
    this.kitchenRoom.visible = kitchen;
    this.clouds.visible = !kitchen;
    this.hills.visible = !kitchen;
    this.fence.visible = !kitchen;
    this.ovenGlow.intensity = index === 2 ? 60 : 0;
    // Per-stage light: barn dimmer and redder, kitchen bright and pale.
    if (index === 1) { this.hemi.intensity = 0.8; this.hemi.color.set(0xffd9b0); this.sun.intensity = 1.3; this.sun.color.set(0xffb070); }
    else if (index === 2) { this.hemi.intensity = 1.15; this.hemi.color.set(0xfff6e0); this.sun.intensity = 1.7; this.sun.color.set(0xfff0c0); }
    else { this.hemi.intensity = 0.95; this.hemi.color.set(0xfff2cc); this.sun.intensity = 1.6; this.sun.color.set(0xffe0a0); }
    // Clear old scenery; fresh dressing spawns as the run continues.
    for (const item of this.scenery) this.scene.remove(item.mesh);
    this.scenery = [];
    this.spawnClock = 0;
  }

  _makeSceneryProp(kind) {
    const g = new THREE.Group();
    const { wood, leaf, leaf2, hay, red } = MAT;
    if (kind === 'kitchenwall') {
      // Kitchen wall: pale cream with a red door, so the kitchen reads as a room.
      const wall = new THREE.Mesh(GEO.kitchenWall, MAT.creamWall);
      wall.position.y = 2.2; wall.castShadow = true; g.add(wall);
      const door = new THREE.Mesh(GEO.kitchenDoor, MAT.cabinetRed);
      door.position.set(0.6, 1.3, 0.18); g.add(door);
      const knob = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), MAT.tray);
      knob.position.set(0.15, 1.3, 0.26); g.add(knob);
    } else if (kind === 'cabinet') {
      // Cream cabinet with red doors + a pie tray on top.
      const cab = new THREE.Mesh(GEO.cabinet, MAT.creamWall);
      cab.position.y = 1.0; cab.castShadow = true; g.add(cab);
      for (const dx of [-0.55, 0.55]) {
        const door = new THREE.Mesh(GEO.cabinetDoor, MAT.cabinetRed);
        door.position.set(dx, 1.0, 0.52); g.add(door);
      }
      const tray = new THREE.Mesh(GEO.tray, MAT.tray);
      tray.position.set(0.4, 2.1, 0); tray.castShadow = true; g.add(tray);
      const pot = new THREE.Mesh(GEO.pot, MAT.pot);
      pot.position.set(-0.6, 2.25, 0); g.add(pot);
    } else if (kind === 'tree') {
      const trunk = new THREE.Mesh(GEO.trunk, wood);
      trunk.position.y = 0.8; trunk.castShadow = true; g.add(trunk);
      const crown = new THREE.Mesh(GEO.crown, this.random() < 0.5 ? leaf : leaf2);
      crown.position.y = 3.0; crown.castShadow = true; g.add(crown);
    } else if (kind === 'haystack') {
      const bale = new THREE.Mesh(GEO.bale, hay);
      bale.rotation.z = Math.PI / 2; bale.position.y = 0.9; bale.castShadow = true; g.add(bale);
    } else if (kind === 'fencepost') {
      for (let i = 0; i < 3; i += 1) {
        const post = new THREE.Mesh(GEO.post, wood);
        post.position.set(i * 1.4 - 1.4, 0.55, 0); post.castShadow = true; g.add(post);
      }
      const rail = new THREE.Mesh(GEO.rail, wood);
      rail.position.y = 0.85; g.add(rail);
    } else if (kind === 'barnwall') {
      const wall = new THREE.Mesh(GEO.wall, red);
      wall.position.y = 2.1; wall.castShadow = true; g.add(wall);
      const roof = new THREE.Mesh(GEO.roof, wood);
      roof.position.y = 4.9; roof.rotation.y = Math.PI / 4; g.add(roof);
    } else if (kind === 'counter') {
      const counter = new THREE.Mesh(GEO.counter, MAT.counter);
      counter.position.y = 0.55; counter.castShadow = true; g.add(counter);
      const pot = new THREE.Mesh(GEO.pot, MAT.pot);
      pot.position.set(-0.5, 1.35, 0); g.add(pot);
    } else if (kind === 'pumpkin') {
      const p = new THREE.Mesh(GEO.pumpkin, MAT.pumpkin);
      p.scale.y = 0.8; p.position.y = 0.45; p.castShadow = true; g.add(p);
      const stem = new THREE.Mesh(GEO.stem, leaf);
      stem.position.y = 0.95; g.add(stem);
    }
    return g;
  }

  _spawnScenery(random) {
    const stage = this.stageIndex;
    const kinds = stage === 0 ? ['tree', 'haystack', 'fencepost', 'pumpkin']
      : stage === 1 ? ['barnwall', 'haystack', 'fencepost', 'pumpkin']
      : ['counter', 'cabinet', 'kitchenwall', 'pumpkin'];
    const side = random() < 0.5 ? -1 : 1;
    const kind = kinds[Math.floor(random() * kinds.length)];
    const mesh = this._makeSceneryProp(kind);
    const x = side * (7.5 + random() * 6);
    mesh.position.set(x, 0, 78);
    this.scene.add(mesh);
    this.scenery.push({ mesh, speed: 1 });
  }

  update(dt, speed, random) {
    this.sleeperOffset = (this.sleeperOffset + speed * dt) % (this.sleeperCount * 1.9);
    this._layoutSleepers(this.sleeperOffset);
    this._layoutFence(this.sleeperOffset * 0.53);
    for (const cloud of this.clouds.children) {
      cloud.position.x += dt * 0.25;
      if (cloud.position.x > 42) cloud.position.x = -42;
    }
    this.spawnClock -= dt;
    if (this.spawnClock <= 0) {
      this.spawnClock = 1.1 + random() * 1.4;
      this._spawnScenery(random);
    }
    for (let i = this.scenery.length - 1; i >= 0; i -= 1) {
      const item = this.scenery[i];
      item.mesh.position.z -= speed * dt;
      if (item.mesh.position.z < -14) {
        this.scene.remove(item.mesh);
        this.scenery.splice(i, 1);
      }
    }
  }

  reset(random) {
    for (const item of this.scenery) this.scene.remove(item.mesh);
    this.scenery = [];
    // Clouds drift during the title idle before staging; put them home so a
    // seeded run always starts from the same sky.
    for (const cloud of this.clouds.children) cloud.position.x = cloud.userData.baseX;
    this.spawnClock = 0;
    this.sleeperOffset = 0;
    this._layoutSleepers(0);
    this._layoutFence(0);
    this.setStage(0, random);
  }
}
