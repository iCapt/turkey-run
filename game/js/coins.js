// Turkey Run 3D — corn coins and power-up pickups on the track.
// One job: spawn collectible lines/arcs, spin them, hand out what the turkey grabs.
import * as THREE from 'three';
import { LANES, DESPAWN_BEHIND, COLLECT_Z } from './config.js';

const POWERUP_DEFS = {
  tray: { icon: '🍳', name: 'TRAY BOARD', color: 0xe8c84a },
  feather: { icon: '🪶', name: 'MAGNET FEATHER', color: 0xffffff },
  pie: { icon: '🥧', name: 'SLOW-MO PIE', color: 0xe8722a },
  heart: { icon: '❤️', name: 'EXTRA HEART', color: 0xd23b2e },
};

function cornMesh() {
  const g = new THREE.Group();
  const cob = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.16, 0.34, 4, 10),
    new THREE.MeshStandardMaterial({ color: 0xf2b705, roughness: 0.5, emissive: 0x664400, emissiveIntensity: 0.35 }),
  );
  cob.rotation.x = Math.PI / 2;
  g.add(cob);
  const tip = new THREE.Mesh(
    new THREE.ConeGeometry(0.1, 0.18, 8),
    new THREE.MeshStandardMaterial({ color: 0x4a7c2f, roughness: 0.8 }),
  );
  tip.position.set(0, 0.05, -0.32);
  tip.rotation.x = -Math.PI / 2;
  g.add(tip);
  return g;
}

function powerupMesh(kind) {
  const g = new THREE.Group();
  const def = POWERUP_DEFS[kind];
  const glow = new THREE.Mesh(
    new THREE.TorusGeometry(0.55, 0.06, 8, 24),
    new THREE.MeshStandardMaterial({ color: def.color, emissive: def.color, emissiveIntensity: 0.9 }),
  );
  g.add(glow);
  if (kind === 'tray') {
    const tray = new THREE.Mesh(
      new THREE.BoxGeometry(0.9, 0.08, 0.6),
      new THREE.MeshStandardMaterial({ color: 0x8a8f96, roughness: 0.35, metalness: 0.7 }),
    );
    tray.rotation.x = 0.35;
    g.add(tray);
  } else if (kind === 'feather') {
    const f = new THREE.Mesh(
      new THREE.ConeGeometry(0.16, 0.7, 8),
      new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6 }),
    );
    f.rotation.z = 0.6;
    g.add(f);
  } else if (kind === 'pie') {
    const pie = new THREE.Mesh(
      new THREE.CylinderGeometry(0.34, 0.3, 0.18, 14),
      new THREE.MeshStandardMaterial({ color: 0xc47f3e, roughness: 0.8 }),
    );
    g.add(pie);
    const crust = new THREE.Mesh(
      new THREE.TorusGeometry(0.32, 0.07, 8, 16),
      new THREE.MeshStandardMaterial({ color: 0xe8c84a, roughness: 0.8 }),
    );
    crust.rotation.x = Math.PI / 2;
    crust.position.y = 0.1;
    g.add(crust);
  } else if (kind === 'heart') {
    const m = new THREE.MeshStandardMaterial({ color: 0xd23b2e, roughness: 0.5, emissive: 0x550000, emissiveIntensity: 0.5 });
    const s1 = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 10), m);
    s1.position.set(-0.16, 0.12, 0);
    const s2 = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 10), m);
    s2.position.set(0.16, 0.12, 0);
    const cone = new THREE.Mesh(new THREE.ConeGeometry(0.32, 0.5, 4), m);
    cone.rotation.x = Math.PI; cone.rotation.y = Math.PI / 4;
    cone.position.set(0, -0.12, 0);
    g.add(s1); g.add(s2); g.add(cone);
  }
  return g;
}

export class Coins {
  constructor(scene) {
    this.scene = scene;
    this.list = [];
    this.spawnClock = 0;
    this.lineId = 0;
    this.lineSizes = new Map();
  }

  reset() {
    for (const c of this.list) this.scene.remove(c.mesh);
    this.list = [];
    this.lineSizes.clear();
    this.spawnClock = 0.6;
  }

  _spawnLine(random, zBase) {
    const lane = Math.floor(random() * 3);
    const id = this.lineId;
    this.lineId += 1;
    this.lineSizes.set(id, 6);
    for (let i = 0; i < 6; i += 1) {
      const mesh = cornMesh();
      mesh.position.set(LANES[lane], 0.7, zBase + i * 1.4);
      this.scene.add(mesh);
      this.list.push({ mesh, lane, z: zBase + i * 1.4, y: 0.7, kind: 'corn', lineId: id, bob: random() * Math.PI * 2 });
    }
  }

