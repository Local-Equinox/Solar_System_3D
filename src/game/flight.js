// Flying the ship through the Solar System, and warping.
//
// The ship's position is kept relative to the nearest body, so it's carried along as that body
// orbits. It's drawn in its own small scene in metres, layered over the system, because the
// system's compressed scale would make a 20 m ship and a 1,000 km moon fight for depth precision.
// The camera rig works in system units; METRES_PER_UNIT converts its offset for the ship's scene.

import { AmbientLight, DirectionalLight, MathUtils, PerspectiveCamera, Quaternion, Scene, Vector3 } from 'three';
import { createSpaceship } from './models.js';

const METRES_PER_UNIT = 333;
const CHASE_DISTANCE = 0.2;
const FOV = 42;
const WARP_SECONDS = 2.4;
const SPHERE_OF_INFLUENCE = 7; // in body radii
const MIN_SPEED = 0.1;
const MAX_SPEED = 90;
const SPEED_PER_ALTITUDE = 0.9;
const BOOST = 3;
const ORBIT_FACTOR = 2.4;

const _forward = new Vector3();
const _right = new Vector3();
const _up = new Vector3();
const _thrust = new Vector3();
const _direction = new Vector3();
const _quaternion = new Quaternion();
const SHIP_FORWARD = new Vector3(0, 0, -1);

const smootherstep = (t) => t * t * t * (t * (6 * t - 15) + 10);

const reachOf = (body) => (body.data.ring ? body.radius * body.data.ring.outer : body.radius);
const orbitRadiusOf = (body) => reachOf(body) * ORBIT_FACTOR + 0.3;

export class ShipFlight {
  constructor(system, rig, input) {
    Object.assign(this, { system, rig, input });
    this.name = 'Your ship';
    this.kind = 'marker';
    this.radius = 0;
    this.moons = [];
    this.data = { color: '#79c7ff' };
    this.worldPosition = new Vector3(); // system coordinates; what the camera rig follows
    this.frameBody = system.bodies[0];
    this.relative = new Vector3();
    this.velocity = new Vector3();
    this.thrustLevel = 0;
    this.warp = null;

    this.scene = new Scene();
    this.model = createSpaceship();
    this.model.userData.setGearDown(false);
    this.model.position.y = -3.5; // pivot on the hull's centre, not its landing feet
    this.scene.add(this.model);
    this.scene.add(new AmbientLight(0xffffff, 0.34));
    this.sun = new DirectionalLight(0xffffff, 2.9);
    this.scene.add(this.sun, this.sun.target);
    this.camera = new PerspectiveCamera(FOV, 1, 0.5, 4000);
  }

  isVisible(distance) {
    return distance > 3;
  }

  /** Puts the ship above a point on a body, as after lift-off. */
  placeAbove(body, worldNormal) {
    this.setFrame(body);
    const altitude = Math.max(body.radius * 0.4, 0.3);
    this.relative.copy(worldNormal).multiplyScalar(reachOf(body) + altitude);
    this.worldPosition.addVectors(body.worldPosition, this.relative);
    this.velocity.set(0, 0, 0);

    const tangent = _right.set(0, 1, 0).cross(worldNormal);
    if (tangent.lengthSq() < 1e-4) tangent.set(1, 0, 0);
    const offset = tangent.normalize().multiplyScalar(0.9).addScaledVector(worldNormal, 0.42).normalize();
    this.rig.follow(this, CHASE_DISTANCE, offset);
    this.rig.setFov(FOV);
    this.model.quaternion.setFromUnitVectors(SHIP_FORWARD, _forward.copy(offset).negate());
  }

  setFrame(body) {
    this.frameBody = body;
    this.relative.subVectors(this.worldPosition, body.worldPosition);
  }

  get isWarping() {
    return Boolean(this.warp);
  }

  /** Altitude above a body's surface, in system units. */
  altitudeOver(body) {
    return this.worldPosition.distanceTo(body.worldPosition) - body.radius;
  }

  /**
   * The body the ship is near, for landing. The smallest body in range wins: a moon's neighbourhood
   * sits inside its planet's, and every inner planet's sits inside the Sun's.
   */
  nearbyBody() {
    let best = null;
    for (const body of this.system.bodies) {
      // Generous enough to include the orbit a warp arrives at.
      if (this.altitudeOver(body) < orbitRadiusOf(body) * 1.1 && (!best || reachOf(body) < reachOf(best))) best = body;
    }
    return best;
  }

  /** Fast-travels to an orbit around `body`, approaching its sunlit side. */
  warpTo(body) {
    const toSun = body.worldPosition.lengthSq() < 1e-6
      ? new Vector3(0.3, 0.5, 0.8)
      : body.worldPosition.clone().negate().normalize();
    const direction = toSun.clone().multiplyScalar(0.9).add(new Vector3(0, 1, 0).cross(toSun).normalize().multiplyScalar(0.5))
      .add(new Vector3(0, 0.3, 0)).normalize();
    this.warp = {
      body,
      elapsed: 0,
      from: this.worldPosition.clone(),
      direction,
      offsetFrom: this.rig.camera.position.clone().sub(this.rig.controls.target).normalize(),
      orbitRadius: orbitRadiusOf(body),
    };
    this.velocity.set(0, 0, 0);
    this.rig.controls.enabled = false;
    document.body.classList.add('warping');
  }

  update(dt) {
    if (this.warp) this._updateWarp(dt);
    else this._updateFlight(dt);
    this.model.userData.setThrust(this.thrustLevel);
  }

