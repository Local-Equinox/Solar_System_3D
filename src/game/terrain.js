// Endless procedural ground for each landable world, as chunks streamed around the player.
//
// Chunks are addressed by integer indices, so the height function never sees a large
// floating-point coordinate. Meshes and colliders are placed relative to a movable origin chunk.

import {
  BufferAttribute, BufferGeometry, Color, IcosahedronGeometry, InstancedMesh, Matrix4, Mesh, MeshLambertMaterial,
  Quaternion, Vector3,
} from 'three';

export const CHUNK_SIZE = 128;
const NEAR_RADIUS = 1; // chunks with full detail and physics
const MID_RADIUS = 2;
const FAR_RADIUS = 5;
const RESOLUTION = { near: 64, mid: 32, far: 8 };
const SKIRT_DEPTH = 8; // hides cracks where chunks of different detail meet
const ROCKS_PER_CHUNK = 34;

// Per-world looks. Anything not listed gets a cratered, airless default with colours sampled from
// the world's own map. `sky` is the colour of an atmosphere's daytime sky.
const PROFILES = {
  mercury: { amplitude: 16, craterDepth: 1 },
  venus: { amplitude: 13, craterDepth: 0.25, palette: ['#4e2f18', '#8c5a2b', '#c08a4a'], sky: '#dd9f55' },
  earth: { amplitude: 12, craterDepth: 0, palette: ['#3a5f2c', '#5d8a3a', '#8f8a6a'], sky: '#6fb1ff', rocks: 0.45 },
  moon: { amplitude: 15, craterDepth: 1.1 },
  mars: { amplitude: 15, craterDepth: 0.55, sky: '#c99a72' },
  io: { amplitude: 11, craterDepth: 0 },
  europa: { amplitude: 5, craterDepth: 0.12 },
  titan: { amplitude: 9, craterDepth: 0.1, palette: ['#4f3216', '#7a5226', '#a97b3a'], sky: '#c8873a', rocks: 0.5 },
  enceladus: { amplitude: 7, craterDepth: 0.35 },
};
const DEFAULT_PROFILE = { amplitude: 13, craterDepth: 1 };

/** Three representative colours from a world's map: the mean of its dark, mid and bright pixels. */
function samplePalette(body) {
  const fallback = [body.color.clone().multiplyScalar(0.45), body.color.clone().multiplyScalar(0.75), body.color.clone()];
  const image = body.surface.material.map?.image;
  if (!image) return fallback;
  try {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 32;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    context.drawImage(image, 0, 0, 64, 32);
    const { data } = context.getImageData(0, 0, 64, 32);
    const pixels = [];
    for (let i = 0; i < data.length; i += 4) pixels.push([data[i], data[i + 1], data[i + 2]]);
    pixels.sort((a, b) => a[0] + a[1] + a[2] - b[0] - b[1] - b[2]);
    const third = Math.floor(pixels.length / 3);
    return [0, 1, 2].map((slice) => {
      const group = pixels.slice(slice * third, (slice + 1) * third);
      const mean = [0, 1, 2].map((c) => group.reduce((sum, p) => sum + p[c], 0) / group.length / 255);
      return new Color().setRGB(mean[0], mean[1], mean[2], 'srgb');
    });
  } catch {
    return fallback;
  }
}

export function surfaceProfile(body) {
  const profile = { ...DEFAULT_PROFILE, rocks: 1, ...PROFILES[body.id] };
  profile.colors = profile.palette ? profile.palette.map((c) => new Color(c)) : samplePalette(body);
  let seed = 0;
  for (const char of body.id) seed = Math.imul(seed, 31) + char.charCodeAt(0);
  profile.seed = seed;
  return profile;
}

