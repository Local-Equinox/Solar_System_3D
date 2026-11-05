// Walking on a world: a separate scene and physics world, in real metres.
//
// None of this shares coordinates with the Solar System. The player stays near (0,0,0), and the
// chunks recentre as they walk, so physics and rendering stay precise however far they explore.
// The real Solar System is drawn behind as the sky, from a camera standing at the same spot on
// the body's globe (see skyPose), so the Sun, moons and planets above are the real ones.

import {
  AdditiveBlending, BackSide, Color, CylinderGeometry, DirectionalLight, DoubleSide, HemisphereLight, Matrix4,
  Mesh, MeshBasicMaterial, MeshLambertMaterial, PerspectiveCamera, Quaternion, RingGeometry, Scene, ShaderMaterial,
  SphereGeometry, Vector3,
} from 'three';
import { createAstronaut, createSpaceship } from './models.js';
import { CHUNK_SIZE, Terrain, surfaceProfile } from './terrain.js';

const FIXED_STEP = 1 / 60;
const CAPSULE_HALF_HEIGHT = 0.5;
const CAPSULE_RADIUS = 0.4;
const FEET_OFFSET = CAPSULE_HALF_HEIGHT + CAPSULE_RADIUS;

// The same push of the legs everywhere: 4 m/s is about a 0.8 m jump on Earth. How high and how
// long it lasts then depends only on the world's real surface gravity.
export const JUMP_SPEED = 4;
const WALK_SPEED = 5;
const RUN_SPEED = 9.5;
const GROUND_ACCELERATION = 32;
const AIR_ACCELERATION = 3;
const SUIT_THRUST = 12; // m/s², optional, for the worlds where a jump lasts many minutes

const BOARD_DISTANCE = 16;
const REBASE_DISTANCE = CHUNK_SIZE * 2;
const EYE_HEIGHT = 1.35;
const SHIP_START_HEIGHT = 90;
const DESCENT_SECONDS = 2.2;
const ASCENT_SECONDS = 1.6;

const _up = new Vector3();
const _east = new Vector3();
const _south = new Vector3();
const _matrix = new Matrix4();
const _quatA = new Quaternion();
const _vector = new Vector3();

export function bodyFixedQuaternion(body, out = new Quaternion()) {
  return out.copy(body.axis.quaternion).multiply(body.surface.quaternion);
}

/** Bends the ground away with distance from the camera, by the world's curvature. */
function curvedMaterial(radiusUniform) {
  return (material) => {
    material.onBeforeCompile = (shader) => {
      shader.uniforms.curveRadius = radiusUniform;
      shader.vertexShader = `uniform float curveRadius;\n${shader.vertexShader}`.replace(
        '#include <project_vertex>',
        /* glsl */ `
        vec4 worldVertex = vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
          worldVertex = instanceMatrix * worldVertex;
        #endif
        worldVertex = modelMatrix * worldVertex;
        vec2 fromCamera = worldVertex.xz - cameraPosition.xz;
        worldVertex.y -= dot(fromCamera, fromCamera) / (2.0 * curveRadius);
        vec4 mvPosition = viewMatrix * worldVertex;
        gl_Position = projectionMatrix * mvPosition;
        `,
      );
    };
    return material;
  };
}

function createSkyDome(skyColor) {
  return new Mesh(
    new SphereGeometry(6000, 32, 20),
    new ShaderMaterial({
      uniforms: { skyColor: { value: new Color(skyColor) }, sunDirection: { value: new Vector3(0, 1, 0) } },
      vertexShader: /* glsl */ `
        varying vec3 vDirection;
        void main() {
          vDirection = normalize(position);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 skyColor;
        uniform vec3 sunDirection;
        varying vec3 vDirection;
        void main() {
          vec3 direction = normalize(vDirection);
          float day = smoothstep(-0.18, 0.22, sunDirection.y);
          float toSun = max(dot(direction, sunDirection), 0.0);
          float horizon = pow(1.0 - clamp(direction.y, 0.0, 1.0), 3.0);
          vec3 color = mix(skyColor, vec3(1.0), horizon * 0.42) + vec3(1.0, 0.86, 0.66) * pow(toSun, 90.0) * 0.8;
          // Sunset glow near the horizon on the Sun's side.
          float dusk = (1.0 - abs(sunDirection.y)) * pow(toSun, 3.0) * horizon;
          color += vec3(0.9, 0.42, 0.14) * dusk * 0.8;
          float alpha = day * mix(0.86, 1.0, horizon);
          gl_FragColor = vec4(color, alpha);
          #include <colorspace_fragment>
        }
      `,
      side: BackSide,
      transparent: true,
      depthWrite: false,
    }),
  );
}