  _updateWarp(dt) {
    const { warp, rig } = this;
    warp.elapsed += dt;
    const t = Math.min(1, warp.elapsed / WARP_SECONDS);
    const e = smootherstep(t);
    const destination = _direction.copy(warp.body.worldPosition).addScaledVector(warp.direction, warp.orbitRadius);
    this.worldPosition.lerpVectors(warp.from, destination, e);
    this.thrustLevel = Math.sin(t * Math.PI);

    rig.setFov(FOV + Math.sin(t * Math.PI) * 34);
    const offset = _up.lerpVectors(warp.offsetFrom, warp.direction, e);
    if (offset.lengthSq() < 1e-4) offset.set(0, 1, 0);
    rig.setOffsetDirection(offset.normalize());
    this.model.quaternion.setFromUnitVectors(SHIP_FORWARD, _forward.copy(offset).negate());

    if (t >= 1) {
      this.setFrame(warp.body);
      this.warp = null;
      this.thrustLevel = 0;
      rig.setFov(FOV);
      rig.controls.enabled = true;
      document.body.classList.remove('warping');
    }
  }

  _updateFlight(dt) {
    const { input, rig } = this;
    const { x: strafe, y: forward } = input.movement();
    const rise = (input.down.has('Space') ? 1 : 0) - (input.down.has('KeyC') ? 1 : 0);
    input.consumeJump();

    // Forward is wherever the camera is pointing.
    rig.camera.getWorldDirection(_forward);
    _right.crossVectors(_forward, rig.camera.up).normalize();
    _up.crossVectors(_right, _forward);
    _thrust.set(0, 0, 0).addScaledVector(_forward, forward).addScaledVector(_right, strafe).addScaledVector(_up, rise);
    const demand = Math.min(1, _thrust.length());
    if (demand > 0) _thrust.normalize();

    // Speed scales with altitude: careful near a surface, fast between planets.
    this._updateFrame();
    const altitude = Math.max(0, this.altitudeOver(this.frameBody));
    const nearest = this._nearestAltitude(altitude);
    let top = MathUtils.clamp(nearest * SPEED_PER_ALTITUDE, MIN_SPEED, MAX_SPEED);
    if (input.boost) top *= BOOST;
    const wanted = _thrust.multiplyScalar(top * demand);
    this.velocity.lerp(wanted, 1 - Math.exp(-dt * 3.2));
    this.relative.addScaledVector(this.velocity, dt);
    this.speed = this.velocity.length();
    this.thrustLevel += (demand * (input.boost ? 1 : 0.6) - this.thrustLevel) * Math.min(1, dt * 6);

    // Hold the ship outside the surface, sliding along it.
    const body = this.frameBody;
    const minimum = body.radius * 1.015 + 0.01;
    const distance = this.relative.length();
    if (distance < minimum) {
      this.relative.multiplyScalar(minimum / Math.max(distance, 1e-6));
      _direction.copy(this.relative).normalize();
      const inward = this.velocity.dot(_direction);
      if (inward < 0) this.velocity.addScaledVector(_direction, -inward);
    }
    this.worldPosition.addVectors(body.worldPosition, this.relative);

    if (demand > 0) {
      // Nose turns toward the direction of travel, or the view when reversing and strafing.
      _quaternion.setFromUnitVectors(SHIP_FORWARD, rig.camera.getWorldDirection(_forward));
      this.model.quaternion.slerp(_quaternion, 1 - Math.exp(-dt * 4));
    }

    // The camera can orbit around the ship, so stop it passing inside the body.
    const camera = rig.camera.position;
    const fromBody = camera.distanceTo(body.worldPosition);
    if (fromBody < body.radius * 1.01) {
      camera.sub(body.worldPosition).multiplyScalar((body.radius * 1.01) / fromBody).add(body.worldPosition);
    }
  }

  /** Re-attaches the ship to the smallest body whose neighbourhood it's in, or else the Sun. */
  _updateFrame() {
    let best = this.system.bodies[0];
    for (const body of this.system.bodies) {
      const reach = Math.max(reachOf(body) * SPHERE_OF_INFLUENCE, orbitRadiusOf(body) * 1.2);
      if (this.worldPosition.distanceTo(body.worldPosition) < reach && reachOf(body) < reachOf(best)) best = body;
    }
    if (best !== this.frameBody) this.setFrame(best);
  }

  _nearestAltitude(fallback) {
    let nearest = fallback;
    for (const body of this.system.bodies) nearest = Math.min(nearest, Math.max(0, this.altitudeOver(body)));
    return nearest;
  }

  /** Draws the ship in its own metre-scale pass, using the rig's view. */
  render(renderer) {
    const { rig, camera } = this;
    const offset = _direction.subVectors(rig.camera.position, this.worldPosition).multiplyScalar(METRES_PER_UNIT);
    const distance = offset.length();
    if (distance > 3800) return; // less than a pixel; the marker takes over
    camera.position.copy(offset);
    camera.quaternion.copy(rig.camera.quaternion);
    camera.fov = rig.camera.fov;
    camera.aspect = rig.camera.aspect;
    camera.near = Math.max(0.5, distance * 0.1);
    camera.far = distance + 200;
    const { width, height } = rig.size;
    camera.setViewOffset(width, height, rig.viewOffset.x, rig.viewOffset.y, width, height);

    this.sun.position.copy(this.worldPosition).negate().normalize().multiplyScalar(100);
    renderer.render(this.scene, camera);
  }
}
