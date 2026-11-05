// Display scales. True proportions would put Neptune roughly 6,500 Sun-radii out and
// shrink Earth to a sub-pixel speck, so each quantity is compressed on its own curve.
// All three are monotonic: a larger or farther body in reality is larger or farther here.
//
// The constants are tuned together. If you change them, make sure that:
//   - the Sun fits inside Mercury's perihelion (0.307 AU)
//   - Jupiter's and Saturn's outermost moon orbits don't overlap
//   - Mimas stays outside Saturn's rings

const DISTANCE_OFFSET = 131;
const DISTANCE_PER_DECADE = 208;
const RADIUS_FACTOR = 0.0194;
const MOON_SPREAD = 0.85;

/** Heliocentric distance: logarithmic in AU. Each factor of 10 adds a fixed span. */
export function distanceFromSun(au) {
  return DISTANCE_OFFSET + DISTANCE_PER_DECADE * Math.log10(au);
}

/** Body radius: square root of km. Jupiter still reads as bigger than Earth, but both stay visible. */
export function displayRadius(km) {
  return RADIUS_FACTOR * Math.sqrt(km);
}

/**
 * Moon orbit radius: logarithmic in parent radii, measured from `clearance` parent radii out.
 * Saturn passes a clearance past its rings so its inner moons don't sit inside them.
 */
export function moonOrbitRadius(semiMajorKm, parentKm, clearance = 1) {
  const spread = Math.log(semiMajorKm / (clearance * parentKm));
  return displayRadius(parentKm) * (clearance + MOON_SPREAD * spread);
}