export class Surface {
  /**
   * @param body       the body being walked on
   * @param siteNormal unit vector to the landing site, in the body's own rotating frame
   */
  constructor(RAPIER, body, siteNormal, input, canvas) {
    Object.assign(this, { RAPIER, body, input, canvas });
    this.gravity = body.data.gravity;
    this.scene = new Scene();
    this.camera = new PerspectiveCamera(58, 1, 0.1, 9000);
    this.skyCamera = new PerspectiveCamera(58, 1, 0.02, 6000);

    // Basis of the site in the body's frame: X east, Y up, Z south.
    _up.copy(siteNormal).normalize();
    _east.set(0, 1, 0).cross(_up);
    if (_east.lengthSq() < 1e-6) _east.set(1, 0, 0);
    _east.normalize();
    _south.crossVectors(_east, _up);
    this.siteNormal = _up.clone();
    this.siteFrame = new Quaternion().setFromRotationMatrix(_matrix.makeBasis(_east, _up, _south));

    this.world = new RAPIER.World({ x: 0, y: -this.gravity, z: 0 });
    this.world.timestep = FIXED_STEP;

    const profile = surfaceProfile(body);
    this.profile = profile;
    // True curvature on small moons, capped so that the terrain edge stays below the horizon.
    this.curveRadius = { value: Math.min(30000, body.data.radiusKm * 1000) };
    this.curved = curvedMaterial(this.curveRadius);
    this.terrain = new Terrain(RAPIER, this.world, this.scene, profile, this.curved);
    this.terrain.update(0, 0, Infinity);

    this._addEnvironment(profile);
    this._addShip();
    this._addPlayer();
    this._bindCamera();

    this.phase = 'descending'; // then 'walking', 'ascending'
    this.phaseTime = 0;
    this.player.visible = false;
    this.accumulator = 0;
    this.lastJump = null;
    this.update(0);
  }

