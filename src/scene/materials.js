// Custom shaders. Everything here is lit analytically from the Sun at the world origin, so no
// shadow maps or post-processing are needed. That keeps the app fast on phones.

import { AdditiveBlending, BackSide, Color, DoubleSide, ShaderMaterial, Vector3 } from 'three';

// Where the Sun is in render space. Rendering uses a floating origin, so this moves every frame.
export const SUN_POSITION = { value: new Vector3() };

const WORLD_VERTEX = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vWorldNormal;
  varying vec3 vWorldPosition;
  void main() {
    vUv = uv;
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorldPosition = world.xyz;
    vWorldNormal = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

/** The Sun: unlit, with limb darkening and slowly churning granulation from two texture samples. */
export function createSunMaterial() {
  return new ShaderMaterial({
    uniforms: { map: { value: null }, time: { value: 0 } },
    vertexShader: WORLD_VERTEX,
    fragmentShader: /* glsl */ `
      uniform sampler2D map;
      uniform float time;
      varying vec2 vUv;
      varying vec3 vWorldNormal;
      varying vec3 vWorldPosition;
      void main() {
        vec3 a = texture2D(map, vUv + vec2(time * 0.0012, 0.0)).rgb;
        vec3 b = texture2D(map, vUv - vec2(time * 0.0007, -time * 0.0004)).rgb;
        vec3 color = mix(a, b, 0.5 + 0.5 * sin(time * 0.15)) * vec3(1.55, 1.4, 1.2) + vec3(0.1, 0.05, 0.0);
        vec3 toCamera = normalize(cameraPosition - vWorldPosition);
        float facing = clamp(dot(vWorldNormal, toCamera), 0.0, 1.0);
        color *= 0.55 + 0.45 * pow(facing, 0.55);
        gl_FragColor = vec4(color, 1.0);
        #include <colorspace_fragment>
      }
    `,
  });
}

/** Earth: daylight map on the lit side, city lights fading in across the terminator. */
export function createEarthMaterial() {
  return new ShaderMaterial({
    uniforms: { dayMap: { value: null }, nightMap: { value: null }, sunPosition: SUN_POSITION },
    vertexShader: WORLD_VERTEX,
    fragmentShader: /* glsl */ `
      uniform sampler2D dayMap;
      uniform sampler2D nightMap;
      uniform vec3 sunPosition;
      varying vec2 vUv;
      varying vec3 vWorldNormal;
      varying vec3 vWorldPosition;
      void main() {
        vec3 toSun = normalize(sunPosition - vWorldPosition);
        float light = dot(normalize(vWorldNormal), toSun);
        vec3 day = texture2D(dayMap, vUv).rgb;
        vec3 night = texture2D(nightMap, vUv).rgb;
        vec3 color = day * max(light, 0.0) * 1.05 + day * 0.02;
        color += night * smoothstep(0.08, -0.14, light) * vec3(1.25, 1.1, 0.85);
        gl_FragColor = vec4(color, 1.0);
        #include <colorspace_fragment>
      }
    `,
  });
}

/** A thin shell glowing at the limb on the daylight side, rendered from the inside. */
export function createAtmosphereMaterial(color, strength) {
  return new ShaderMaterial({
    uniforms: { color: { value: new Color(color) }, strength: { value: strength }, sunPosition: SUN_POSITION },
    vertexShader: WORLD_VERTEX,
    fragmentShader: /* glsl */ `
      uniform vec3 color;
      uniform float strength;
      uniform vec3 sunPosition;
      varying vec3 vWorldNormal;
      varying vec3 vWorldPosition;
      void main() {
        vec3 normal = normalize(vWorldNormal);
        vec3 toCamera = normalize(cameraPosition - vWorldPosition);
        vec3 toSun = normalize(sunPosition - vWorldPosition);
        float edge = clamp(-dot(normal, toCamera), 0.0, 1.0);
        float rim = smoothstep(0.0, 0.32, edge);
        float daylight = smoothstep(-0.35, 0.5, dot(normal, toSun));
        gl_FragColor = vec4(color, rim * daylight * strength * 0.8);
        #include <colorspace_fragment>
      }
    `,
    side: BackSide,
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
  });
}

/** Saturn's rings: the texture runs radially, and the planet casts a soft shadow across them. */
export function createRingMaterial(innerRadius, outerRadius) {
  return new ShaderMaterial({
    uniforms: {
      map: { value: null },
      inner: { value: innerRadius },
      outer: { value: outerRadius },
      sunPosition: SUN_POSITION,
      planetRadius: { value: 1 },
    },
    vertexShader: /* glsl */ `
      varying vec3 vLocal;
      varying vec3 vWorldPosition;
      varying vec3 vPlanetCenter;
      void main() {
        vLocal = position;
        vPlanetCenter = modelMatrix[3].xyz;
        vec4 world = modelMatrix * vec4(position, 1.0);
        vWorldPosition = world.xyz;
        gl_Position = projectionMatrix * viewMatrix * world;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform sampler2D map;
      uniform float inner;
      uniform float outer;
      uniform vec3 sunPosition;
      varying vec3 vPlanetCenter;
      uniform float planetRadius;
      varying vec3 vLocal;
      varying vec3 vWorldPosition;
      void main() {
        float u = (length(vLocal.xy) - inner) / (outer - inner);
        vec4 ringColor = texture2D(map, vec2(u, 0.5));
        vec3 toSun = normalize(sunPosition - vWorldPosition);
        vec3 fromCenter = vWorldPosition - vPlanetCenter;
        float along = dot(fromCenter, toSun);
        float offAxis = length(fromCenter - toSun * along);
        float lit = along > 0.0 ? 1.0 : smoothstep(planetRadius * 0.96, planetRadius * 1.04, offAxis);
        gl_FragColor = vec4(ringColor.rgb * (0.04 + 0.96 * lit), ringColor.a);
        #include <colorspace_fragment>
      }
    `,
    side: DoubleSide,
    transparent: true,
    depthWrite: false,
  });
}

/** An orbit line: faint all the way round, brightening into a comet-like trail behind the body. */
export function createOrbitMaterial(color, baseAlpha) {
  return new ShaderMaterial({
    uniforms: {
      color: { value: new Color(color) },
      head: { value: 0 },
      baseAlpha: { value: baseAlpha },
      trailAlpha: { value: 0.5 },
    },
    vertexShader: /* glsl */ `
      attribute float phase;
      uniform float head;
      uniform float baseAlpha;
      uniform float trailAlpha;
      varying float vAlpha;
      void main() {
        float behind = fract(head - phase);
        vAlpha = baseAlpha + trailAlpha * pow(1.0 - behind, 5.0);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 color;
      varying float vAlpha;
      void main() {
        gl_FragColor = vec4(color, vAlpha);
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
  });
}

/** Small dots keeping far-away bodies visible. Hidden by depth once a body's sphere covers them. */
export function createMarkerMaterial(pixelRatio) {
  return new ShaderMaterial({
    uniforms: { pixelRatio: { value: pixelRatio } },
    vertexShader: /* glsl */ `
      attribute vec3 color;
      attribute float size;
      uniform float pixelRatio;
      varying vec3 vColor;
      void main() {
        vColor = color;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = size * pixelRatio;
      }
    `,
    fragmentShader: /* glsl */ `
      varying vec3 vColor;
      void main() {
        float d = length(gl_PointCoord - 0.5);
        gl_FragColor = vec4(vColor, smoothstep(0.5, 0.2, d));
      }
    `,
    transparent: true,
    depthWrite: false,
  });
}
