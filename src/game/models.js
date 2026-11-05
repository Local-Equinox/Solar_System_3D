// The astronaut and spaceship, built from primitives in real metres, so they need no asset files
// and work in any lighting. Both face their local forward: +Z for the astronaut, -Z for the ship.

import {
  BoxGeometry, CapsuleGeometry, CylinderGeometry, Group, LatheGeometry, Mesh, MeshBasicMaterial,
  MeshStandardMaterial, SphereGeometry, Vector2,
} from 'three';

const material = (color, extra = {}) => new MeshStandardMaterial({ color, roughness: 0.55, metalness: 0.08, ...extra });

function part(geometry, mat, x = 0, y = 0, z = 0, parent) {
  const mesh = new Mesh(geometry, mat);
  mesh.position.set(x, y, z);
  parent?.add(mesh);
  return mesh;
}

/** A chibi astronaut 1.8 m tall: oversized helmet, glowing blue visor, red suit bands. */
export function createAstronaut() {
  const root = new Group();
  const suit = material('#eef0f4');
  const trim = material('#c9ced8');
  const dark = material('#2b2f3a', { roughness: 0.4 });
  const red = material('#d8473f');
  const blue = material('#2f8df5');
  const visor = new MeshStandardMaterial({
    color: '#0c3f9e', emissive: '#1f9dff', emissiveIntensity: 0.75, roughness: 0.12, metalness: 0.5,
  });

  part(new CapsuleGeometry(0.3, 0.32, 6, 16), suit, 0, 0.85, 0, root);
  part(new BoxGeometry(0.28, 0.16, 0.05), dark, 0, 0.92, 0.29, root);
  part(new BoxGeometry(0.06, 0.05, 0.02), red, -0.07, 0.93, 0.32, root);
  part(new BoxGeometry(0.06, 0.05, 0.02), blue, 0.07, 0.93, 0.32, root);
  part(new CylinderGeometry(0.31, 0.31, 0.06, 18), trim, 0, 0.66, 0, root);

  const pack = part(new BoxGeometry(0.46, 0.58, 0.24), trim, 0, 0.92, -0.33, root);
  part(new BoxGeometry(0.34, 0.1, 0.03), dark, 0, 0.1, -0.13, pack);

  const head = new Group();
  head.position.y = 1.4;
  root.add(head);
  part(new SphereGeometry(0.4, 28, 20), suit, 0, 0, 0, head);
  const visorMesh = part(new SphereGeometry(0.325, 24, 16), visor, 0, 0.01, 0.125, head);
  visorMesh.scale.set(1, 0.82, 0.86);
  part(new CylinderGeometry(0.08, 0.08, 0.1, 14).rotateZ(Math.PI / 2), blue, 0.4, 0.02, 0, head);
  part(new CylinderGeometry(0.08, 0.08, 0.1, 14).rotateZ(Math.PI / 2), blue, -0.4, 0.02, 0, head);

  const limb = (x, y, length, radius, cuff) => {
    const pivot = new Group();
    pivot.position.set(x, y, 0);
    root.add(pivot);
    part(new CapsuleGeometry(radius, length, 4, 12), suit, 0, -length / 2 - radius * 0.3, 0, pivot);
    part(new CylinderGeometry(radius * 1.08, radius * 1.08, 0.05, 12), red, 0, -length * 0.74, 0, pivot);
    part(cuff, dark, 0, -length - radius, 0.03, pivot);
    return pivot;
  };
  const boot = () => new BoxGeometry(0.21, 0.13, 0.34);
  const glove = () => new SphereGeometry(0.095, 12, 10);
  const armLeft = limb(-0.39, 1.05, 0.36, 0.085, glove());
  const armRight = limb(0.39, 1.05, 0.36, 0.085, glove());
  const legLeft = limb(-0.15, 0.6, 0.34, 0.115, boot());
  const legRight = limb(0.15, 0.6, 0.34, 0.115, boot());
  armLeft.rotation.z = -0.22;
  armRight.rotation.z = 0.22;

  let phase = 0;
  /** @param speed ground speed in m/s; @param airborne true during jumps and falls */
  root.userData.animate = (dt, speed, airborne) => {
    if (airborne) {
      legLeft.rotation.x = 0.5;
      legRight.rotation.x = -0.25;
      armLeft.rotation.x = -0.6;
      armRight.rotation.x = 0.6;
      return;
    }
    phase += dt * Math.min(speed, 9) * 2.1;
    const swing = Math.sin(phase) * Math.min(1, speed / 3) * 0.75;
    legLeft.rotation.x = swing;
    legRight.rotation.x = -swing;
    armLeft.rotation.x = -swing * 0.8;
    armRight.rotation.x = swing * 0.8;
  };
  return root;
}