  _addEnvironment(profile) {
    this.sunLight = new DirectionalLight(0xffffff, 2.6);
    this.scene.add(this.sunLight, this.sunLight.target);
    const groundBounce = profile.colors[1].clone().multiplyScalar(0.5);
    this.skyLight = new HemisphereLight(new Color(profile.sky ?? '#8a93a8'), groundBounce, 0.55);
    this.scene.add(this.skyLight);

    // Past the streamed chunks, a plain curved disc carries the ground on to the horizon.
    const farMaterial = this.curved(new MeshLambertMaterial({ color: profile.colors[1].clone().multiplyScalar(0.9) }));
    const far = new Mesh(new RingGeometry(0, 8000, 72, 40).rotateX(-Math.PI / 2), farMaterial);
    far.position.y = -Math.max(14, profile.amplitude * 1.4);
    far.renderOrder = -1;
    this.farGround = far;
    this.scene.add(far);

    if (profile.sky) {
      this.dome = createSkyDome(profile.sky);
      this.scene.add(this.dome);
    }

    const shadow = new Mesh(
      new RingGeometry(0, 0.72, 24).rotateX(-Math.PI / 2),
      new MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.34, depthWrite: false }),
    );
    this.playerShadow = shadow;
    this.scene.add(shadow);
  }

  _addShip() {
    this.shipGroundY = this.terrain.heightAt(0, 0);
    this.ship = createSpaceship();
    this.ship.traverse((node) => {
      if (node.isMesh && node.material.isMeshStandardMaterial && !node.material.userData.curved) {
        node.material.userData.curved = true;
        this.curved(node.material);
      }
    });
    this.ship.position.set(0, this.shipGroundY + SHIP_START_HEIGHT, 0);
    this.ship.rotation.y = 0.5;
    this.scene.add(this.ship);

    // Hull collision, approximated by one box.
    const desc = this.RAPIER.ColliderDesc.cuboid(2.4, 2.4, 9).setTranslation(0, this.shipGroundY + 3.5, 0)
      .setRotation(new Quaternion().setFromAxisAngle(_vector.set(0, 1, 0), 0.5));
    this.shipCollider = this.world.createCollider(desc);

    // A beacon, so the ship can be found from far away on any world.
    const beacon = new Mesh(
      new CylinderGeometry(0.5, 0.5, 900, 8, 1, true).translate(0, 450, 0),
      new MeshBasicMaterial({
        color: '#79c7ff', transparent: true, opacity: 0.24, blending: AdditiveBlending, depthWrite: false, side: DoubleSide,
      }),
    );
    beacon.visible = false;
    this.beacon = beacon;
    this.scene.add(beacon);

    const pad = new Mesh(
      new RingGeometry(0, 11, 56).rotateX(-Math.PI / 2),
      new MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.15, depthWrite: false }),
    );
    pad.position.set(0, this.shipGroundY + 0.04, 0);
    this.scene.add(pad);
    this.shipPad = pad;
  }

  _addPlayer() {
    const { RAPIER, world } = this;
    const startX = 9;
    const startZ = 9;
    const y = this.terrain.heightAt(startX, startZ) + FEET_OFFSET + 0.05;
    this.playerBody = world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(startX, y, startZ));
    this.playerCollider = world.createCollider(RAPIER.ColliderDesc.capsule(CAPSULE_HALF_HEIGHT, CAPSULE_RADIUS), this.playerBody);

    this.controller = world.createCharacterController(0.02);
    this.controller.setUp({ x: 0, y: 1, z: 0 });
    this.controller.setMaxSlopeClimbAngle((52 * Math.PI) / 180);
    this.controller.setMinSlopeSlideAngle((62 * Math.PI) / 180);
    this.controller.enableAutostep(0.5, 0.25, true);
    this.controller.enableSnapToGround(0.35);
    this.controller.setApplyImpulsesToDynamicBodies(false);

    this.position = new Vector3(startX, y, startZ);
    this.previousPosition = this.position.clone();
    this.renderPosition = this.position.clone();
    this.velocity = new Vector3();
    this.grounded = true;
    this.heading = -Math.PI * 0.75; // facing the ship

    this.player = createAstronaut();
    this.scene.add(this.player);
  }

  _bindCamera() {
    this.yaw = Math.PI * 0.25; // behind the player, looking back past them at the ship
    this.pitch = 0.2;
    this.distance = 7;
    const pointers = new Map();
    let pinch = 0;
    this.listeners = {
      down: (event) => {
        pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
        this.canvas.setPointerCapture?.(event.pointerId);
        if (pointers.size === 2) {
          const [a, b] = pointers.values();
          pinch = Math.hypot(a.x - b.x, a.y - b.y);
        }
      },
      move: (event) => {
        const pointer = pointers.get(event.pointerId);
        if (!pointer) return;
        const dx = event.clientX - pointer.x;
        const dy = event.clientY - pointer.y;
        pointer.x = event.clientX;
        pointer.y = event.clientY;
        if (pointers.size === 1) {
          this.yaw -= dx * 0.0048;
          this.pitch = Math.min(1.35, Math.max(-0.55, this.pitch + dy * 0.0042));
        } else if (pointers.size === 2) {
          const [a, b] = pointers.values();
          const span = Math.hypot(a.x - b.x, a.y - b.y);
          if (pinch > 0) this.zoomBy(pinch / span);
          pinch = span;
        }
      },
      up: (event) => pointers.delete(event.pointerId),
      wheel: (event) => {
        event.preventDefault();
        this.zoomBy(Math.exp(event.deltaY * 0.0012));
      },
    };
    this.canvas.addEventListener('pointerdown', this.listeners.down);
    this.canvas.addEventListener('pointermove', this.listeners.move);
    this.canvas.addEventListener('pointerup', this.listeners.up);
    this.canvas.addEventListener('pointercancel', this.listeners.up);
    this.canvas.addEventListener('wheel', this.listeners.wheel, { passive: false });
  }

  zoomBy(factor) {
    this.distance = Math.min(60, Math.max(2.6, this.distance * factor));
  }

  setSize(width, height) {
    for (const camera of [this.camera, this.skyCamera]) {
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    }
  }

  get canBoard() {
    return this.phase === 'walking' && Math.hypot(this.position.x - this.ship.position.x, this.position.z - this.ship.position.z) < BOARD_DISTANCE;
  }

  get distanceToShip() {
    return Math.hypot(this.position.x - this.ship.position.x, this.position.z - this.ship.position.z);
  }

  /** Height of the player's feet above the ground beneath them. */
  get altitude() {
    return Math.max(0, this.position.y - FEET_OFFSET - this.terrain.heightAt(this.position.x, this.position.z));
  }

  /** Boards the ship and lifts off. `onDeparted` runs once it has climbed away. */
  board(onDeparted) {
    this.phase = 'ascending';
    this.phaseTime = 0;
    this.onDeparted = onDeparted;
    this.player.visible = false;
    this.playerShadow.visible = false;
  }

  update(dt) {
    this.phaseTime += dt;
    if (this.phase === 'descending') this._updateDescent();
    else if (this.phase === 'ascending') this._updateAscent();

    if (this.phase === 'walking') {
      this.accumulator += Math.min(dt, 0.1);
      while (this.accumulator >= FIXED_STEP) {
        this._physicsStep();
        this.accumulator -= FIXED_STEP;
      }
      this.renderPosition.lerpVectors(this.previousPosition, this.position, this.accumulator / FIXED_STEP);
      this._rebaseIfFar();
    }

    this.terrain.update(this.position.x, this.position.z, 1);
    this._updatePlayerModel(dt);
    this._updateCamera();
    this._updateSunlight();
    this.farGround.position.x = this.camera.position.x;
    this.farGround.position.z = this.camera.position.z;
    this.dome?.position.copy(this.camera.position);

    const away = this.distanceToShip;
    this.beacon.visible = this.phase === 'walking' && away > 60;
    this.beacon.position.set(this.ship.position.x, this.shipGroundY, this.ship.position.z);
  }

  _updateDescent() {
    const t = Math.min(1, this.phaseTime / DESCENT_SECONDS);
    const eased = 1 - (1 - t) ** 3;
    this.ship.position.y = this.shipGroundY + SHIP_START_HEIGHT * (1 - eased);
    this.ship.userData.setThrust(1 - t);
    if (t >= 1) {
      this.ship.userData.setThrust(0);
      this.phase = 'walking';
      this.player.visible = true;
    }
  }

  _updateAscent() {
    const t = Math.min(1, this.phaseTime / ASCENT_SECONDS);
    this.ship.position.y = this.shipGroundY + SHIP_START_HEIGHT * 1.6 * t * t;
    this.ship.userData.setThrust(0.4 + t * 0.6);
    if (t >= 1 && this.onDeparted) {
      const departed = this.onDeparted;
      this.onDeparted = null;
      departed();
    }
  }

  _physicsStep() {
    const { input, velocity, controller, playerCollider, gravity } = this;
    const dt = FIXED_STEP;
    this.previousPosition.copy(this.position);

    // Horizontal: move relative to where the camera faces.
    const { x: strafe, y: forward } = input.movement();
    const speed = input.boost ? RUN_SPEED : WALK_SPEED;
    const sin = Math.sin(this.yaw);
    const cos = Math.cos(this.yaw);
    const wantX = (forward * -sin + strafe * cos) * speed;
    const wantZ = (forward * -cos - strafe * sin) * speed;
    const acceleration = (this.grounded ? GROUND_ACCELERATION : AIR_ACCELERATION) * dt;
    const dx = wantX - velocity.x;
    const dz = wantZ - velocity.z;
    const change = Math.hypot(dx, dz);
    const applied = change > acceleration ? acceleration / change : 1;
    velocity.x += dx * applied;
    velocity.z += dz * applied;
    if (Math.hypot(wantX, wantZ) > 0.1) this.heading = Math.atan2(velocity.x, velocity.z);

    if (input.consumeJump() && this.grounded) {
      velocity.y = JUMP_SPEED;
      this.grounded = false;
      controller.disableSnapToGround();
      this.lastJump = { startY: this.position.y, peak: this.position.y, time: 0 };
    }
    // Optional suit thrusters: without them, a jump on Phobos lasts over twenty minutes.
    const thrust = !this.grounded && input.down.has('KeyX') ? SUIT_THRUST : 0;

    // Vertical: constant acceleration, integrated exactly, so jumps match the real formula.
    const totalDown = gravity + thrust;
    let moveY = velocity.y * dt - 0.5 * totalDown * dt * dt;
    if (this.grounded) moveY = -0.04;

    controller.computeColliderMovement(playerCollider, { x: velocity.x * dt, y: moveY, z: velocity.z * dt });
    const moved = controller.computedMovement();
    const nowGrounded = controller.computedGrounded();

    if (!this.grounded) {
      if (velocity.y > 0 && moved.y < moveY * 0.5) velocity.y = 0; // bumped into something overhead
      velocity.y -= totalDown * dt;
      if (this.lastJump) {
        this.lastJump.time += dt;
        this.lastJump.peak = Math.max(this.lastJump.peak, this.position.y + moved.y);
      }
    }
    if (nowGrounded && velocity.y <= 0) {
      if (!this.grounded) {
        controller.enableSnapToGround(0.35);
        if (this.lastJump) {
          this.jumpResult = { height: this.lastJump.peak - this.lastJump.startY, seconds: this.lastJump.time };
          this.lastJump = null;
        }
      }
      this.grounded = true;
      velocity.y = 0;
    } else if (!nowGrounded && this.grounded) {
      // Walked off an edge.
      this.grounded = false;
      controller.disableSnapToGround();
    }

    this.position.x += moved.x;
    this.position.y += moved.y;
    this.position.z += moved.z;
    this.playerBody.setNextKinematicTranslation(this.position);
    this.world.step();
  }

  /** Recentres on the player in whole chunks: the floating origin of the surface scene. */
  _rebaseIfFar() {
    const chunksX = Math.trunc(this.position.x / REBASE_DISTANCE) * 2;
    const chunksZ = Math.trunc(this.position.z / REBASE_DISTANCE) * 2;
    if (!chunksX && !chunksZ) return;
    const shiftX = chunksX * CHUNK_SIZE;
    const shiftZ = chunksZ * CHUNK_SIZE;
    for (const vector of [this.position, this.previousPosition, this.renderPosition, this.ship.position, this.shipPad.position]) {
      vector.x -= shiftX;
      vector.z -= shiftZ;
    }
    this.playerBody.setTranslation(this.position, true);
    this.shipCollider.setTranslation({
      x: this.ship.position.x,
      y: this.shipGroundY + 3.5,
      z: this.ship.position.z,
    });
    this.terrain.shiftOrigin(chunksX, chunksZ);
  }

  _updatePlayerModel(dt) {
    const { player, renderPosition, velocity } = this;
    const feetY = renderPosition.y - FEET_OFFSET;
    player.position.set(renderPosition.x, feetY, renderPosition.z);
    let delta = this.heading - player.rotation.y;
    delta = Math.atan2(Math.sin(delta), Math.cos(delta));
    player.rotation.y += delta * Math.min(1, dt * 12);
    player.userData.animate(dt, Math.hypot(velocity.x, velocity.z), !this.grounded);

    const groundY = this.terrain.heightAt(renderPosition.x, renderPosition.z);
    const altitude = Math.max(0, feetY - groundY);
    this.playerShadow.visible = player.visible;
    this.playerShadow.position.set(renderPosition.x, groundY + 0.06, renderPosition.z);
    this.playerShadow.scale.setScalar(1 + Math.min(altitude * 0.04, 1.2));
    this.playerShadow.material.opacity = 0.36 / (1 + altitude * 0.14);
  }

  _updateCamera() {
    const target = this.phase === 'walking' ? this.renderPosition : this.ship.position;
    const focusY = this.phase === 'walking' ? target.y - FEET_OFFSET + EYE_HEIGHT : target.y + 3.5;
    let distance = this.phase === 'walking' ? this.distance : Math.max(this.distance, 34);
    if (this.phase === 'walking') distance = this._unobstructedDistance(target, focusY, distance);
    const horizontal = Math.cos(this.pitch) * distance;
    const x = target.x + Math.sin(this.yaw) * horizontal;
    const z = target.z + Math.cos(this.yaw) * horizontal;
    let y = focusY + Math.sin(this.pitch) * distance;
    y = Math.max(y, this.terrain.heightAt(x, z) + 0.7);
    this.camera.position.set(x, y, z);
    this.camera.lookAt(target.x, focusY, target.z);
    this.camera.updateMatrixWorld();
  }

  /** Pulls the camera in front of anything between it and the player, like the ship's hull. */
  _unobstructedDistance(target, focusY, wanted) {
    const horizontal = Math.cos(this.pitch);
    const direction = { x: Math.sin(this.yaw) * horizontal, y: Math.sin(this.pitch), z: Math.cos(this.yaw) * horizontal };
    const ray = new this.RAPIER.Ray({ x: target.x, y: focusY, z: target.z }, direction);
    const hit = this.world.castRay(ray, wanted + 0.4, true, undefined, undefined, this.playerCollider);
    return hit ? Math.max(1.2, hit.timeOfImpact - 0.4) : wanted;
  }

  _updateSunlight() {
    const { body, sunLight } = this;
    const eye = this.skyPose().eye;
    const toSun = _vector.copy(eye).negate().normalize();
    // World direction into the site's local axes.
    bodyFixedQuaternion(body, _quatA).multiply(this.siteFrame).invert();
    toSun.applyQuaternion(_quatA);
    sunLight.position.copy(toSun).multiplyScalar(100).add(this.renderPosition);
    sunLight.target.position.copy(this.renderPosition);

    const elevation = toSun.y;
    const day = Math.min(1, Math.max(0, (elevation + 0.05) / 0.25));
    sunLight.intensity = 2.7 * day;
    this.skyLight.intensity = (this.profile.sky ? 0.3 + 0.75 * day : 0.3 + 0.2 * day);
    this.sunElevation = elevation;
    if (this.dome) this.dome.material.uniforms.sunDirection.value.copy(toSun);
  }

  /**
   * Where the Solar System's camera should stand to draw this sky: at the landing site on the
   * body's globe, looking the same way as the surface camera.
   */
  skyPose() {
    const { body } = this;
    const bodyRotation = bodyFixedQuaternion(body, new Quaternion());
    const eye = this.siteNormal.clone().applyQuaternion(bodyRotation)
      .multiplyScalar(body.radius * 1.004).add(body.worldPosition);
    const quaternion = bodyRotation.multiply(this.siteFrame).multiply(this.camera.quaternion);
    return { eye, quaternion };
  }

  dispose() {
    for (const [type, handler] of [
      ['pointerdown', this.listeners.down],
      ['pointermove', this.listeners.move],
      ['pointerup', this.listeners.up],
      ['pointercancel', this.listeners.up],
      ['wheel', this.listeners.wheel],
    ]) {
      this.canvas.removeEventListener(type, handler);
    }
    this.terrain.dispose();
    this.scene.traverse((node) => {
      if (!node.isMesh) return;
      node.geometry?.dispose();
      node.material?.dispose?.();
    });
    this.world.free();
  }
}
