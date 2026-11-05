// The sky: real stars and constellations, from the J2000 catalog in assets/sky.
//
// Everything here lives in its own scene, rendered behind the main scene with depth cleared in
// between. The Raycaster only ever tests the bodies' surface meshes in the main scene, so the sky
// can't be selected. Each object's `raycast` is also a no-op, so that stays true even if someone
// later points a raycaster at this scene.
//
// The sky's camera sits at the origin and shares only the main camera's rotation, which makes the
// stars infinitely far away: they never shift as you fly around.

import {
  AdditiveBlending, BufferAttribute, BufferGeometry, CanvasTexture, Color, LineBasicMaterial, LineSegments,
  LinearFilter, PerspectiveCamera, Points, Scene, ShaderMaterial, Vector2, Vector3, Mesh,
} from 'three';
import { equatorialToScene } from '../astro.js';

const SKY_RADIUS = 1000;
const noRaycast = () => {};

/** Approximate star colour from its B-V index (Ballesteros temperature, blackbody fit). */
function colorFromBV(bv, target) {
  const clamped = Math.min(2, Math.max(-0.4, bv));
  const T = 4600 * (1 / (0.92 * clamped + 1.7) + 1 / (0.92 * clamped + 0.62));
  const t = T / 100;
  const r = t <= 66 ? 1 : Math.min(1, 1.2929 * Math.pow(t - 60, -0.1332));
  const g = t <= 66
    ? Math.min(1, Math.max(0, 0.39 * Math.log(t) - 0.6318))
    : Math.min(1, 1.1299 * Math.pow(t - 60, -0.0755));
  const b = t >= 66 ? 1 : t <= 19 ? 0 : Math.min(1, Math.max(0, 0.5432 * Math.log(t - 10) - 1.1963));
  return target.setRGB(r, g, b);
}

function buildStars(buffer, pixelRatio) {
  const records = new Int16Array(buffer);
  const count = records.length / 4;
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const magnitudes = new Float32Array(count);
  const direction = new Vector3();
  const color = new Color();

  for (let i = 0; i < count; i++) {
    const ra = (records[i * 4] * 180) / 32767;
    const dec = (records[i * 4 + 1] * 90) / 32767;
    magnitudes[i] = records[i * 4 + 2] / 1000;
    equatorialToScene(ra, dec, direction).multiplyScalar(SKY_RADIUS).toArray(positions, i * 3);
    colorFromBV(records[i * 4 + 3] / 1000, color).toArray(colors, i * 3);
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(positions, 3));
  geometry.setAttribute('color', new BufferAttribute(colors, 3));
  geometry.setAttribute('magnitude', new BufferAttribute(magnitudes, 1));

  const material = new ShaderMaterial({
    uniforms: { pixelRatio: { value: pixelRatio } },
    vertexShader: /* glsl */ `
      attribute vec3 color;
      attribute float magnitude;
      uniform float pixelRatio;
      varying vec3 vColor;
      varying float vAlpha;
      void main() {
        // Apparent brightness falls 2.512x per magnitude; size and alpha together carry the range.
        vAlpha = clamp(pow(10.0, -0.13 * (magnitude - 2.0)), 0.12, 1.0);
        vColor = mix(vec3(1.0), color, 0.75);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = clamp(4.1 - 0.42 * magnitude, 1.4, 6.0) * pixelRatio;
      }
    `,
    fragmentShader: /* glsl */ `
      varying vec3 vColor;
      varying float vAlpha;
      void main() {
        float d = length(gl_PointCoord - 0.5);
        gl_FragColor = vec4(vColor, vAlpha * smoothstep(0.5, 0.18, d));
      }
    `,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    blending: AdditiveBlending,
  });

  const points = new Points(geometry, material);
  points.frustumCulled = false;
  points.raycast = noRaycast;
  return points;
}

function buildConstellationLines(constellations) {
  const vertices = [];
  const a = new Vector3();
  const b = new Vector3();
  for (const { lines } of constellations) {
    for (const polyline of lines) {
      for (let i = 0; i < polyline.length - 1; i++) {
        equatorialToScene(polyline[i][0], polyline[i][1], a).multiplyScalar(SKY_RADIUS);
        equatorialToScene(polyline[i + 1][0], polyline[i + 1][1], b).multiplyScalar(SKY_RADIUS);
        vertices.push(a.x, a.y, a.z, b.x, b.y, b.z);
      }
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(vertices), 3));
  const lines = new LineSegments(geometry, new LineBasicMaterial({
    color: 0x7f9fd4, transparent: true, opacity: 0.17, depthTest: false, depthWrite: false,
    blending: AdditiveBlending,
  }));
  lines.frustumCulled = false;
  lines.raycast = noRaycast;
  return lines;
}