  _spawnArc(random, zBase) {
    const lane = Math.floor(random() * 3);
    const id = this.lineId;
    this.lineId += 1;
    this.lineSizes.set(id, 5);
    for (let i = 0; i < 5; i += 1) {
      const t = i / 4;
      const y = 0.7 + Math.sin(t * Math.PI) * 1.5;
      const mesh = cornMesh();
      mesh.position.set(LANES[lane], y, zBase + i * 1.5);
      this.scene.add(mesh);
      this.list.push({ mesh, lane, z: zBase + i * 1.5, y, kind: 'corn', lineId: id, bob: 0 });
    }
  }

  _spawnPowerup(random, zBase) {
    const kinds = ['tray', 'feather', 'pie', 'heart'];
    const kind = kinds[Math.floor(random() * kinds.length)];
    const lane = Math.floor(random() * 3);
    const mesh = powerupMesh(kind);
    mesh.position.set(LANES[lane], 1.1, zBase);
    this.scene.add(mesh);
    this.list.push({ mesh, lane, z: zBase, y: 1.1, kind, lineId: -1, bob: random() * Math.PI * 2 });
  }

  update(dt, speed, random, time) {
    this.spawnClock -= dt * speed;
    if (this.spawnClock <= 0) {
      const roll = random();
      if (roll < 0.55) this._spawnLine(random, 78);
      else if (roll < 0.8) this._spawnArc(random, 78);
      else this._spawnPowerup(random, 78);
      this.spawnClock = 13 + random() * 8;
    }
    for (let i = this.list.length - 1; i >= 0; i -= 1) {
      const c = this.list[i];
      c.z -= speed * dt;
      c.mesh.position.z = c.z;
      c.mesh.rotation.y += dt * 2.4;
      if (c.kind === 'corn') c.mesh.position.y = c.y + Math.sin(time * 2 + c.bob) * 0.08;
      if (c.z < DESPAWN_BEHIND) {
        this.scene.remove(c.mesh);
        this.list.splice(i, 1);
      }
    }
  }

  // Collect what the turkey touches. Returns { corn, lines, powerup }.
  collect(turkey, magnet) {
    const out = { corn: 0, lines: 0, powerup: null };
    const reach = magnet ? 2.6 : 0.85;
    for (let i = this.list.length - 1; i >= 0; i -= 1) {
      const c = this.list[i];
      if (Math.abs(c.z) > COLLECT_Z + 0.4) continue;
      const laneDx = Math.abs(LANES[c.lane] - LANES[turkey.lane]);
      const close = magnet ? laneDx <= 2.6 && Math.abs(c.z) < 3.5 : laneDx < 0.1;
      const yOk = c.kind === 'corn' ? Math.abs(turkey.y + 0.7 - c.y) < 1.1 : Math.abs(turkey.y + 0.9 - c.y) < 1.4;
      if (close && yOk) {
        this.scene.remove(c.mesh);
        this.list.splice(i, 1);
        if (c.kind === 'corn') {
          out.corn += 1;
          if (c.lineId >= 0) {
            const left = (this.lineSizes.get(c.lineId) || 1) - 1;
            this.lineSizes.set(c.lineId, left);
            if (left <= 0) out.lines += 1;
          }
        } else {
          out.powerup = c.kind;
        }
      }
    }
    return out;
  }

  // Test helper / screenshot staging: place a coin line right ahead.
  placeLineAhead(lane, zStart) {
    const id = this.lineId;
    this.lineId += 1;
    this.lineSizes.set(id, 6);
    for (let i = 0; i < 6; i += 1) {
      const mesh = cornMesh();
      mesh.position.set(LANES[lane], 0.7, zStart + i * 1.4);
      this.scene.add(mesh);
      this.list.push({ mesh, lane, z: zStart + i * 1.4, y: 0.7, kind: 'corn', lineId: id, bob: 0 });
    }
  }

  placePowerupAhead(kind, lane, z) {
    const mesh = powerupMesh(kind);
    mesh.position.set(LANES[lane], 1.1, z);
    this.scene.add(mesh);
    this.list.push({ mesh, lane, z, y: 1.1, kind, lineId: -1, bob: 0 });
  }
}

export { POWERUP_DEFS };
