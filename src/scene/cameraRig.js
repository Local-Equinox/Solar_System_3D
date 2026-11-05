// OrbitControls plus the behaviour around it: flying to a selected body, keeping up with it as it
// moves, and framing it in the part of the screen the info panel doesn't cover.

import { PerspectiveCamera, Vector3 } from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const FOV = 42;
const MAX_DISTANCE = 2400;
const OVERVIEW_DIRECTION = new Vector3(0.2, 0.52, 0.83).normalize();
const SYSTEM_RADIUS = 445; // scene units reaching Neptune's orbit
const FLY_SECONDS = 1.5;

const smootherstep = (t) => t * t * t * (t * (6 * t - 15) + 10);

const _delta = new Vector3();
const _direction = new Vector3();
const _offset = new Vector3();

export class CameraRig {
  constructor(canvas, reducedMotion) {
    this.canvas = canvas;
    this.reducedMotion = reducedMotion;
    this.camera = new PerspectiveCamera(FOV, 1, 0.05, 6000);
    this.controls = new OrbitControls(this.camera, canvas);
    Object.assign(this.controls, {
      enableDamping: true,
      dampingFactor: 0.08,
      rotateSpeed: 0.65,
      zoomSpeed: 1.0,
      panSpeed: 0.9,
      screenSpacePanning: true,
      minDistance: 16,
      maxDistance: MAX_DISTANCE,
    });

    this.target = null; // the followed body
    this.flight = null;
    this.lastTargetPosition = new Vector3();
    this.size = { width: 1, height: 1 };
    this.insets = { left: 0, bottom: 0 };
    this.viewOffset = { x: 0, y: 0 };
    this.pendingZoom = 0;
    this.camera.position.copy(OVERVIEW_DIRECTION).multiplyScalar(1000);
  }

  setSize(width, height) {
    this.size = { width, height };
    this.camera.aspect = width / height;
    this._applyViewOffset();
  }

  /** The panel's footprint, so framing can centre on what's left of the screen. */
  setInsets(left, bottom) {
    this.insets = { left, bottom };
  }

  _applyViewOffset() {
    const { width, height } = this.size;
    this.camera.setViewOffset(width, height, this.viewOffset.x, this.viewOffset.y, width, height);
  }

  /** Distance at which a sphere of `radius` fills `fill` of the unobstructed screen. */
  _frameDistance(radius, fill) {
    const { width, height } = this.size;
    const visible = Math.min(width - this.insets.left, height - this.insets.bottom);
    const halfFov = Math.tan((FOV * Math.PI) / 360);
    return (radius * height) / (fill * Math.max(visible, 1) * halfFov);
  }

  overviewDistance() {
    const { width, height } = this.size;
    // The system is seen obliquely, so it needs less vertical room than horizontal.
    const visible = Math.min(width - this.insets.left, (height - this.insets.bottom) / 0.62);
    const halfFov = Math.tan((FOV * Math.PI) / 360);
    return (SYSTEM_RADIUS * height) / (0.74 * Math.max(visible, 1) * halfFov);
  }

  /** Flies to a body and follows it, or back to the overview if `body` is null. */
  focus(body) {
    this.target = body;
    const fromTarget = this.controls.target.clone();
    const fromOffset = this.camera.position.clone().sub(fromTarget);
    let toDirection;
    let toDistance;

    if (body) {
      const reach = body.data.ring ? body.radius * body.data.ring.outer : body.radius;
      toDistance = this._frameDistance(reach, body.kind === 'moon' ? 0.5 : 0.38);
      toDirection = this._approachDirection(body, fromOffset);
      this.controls.minDistance = body.radius * 1.3;
      this.lastTargetPosition.copy(body.worldPosition);
    } else {
      toDistance = this.overviewDistance();
      toDirection = OVERVIEW_DIRECTION.clone();
      this.controls.minDistance = 16;
    }

    this.flight = {
      elapsed: 0,
      duration: this.reducedMotion ? 0 : FLY_SECONDS,
      fromTarget,
      fromDirection: fromOffset.clone().normalize(),
      fromDistance: fromOffset.length(),
      toDirection,
      toDistance: Math.min(toDistance, MAX_DISTANCE),
    };
    this.controls.enabled = false;
    this.pendingZoom = 0;
  }

