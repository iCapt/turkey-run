// Turkey Runner — the hero turkey, built from primitives, no borrowed art.
// One job: the turkey's body and its run / jump / roll / hoverboard poses.
import * as THREE from 'three';

function mat(color, rough = 0.85) {
  return new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: 0.05 });
}

export class Turkey {
  constructor() {
    this.group = new THREE.Group();
    this.legL = null; this.legR = null;
    this.wingL = null; this.wingR = null;
    this.tail = null; this.body = null; this.head = null;
    this.runPhase = 0;
    this._build();
  }

  _build() {
    const brown = mat(0x8b5a2b);
    const darkBrown = mat(0x6b4226);
    const cream = mat(0xe8d8b0);
    const red = mat(0xd23b2e, 0.6);
    const orange = mat(0xf28c28, 0.6);
    const gold = mat(0xf2b705, 0.7);

    // Body: a plump egg shape, tilted slightly forward.
    this.body = new THREE.Mesh(new THREE.SphereGeometry(0.55, 20, 16), brown);
    this.body.scale.set(1, 0.92, 1.15);
    this.body.position.set(0, 0.85, 0);
    this.body.castShadow = true;
    this.group.add(this.body);

    // Breast patch.
    const breast = new THREE.Mesh(new THREE.SphereGeometry(0.38, 16, 12), cream);
    breast.scale.set(0.9, 0.85, 0.7);
    breast.position.set(0, 0.78, 0.32);
    this.group.add(breast);

    // Tail fan: five feathers fanned up behind.
    this.tail = new THREE.Group();
    const fanColors = [0xd23b2e, 0xf28c28, 0xf2b705, 0x8b5a2b, 0x4a7c2f];
    for (let i = 0; i < 5; i += 1) {
      const feather = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.85, 6), mat(fanColors[i], 0.75));
      feather.scale.set(1, 1, 0.35);
      const angle = (i - 2) * 0.42;
      feather.position.set(Math.sin(angle) * 0.42, 0.62, -0.18);
      feather.rotation.set(-0.5, 0, -angle * 0.9);
      feather.castShadow = true;
      this.tail.add(feather);
    }
    this.tail.position.set(0, 0.95, -0.35);
    this.group.add(this.tail);

    // Head + beak + wattle + eyes.
    this.head = new THREE.Group();
    const skull = new THREE.Mesh(new THREE.SphereGeometry(0.26, 16, 12), mat(0x7a4a22));
    skull.castShadow = true;
    this.head.add(skull);
    const beak = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.3, 8), orange);
    beak.rotation.x = Math.PI / 2;
    beak.position.set(0, -0.02, 0.3);
    this.head.add(beak);
    const wattle = new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 8), red);
    wattle.scale.set(0.7, 1.4, 0.7);
    wattle.position.set(0, -0.2, 0.22);
    this.head.add(wattle);
    const eyeGeo = new THREE.SphereGeometry(0.045, 8, 8);
    const eyeMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.3 });
    const eyeL = new THREE.Mesh(eyeGeo, eyeMat); eyeL.position.set(-0.13, 0.08, 0.2);
    const eyeR = new THREE.Mesh(eyeGeo, eyeMat); eyeR.position.set(0.13, 0.08, 0.2);
    this.head.add(eyeL); this.head.add(eyeR);
    this.head.position.set(0, 1.42, 0.42);
    this.group.add(this.head);

    // Wings: flattened, tucked at the sides.
    const wingGeo = new THREE.SphereGeometry(0.3, 12, 10);
    this.wingL = new THREE.Mesh(wingGeo, darkBrown);
    this.wingL.scale.set(0.35, 0.9, 1.1);
    this.wingL.position.set(-0.52, 0.95, 0.05);
    this.wingL.castShadow = true;
    this.group.add(this.wingL);
    this.wingR = new THREE.Mesh(wingGeo, darkBrown);
    this.wingR.scale.set(0.35, 0.9, 1.1);
    this.wingR.position.set(0.52, 0.95, 0.05);
    this.wingR.castShadow = true;
    this.group.add(this.wingR);

    // Legs: thin orange sticks with flat feet.
    const legGeo = new THREE.CylinderGeometry(0.05, 0.05, 0.5, 8);
    const footGeo = new THREE.BoxGeometry(0.22, 0.05, 0.3);
    this.legL = new THREE.Group();
    const shinL = new THREE.Mesh(legGeo, orange); shinL.position.y = 0.25;
    const footL = new THREE.Mesh(footGeo, orange); footL.position.set(0, 0.02, 0.06);
    this.legL.add(shinL); this.legL.add(footL);
    this.legL.position.set(-0.2, 0, 0);
    this.group.add(this.legL);
    this.legR = new THREE.Group();
    const shinR = new THREE.Mesh(legGeo, orange); shinR.position.y = 0.25;
    const footR = new THREE.Mesh(footGeo, orange); footR.position.set(0, 0.02, 0.06);
    this.legR.add(shinR); this.legR.add(footR);
    this.legR.position.set(0.2, 0, 0);
    this.group.add(this.legR);

    // A little gold neck ring, so the hero reads at a glance.
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.045, 8, 20), gold);
    ring.rotation.x = Math.PI / 2 - 0.25;
    ring.position.set(0, 1.2, 0.42);
    this.group.add(ring);
  }

  // pose: 'run' | 'jump' | 'roll' | 'board' | 'idle' | 'caught'
  update(dt, pose, speedNorm) {
    this.runPhase += dt * (7 + speedNorm * 9);
    const p = this.runPhase;
    const s = Math.sin(p);
    const c = Math.cos(p);
    if (pose === 'run' || pose === 'board') {
      this.group.position.y = Math.abs(s) * 0.08;
      this.group.rotation.x = pose === 'board' ? -0.06 : 0.06;
      this.group.scale.set(1, 1, 1);
      this.legL.rotation.x = s * 0.9;
      this.legR.rotation.x = -s * 0.9;
      this.wingL.rotation.z = 0.25 + c * 0.12;
      this.wingR.rotation.z = -0.25 - c * 0.12;
      this.tail.rotation.x = -0.12 + s * 0.05;
      this.head.position.y = 1.42 + Math.abs(c) * 0.03;
    } else if (pose === 'jump') {
      this.group.rotation.x = -0.12;
      this.group.scale.set(1, 1, 1);
      this.legL.rotation.x = 0.9;
      this.legR.rotation.x = 0.7;
      this.wingL.rotation.z = 0.9;
      this.wingR.rotation.z = -0.9;
      this.tail.rotation.x = -0.3;
    } else if (pose === 'roll') {
      this.group.scale.set(1.05, 0.42, 1.15);
      this.group.rotation.x = 0.35;
      this.legL.rotation.x = 0.2;
      this.legR.rotation.x = 0.2;
      this.wingL.rotation.z = 0.15;
      this.wingR.rotation.z = -0.15;
    } else if (pose === 'caught') {
      this.group.scale.set(1, 1, 1);
      this.group.rotation.x = 0.5;
      this.group.rotation.z = 0.6;
      this.wingL.rotation.z = 1.4;
      this.wingR.rotation.z = -1.4;
      this.legL.rotation.x = 0.4;
      this.legR.rotation.x = -0.3;
    } else { // idle
      this.group.position.y = Math.sin(p * 0.4) * 0.02;
      this.group.rotation.x = 0;
      this.group.scale.set(1, 1, 1);
      this.legL.rotation.x = 0;
      this.legR.rotation.x = 0;
      this.wingL.rotation.z = 0.2 + Math.sin(p * 0.4) * 0.06;
      this.wingR.rotation.z = -0.2 - Math.sin(p * 0.4) * 0.06;
      this.tail.rotation.x = -0.1;
      this.head.rotation.y = Math.sin(p * 0.25) * 0.35;
    }
  }
}
