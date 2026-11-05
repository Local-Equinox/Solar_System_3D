# Solar_System_3D

An interactive 3D model of the Solar System in the browser: the Sun, all eight planets and 20 major moons, moving against the real night sky. Built with [Three.js](https://threejs.org) and plain HTML, CSS and JavaScript.

## Run it

There's no build step and nothing to install. Browsers won't load ES modules from `file://`, so serve the folder with any static server:

```sh
python3 -m http.server 8000
```

Then open <http://localhost:8000>. To deploy, upload the folder as is to any static host, such as GitHub Pages or Netlify.

## Controls

| Action | Mouse | Touch |
| --- | --- | --- |
| Select a body | Click | Tap |
| Orbit | Left-drag | One-finger drag |
| Pan | Right-drag | Two-finger drag |
| Zoom | Scroll | Pinch |

The panel on the left lists every body, so everything can also be reached by keyboard. `Esc` returns to the overview and `Space` pauses. You can link directly to a body, for example `#saturn`.

## How accurate it is

**True to reality**

- Planet positions come from JPL's Keplerian elements, starting at today's date. The simulated clock then runs ahead at the speed you choose.
- Stars and constellation lines are in their real J2000 positions, in the same coordinate frame as the planets. The ecliptic plane runs through the zodiac constellations as it does in the real sky.
- Spin axes and starting rotation use the IAU rotation models. When the page loads, Earth's day and night sides match the real time.
- Every value in the panel is a real one, including the live distances.

**Changed so the scene is viewable** (see [src/scale.js](src/scale.js))

- Distances from the Sun are logarithmic, body sizes follow a square-root curve, and moon orbits are logarithmic in units of the parent's radius. Order is preserved, but proportions aren't to scale.
- Fast rotations and moon orbits are smoothly slowed at high simulation speeds, because Phobos at 10 days/s would otherwise strobe at 31 orbits per second. Faster bodies still move faster. Planetary orbits are never slowed, so at high speed Earth's spin no longer stays in step with the date.
- Moon orbits are drawn as circles. Earth's Moon starts near its true position (within several degrees); the other moons have correct periods and sizes, but illustrative starting positions.
- Parts of Triton and the moons of Uranus have never been imaged. Those areas are a flat neutral colour, and the panel says so.
- Sunlight doesn't dim with distance, or the outer planets would be black.

JPL's elements are valid from 1800 to 2050, so positions become less accurate if you let the clock run far past that.

## Project layout

```
index.html              Page structure and import map
css/style.css           UI overlay, including phone layouts
src/
  main.js               Wires everything into the frame loop; selection state
  scale.js              Display compression curves
  astro.js              Kepler solver and coordinate frames
  data/bodies.js        Every body's facts and orbital parameters
  scene/solarSystem.js  Bodies, orbit paths, motion
  scene/materials.js    Shaders: Sun, Earth, atmospheres, rings, orbit lines
  scene/starfield.js    Stars and constellations, in their own scene
  scene/cameraRig.js    OrbitControls, fly-to, following the selected body
  interaction/picker.js Raycasting for clicks and taps
  ui/panel.js           Left information panel
  ui/labels.js          Name labels that track bodies
assets/                 Textures and the star catalog
vendor/three/           Three.js r187
tools/                  Scripts that regenerate assets/ from the original sources
```

The stars can't be selected because they're in a separate scene that the raycaster never sees. Clicks test only the bodies' surface meshes and Saturn's rings. If a click misses, the nearest body within a small on-screen distance is selected, since from far away a moon is only a pixel or two wide.

## Regenerating assets

The sources for each file are listed at the top of each script.

```sh
python3 tools/build_sky.py <d3-celestial data folder> assets/sky
python3 tools/prepare_moon_textures.py <downloaded maps folder> assets/textures/moons   # needs Pillow and NumPy
```

## Credits and licences

- **Sun, planets, Earth's Moon, Saturn's rings:** [Solar System Scope](https://www.solarsystemscope.com/textures/), [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/), based on NASA data. The JPEGs were re-encoded.
- **Mimas, Enceladus, Tethys, Dione, Rhea, Iapetus:** NASA/JPL-Caltech/Space Science Institute (PIA18434 to PIA18439). Resampled, re-centred and desaturated.
- **Triton:** NASA/JPL-Caltech/Lunar & Planetary Institute (PIA18668). Resampled, desaturated, unmapped areas filled.
- **Other moons:** [JPL Solar System Simulator](https://space.jpl.nasa.gov/tmaps/) maps, by Caltech/JPL/USGS. Resampled and tinted; the Uranian moons' unmapped areas are filled.
- **Stars and constellation lines:** [d3-celestial](https://github.com/ofrohn/d3-celestial) by Olaf Frohn, BSD 3-Clause ([licence](assets/sky/LICENSE)).
- **Three.js:** MIT ([licence](vendor/three/LICENSE)).
- **Orbital elements:** [JPL Solar System Dynamics](https://ssd.jpl.nasa.gov/planets/approx_pos.html). Rotation models are from the IAU Working Group on Cartographic Coordinates and Rotational Elements.