  /** A view from the sunlit side, so a selected body isn't shown as a dark silhouette. */
  _approachDirection(body, fromOffset) {
    const position = body.worldPosition;
    if (position.lengthSq() < 1e-6) return fromOffset.clone().normalize(); // the Sun
    const toSun = position.clone().normalize().negate();
    const side = new Vector3(0, 1, 0).cross(toSun).normalize();
    const direction = toSun.clone().multiplyScalar(0.8).addScaledVector(side, 0.55).add(new Vector3(0, 0.32, 0));
    if (body.data.ring) {
      const pole = new Vector3(0, 1, 0).applyQuaternion(body.poleQuaternion);
      direction.addScaledVector(pole, pole.dot(toSun) >= 0 ? 0.6 : -0.6);
    }
    return direction.normalize();
  }

  /** Chase-camera mode: orbit around a moving point instead of a body. */
  follow(point, distance, direction) {
    this.target = point;
    this.flight = null;
    this.pendingZoom = 0;
    this.controls.enabled = true;
    this.controls.minDistance = 0.09;
    this.controls.target.copy(point.worldPosition);
    this.camera.position.copy(point.worldPosition).addScaledVector(direction, distance);
    this.lastTargetPosition.copy(point.worldPosition);
  }

  /** Swings the camera to a new offset direction around its target, keeping its distance. */
  setOffsetDirection(direction) {
    const distance = this.camera.position.distanceTo(this.controls.target);
    this.camera.position.copy(this.controls.target).addScaledVector(direction, distance);
  }

  setFov(fov) {
    this.camera.fov = fov;
    this._applyViewOffset();
  }

  zoomBy(factor) {
    this.pendingZoom += Math.log(factor);
  }

  update(dt) {
    const { camera, controls } = this;

    if (this.flight) {
      this._advanceFlight(dt);
    } else if (this.target) {
      // Carry the camera along with the body. Keeping the existing offset preserves the user's
      // orbit angle, zoom and any pan.
      _delta.subVectors(this.target.worldPosition, this.lastTargetPosition);
      camera.position.add(_delta);
      controls.target.add(_delta);
    }
    if (this.target) this.lastTargetPosition.copy(this.target.worldPosition);

    if (Math.abs(this.pendingZoom) > 1e-4) {
      const step = this.pendingZoom * Math.min(1, dt * 9);
      this.pendingZoom -= step;
      _offset.subVectors(camera.position, controls.target).multiplyScalar(Math.exp(step));
      const clamped = Math.min(controls.maxDistance, Math.max(controls.minDistance, _offset.length()));
      _offset.setLength(clamped);
      camera.position.addVectors(controls.target, _offset);
    }

    controls.update(dt);
    this._updateViewOffset(dt);
  }

  _advanceFlight(dt) {
    const { camera, controls, flight } = this;
    flight.elapsed += dt;
    const t = flight.duration > 0 ? Math.min(1, flight.elapsed / flight.duration) : 1;
    const e = smootherstep(t);
    const destination = this.target ? this.target.worldPosition : _delta.set(0, 0, 0);

    controls.target.lerpVectors(flight.fromTarget, destination, e);
    _direction.lerpVectors(flight.fromDirection, flight.toDirection, e);
    if (_direction.lengthSq() < 1e-4) _direction.set(0, 1, 0); // opposite ends: lift over the middle
    _direction.normalize();
    // Interpolate distance geometrically: zooming by orders of magnitude should feel even.
    const distance = flight.fromDistance * Math.pow(flight.toDistance / flight.fromDistance, e);
    camera.position.copy(controls.target).addScaledVector(_direction, distance);

    if (t >= 1) {
      this.flight = null;
      controls.enabled = true;
    }
  }

  _updateViewOffset(dt) {
    // Shifting the projection, not the camera, recentres the target without disturbing controls.
    const goalX = -this.insets.left / 2;
    const goalY = this.insets.bottom / 2;
    const k = this.reducedMotion ? 1 : Math.min(1, dt * 5);
    const nextX = this.viewOffset.x + (goalX - this.viewOffset.x) * k;
    const nextY = this.viewOffset.y + (goalY - this.viewOffset.y) * k;
    if (Math.abs(nextX - this.viewOffset.x) > 0.01 || Math.abs(nextY - this.viewOffset.y) > 0.01) {
      this.viewOffset.x = nextX;
      this.viewOffset.y = nextY;
      this._applyViewOffset();
    }
  }

  /** Tightens the depth range around the nearest surface, keeping precision when very close. */
  fitClippingPlanes(bodies) {
    let nearest = Infinity;
    for (const body of bodies) {
      const surface = this.camera.position.distanceTo(body.worldPosition) - body.radius;
      if (surface < nearest) nearest = surface;
    }
    const near = Math.min(4, Math.max(0.002, nearest * 0.3));
    if (Math.abs(near - this.camera.near) / this.camera.near > 0.1) {
      this.camera.near = near;
      this.camera.updateProjectionMatrix();
    }
  }
}
