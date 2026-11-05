// Builds the Sun, planets, moons and orbit paths, and advances them each frame.
//
// Scene graph for a planet (moons nest inside their parent's anchor the same way):
//   anchor        follows the orbit; never rotates, so moons and their paths stay put
//   ├─ axis       fixed orientation of the real spin axis
//   │  ├─ surface spins about local Y (this is the pickable mesh)
//   │  ├─ clouds, atmosphere
//   │  └─ ring
//   ├─ path       each moon's orbit line
//   └─ moon anchor ...

import {
  AdditiveBlending, AmbientLight, BufferAttribute, BufferGeometry, CanvasTexture, Color, Group, Line,
  LinearMipmapLinearFilter, Matrix4, Mesh, MeshLambertMaterial, PointLight, Points, Quaternion, RingGeometry,
  SphereGeometry, Sprite, SpriteMaterial, SRGBColorSpace, TextureLoader, Vector3,
} from 'three';
import { BODIES } from '../data/bodies.js';
import { KeplerOrbit, equatorialToScene } from '../astro.js';
import { displayRadius, moonOrbitRadius } from '../scale.js';
import {
  createAtmosphereMaterial, createEarthMaterial, createMarkerMaterial, createOrbitMaterial,
  createRingMaterial, createSunMaterial,
} from './materials.js';

const DEG = Math.PI / 180;
const TAU = Math.PI * 2;
const X_AXIS = new Vector3(1, 0, 0);
const Y_AXIS = new Vector3(0, 1, 0);

// Above these rates, real motion would strobe: Phobos at 10 days/s is 31 orbits per second. Fast
// spins and moon orbits saturate smoothly toward these limits, in revolutions per second. Faster
// bodies still move faster, and planetary orbits are never limited.
const MAX_SPIN_REV_PER_S = 0.35;
const MAX_MOON_REV_PER_S = 0.5;
const softLimit = (revPerSecond, limit) => limit * Math.tanh(revPerSecond / limit);

const PLANET_SPHERE = new SphereGeometry(1, 64, 44);
const MOON_SPHERE = new SphereGeometry(1, 32, 22);

const _x = new Vector3();
const _z = new Vector3();
const _basis = new Matrix4();
const _quatA = new Quaternion();
const _quatB = new Quaternion();

/** Orientation whose local Y is the IAU pole and whose local X is the equator's J2000 node. */
function poleQuaternion(pole) {
  const y = equatorialToScene(pole.ra, pole.dec);
  const x = equatorialToScene(pole.ra + 90, 0);
  const z = new Vector3().crossVectors(x, y);
  return new Quaternion().setFromRotationMatrix(new Matrix4().makeBasis(x, y, z));
}

function makeSunGlow() {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const g = canvas.getContext('2d');
  const gradient = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gradient.addColorStop(0, 'rgba(255,225,170,1)');
  gradient.addColorStop(0.16, 'rgba(255,200,120,0.62)');
  gradient.addColorStop(0.3, 'rgba(255,150,70,0.16)');
  gradient.addColorStop(0.6, 'rgba(255,120,50,0.04)');
  gradient.addColorStop(1, 'rgba(255,100,40,0)');
  g.fillStyle = gradient;
  g.fillRect(0, 0, size, size);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

function makeOrbitLine(points, color, baseAlpha) {
  const positions = new Float32Array(points.length * 3);
  const phases = new Float32Array(points.length);
  points.forEach((point, i) => {
    point.toArray(positions, i * 3);
    phases[i] = i / (points.length - 1);
  });
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(positions, 3));
  geometry.setAttribute('phase', new BufferAttribute(phases, 1));
  const line = new Line(geometry, createOrbitMaterial(color, baseAlpha));
  line.frustumCulled = false; // a path around the camera is always partly in view
  return line;
}

class Body {
  constructor(data, parent) {
    Object.assign(this, { data, parent, id: data.id, name: data.name, kind: data.kind });
    this.moons = [];
    this.radius = displayRadius(data.radiusKm);
    this.color = new Color(data.color);
    this.worldPosition = new Vector3();
    this.positionAU = new Vector3(); // heliocentric; a moon shares its planet's
    this.anchor = new Group();
    this.axis = new Group();
    this.anchor.add(this.axis);
    this.spinDeg = 0;
    this.path = null;
  }
}

