// The catalog of bodies: physical facts for the panel and parameters for the simulation.
//
//   mass       [mantissa, exponent] in kg
//   radiusKm   mean radius
//   gravity    surface gravity, m/s^2
//   orbitDays  sidereal orbital period (moons: around their planet)
//   rotHours   sidereal rotation; negative means retrograde
//   pole       IAU rotation model: north pole RA/Dec, prime meridian W0 and rate, in degrees and
//              degrees per day (J2000). Places each globe's real axis and starting orientation.
//   elements   JPL approximate Keplerian elements, valid 1800-2050: [value at J2000, rate per
//              Julian century] for a (AU), e, i, L, peri, node (degrees)
//   orbit      moon orbit: semi-major axis in km, plus inclination and node in degrees relative
//              to the parent's equator (or to the ecliptic, for frame: 'ecliptic')
//
// Physical values are from the NASA/JPL planetary and satellite fact sheets. Known-moon counts
// are from 2025 and keep growing as surveys find small outer moons.

const P = (path) => `assets/textures/planets/${path}`;
const M = (name) => `assets/textures/moons/${name}.jpg`;

const VOYAGER_GAP_NOTE =
  'Voyager 2 is the only spacecraft to have visited, and it saw only part of this surface. Unmapped areas are a flat neutral colour.';

