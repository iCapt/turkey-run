// track.js — the world the turkey runs through: sky, ground, props and the kitchen.
// One job: build the scenery and scroll it. It owns the four-band gradient sky,
// the per-stage palettes, the farm props and the permanent kitchen interior room.

import * as THREE from 'three';
import { STAGES, stageAt, stageIndexAt, mulberry32, clamp } from './config.js';

function skyTexture(bands) {
  const c = document.createElement('canvas');
  c.width = 4;
  c.height = 256;
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, bands[0]);
  grad.addColorStop(0.42, bands[1]);
  grad.addColorStop(0.72, bands[2]);
  grad.addColorStop(1, bands[3]);
  g.fillStyle = grad;
  g.fillRect(0, 0, 4, 256);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function groundTexture(kind) {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 256;
  const g = c.getContext('2d');
  if (kind === 'kitchen') {
    // Red and cream checkerboard, one tile per 32 px.
    for (let y = 0; y < 8; y++) {
      for (let x = 0; x < 8; x++) {
        g.fillStyle = (x + y) % 2 === 0 ? '#b3402e' : '#f2e3c8';
        g.fillRect(x * 32, y * 32, 32, 32);
      }
    }
    g.strokeStyle = 'rgba(0,0,0,0.12)';
    for (let i = 0; i <= 8; i++) {
      g.beginPath(); g.moveTo(i * 32, 0); g.lineTo(i * 32, 256); g.stroke();
      g.beginPath(); g.moveTo(0, i * 32); g.lineTo(256, i * 32); g.stroke();
    }
  } else {
    // Dirt track down the middle, grass at the sides, lane dashes.
    g.fillStyle = kind === 'barn' ? '#6b4a2a' : '#7d9b4a';
    g.fillRect(0, 0, 256, 256);
    g.fillStyle = kind === 'barn' ? '#8a5a34' : '#b98a4a';
    g.fillRect(64, 0, 128, 256);
    g.fillStyle = 'rgba(255,255,255,0.55)';
    g.fillRect(100, 0, 4, 40);
    g.fillRect(152, 0, 4, 40);
    g.fillStyle = 'rgba(0,0,0,0.08)';
    for (let i = 0; i < 40; i++) {
      g.fillRect(Math.random() * 256, Math.random() * 256, 3, 3);
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(3, 8);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function box(w, h, d, color, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(
    new THREE.BoxGeometry(w, h, d),
    new THREE.MeshStandardMaterial({ color, roughness: 0.9 }),
  );
  m.position.set(x, y, z);
  m.receiveShadow = true;
  m.castShadow = true;
  return m;
}

export class Track {
  constructor(scene, rng) {
    this.scene = scene;
    this.rng = rng || mulberry32(7);
    this.distance = 0;
    this.stageIndex = 0;

    // Sky: a four-band gradient painted on a canvas, swapped per stage.
    // (applyStage runs at the end of the constructor, once the ground, the
    // clouds and the kitchen room exist.)
    this.skyTex = null;

    // Sun: a warm disc low on the horizon, always in frame.
    const sunCanvas = document.createElement('canvas');
    sunCanvas.width = 128;
    sunCanvas.height = 128;
    const sg = sunCanvas.getContext('2d');
    const radial = sg.createRadialGradient(64, 64, 8, 64, 64, 64);
    radial.addColorStop(0, 'rgba(255,236,180,1)');
    radial.addColorStop(0.5, 'rgba(255,190,90,0.85)');
    radial.addColorStop(1, 'rgba(255,190,90,0)');
    sg.fillStyle = radial;
    sg.fillRect(0, 0, 128, 128);
    const sunTex = new THREE.CanvasTexture(sunCanvas);
    this.sun = new THREE.Mesh(
      new THREE.PlaneGeometry(14, 14),
      new THREE.MeshBasicMaterial({ map: sunTex, transparent: true, depthWrite: false }),
    );
    this.sun.position.set(-14, 16, -90);
    scene.add(this.sun);

    // Ground: one long plane whose texture scrolls with the run.
    this.groundTex = groundTexture('farm');
    this.ground = new THREE.Mesh(
      new THREE.PlaneGeometry(70, 220),
      new THREE.MeshStandardMaterial({ map: this.groundTex, roughness: 1 }),
    );
    this.ground.rotation.x = -Math.PI / 2;
    this.ground.position.set(0, -0.02, -80);
    this.ground.receiveShadow = true;
    scene.add(this.ground);

    // Clouds: flat white blobs drifting over the farmyard and barn.
    this.clouds = new THREE.Group();
    scene.add(this.clouds);
    const cloudMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1 });
    for (let i = 0; i < 7; i++) {
      const puff = new THREE.Group();
      for (let j = 0; j < 3; j++) {
        const s = new THREE.Mesh(new THREE.SphereGeometry(2.2 + this.rng() * 1.6, 10, 8), cloudMat);
        s.position.set(j * 2.4 - 2.4, (this.rng() - 0.5) * 0.8, 0);
        s.scale.y = 0.45;
        puff.add(s);
      }
      puff.position.set((this.rng() - 0.5) * 70, 20 + this.rng() * 10, -30 - this.rng() * 60);
      this.clouds.add(puff);
    }

    // Props pool: farm dressing that scrolls past and recycles ahead.
    this.props = new THREE.Group();
    scene.add(this.props);
    this.propItems = [];
    for (let i = 0; i < 26; i++) {
      const item = this.makeProp();
      item.position.z = -10 - this.rng() * 150;
      this.props.add(item);
      this.propItems.push(item);
    }

    // The kitchen: a permanent interior room, hidden until stage three.
    this.kitchenRoom = this.buildKitchenRoom();
    this.kitchenRoom.visible = false;
    scene.add(this.kitchenRoom);

    this.groundOffset = 0;
    this.applyStage(0, true);
  }

  makeProp() {
    const kind = this.rng();
    const g = new THREE.Group();
    if (kind < 0.3) {
      // Hay bale: a squat golden cylinder on its side.
      const bale = new THREE.Mesh(
        new THREE.CylinderGeometry(0.9, 0.9, 1.1, 14),
        new THREE.MeshStandardMaterial({ color: 0xd9a83a, roughness: 1 }),
      );
      bale.rotation.z = Math.PI / 2;
      bale.position.y = 0.9;
      bale.castShadow = true;
      g.add(bale);
    } else if (kind < 0.55) {
      // Fence post pair with two rails.
      g.add(box(0.14, 1.1, 0.14, 0x6b4a2a, -0.9, 0.55, 0));
      g.add(box(0.14, 1.1, 0.14, 0x6b4a2a, 0.9, 0.55, 0));
      g.add(box(2, 0.1, 0.08, 0x8a6a3a, 0, 0.95, 0));
      g.add(box(2, 0.1, 0.08, 0x8a6a3a, 0, 0.55, 0));
    } else if (kind < 0.75) {
      // Pumpkin: an orange squashed sphere with a stem.
      const p = new THREE.Mesh(
        new THREE.SphereGeometry(0.55, 14, 10),
        new THREE.MeshStandardMaterial({ color: 0xe07b1f, roughness: 0.8 }),
      );
      p.scale.y = 0.75;
      p.position.y = 0.4;
      p.castShadow = true;
      g.add(p);
      g.add(box(0.08, 0.25, 0.08, 0x4a6b2a, 0, 0.85, 0));
    } else if (kind < 0.9) {
      // Tree: trunk and two green blobs.
      const trunk = new THREE.Mesh(
        new THREE.CylinderGeometry(0.18, 0.24, 1.6, 8),
        new THREE.MeshStandardMaterial({ color: 0x6b4a2a, roughness: 1 }),
      );
      trunk.position.y = 0.8;
      trunk.castShadow = true;
      g.add(trunk);
      const leaf = new THREE.MeshStandardMaterial({ color: 0x4a7a2a, roughness: 1 });
      const c1 = new THREE.Mesh(new THREE.SphereGeometry(1.3, 12, 10), leaf);
      c1.position.y = 2.4;
      c1.castShadow = true;
      g.add(c1);
      const c2 = new THREE.Mesh(new THREE.SphereGeometry(0.9, 12, 10), leaf);
      c2.position.set(0.7, 1.9, 0.3);
      g.add(c2);
    } else {
      // Red barn: a box with a pitched roof, far off the track.
      g.add(box(4.5, 3, 4, 0x9c2b1e, 0, 1.5, 0));
      const roof = new THREE.Mesh(
        new THREE.ConeGeometry(3.6, 1.8, 4),
        new THREE.MeshStandardMaterial({ color: 0x5a2a1a, roughness: 0.95 }),
      );
      roof.position.y = 3.9;
      roof.rotation.y = Math.PI / 4;
      roof.castShadow = true;
      g.add(roof);
      g.add(box(1.2, 1.8, 0.1, 0x3a1a10, 0, 0.9, 2.05));
    }
    const side = this.rng() < 0.5 ? -1 : 1;
    g.position.x = side * (4.5 + this.rng() * 9);
    return g;
  }

  buildKitchenRoom() {
    const room = new THREE.Group();
    // Checkered floor, long enough to fill the view down the corridor.
    const floorTex = groundTexture('kitchen');
    floorTex.repeat.set(4, 24);
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(16, 160),
      new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.9 }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(0, 0, -60);
    floor.receiveShadow = true;
    room.add(floor);
    this.kitchenFloorTex = floorTex;

    // Cream walls both sides, red trim stripe along the top.
    for (const side of [-1, 1]) {
      room.add(box(0.5, 7, 160, 0xf2e3c8, side * 8, 3.5, -60));
      room.add(box(0.55, 0.5, 160, 0xb3402e, side * 8, 6.6, -60));
      room.add(box(0.55, 0.35, 160, 0x8a5a34, side * 8, 0.18, -60));
    }
    // Far end wall, pale cream, closes the corridor.
    room.add(box(16.5, 7, 0.5, 0xeadfc2, 0, 3.5, -140));

    // Cabinets: cream boxes with red doors, lining both walls, topped with pots.
    for (const side of [-1, 1]) {
      for (let i = 0; i < 5; i++) {
        const z = -12 - i * 22;
        room.add(box(1.1, 2.4, 3.2, 0xf2e3c8, side * 7.1, 1.2, z));
        room.add(box(0.12, 1.9, 2.6, 0xb3402e, side * 6.5, 1.2, z));
        room.add(box(0.12, 0.9, 1.1, 0x8a2a1e, side * 6.5, 1.5, z - 0.6));
        room.add(box(0.12, 0.9, 1.1, 0x8a2a1e, side * 6.5, 1.5, z + 0.6));
        const pot = new THREE.Mesh(
          new THREE.CylinderGeometry(0.45, 0.38, 0.5, 12),
          new THREE.MeshStandardMaterial({ color: 0x2a2a2a, roughness: 0.6, metalness: 0.4 }),
        );
        pot.position.set(side * 7.1, 2.65, z);
        pot.castShadow = true;
        room.add(pot);
      }
    }

    // A pie dish and a rolling pin on the near cabinet, for scale.
    room.add(box(1.4, 0.25, 1.4, 0xc98a4a, -7.1, 2.55, -6));
    const pin = new THREE.Mesh(
      new THREE.CylinderGeometry(0.12, 0.12, 1.4, 10),
      new THREE.MeshStandardMaterial({ color: 0xd9b48a, roughness: 0.8 }),
    );
    pin.rotation.z = Math.PI / 2;
    pin.position.set(7.1, 2.55, -8);
    room.add(pin);
    return room;
  }

  applyStage(index, force = false) {
    if (index === this.stageIndex && !force) return;
    this.stageIndex = index;
    const s = STAGES[index];
    if (this.skyTex) this.skyTex.dispose();
    this.skyTex = skyTexture(s.sky);
    this.scene.background = this.skyTex;
    this.scene.fog = new THREE.Fog(s.fog, s.fogNear, s.fogFar);
    const kind = index === 2 ? 'kitchen' : index === 1 ? 'barn' : 'farm';
    if (this.groundTex) this.groundTex.dispose();
    this.groundTex = groundTexture(kind);
    this.ground.material.map = this.groundTex;
    this.ground.material.needsUpdate = true;
    this.kitchenRoom.visible = index === 2;
    this.clouds.visible = index !== 2;
    this.sun.visible = index !== 2;
  }

  update(dt, distance, speed) {
    this.distance = distance;
    this.applyStage(stageIndexAt(distance));
    // Scroll the ground texture so the world reads as moving.
    this.groundOffset += (speed * dt) / 32;
    this.groundTex.offset.y = this.groundOffset % 1;
    if (this.kitchenRoom.visible) {
      this.kitchenFloorTex.offset.y = (this.groundOffset * 1.4) % 1;
    }
    // Props drift toward the camera and recycle far ahead.
    for (const item of this.propItems) {
      item.position.z += speed * dt;
      if (item.position.z > 14) {
        item.position.z = -150 - this.rng() * 20;
        const side = this.rng() < 0.5 ? -1 : 1;
        item.position.x = side * (4.5 + this.rng() * 9);
      }
    }
    for (const cloud of this.clouds.children) {
      cloud.position.x += dt * 0.4;
      if (cloud.position.x > 45) cloud.position.x = -45;
    }
    this.sun.position.y = 16 + Math.sin(distance * 0.002) * 2;
  }
}
