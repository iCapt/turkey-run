// Turkey Run 3D — the world the turkey runs through: track, rails, sky and scenery.
// One job: the ground under the run and the stage dressing that scrolls past.
import * as THREE from 'three';
import { STAGES, LANES } from './config.js';

function groundTexture(baseColor, speckleColor, tile) {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = baseColor;
  g.fillRect(0, 0, 256, 256);
  if (tile) {
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
    g.globalAlpha = 0.05 + Math.random() * 0.07;
    const r = 1 + Math.random() * 2.5;
    g.beginPath(); g.arc(Math.random() * 256, Math.random() * 256, r, 0, Math.PI * 2); g.fill();
  }
  g.globalAlpha = 1;
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping; tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(6, 24);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export class Track {
  constructor(scene) {
    this.scene = scene;
    this.stageIndex = 0;
    this.sleeperOffset = 0;
    this.scenery = [];
    this.spawnClock = 0;
    this.random = Math.random;
    this._buildLights();
    this._buildGround();
    this._buildRails();
    this._buildSky();
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
        const s = new THREE.Mesh(new THREE.SphereGeometry(2.2 + Math.random() * 1.6, 10, 8), cloudMat);
        s.scale.y = 0.45;
        s.position.set(i * 2.6 - 2.6, (Math.random() - 0.5) * 0.6, (Math.random() - 0.5) * 1.2);
        puff.add(s);
      }
      puff.position.set(x, y, z);
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
    this.scene.background = new THREE.Color(st.sky);
    this.scene.fog = new THREE.Fog(st.fog, 26, 95);
    this.groundMat.map = groundTexture(`#${st.ground.toString(16).padStart(6, '0')}`, '#000000', index === 2);
    this.groundMat.needsUpdate = true;
    this.bedMat.map = groundTexture(`#${st.track.toString(16).padStart(6, '0')}`, '#ffffff', false);
    this.bedMat.needsUpdate = true;
    this.ovenGlow.intensity = index === 2 ? 60 : 0;
    // Clear old scenery; fresh dressing spawns as the run continues.
    for (const item of this.scenery) this.scene.remove(item.mesh);
    this.scenery = [];
    this.spawnClock = 0;
  }

  _makeSceneryProp(kind) {
    const g = new THREE.Group();
    const wood = new THREE.MeshStandardMaterial({ color: 0x7a5a30, roughness: 1 });
    const leaf = new THREE.MeshStandardMaterial({ color: 0x4a7c2f, roughness: 1 });
    const leaf2 = new THREE.MeshStandardMaterial({ color: 0xd98e2b, roughness: 1 });
    const hay = new THREE.MeshStandardMaterial({ color: 0xe8c84a, roughness: 1 });
    const red = new THREE.MeshStandardMaterial({ color: 0xa63a2a, roughness: 0.9 });
    if (kind === 'tree') {
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.3, 1.6, 8), wood);
      trunk.position.y = 0.8; trunk.castShadow = true; g.add(trunk);
      const crown = new THREE.Mesh(new THREE.ConeGeometry(1.5, 3.2, 8), Math.random() < 0.5 ? leaf : leaf2);
      crown.position.y = 3.0; crown.castShadow = true; g.add(crown);
    } else if (kind === 'haystack') {
      const bale = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 1.4, 12), hay);
      bale.rotation.z = Math.PI / 2; bale.position.y = 0.9; bale.castShadow = true; g.add(bale);
    } else if (kind === 'fencepost') {
      for (let i = 0; i < 3; i += 1) {
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.16, 1.1, 0.16), wood);
        post.position.set(i * 1.4 - 1.4, 0.55, 0); post.castShadow = true; g.add(post);
      }
      const rail = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.12, 0.08), wood);
      rail.position.y = 0.85; g.add(rail);
    } else if (kind === 'barnwall') {
      const wall = new THREE.Mesh(new THREE.BoxGeometry(3.4, 4.2, 0.3), red);
      wall.position.y = 2.1; wall.castShadow = true; g.add(wall);
      const roof = new THREE.Mesh(new THREE.ConeGeometry(2.6, 1.4, 4), wood);
      roof.position.y = 4.9; roof.rotation.y = Math.PI / 4; g.add(roof);
    } else if (kind === 'counter') {
      const counter = new THREE.Mesh(new THREE.BoxGeometry(2.6, 1.1, 1.2), new THREE.MeshStandardMaterial({ color: 0x8a6b4a, roughness: 0.8 }));
      counter.position.y = 0.55; counter.castShadow = true; g.add(counter);
      const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.3, 0.5, 12), new THREE.MeshStandardMaterial({ color: 0x3a3a3a, roughness: 0.4, metalness: 0.6 }));
      pot.position.set(-0.5, 1.35, 0); g.add(pot);
    } else if (kind === 'pumpkin') {
      const p = new THREE.Mesh(new THREE.SphereGeometry(0.55, 12, 10), new THREE.MeshStandardMaterial({ color: 0xe8722a, roughness: 0.7 }));
      p.scale.y = 0.8; p.position.y = 0.45; p.castShadow = true; g.add(p);
      const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 0.35, 6), leaf);
      stem.position.y = 0.95; g.add(stem);
    }
    return g;
  }

  _spawnScenery(random) {
    const stage = this.stageIndex;
    const kinds = stage === 0 ? ['tree', 'haystack', 'fencepost', 'pumpkin']
      : stage === 1 ? ['barnwall', 'haystack', 'fencepost', 'pumpkin']
      : ['counter', 'barnwall', 'pumpkin'];
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
    this.spawnClock = 0;
    this.sleeperOffset = 0;
    this._layoutSleepers(0);
    this._layoutFence(0);
    this.setStage(0, random);
  }
}
