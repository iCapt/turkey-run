// coins.js — corn kernels: the collectible. Spawned in lines and arcs, spun and
// bobbed, collected when the turkey runs through them. One job: corn only.

import * as THREE from 'three';
import { LANES } from './config.js';

// How close (in metres along the track) a kernel must be to count as eaten.
const COLLECT_Z = 1.1;

export class Coins {
  constructor(scene, rng) {
    this.scene = scene;
    this.rng = rng;
    this.group = new THREE.Group();
    scene.add(this.group);
    this.items = [];
    this.spawnT = 0;
  }

  reset() {
    for (const it of this.items) this.group.remove(it.mesh);
    this.items = [];
    this.spawnT = 0;
  }

  makeCorn() {
    const g = new THREE.Group();
    const kernel = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.16, 0.3, 4, 10),
      new THREE.MeshStandardMaterial({ color: 0xf2c230, roughness: 0.5 }),
    );
    kernel.castShadow = true;
    g.add(kernel);
    const leafMat = new THREE.MeshStandardMaterial({ color: 0x4a7a2a, roughness: 0.9 });
    const leafL = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.4, 0.16), leafMat);
    leafL.position.set(-0.14, -0.1, 0);
    leafL.rotation.z = 0.5;
    g.add(leafL);
    const leafR = leafL.clone();
    leafR.position.x = 0.14;
    leafR.rotation.z = -0.5;
    g.add(leafR);
    return g;
  }

  spawnLine(lane, z, count, arc) {
    for (let i = 0; i < count; i++) {
      const mesh = this.makeCorn();
      const zz = z - i * 2.2;
      const y = arc ? 0.9 + Math.sin((i / (count - 1)) * Math.PI) * 0.9 : 0.9;
      mesh.position.set(LANES[lane], y, zz);
      this.group.add(mesh);
      this.items.push({ mesh, lane, z: zz, y, spin: this.rng() * Math.PI * 2 });
    }
  }

  update(dt, speed, distance, events, turkey) {
    this.spawnT += dt;
    if (this.spawnT > 1.7) {
      this.spawnT = 0;
      const lane = Math.floor(this.rng() * 3);
      const arc = this.rng() < 0.35;
      this.spawnLine(lane, -70, arc ? 5 : 4, arc);
    }
    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i];
      it.z += speed * dt;
      it.mesh.position.z = it.z;
      it.spin += dt * 3;
      it.mesh.rotation.y = it.spin;
      it.mesh.position.y = it.y + Math.sin(it.spin * 0.7) * 0.08;
      if (Math.abs(it.z) < COLLECT_Z && it.lane === turkey.lane && turkey.y < 1.6) {
        this.group.remove(it.mesh);
        this.items.splice(i, 1);
        if (events) events.push({ type: 'coin' });
        continue;
      }
      if (it.z > 16) {
        this.group.remove(it.mesh);
        this.items.splice(i, 1);
      }
    }
  }
}