export const BODIES = [
  {
    id: 'sun', name: 'Sun', kind: 'star', type: 'G2V yellow dwarf star', color: '#ffc46b',
    texture: P('sun.jpg'),
    mass: [1.989, 30], radiusKm: 695700, gravity: 274, rotHours: 609.12, orbitDays: null,
    temperature: '5,500 °C at the surface; 15 million °C at the core',
    composition: 'Hydrogen 73%, helium 25%',
    pole: { ra: 286.13, dec: 63.87, w0: 84.176, wd: 14.1844 },
    tilt: 7.25,
    blurb: 'Holds 99.86% of the Solar System’s mass. It fuses about 600 million tonnes of hydrogen every second, and its light takes 8.3 minutes to reach Earth.',
  },
  {
    id: 'mercury', name: 'Mercury', kind: 'planet', type: 'Terrestrial planet', color: '#b5a899',
    texture: P('mercury.jpg'),
    mass: [3.301, 23], radiusKm: 2439.7, gravity: 3.7, rotHours: 1407.6, orbitDays: 87.969,
    tilt: 0.034, knownMoons: 0, distance: '0.387 AU (57.9 million km)',
    temperature: '−180 to 430 °C', composition: 'Trace exosphere of oxygen, sodium, hydrogen',
    pole: { ra: 281.0103, dec: 61.4155, w0: 329.5988, wd: 6.1385108 },
    elements: {
      a: [0.38709927, 0.00000037], e: [0.20563593, 0.00001906], i: [7.00497902, -0.00594749],
      L: [252.2503235, 149472.67411175], peri: [77.45779628, 0.16047689], node: [48.33076593, -0.12534081],
    },
    blurb: 'The smallest planet and the fastest, circling the Sun in just 88 days. Its long days and airless surface give it the widest temperature swing of any planet.',
  },
  {
    id: 'venus', name: 'Venus', kind: 'planet', type: 'Terrestrial planet', color: '#e6c58a',
    texture: P('venus_atmosphere.jpg'),
    mass: [4.867, 24], radiusKm: 6051.8, gravity: 8.87, rotHours: -5832.5, orbitDays: 224.701,
    tilt: 177.4, knownMoons: 0, distance: '0.723 AU (108.2 million km)',
    temperature: '464 °C', composition: 'Carbon dioxide 96.5%, nitrogen 3.5%',
    atmosphere: { color: '#f0d9a8', strength: 0.7 },
    pole: { ra: 272.76, dec: 67.16, w0: 160.2, wd: -1.4813688 },
    elements: {
      a: [0.72333566, 0.0000039], e: [0.00677672, -0.00004107], i: [3.39467605, -0.0007889],
      L: [181.9790995, 58517.81538729], peri: [131.60246718, 0.00268329], node: [76.67984255, -0.27769418],
    },
    blurb: 'The hottest planet, wrapped in a crushing carbon-dioxide atmosphere and clouds of sulfuric acid. It spins backwards, and its day is longer than its year.',
  },
  {
    id: 'earth', name: 'Earth', kind: 'planet', type: 'Terrestrial planet', color: '#6fa8ff',
    texture: P('earth_daymap.jpg'), nightTexture: P('earth_nightmap.jpg'), cloudTexture: P('earth_clouds.jpg'),
    mass: [5.972, 24], radiusKm: 6371, gravity: 9.81, rotHours: 23.934, orbitDays: 365.256,
    tilt: 23.44, knownMoons: 1, distance: '1.000 AU (149.6 million km)',
    temperature: '15 °C average', composition: 'Nitrogen 78%, oxygen 21%',
    atmosphere: { color: '#6fb1ff', strength: 1 },
    pole: { ra: 0, dec: 90, w0: 190.147, wd: 360.9856235 },
    elements: {
      a: [1.00000261, 0.00000562], e: [0.01671123, -0.00004392], i: [-0.00001531, -0.01294668],
      L: [100.46457166, 35999.37244981], peri: [102.93768193, 0.32327364], node: [0, 0],
    },
    blurb: 'The only world known to harbour life, and the only one with stable liquid water on its surface, covering about 71% of it.',
  },
  {
    id: 'mars', name: 'Mars', kind: 'planet', type: 'Terrestrial planet', color: '#e0805a',
    texture: P('mars.jpg'),
    mass: [6.417, 23], radiusKm: 3389.5, gravity: 3.71, rotHours: 24.623, orbitDays: 686.98,
    tilt: 25.19, knownMoons: 2, distance: '1.524 AU (227.9 million km)',
    temperature: '−65 °C average', composition: 'Carbon dioxide 95%, nitrogen 2.8%, argon 2%',
    atmosphere: { color: '#e8a57a', strength: 0.35 },
    pole: { ra: 317.269, dec: 54.433, w0: 176.049, wd: 350.89198226 },
    elements: {
      a: [1.52371034, 0.00001847], e: [0.0933941, 0.00007882], i: [1.84969142, -0.00813131],
      L: [-4.55343205, 19140.30268499], peri: [-23.94362959, 0.44441088], node: [49.55953891, -0.29257343],
    },
    blurb: 'A cold desert world with the largest volcano in the Solar System, Olympus Mons, and ancient river valleys carved by water that once flowed here.',
  },
  {
    id: 'jupiter', name: 'Jupiter', kind: 'planet', type: 'Gas giant', color: '#d9b48f',
    texture: P('jupiter.jpg'),
    mass: [1.898, 27], radiusKm: 69911, gravity: 24.79, rotHours: 9.925, orbitDays: 4332.59,
    tilt: 3.13, knownMoons: 97, distance: '5.204 AU (778.5 million km)',
    temperature: '−110 °C at cloud tops', composition: 'Hydrogen 90%, helium 10%',
    pole: { ra: 268.057, dec: 64.495, w0: 284.95, wd: 870.536 },
    elements: {
      a: [5.202887, -0.00011607], e: [0.04838624, -0.00013253], i: [1.30439695, -0.00183714],
      L: [34.39644051, 3034.74612775], peri: [14.72847983, 0.21252668], node: [100.47390909, 0.20469106],
    },
    blurb: 'More than twice as massive as all the other planets combined. Its Great Red Spot is a storm wider than Earth that has raged for centuries.',
  },
  {
    id: 'saturn', name: 'Saturn', kind: 'planet', type: 'Gas giant', color: '#e8d3a0',
    texture: P('saturn.jpg'),
    ring: { texture: P('saturn_ring.png'), inner: 1.24, outer: 2.27 },
    mass: [5.683, 26], radiusKm: 58232, gravity: 10.44, rotHours: 10.656, orbitDays: 10759.22,
    tilt: 26.73, knownMoons: 274, distance: '9.583 AU (1.43 billion km)',
    temperature: '−140 °C at cloud tops', composition: 'Hydrogen 96%, helium 3%',
    pole: { ra: 40.589, dec: 83.537, w0: 38.9, wd: 810.7939024 },
    moonClearance: 2.35,
    elements: {
      a: [9.53667594, -0.0012506], e: [0.05386179, -0.00050991], i: [2.48599187, 0.00193609],
      L: [49.95424423, 1222.49362201], peri: [92.59887831, -0.41897216], node: [113.66242448, -0.28867794],
    },
    blurb: 'Its rings stretch hundreds of thousands of kilometres yet are mostly only tens of metres thick, made of countless pieces of water ice.',
  },
  {
    id: 'uranus', name: 'Uranus', kind: 'planet', type: 'Ice giant', color: '#a6e0e6',
    texture: P('uranus.jpg'),
    mass: [8.681, 25], radiusKm: 25362, gravity: 8.87, rotHours: -17.24, orbitDays: 30688.5,
    tilt: 97.77, knownMoons: 29, distance: '19.19 AU (2.87 billion km)',
    temperature: '−195 °C at cloud tops', composition: 'Hydrogen 83%, helium 15%, methane 2%',
    atmosphere: { color: '#a6e0e6', strength: 0.6 },
    pole: { ra: 257.311, dec: -15.175, w0: 203.81, wd: -501.1600928 },
    elements: {
      a: [19.18916464, -0.00196176], e: [0.04725744, -0.00004397], i: [0.77263783, -0.00242939],
      L: [313.23810451, 428.48202785], peri: [170.9542763, 0.40805281], node: [74.01692503, 0.04240589],
    },
    blurb: 'Tipped on its side, it rolls around the Sun, so each pole spends about 42 years in continuous sunlight followed by 42 in darkness.',
  },
  {
    id: 'neptune', name: 'Neptune', kind: 'planet', type: 'Ice giant', color: '#6f8fff',
    texture: P('neptune.jpg'),
    mass: [1.024, 26], radiusKm: 24622, gravity: 11.15, rotHours: 16.11, orbitDays: 60182,
    tilt: 28.32, knownMoons: 16, distance: '30.07 AU (4.50 billion km)',
    temperature: '−200 °C at cloud tops', composition: 'Hydrogen 80%, helium 19%, methane 1.5%',
    atmosphere: { color: '#6f8fff', strength: 0.7 },
    pole: { ra: 299.36, dec: 43.46, w0: 249.978, wd: 541.1397757 },
    elements: {
      a: [30.06992276, 0.00026291], e: [0.00859048, 0.00005105], i: [1.77004347, 0.00035372],
      L: [-55.12002969, 218.45945325], peri: [44.96476227, -0.32241464], node: [131.78422574, -0.00508664],
    },
    blurb: 'Found by mathematics before anyone saw it. It has the fastest winds measured on any planet, reaching about 2,000 km/h.',
  },

  // Moons. Only Earth's Moon starts near its true place in its orbit (`meanLongitude`); the others
  // start at illustrative positions, with accurate periods and sizes.
  {
    id: 'moon', name: 'Moon', kind: 'moon', parent: 'earth', type: 'Natural satellite', color: '#cfcac0',
    texture: P('moon.jpg'),
    mass: [7.342, 22], radiusKm: 1737.4, gravity: 1.62, orbitDays: 27.3217,
    orbit: { aKm: 384400, inc: 5.145, frame: 'ecliptic', meanLongitude: [218.316, 13.176396], nodeLongitude: [125.08, -0.0529538] },
    temperature: '−173 to 127 °C', discovered: 'Known since prehistory',
    blurb: 'The largest moon relative to its planet. Its gravity drives Earth’s tides, and it is the only other world where humans have walked.',
  },
  {
    id: 'phobos', name: 'Phobos', kind: 'moon', parent: 'mars', type: 'Irregular rocky moon', color: '#9c8c7c',
    texture: M('phobos'), shape: [1.2, 0.98, 0.82],
    mass: [1.066, 16], radiusKm: 11.27, gravity: 0.0057, orbitDays: 0.3189,
    orbit: { aKm: 9376, inc: 1.08, node: 40, phase: 20 },
    discovered: '1877, Asaph Hall',
    blurb: 'Orbits Mars faster than Mars rotates, so it rises in the west. It is spiralling inward and will break apart or crash in tens of millions of years.',
  },
  {
    id: 'deimos', name: 'Deimos', kind: 'moon', parent: 'mars', type: 'Irregular rocky moon', color: '#a89a88',
    texture: M('deimos'), shape: [1.2, 0.98, 0.86],
    mass: [1.476, 15], radiusKm: 6.2, gravity: 0.0026, orbitDays: 1.2624,
    orbit: { aKm: 23463, inc: 1.79, node: 210, phase: 190 },
    discovered: '1877, Asaph Hall',
    blurb: 'The smaller of Mars’s two moons, so small that its gravity could not pull it into a sphere. From Mars it would look like a bright star.',
  },
  {
    id: 'io', name: 'Io', kind: 'moon', parent: 'jupiter', type: 'Galilean moon', color: '#e8d27a',
    texture: M('io'),
    mass: [8.932, 22], radiusKm: 1821.6, gravity: 1.796, orbitDays: 1.769,
    orbit: { aKm: 421700, inc: 0.04, phase: 40 },
    temperature: '−130 °C average', discovered: '1610, Galileo Galilei',
    blurb: 'The most volcanically active body in the Solar System, with hundreds of volcanoes kept hot by the tidal pull of Jupiter.',
  },
  {
    id: 'europa', name: 'Europa', kind: 'moon', parent: 'jupiter', type: 'Galilean moon', color: '#d8cdb5',
    texture: M('europa'),
    mass: [4.8, 22], radiusKm: 1560.8, gravity: 1.314, orbitDays: 3.551,
    orbit: { aKm: 671034, inc: 0.47, phase: 130 },
    temperature: '−160 °C at the equator', discovered: '1610, Galileo Galilei',
    blurb: 'A cracked ice shell hides a salty ocean holding perhaps twice as much water as all of Earth’s oceans, making it a prime target in the search for life.',
  },
  {
    id: 'ganymede', name: 'Ganymede', kind: 'moon', parent: 'jupiter', type: 'Galilean moon', color: '#a89d8f',
    texture: M('ganymede'),
    mass: [1.482, 23], radiusKm: 2634.1, gravity: 1.428, orbitDays: 7.155,
    orbit: { aKm: 1070412, inc: 0.2, phase: 250 },
    temperature: '−160 °C average', discovered: '1610, Galileo Galilei',
    blurb: 'The largest moon in the Solar System, bigger than Mercury, and the only moon known to generate its own magnetic field.',
  },
  {
    id: 'callisto', name: 'Callisto', kind: 'moon', parent: 'jupiter', type: 'Galilean moon', color: '#7d7264',
    texture: M('callisto'),
    mass: [1.076, 23], radiusKm: 2410.3, gravity: 1.235, orbitDays: 16.689,
    orbit: { aKm: 1882709, inc: 0.19, phase: 330 },
    temperature: '−139 °C average', discovered: '1610, Galileo Galilei',
    blurb: 'One of the most heavily cratered surfaces known, largely unchanged for about four billion years.',
  },
  {
    id: 'mimas', name: 'Mimas', kind: 'moon', parent: 'saturn', type: 'Major icy moon', color: '#c2bdb4',
    texture: M('mimas'),
    mass: [3.75, 19], radiusKm: 198.2, gravity: 0.064, orbitDays: 0.942,
    orbit: { aKm: 185539, inc: 1.57, phase: 70 },
    discovered: '1789, William Herschel',
    blurb: 'Nicknamed the “Death Star” for Herschel, a crater so big that the impact nearly shattered it. Its gravity clears the Cassini Division in Saturn’s rings.',
  },
  {
    id: 'enceladus', name: 'Enceladus', kind: 'moon', parent: 'saturn', type: 'Major icy moon', color: '#eef2f4',
    texture: M('enceladus'),
    mass: [1.08, 20], radiusKm: 252.1, gravity: 0.113, orbitDays: 1.37,
    orbit: { aKm: 237948, inc: 0.02, phase: 170 },
    temperature: '−198 °C average', discovered: '1789, William Herschel',
    blurb: 'Geysers at its south pole spray water from a subsurface ocean into space, feeding Saturn’s E ring. It is the most reflective body in the Solar System.',
  },
  {
    id: 'tethys', name: 'Tethys', kind: 'moon', parent: 'saturn', type: 'Major icy moon', color: '#d6d3cd',
    texture: M('tethys'),
    mass: [6.175, 20], radiusKm: 531.1, gravity: 0.145, orbitDays: 1.888,
    orbit: { aKm: 294619, inc: 1.09, phase: 280 },
    discovered: '1684, Giovanni Cassini',
    blurb: 'Almost pure water ice, marked by the huge Odysseus crater and the long Ithaca Chasma canyon system.',
  },
  {
    id: 'dione', name: 'Dione', kind: 'moon', parent: 'saturn', type: 'Major icy moon', color: '#c9c6bf',
    texture: M('dione'),
    mass: [1.095, 21], radiusKm: 561.4, gravity: 0.232, orbitDays: 2.737,
    orbit: { aKm: 377396, inc: 0.02, phase: 15 },
    discovered: '1684, Giovanni Cassini',
    blurb: 'Bright, wispy cliffs of ice cross its darker trailing side, the result of tectonic fracturing.',
  },
  {
    id: 'rhea', name: 'Rhea', kind: 'moon', parent: 'saturn', type: 'Major icy moon', color: '#bdb9b1',
    texture: M('rhea'),
    mass: [2.307, 21], radiusKm: 763.8, gravity: 0.264, orbitDays: 4.518,
    orbit: { aKm: 527108, inc: 0.35, phase: 110 },
    discovered: '1672, Giovanni Cassini',
    blurb: 'Saturn’s second-largest moon, an ancient, heavily cratered ball of ice and rock.',
  },
  {
    id: 'titan', name: 'Titan', kind: 'moon', parent: 'saturn', type: 'Major moon', color: '#e0a64f',
    texture: M('titan'),
    mass: [1.345, 23], radiusKm: 2574.7, gravity: 1.352, orbitDays: 15.945,
    orbit: { aKm: 1221870, inc: 0.33, phase: 215 },
    temperature: '−179 °C', discovered: '1655, Christiaan Huygens', composition: 'Nitrogen 95%, methane 5%',
    atmosphere: { color: '#e8a24a', strength: 0.9 },
    blurb: 'The only moon with a thick atmosphere, and the only world besides Earth with stable surface liquid: lakes and seas of liquid methane and ethane.',
  },
  {
    id: 'iapetus', name: 'Iapetus', kind: 'moon', parent: 'saturn', type: 'Major icy moon', color: '#8d8578',
    texture: M('iapetus'),
    mass: [1.806, 21], radiusKm: 734.5, gravity: 0.223, orbitDays: 79.32,
    orbit: { aKm: 3560820, inc: 15.47, phase: 300 },
    discovered: '1671, Giovanni Cassini',
    blurb: 'Two-toned: its leading side is as dark as coal, its trailing side as bright as snow. A mountain ridge runs along much of its equator.',
  },
  {
    id: 'miranda', name: 'Miranda', kind: 'moon', parent: 'uranus', type: 'Major icy moon', color: '#b8b8bc',
    texture: M('miranda'), textureNote: VOYAGER_GAP_NOTE,
    mass: [6.59, 19], radiusKm: 235.8, gravity: 0.079, orbitDays: 1.413,
    orbit: { aKm: 129390, inc: 180 - 4.34, phase: 30 },
    discovered: '1948, Gerard Kuiper',
    blurb: 'A patchwork of strange terrain, including Verona Rupes, the tallest known cliff in the Solar System at around 20 km.',
  },
  {
    id: 'ariel', name: 'Ariel', kind: 'moon', parent: 'uranus', type: 'Major icy moon', color: '#c5c5c9',
    texture: M('ariel'), textureNote: VOYAGER_GAP_NOTE,
    mass: [1.251, 21], radiusKm: 578.9, gravity: 0.249, orbitDays: 2.52,
    orbit: { aKm: 190900, inc: 180 - 0.26, phase: 145 },
    discovered: '1851, William Lassell',
    blurb: 'The brightest of Uranus’s large moons, with the youngest surface and a network of deep rift valleys.',
  },
  {
    id: 'umbriel', name: 'Umbriel', kind: 'moon', parent: 'uranus', type: 'Major icy moon', color: '#8d8d91',
    texture: M('umbriel'), textureNote: VOYAGER_GAP_NOTE,
    mass: [1.275, 21], radiusKm: 584.7, gravity: 0.25, orbitDays: 4.144,
    orbit: { aKm: 266000, inc: 180 - 0.13, phase: 240 },
    discovered: '1851, William Lassell',
    blurb: 'The darkest of Uranus’s large moons, with an old cratered surface and a mysterious bright ring called Wunda.',
  },
  {
    id: 'titania', name: 'Titania', kind: 'moon', parent: 'uranus', type: 'Major icy moon', color: '#b9b2ab',
    texture: M('titania'), textureNote: VOYAGER_GAP_NOTE,
    mass: [3.4, 21], radiusKm: 788.4, gravity: 0.365, orbitDays: 8.706,
    orbit: { aKm: 436300, inc: 180 - 0.34, phase: 320 },
    discovered: '1787, William Herschel',
    blurb: 'The largest moon of Uranus, crossed by huge fault canyons that may mark the expansion of its interior as it froze.',
  },
  {
    id: 'oberon', name: 'Oberon', kind: 'moon', parent: 'uranus', type: 'Major icy moon', color: '#a89f99',
    texture: M('oberon'), textureNote: VOYAGER_GAP_NOTE,
    mass: [3.076, 21], radiusKm: 761.4, gravity: 0.346, orbitDays: 13.463,
    orbit: { aKm: 583500, inc: 180 - 0.06, phase: 80 },
    discovered: '1787, William Herschel',
    blurb: 'The outermost large moon of Uranus, old and heavily cratered, with a mountain rising from its limb about 11 km high.',
  },
  {
    id: 'triton', name: 'Triton', kind: 'moon', parent: 'neptune', type: 'Captured moon', color: '#d4c8bd',
    texture: M('triton'), textureNote: VOYAGER_GAP_NOTE,
    mass: [2.139, 22], radiusKm: 1353.4, gravity: 0.779, orbitDays: 5.877, retrograde: true,
    orbit: { aKm: 354759, inc: 156.885, phase: 200 },
    temperature: '−235 °C', discovered: '1846, William Lassell', composition: 'Thin nitrogen atmosphere',
    blurb: 'The only large moon that orbits backwards, a sign it is a captured Kuiper Belt object. Nitrogen geysers erupt from its frozen surface.',
  },
];