/** A small explorer ship, 20 m long, nose toward -Z, standing on landing legs at y = 0. */
export function createSpaceship() {
  const root = new Group();
  const hull = material('#dfe3ea', { metalness: 0.35, roughness: 0.38 });
  const panel = material('#7d8798', { metalness: 0.45, roughness: 0.45 });
  const accent = material('#d8473f');
  const canopy = new MeshStandardMaterial({
    color: '#0c3f9e', emissive: '#1f9dff', emissiveIntensity: 0.55, roughness: 0.1, metalness: 0.6,
  });

  const body = new Group();
  body.position.y = 3.5;
  root.add(body);

  const profile = [[0, 10.2], [0.75, 9], [1.55, 6.4], [2.2, 2.5], [2.45, -1.5], [2.25, -6], [1.55, -8.4], [0, -8.4]]
    .map(([radius, along]) => new Vector2(radius, along))
    .reverse(); // LatheGeometry's normals face outward only when the profile climbs
  const fuselage = part(new LatheGeometry(profile, 28).rotateX(-Math.PI / 2), hull, 0, 0, 0, body);
  fuselage.scale.y = 0.82;

  const canopyMesh = part(new SphereGeometry(1.35, 24, 16), canopy, 0, 1.1, -5.2, body);
  canopyMesh.scale.set(0.95, 0.72, 1.9);
  part(new BoxGeometry(5, 0.12, 0.5), accent, 0, 0, -0.5, body);

  const gear = [];
  for (const side of [-1, 1]) {
    const wing = part(new BoxGeometry(6.5, 0.3, 5), hull, side * 5, -0.15, 2.8, body);
    wing.rotation.y = side * -0.42;
    part(new BoxGeometry(5.2, 0.33, 0.45), accent, 0, 0, -1.7, wing);
    part(new CylinderGeometry(0.75, 0.9, 5.4, 16).rotateX(Math.PI / 2), panel, side * 3.15, -0.2, 5.6, body);
    const fin = part(new BoxGeometry(0.22, 2.2, 3.2), hull, side * 7.8, 0.75, 4.4, body);
    fin.rotation.x = 0.3;

    const leg = part(new CylinderGeometry(0.16, 0.2, 3, 8), panel, side * 2.4, -1.9, 4, body);
    leg.rotation.z = side * -0.32;
    gear.push(leg, part(new CylinderGeometry(0.8, 0.9, 0.2, 14), panel, side * 2.95, -3.4, 4, body));
  }
  part(new BoxGeometry(0.22, 2.8, 3.4), hull, 0, 2.7, 5.5, body);
  gear.push(
    part(new CylinderGeometry(0.16, 0.2, 3, 8), panel, 0, -1.9, -5.5, body),
    part(new CylinderGeometry(0.8, 0.9, 0.2, 14), panel, 0, -3.4, -5.5, body),
  );

  // Thruster plumes, stretched by the flight code with thrust.
  const flames = [];
  const flameMaterial = new MeshBasicMaterial({ color: '#7fc8ff', transparent: true, opacity: 0.85, depthWrite: false });
  for (const x of [-3.15, 3.15]) {
    const flame = new Mesh(new CylinderGeometry(0.06, 0.62, 1, 12, 1, true).rotateX(Math.PI / 2).translate(0, 0, 0.5), flameMaterial);
    flame.position.set(x, -0.2, 8.3);
    flame.visible = false;
    body.add(flame);
    flames.push(flame);
  }

  root.userData.setGearDown = (down) => gear.forEach((part) => { part.visible = down; });

  /** @param thrust 0..1 */
  root.userData.setThrust = (thrust) => {
    for (const flame of flames) {
      flame.visible = thrust > 0.02;
      flame.scale.z = 1 + thrust * 9;
    }
  };
  return root;
}