/** Constellation names: one atlas texture and one draw call, as screen-aligned quads. */
function buildConstellationNames(constellations, pixelRatio, resolution) {
  const FONT_PX = 26;
  const ROW = FONT_PX + 10;
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 1024;
  const g = canvas.getContext('2d');
  g.font = `400 ${FONT_PX}px -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif`;
  g.textBaseline = 'middle';
  g.fillStyle = '#ffffff';

  const positions = [];
  const corners = [];
  const uvs = [];
  const indices = [];
  const direction = new Vector3();
  let x = 4;
  let y = 4;
  constellations.forEach((c, i) => {
    const text = c.name.toUpperCase().split('').join(' ');
    const width = Math.ceil(g.measureText(text).width) + 4;
    if (x + width > canvas.width) {
      x = 4;
      y += ROW;
    }
    g.fillText(text, x, y + ROW / 2);

    const u0 = x / canvas.width;
    const u1 = (x + width) / canvas.width;
    const v1 = 1 - y / canvas.height;
    const v0 = 1 - (y + ROW) / canvas.height;
    equatorialToScene(c.label[0], c.label[1], direction).multiplyScalar(SKY_RADIUS);
    for (const [cx, cy, u, v] of [[-1, -1, u0, v0], [1, -1, u1, v0], [1, 1, u1, v1], [-1, 1, u0, v1]]) {
      positions.push(direction.x, direction.y, direction.z);
      corners.push(cx * width * 0.5, cy * ROW * 0.5);
      uvs.push(u, v);
    }
    const base = i * 4;
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
    x += width + 6;
  });

  const texture = new CanvasTexture(canvas);
  texture.minFilter = LinearFilter;
  texture.generateMipmaps = false;

  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3));
  geometry.setAttribute('corner', new BufferAttribute(new Float32Array(corners), 2));
  geometry.setAttribute('uv', new BufferAttribute(new Float32Array(uvs), 2));
  geometry.setIndex(indices);

  const material = new ShaderMaterial({
    uniforms: { atlas: { value: texture }, pixelRatio: { value: pixelRatio }, resolution: { value: resolution } },
    vertexShader: /* glsl */ `
      attribute vec2 corner;
      uniform float pixelRatio;
      uniform vec2 resolution;
      varying vec2 vUv;
      void main() {
        vUv = uv;
        vec4 clip = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        // The atlas is drawn at twice display size, for crispness on high-DPI screens.
        clip.xy += corner * 0.42 * pixelRatio * 2.0 / resolution * clip.w;
        gl_Position = clip;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform sampler2D atlas;
      varying vec2 vUv;
      void main() {
        gl_FragColor = vec4(0.62, 0.72, 0.92, texture2D(atlas, vUv).a * 0.55);
      }
    `,
    transparent: true,
    depthTest: false,
    depthWrite: false,
  });
  const names = new Mesh(geometry, material);
  names.frustumCulled = false;
  names.raycast = noRaycast;
  return names;
}

export class Starfield {
  constructor(pixelRatio) {
    this.scene = new Scene();
    this.camera = new PerspectiveCamera();
    this.pixelRatio = pixelRatio;
    this.resolution = new Vector2(1, 1);
  }

  async load() {
    const [starsResponse, constellationsResponse] = await Promise.all([
      fetch('assets/sky/stars.bin'),
      fetch('assets/sky/constellations.json'),
    ]);
    if (!starsResponse.ok || !constellationsResponse.ok) throw new Error('Sky catalog failed to load');
    const [buffer, constellations] = await Promise.all([
      starsResponse.arrayBuffer(),
      constellationsResponse.json(),
    ]);
    this.stars = buildStars(buffer, this.pixelRatio);
    this.lines = buildConstellationLines(constellations);
    this.names = buildConstellationNames(constellations, this.pixelRatio, this.resolution);
    this.scene.add(this.stars, this.lines, this.names);
    this.setPixelRatio(this.pixelRatio);
  }

  setPixelRatio(pixelRatio) {
    this.pixelRatio = pixelRatio;
    if (this.stars) this.stars.material.uniforms.pixelRatio.value = pixelRatio;
    if (this.names) this.names.material.uniforms.pixelRatio.value = pixelRatio;
  }

  setDrawingSize(width, height) {
    this.resolution.set(width, height);
  }

  setConstellationsVisible(visible) {
    if (this.lines) this.lines.visible = visible;
    if (this.names) this.names.visible = visible;
  }

  /** Matches the main camera's rotation and lens, including its view offset. */
  syncTo(mainCamera) {
    this.camera.quaternion.copy(mainCamera.quaternion);
    this.camera.projectionMatrix.copy(mainCamera.projectionMatrix);
    this.camera.projectionMatrixInverse.copy(mainCamera.projectionMatrixInverse);
    this.camera.updateMatrixWorld();
  }
}
