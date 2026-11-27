// Turkey Run 3D — the farmer: overalls, straw hat, pitchfork, and a grudge.
// One job: the chaser's body and the run cycle that sells how close he is.
import * as THREE from 'three';

function mat(color, rough = 0.9) {
  return new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: 0.02 });
}

export class Farmer {
  constructor() {
    this.group = new THREE.Group();
    this.legL = null; this.legR = null;
    this.armL = null; this.armR = null;
    this.pitchfork = null;
    this.runPhase = 0;
    this._build();
  }

  _build() {
    const skin = mat(0xe8b98a);
    const shirt = mat(0xc0392b);
    const overalls = mat(0x2e5fa3);
    const straw = mat(0xe8c84a, 0.95);
    const dark = mat(0x4a2c14);
    const steel = new THREE.MeshStandardMaterial({ color: 0xb8c0c8, roughness: 0.35, metalness: 0.7 });

    // Legs (overalls).
    const legGeo = new THREE.CylinderGeometry(0.13, 0.15, 0.85, 10);
    this.legL = new THREE.Group();
    const ll = new THREE.Mesh(legGeo, overalls); ll.position.y = 0.42; ll.castShadow = true;
    const bootL = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.14, 0.42), dark);
    bootL.position.set(0, 0.07, 0.08);
    this.legL.add(ll); this.legL.add(bootL);
    this.legL.position.set(-0.22, 0, 0);
    this.group.add(this.legL);
    this.legR = new THREE.Group();
    const lr = new THREE.Mesh(legGeo, overalls); lr.position.y = 0.42; lr.castShadow = true;
    const bootR = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.14, 0.42), dark);
    bootR.position.set(0, 0.07, 0.08);
    this.legR.add(lr); this.legR.add(bootR);
    this.legR.position.set(0.22, 0, 0);
    this.group.add(this.legR);

    // Torso: red shirt + overall bib.
    const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.5, 0.85, 12), shirt);
    torso.position.y = 1.28; torso.castShadow = true;
    this.group.add(torso);
    const bib = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.5, 0.12), overalls);
    bib.position.set(0, 1.32, 0.42);
    this.group.add(bib);
    const strapGeo = new THREE.BoxGeometry(0.12, 0.55, 0.06);
    const strapL = new THREE.Mesh(strapGeo, overalls); strapL.position.set(-0.22, 1.62, 0.42);
    const strapR = new THREE.Mesh(strapGeo, overalls); strapR.position.set(0.22, 1.62, 0.42);
    this.group.add(strapL); this.group.add(strapR);

    // Arms.
    const armGeo = new THREE.CylinderGeometry(0.1, 0.11, 0.7, 10);
    this.armL = new THREE.Group();
    const al = new THREE.Mesh(armGeo, shirt); al.position.y = -0.32; al.castShadow = true;
    this.armL.add(al);
    this.armL.position.set(-0.55, 1.62, 0);
    this.group.add(this.armL);
    this.armR = new THREE.Group();
    const ar = new THREE.Mesh(armGeo, shirt); ar.position.y = -0.32; ar.castShadow = true;
    this.armR.add(ar);
    this.armR.position.set(0.55, 1.62, 0);
    this.group.add(this.armR);

    // Head: skin, big nose, moustache, angry brows.
    const head = new THREE.Group();
    const skull = new THREE.Mesh(new THREE.SphereGeometry(0.32, 16, 12), skin);
    skull.castShadow = true;
    head.add(skull);
    const nose = new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 8), skin);
    nose.position.set(0, -0.04, 0.3);
    head.add(nose);
    const mo = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.07, 0.08), mat(0x3a2a1a));
    mo.position.set(0, -0.14, 0.28);
    head.add(mo);
    const browGeo = new THREE.BoxGeometry(0.13, 0.05, 0.05);
    const browL = new THREE.Mesh(browGeo, mat(0x3a2a1a)); browL.position.set(-0.13, 0.12, 0.27); browL.rotation.z = 0.35;
    const browR = new THREE.Mesh(browGeo, mat(0x3a2a1a)); browR.position.set(0.13, 0.12, 0.27); browR.rotation.z = -0.35;
    head.add(browL); head.add(browR);
    // Straw hat: brim + dome.
    const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.52, 0.55, 0.05, 16), straw);
    brim.position.y = 0.22;
    head.add(brim);
    const dome = new THREE.Mesh(new THREE.ConeGeometry(0.32, 0.3, 16), straw);
    dome.position.y = 0.36;
    head.add(dome);
    head.position.set(0, 2.0, 0);
    this.group.add(head);

    // Pitchfork, gripped in the right hand and raised.
    this.pitchfork = new THREE.Group();
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 1.7, 8), mat(0x8a6b3a));
    shaft.position.y = 0.85;
    this.pitchfork.add(shaft);
    for (let i = -1; i <= 1; i += 1) {
      const prong = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.4, 6), steel);
      prong.position.set(i * 0.13, 1.85, 0);
      this.pitchfork.add(prong);
    }
    const cross = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.06, 0.06), steel);
    cross.position.y = 1.68;
    this.pitchfork.add(cross);
    this.pitchfork.position.set(0.62, 1.05, 0.25);
    this.pitchfork.rotation.z = -0.25;
    this.group.add(this.pitchfork);
  }

  // gapNorm: 0 = right on the turkey's tail, 1 = far behind and small.
  update(dt, speedNorm, gapNorm) {
    this.runPhase += dt * (8 + speedNorm * 10);
    const p = this.runPhase;
    const s = Math.sin(p);
    this.group.position.y = Math.abs(s) * 0.1;
    this.group.rotation.x = 0.14;
    this.legL.rotation.x = s * 1.0;
    this.legR.rotation.x = -s * 1.0;
    this.armL.rotation.x = -s * 0.8;
    this.armR.rotation.x = s * 0.5 - 0.5;
    this.pitchfork.rotation.x = -0.3 + s * 0.12;
    this.pitchfork.rotation.z = -0.25 - gapNorm * 0.15;
    // The closer he gets, the more he leans in.
    this.group.rotation.x = 0.14 + (1 - gapNorm) * 0.12;
  }
}