function hash(ix, iz, seed) {
  let h = Math.imul(ix, 374761393) + Math.imul(iz, 668265263) + Math.imul(seed, 1274126177);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function valueNoise(x, z, seed) {
  const ix = Math.floor(x);
  const iz = Math.floor(z);
  const fx = x - ix;
  const fz = z - iz;
  const u = fx * fx * (3 - 2 * fx);
  const v = fz * fz * (3 - 2 * fz);
  const a = hash(ix, iz, seed);
  const b = hash(ix + 1, iz, seed);
  const c = hash(ix, iz + 1, seed);
  const d = hash(ix + 1, iz + 1, seed);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

function fbm(x, z, seed, octaves) {
  let sum = 0;
  let amplitude = 0.5;
  for (let i = 0; i < octaves; i++) {
    sum += valueNoise(x, z, seed + i * 17) * amplitude;
    x = x * 2.03 + 11.3;
    z = z * 2.03 - 7.1;
    amplitude *= 0.5;
  }
  return sum;
}

const CRATER_CELL = 170;

function craterHeight(x, z, profile) {
  const cellX = Math.floor(x / CRATER_CELL);
  const cellZ = Math.floor(z / CRATER_CELL);
  let height = 0;
  for (let dz = -1; dz <= 1; dz++) {
    for (let dx = -1; dx <= 1; dx++) {
      const cx = cellX + dx;
      const cz = cellZ + dz;
      if (hash(cx, cz, profile.seed + 3) < 0.45) continue;
      const centerX = (cx + hash(cx, cz, profile.seed + 5)) * CRATER_CELL;
      const centerZ = (cz + hash(cx, cz, profile.seed + 7)) * CRATER_CELL;
      const radius = 14 + hash(cx, cz, profile.seed + 9) * 62;
      const d = Math.hypot(x - centerX, z - centerZ) / radius;
      if (d > 1.7) continue;
      const depth = radius * 0.13;
      if (d < 1) height += (d * d - 1) * depth + depth * 0.25 * d * d;
      else height += depth * 0.25 * (1 - (d - 1) / 0.7) ** 2;
    }
  }
  return height * profile.craterDepth;
}

/** Ground height at a global position, levelled off into a landing site around the origin. */
export function terrainHeight(x, z, profile) {
  const { amplitude, seed } = profile;
  let height = (fbm(x / 340, z / 340, seed, 4) - 0.47) * amplitude * 2.3;
  height += (fbm(x / 34, z / 34, seed + 40, 3) - 0.44) * amplitude * 0.16;
  if (profile.craterDepth > 0) height += craterHeight(x, z, profile);
  const site = Math.hypot(x, z);
  if (site < 60) {
    const t = Math.max(0, (site - 22) / 38);
    height *= t * t * (3 - 2 * t);
  }
  return height;
}

function buildGeometry(ix, iz, resolution, profile) {
  const n = resolution;
  const side = n + 3; // one extra row around each edge forms the skirt
  const positions = new Float32Array(side * side * 3);
  const normals = new Float32Array(side * side * 3);
  const colors = new Float32Array(side * side * 3);
  const step = CHUNK_SIZE / n;
  const originX = ix * CHUNK_SIZE;
  const originZ = iz * CHUNK_SIZE;
  const [low, mid, high] = profile.colors;
  const color = new Color();
  const epsilon = step;

  for (let row = 0; row < side; row++) {
    for (let col = 0; col < side; col++) {
      const edge = row === 0 || col === 0 || row === side - 1 || col === side - 1;
      const localX = Math.min(n, Math.max(0, col - 1)) * step;
      const localZ = Math.min(n, Math.max(0, row - 1)) * step;
      const x = originX + localX;
      const z = originZ + localZ;
      const height = terrainHeight(x, z, profile);
      const i = (row * side + col) * 3;
      positions[i] = localX;
      positions[i + 1] = height - (edge ? SKIRT_DEPTH : 0);
      positions[i + 2] = localZ;

      const nx = terrainHeight(x - epsilon, z, profile) - terrainHeight(x + epsilon, z, profile);
      const nz = terrainHeight(x, z - epsilon, profile) - terrainHeight(x, z + epsilon, profile);
      const ny = 2 * epsilon;
      const length = Math.hypot(nx, ny, nz);
      normals[i] = nx / length;
      normals[i + 1] = ny / length;
      normals[i + 2] = nz / length;

      const tone = fbm(x / 23, z / 23, profile.seed + 90, 3);
      const speck = valueNoise(x / 2.7, z / 2.7, profile.seed + 120);
      const shade = Math.min(1, Math.max(0, (tone - 0.28) * 2.4 + (speck - 0.5) * 0.28));
      if (shade < 0.5) color.copy(low).lerp(mid, shade * 2);
      else color.copy(mid).lerp(high, shade * 2 - 1);
      const steep = 1 - ny / length;
      color.multiplyScalar(1 - Math.min(0.45, steep * 1.6));
      colors[i] = color.r;
      colors[i + 1] = color.g;
      colors[i + 2] = color.b;
    }
  }

  const indices = new Uint32Array((side - 1) * (side - 1) * 6);
  let cursor = 0;
  for (let row = 0; row < side - 1; row++) {
    for (let col = 0; col < side - 1; col++) {
      const a = row * side + col;
      const b = a + 1;
      const c = a + side;
      const d = c + 1;
      indices[cursor++] = a;
      indices[cursor++] = c;
      indices[cursor++] = b;
      indices[cursor++] = b;
      indices[cursor++] = c;
      indices[cursor++] = d;
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new BufferAttribute(normals, 3));
  geometry.setAttribute('color', new BufferAttribute(colors, 3));
  geometry.setIndex(new BufferAttribute(indices, 1));
  return geometry;
}

const ROCK_GEOMETRY = new IcosahedronGeometry(1, 1);
{
  const positions = ROCK_GEOMETRY.attributes.position;
  const vertex = new Vector3();
  for (let i = 0; i < positions.count; i++) {
    vertex.fromBufferAttribute(positions, i);
    vertex.multiplyScalar(0.82 + 0.3 * valueNoise(vertex.x * 2 + 5, vertex.z * 2 + vertex.y * 3, 8));
    positions.setXYZ(i, vertex.x, vertex.y * 0.72, vertex.z);
  }
  ROCK_GEOMETRY.computeVertexNormals();
}

const _matrix = new Matrix4();
const _position = new Vector3();
const _quaternion = new Quaternion();
const _scale = new Vector3();
const _axis = new Vector3();

export class Terrain {
  constructor(RAPIER, world, scene, profile, prepareMaterial) {
    Object.assign(this, { RAPIER, world, scene, profile });
    this.chunks = new Map();
    this.originX = 0; // chunk index at render-space (0, 0)
    this.originZ = 0;
    this.material = prepareMaterial(new MeshLambertMaterial({ vertexColors: true }));
    this.rockMaterial = prepareMaterial(new MeshLambertMaterial({ color: profile.colors[0].clone().lerp(profile.colors[1], 0.35), flatShading: true }));
    this.queue = [];
  }

  /** Global (unbounded) coordinates of a point in render space. */
  heightAt(localX, localZ) {
    return terrainHeight(localX + this.originX * CHUNK_SIZE, localZ + this.originZ * CHUNK_SIZE, this.profile);
  }

  /** Moves the origin by whole chunks and shifts everything already placed to match. */
  shiftOrigin(chunksX, chunksZ) {
    this.originX += chunksX;
    this.originZ += chunksZ;
    for (const chunk of this.chunks.values()) this._place(chunk);
  }

  _place(chunk) {
    const x = (chunk.ix - this.originX) * CHUNK_SIZE;
    const z = (chunk.iz - this.originZ) * CHUNK_SIZE;
    chunk.mesh.position.set(x, 0, z);
    if (chunk.rocks) chunk.rocks.position.set(x, 0, z);
    chunk.collider?.setTranslation({ x, y: 0, z });
    if (chunk.rockColliders) {
      for (const { collider, localX, localY, localZ } of chunk.rockColliders) {
        collider.setTranslation({ x: x + localX, y: localY, z: z + localZ });
      }
    }
  }

  /**
   * Streams chunks around a render-space position.
   * @param budget chunks that may be built now; Infinity for the first frame
   */
  update(localX, localZ, budget = 1) {
    const centerX = Math.floor(localX / CHUNK_SIZE) + this.originX;
    const centerZ = Math.floor(localZ / CHUNK_SIZE) + this.originZ;

    for (const [key, chunk] of this.chunks) {
      if (Math.max(Math.abs(chunk.ix - centerX), Math.abs(chunk.iz - centerZ)) > FAR_RADIUS + 1) {
        this._remove(chunk);
        this.chunks.delete(key);
      }
    }

    const needed = [];
    for (let dz = -FAR_RADIUS; dz <= FAR_RADIUS; dz++) {
      for (let dx = -FAR_RADIUS; dx <= FAR_RADIUS; dx++) {
        const ring = Math.max(Math.abs(dx), Math.abs(dz));
        const detail = ring <= NEAR_RADIUS ? 'near' : ring <= MID_RADIUS ? 'mid' : 'far';
        const existing = this.chunks.get(`${centerX + dx},${centerZ + dz}`);
        if (!existing || existing.detail !== detail) needed.push({ ix: centerX + dx, iz: centerZ + dz, detail, ring });
      }
    }
    needed.sort((a, b) => a.ring - b.ring);
    let built = 0;
    for (const job of needed) {
      if (built >= budget) break;
      this._build(job);
      built++;
    }
  }

  _build({ ix, iz, detail }) {
    const key = `${ix},${iz}`;
    const old = this.chunks.get(key);
    if (old) this._remove(old);

    const geometry = buildGeometry(ix, iz, RESOLUTION[detail], this.profile);
    const mesh = new Mesh(geometry, this.material);
    this.scene.add(mesh);
    const chunk = { ix, iz, detail, mesh };

    if (detail === 'near') {
      const desc = this.RAPIER.ColliderDesc.trimesh(geometry.attributes.position.array, geometry.index.array);
      chunk.collider = this.world.createCollider(desc);
    }
    if (detail !== 'far') this._addRocks(chunk);
    this._place(chunk);
    this.chunks.set(key, chunk);
  }

  _addRocks(chunk) {
    const { profile } = this;
    const { ix, iz } = chunk;
    const seed = profile.seed + 200;
    const count = Math.round(ROCKS_PER_CHUNK * profile.rocks);
    if (!count) return;
    const rocks = new InstancedMesh(ROCK_GEOMETRY, this.rockMaterial, count);
    rocks.frustumCulled = false;
    const withPhysics = chunk.detail === 'near';
    if (withPhysics) chunk.rockColliders = [];
    for (let i = 0; i < count; i++) {
      const localX = hash(ix * 977 + i, iz, seed) * CHUNK_SIZE;
      const localZ = hash(ix, iz * 613 + i, seed + 1) * CHUNK_SIZE;
      const globalX = ix * CHUNK_SIZE + localX;
      const globalZ = iz * CHUNK_SIZE + localZ;
      const size = 0.25 + hash(ix + i, iz + i, seed + 2) ** 4 * 3.2;
      // Keep the landing site clear for the ship.
      const clear = Math.hypot(globalX, globalZ) < 28;
      const radius = clear ? 0 : size;
      const y = terrainHeight(globalX, globalZ, profile) + radius * 0.15;
      _position.set(localX, y, localZ);
      _quaternion.setFromAxisAngle(_axis.set(hash(i, ix, seed + 3) - 0.5, 1, hash(i, iz, seed + 4) - 0.5).normalize(), i * 2.4);
      _scale.setScalar(Math.max(radius, 0.0001));
      rocks.setMatrixAt(i, _matrix.compose(_position, _quaternion, _scale));
      if (withPhysics && radius > 0.5) {
        const collider = this.world.createCollider(this.RAPIER.ColliderDesc.ball(radius * 0.72));
        chunk.rockColliders.push({ collider, localX, localY: y, localZ });
      }
    }
    chunk.rocks = rocks;
    this.scene.add(rocks);
  }

  _remove(chunk) {
    this.scene.remove(chunk.mesh);
    chunk.mesh.geometry.dispose();
    if (chunk.collider) this.world.removeCollider(chunk.collider, false);
    if (chunk.rocks) {
      this.scene.remove(chunk.rocks);
      chunk.rocks.dispose();
    }
    chunk.rockColliders?.forEach(({ collider }) => this.world.removeCollider(collider, false));
  }

  dispose() {
    for (const chunk of this.chunks.values()) this._remove(chunk);
    this.chunks.clear();
    this.material.dispose();
    this.rockMaterial.dispose();
  }
}
