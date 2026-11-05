// Orbital mechanics and coordinate frames.
//
// The scene is Y-up with the ecliptic as its ground plane: +X is the J2000 vernal equinox and
// +Y is ecliptic north. Because stars, planets and spin axes all pass through this one frame,
// the sky and the Solar System are correctly aligned with each other.

import { Vector3 } from 'three';
import { distanceFromSun } from './scale.js';

const DEG = Math.PI / 180;
const OBLIQUITY = 23.43928 * DEG;
const COS_OBLIQUITY = Math.cos(OBLIQUITY);
const SIN_OBLIQUITY = Math.sin(OBLIQUITY);
const J2000_MS = Date.UTC(2000, 0, 1, 12);
const MS_PER_DAY = 86400000;

export const daysSinceJ2000 = (ms) => (ms - J2000_MS) / MS_PER_DAY;
export const j2000DaysToDate = (days) => new Date(J2000_MS + days * MS_PER_DAY);

/** Ecliptic (x toward equinox, y, z toward north) to scene axes. */
export function eclipticToScene(x, y, z, out = new Vector3()) {
  return out.set(x, z, -y);
}

/** J2000 right ascension and declination, in degrees, to a unit vector in scene axes. */
export function equatorialToScene(raDeg, decDeg, out = new Vector3()) {
  const ra = raDeg * DEG;
  const dec = decDeg * DEG;
  const x = Math.cos(dec) * Math.cos(ra);
  const y = Math.cos(dec) * Math.sin(ra);
  const z = Math.sin(dec);
  return eclipticToScene(
    x,
    y * COS_OBLIQUITY + z * SIN_OBLIQUITY,
    -y * SIN_OBLIQUITY + z * COS_OBLIQUITY,
    out,
  );
}

function solveKepler(meanAnomaly, eccentricity) {
  let E = meanAnomaly + eccentricity * Math.sin(meanAnomaly);
  for (let i = 0; i < 6; i++) {
    E -= (E - eccentricity * Math.sin(E) - meanAnomaly) / (1 - eccentricity * Math.cos(E));
  }
  return E;
}

/**
 * A planet's Keplerian orbit, from the JPL "Approximate Positions of the Planets" elements.
 *
 * Only the mean longitude advances with time. The orbit's shape and orientation are frozen at
 * `epochDays`, so a planet always sits exactly on its drawn path. Those elements drift only a
 * tiny amount per century.
 */
export class KeplerOrbit {
  constructor(elements, epochDays) {
    const T = epochDays / 36525;
    const value = (name) => elements[name][0] + elements[name][1] * T;
    this.a = value('a');
    this.e = value('e');
    this.L0 = elements.L[0];
    this.Lrate = elements.L[1];
    this.longPeri = value('peri');
    const inclination = value('i') * DEG;
    const node = value('node') * DEG;
    const argPeri = (this.longPeri - value('node')) * DEG;

    // Rotation from the orbital plane to ecliptic axes.
    const cw = Math.cos(argPeri), sw = Math.sin(argPeri);
    const cn = Math.cos(node), sn = Math.sin(node);
    const ci = Math.cos(inclination), si = Math.sin(inclination);
    this.m = [
      cw * cn - sw * sn * ci, -sw * cn - cw * sn * ci,
      cw * sn + sw * cn * ci, -sw * sn + cw * cn * ci,
      sw * si, cw * si,
    ];
    this.semiMinor = this.a * Math.sqrt(1 - this.e * this.e);
  }

  /** True position in AU, in scene axes, for a given eccentric anomaly. */
  positionAU(E, out) {
    const xOrbit = this.a * (Math.cos(E) - this.e);
    const yOrbit = this.semiMinor * Math.sin(E);
    const m = this.m;
    return eclipticToScene(
      m[0] * xOrbit + m[1] * yOrbit,
      m[2] * xOrbit + m[3] * yOrbit,
      m[4] * xOrbit + m[5] * yOrbit,
      out,
    );
  }

  /** Eccentric anomaly at a given day count, in radians. */
  anomalyAt(days) {
    const L = this.L0 + this.Lrate * (days / 36525);
    let M = ((L - this.longPeri) % 360) * DEG;
    if (M > Math.PI) M -= 2 * Math.PI;
    else if (M < -Math.PI) M += 2 * Math.PI;
    return solveKepler(M, this.e);
  }

  /** Compresses a true AU position to scene units, preserving its direction from the Sun. */
  static toScene(positionAU, out) {
    const r = positionAU.length();
    return out.copy(positionAU).multiplyScalar(distanceFromSun(r) / r);
  }

  /** Scene-space points around the whole orbit, for drawing its path. */
  samplePath(segments) {
    const points = [];
    const au = new Vector3();
    for (let i = 0; i <= segments; i++) {
      const E = (i / segments) * 2 * Math.PI;
      this.positionAU(E, au);
      points.push(KeplerOrbit.toScene(au, new Vector3()));
    }
    return points;
  }
}