export class SolarSystem {
  constructor(scene, renderer, startDays) {
    this.scene = scene;
    this.bodies = [];
    this.byId = new Map();
    this.pickables = [];
    this.time = 0;
    this.highlighted = null;
    this.textureRequests = [];
    this.loader = new TextureLoader();
    this.maxAnisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());

    scene.add(new AmbientLight(0xffffff, 0.05));
    // No distance falloff: on a compressed scale, real falloff would leave Neptune black.
    scene.add(new PointLight(0xffffff, 3.1, 0, 0));

    for (const data of BODIES) this._addBody(data, startDays);
    this._addMarkers(renderer.getPixelRatio());
    this.update(startDays, 0, 0);
  }

  _requestTexture(url, sRGB, apply, priority = 0) {
    this.textureRequests.push({ url, sRGB, apply, priority });
  }

  /**
   * Starts texture downloads, biggest bodies first. The scene is usable from the first frame:
   * bodies show their flat colour until their map arrives, and a failed download leaves them so.
   */
  loadTextures(onProgress) {
    const requests = this.textureRequests.sort((a, b) => a.priority - b.priority);
    let done = 0;
    let failed = 0;
    const CONCURRENCY = 6;
    let next = 0;
    const finish = () => {
      done++;
      onProgress(done, requests.length, failed);
      pump();
    };
    const pump = () => {
      if (next >= requests.length) return;
      const { url, sRGB, apply } = requests[next++];
      this.loader.load(url, (texture) => {
        if (sRGB) texture.colorSpace = SRGBColorSpace;
        texture.anisotropy = this.maxAnisotropy;
        texture.minFilter = LinearMipmapLinearFilter;
        apply(texture);
        finish();
      }, undefined, () => {
        failed++;
        console.warn(`Texture failed to load: ${url}`);
        finish();
      });
    };
    for (let i = 0; i < CONCURRENCY; i++) pump();
  }

  _addBody(data, startDays) {
    const parent = data.parent ? this.byId.get(data.parent) : null;
    const body = new Body(data, parent);
    this.bodies.push(body);
    this.byId.set(body.id, body);
    (parent ? parent.anchor : this.scene).add(body.anchor);
    if (parent) parent.moons.push(body);

    this._addSurface(body);
    if (data.pole) {
      body.poleQuaternion = poleQuaternion(data.pole);
      body.axis.quaternion.copy(body.poleQuaternion);
      body.spinDeg = data.pole.w0 + data.pole.wd * startDays;
    }
    if (data.kind === 'planet') this._addPlanetOrbit(body, startDays);
    if (data.kind === 'moon') this._addMoonOrbit(body, startDays);
    if (data.atmosphere) this._addAtmosphere(body);
    if (data.ring) this._addRing(body);
    if (data.cloudTexture) this._addClouds(body);
    if (data.kind === 'star') this._addSunGlow(body);
  }

  _addSurface(body) {
    const { data } = body;
    const priority = data.kind === 'moon' ? 2 : data.kind === 'planet' ? 1 : 0;
    let material;
    if (data.kind === 'star') {
      material = createSunMaterial();
      body.sunMaterial = material;
      this._requestTexture(data.texture, true, (t) => { material.uniforms.map.value = t; }, priority);
    } else if (data.nightTexture) {
      material = createEarthMaterial();
      this._requestTexture(data.texture, true, (t) => { material.uniforms.dayMap.value = t; }, priority);
      this._requestTexture(data.nightTexture, true, (t) => { material.uniforms.nightMap.value = t; }, priority);
    } else {
      material = new MeshLambertMaterial({ color: body.color });
      this._requestTexture(data.texture, true, (t) => {
        material.map = t;
        material.color.set(0xffffff);
        material.needsUpdate = true;
      }, priority);
    }

    const geometry = data.kind === 'moon' ? MOON_SPHERE : PLANET_SPHERE;
    const surface = new Mesh(geometry, material);
    surface.userData.body = body;
    const [sx, sy, sz] = data.shape ?? [1, 1, 1];
    surface.scale.set(body.radius * sx, body.radius * sy, body.radius * sz);
    body.surface = surface;
    body.axis.add(surface);
    this.pickables.push(surface);
  }

  _addPlanetOrbit(body, startDays) {
    body.orbit = new KeplerOrbit(body.data.elements, startDays);
    const tint = body.color.clone().lerp(new Color(0xffffff), 0.45);
    body.path = makeOrbitLine(body.orbit.samplePath(420), tint, 0.17);
    this.scene.add(body.path);
  }

  _addMoonOrbit(body, startDays) {
    const { data, parent } = body;
    const orbit = data.orbit;
    body.orbitRadius = moonOrbitRadius(orbit.aKm, parent.data.radiusKm, parent.data.moonClearance);

    // The orbital plane: rotated from the reference frame by node, then by inclination.
    const reference = orbit.frame === 'ecliptic' ? new Quaternion() : parent.poleQuaternion;
    const nodeDeg = orbit.nodeLongitude
      ? orbit.nodeLongitude[0] + orbit.nodeLongitude[1] * startDays
      : orbit.node ?? 0;
    body.orbitFrame = reference.clone()
      .multiply(_quatA.setFromAxisAngle(Y_AXIS, nodeDeg * DEG))
      .multiply(_quatB.setFromAxisAngle(X_AXIS, orbit.inc * DEG));
    body.orbitNormal = Y_AXIS.clone().applyQuaternion(body.orbitFrame);
    // Map north is on the north side of the system, so on a retrograde orbit (Triton, and the
    // moons of sideways Uranus) it points opposite the orbit's angular momentum.
    body.mapNorth = body.orbitNormal.clone().multiplyScalar(orbit.inc > 90 ? -1 : 1);

    const longitude = orbit.meanLongitude
      ? orbit.meanLongitude[0] + orbit.meanLongitude[1] * startDays - nodeDeg
      : (orbit.phase ?? 0) + (360 / data.orbitDays) * startDays;
    body.orbitAngleDeg = longitude;

    const points = [];
    const segments = 160;
    for (let i = 0; i <= segments; i++) {
      const a = (i / segments) * TAU;
      points.push(new Vector3(Math.cos(a), 0, -Math.sin(a)).multiplyScalar(body.orbitRadius).applyQuaternion(body.orbitFrame));
    }
    body.path = makeOrbitLine(points, body.color.clone().lerp(new Color(0xffffff), 0.5), 0.13);
    parent.anchor.add(body.path);
  }

  _addAtmosphere(body) {
    const { color, strength } = body.data.atmosphere;
    const shell = new Mesh(body.surface.geometry, createAtmosphereMaterial(color, strength));
    shell.scale.setScalar(body.radius * 1.045);
    body.axis.add(shell);
  }

  _addClouds(body) {
    const material = new MeshLambertMaterial({ color: 0xffffff, transparent: true, depthWrite: false, opacity: 0 });
    this._requestTexture(body.data.cloudTexture, false, (t) => {
      material.alphaMap = t;
      material.opacity = 0.9;
      material.needsUpdate = true;
    }, 1);
    body.clouds = new Mesh(PLANET_SPHERE, material);
    body.clouds.scale.setScalar(body.radius * 1.008);
    body.axis.add(body.clouds);
  }

  _addRing(body) {
    const { inner, outer, texture } = body.data.ring;
    const geometry = new RingGeometry(inner, outer, 128, 1);
    const material = createRingMaterial(inner, outer);
    material.uniforms.planetCenter.value = body.worldPosition;
    material.uniforms.planetRadius.value = body.radius;
    this._requestTexture(texture, true, (t) => { material.uniforms.map.value = t; }, 1);
    const ring = new Mesh(geometry, material);
    ring.scale.setScalar(body.radius);
    ring.rotation.x = -Math.PI / 2; // RingGeometry lies in XY; the equator is local XZ
    ring.userData.body = body; // tapping the rings selects Saturn
    body.axis.add(ring);
    this.pickables.push(ring);
  }

  _addSunGlow(body) {
    const glow = new Sprite(new SpriteMaterial({
      map: makeSunGlow(), blending: AdditiveBlending, depthWrite: false, transparent: true,
    }));
    glow.scale.setScalar(body.radius * 9);
    body.anchor.add(glow);
  }

  _addMarkers(pixelRatio) {
    const count = this.bodies.length;
    const colors = new Float32Array(count * 3);
    const sizes = new Float32Array(count);
    this.bodies.forEach((body, i) => {
      body.color.toArray(colors, i * 3);
      sizes[i] = body.kind === 'moon' ? 2.5 : 4;
    });
    const geometry = new BufferGeometry();
    this.markerPositions = new BufferAttribute(new Float32Array(count * 3), 3);
    geometry.setAttribute('position', this.markerPositions);
    geometry.setAttribute('color', new BufferAttribute(colors, 3));
    geometry.setAttribute('size', new BufferAttribute(sizes, 1));
    this.markerMaterial = createMarkerMaterial(pixelRatio);
    const markers = new Points(geometry, this.markerMaterial);
    markers.frustumCulled = false;
    this.scene.add(markers);
  }

  setPixelRatio(pixelRatio) {
    this.markerMaterial.uniforms.pixelRatio.value = pixelRatio;
  }

  /** Brightens the paths of the selected body and of its moons. */
  setHighlight(body) {
    const paint = (target, base, trail) => {
      if (!target?.path) return;
      const { uniforms } = target.path.material;
      uniforms.baseAlpha.value = base;
      uniforms.trailAlpha.value = trail;
    };
    const restore = (target) => {
      if (!target) return;
      paint(target, target.kind === 'moon' ? 0.13 : 0.17, 0.5);
      target.moons.forEach((moon) => paint(moon, 0.13, 0.5));
    };
    restore(this.highlighted);
    this.highlighted = body;
    if (!body) return;
    paint(body, 0.3, 0.5);
    body.moons.forEach((moon) => paint(moon, 0.24, 0.5));
  }

  /**
   * @param days     simulated days since J2000
   * @param dt       real seconds since the last frame
   * @param daysPerS current simulation rate, 0 when paused
   */
  update(days, dt, daysPerS) {
    this.time += dt;
    for (const body of this.bodies) {
      if (body.orbit) {
        const E = body.orbit.anomalyAt(days);
        body.orbit.positionAU(E, body.positionAU);
        KeplerOrbit.toScene(body.positionAU, body.anchor.position);
        body.worldPosition.copy(body.anchor.position);
        body.path.material.uniforms.head.value = ((E / TAU) % 1 + 1) % 1;
      } else if (body.orbitFrame) {
        const rev = daysPerS / body.data.orbitDays;
        body.orbitAngleDeg += softLimit(rev, MAX_MOON_REV_PER_S) * 360 * dt;
        const angle = body.orbitAngleDeg * DEG;
        const local = body.anchor.position;
        local.set(Math.cos(angle), 0, -Math.sin(angle)).multiplyScalar(body.orbitRadius).applyQuaternion(body.orbitFrame);
        body.worldPosition.addVectors(body.parent.worldPosition, local);
        body.positionAU.copy(body.parent.positionAU);
        body.path.material.uniforms.head.value = ((angle / TAU) % 1 + 1) % 1;

        // Tidal lock: longitude 0 always faces the planet, with the spin axis along the orbit normal.
        _x.copy(local).normalize().negate();
        _z.crossVectors(_x, body.mapNorth);
        _basis.makeBasis(_x, body.mapNorth, _z);
        body.axis.quaternion.setFromRotationMatrix(_basis);
      }

      if (body.data.pole) {
        const signedRev = (body.data.pole.wd / 360) * daysPerS;
        const delta = softLimit(signedRev, MAX_SPIN_REV_PER_S) * 360 * dt;
        body.spinDeg += delta;
        body.surface.rotation.y = (body.spinDeg % 360) * DEG;
        if (body.clouds) {
          // Clouds drift slightly against the surface; only the angle's difference is visible.
          body.clouds.rotation.y = ((body.spinDeg + this.time * 0.6) % 360) * DEG;
        }
      }
    }

    if (this.bodies[0].sunMaterial) this.bodies[0].sunMaterial.uniforms.time.value = this.time;

    this.bodies.forEach((body, i) => {
      body.worldPosition.toArray(this.markerPositions.array, i * 3);
    });
    this.markerPositions.needsUpdate = true;
  }
}
