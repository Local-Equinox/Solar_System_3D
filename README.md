# Solar_System_3D

An explorable 3D Solar System in the browser: the Sun, all eight planets and 20 major moons, moving against the real night sky. You start on foot on Earth, board your ship, warp between worlds, then land and walk on them under each world's real gravity. There are no survival mechanics, so you can explore for as long as you like. Built with [Three.js](https://threejs.org), [Rapier](https://rapier.rs) physics and plain HTML, CSS and JavaScript.

## Run it

There's no build step and nothing to install. Browsers won't load ES modules from `file://`, so serve the folder with any static server:

```sh
python3 -m http.server 8000
```

Then open <http://localhost:8000>. To deploy, upload the folder as is to any static host, such as GitHub Pages or Netlify.

## Controls

**On foot**

| Action | Keyboard and mouse | Touch |
| --- | --- | --- |
| Move, relative to the camera | `WASD` or arrow keys | Joystick |
| Run | `Shift` | |
| Jump | `Space` | Jump button |
| Suit thrusters, pushing you back down | Hold `X` | |
| Look | Drag | One-finger drag |
| Camera distance | Scroll | Pinch |
| Board the ship and take off, when close | `E` | Tap the prompt |

**In the ship**

| Action | Keyboard and mouse | Touch |
| --- | --- | --- |
| Fly toward where the camera points, or back | `W` / `S` | Joystick |
| Strafe | `A` / `D` | Joystick |
| Up / down | `Space` / `C` | |
| Boost | `Shift` | |
| Aim the camera | Drag | One-finger drag |
| Select a body, to get its Warp button | Click it, or use the panel | Tap it, or use the panel |
| Land, when the prompt shows | `L` | Tap the prompt |

**Anywhere:** `M` or the map button opens the system map, where dragging orbits, right-drag or two fingers pans, and scrolling or pinching zooms. Clicking a body there flies the map camera to it. `P` pauses time and `Esc` clears the selection. Each view remembers its own simulation speed.

## How accurate it is

**True to reality**

- Planet positions come from JPL's Keplerian elements, starting at today's date. The simulated clock then runs ahead at the speed you choose.
- Stars and constellation lines are in their real J2000 positions, in the same coordinate frame as the planets. The ecliptic plane runs through the zodiac constellations as it does in the real sky.
- Spin axes and starting rotation use the IAU rotation models. When the page loads, Earth's day and night sides match the real time.
- Every value in the panel is a real one, including the live distances.
- Surface gravity on every landable world is its real value. Everyone jumps with the same 4 m/s push, so a jump is 0.8 m on Earth, 4.9 m on the Moon and 3.1 km on Deimos, where it lasts 51 minutes. The suit thrusters are there because of that; they're optional.
- What you see in the sky from a surface is the real simulation: the actual Sun, planets and moons from that spot on the globe, with day and night following the body's rotation.

**Changed so the scene is viewable** (see [src/scale.js](src/scale.js))

- Distances from the Sun are logarithmic, body sizes follow a square-root curve, and moon orbits are logarithmic in units of the parent's radius. Order is preserved, but proportions aren't to scale.
- Fast rotations and moon orbits are smoothly slowed at high simulation speeds, because Phobos at 10 days/s would otherwise strobe at 31 orbits per second. Faster bodies still move faster. Planetary orbits are never slowed, so at high speed Earth's spin no longer stays in step with the date.
- Moon orbits are drawn as circles. Earth's Moon starts near its true position (within several degrees); the other moons have correct periods and sizes, but illustrative starting positions.
- Parts of Triton and the moons of Uranus have never been imaged. Those areas are a flat neutral colour, and the panel says so.
- Sunlight doesn't dim with distance, or the outer planets would be black.
- Surfaces are procedural, not real maps. Colours come from each world's map, or are set by hand where the map doesn't show the ground (Earth, Venus, Titan). Earth has no oceans to walk into, and rivers, cities and other details don't exist. Walking covers real metres, so a walk won't take you across a world's map.
- The ground is a locally flat patch, curved visually toward the horizon. Gravity always points straight down.
- Time near a world runs at about 6 min/s by default, so a day passes in minutes.
- Uranus and Neptune get an "Ice Giant" warning in the same form as the gas giants, and the Sun gets one too.

JPL's elements are valid from 1800 to 2050, so positions become less accurate if you let the clock run far past that.

## How it handles scale

A 2 m astronaut and a 4,500 million km Solar System can't share 32-bit coordinates without jitter, so there are three layers, each with its own coordinates:

- **Space:** a floating origin. Bodies keep stable coordinates in `worldPosition`, but the whole system is shifted every frame so the camera renders at (0,0,0). See `setOrigin` in [src/scene/solarSystem.js](src/scene/solarSystem.js).
- **The ship:** its own small scene in metres, drawn over space after a depth clear, using the same view. See [src/game/flight.js](src/game/flight.js).
- **The surface:** a separate scene and Rapier physics world in real metres. Terrain chunks use integer indices, and everything recentres on the player as they walk. See [src/game/surface.js](src/game/surface.js) and [src/game/terrain.js](src/game/terrain.js).

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
  ui/panel.js           Left information panel, and its Warp button
  ui/labels.js          Name labels that track bodies
  game/game.js          Game state: on foot or flying, map, prompts, warnings
  game/flight.js        Ship flight and warping
  game/surface.js       Walking: physics, gravity, jumps, camera, sky
  game/terrain.js       Endless terrain chunks for each world
  game/models.js        Astronaut and ship, built from primitives
  game/input.js         Keyboard and touch joystick
assets/                 Textures and the star catalog
vendor/                 Three.js r187 and Rapier 0.21
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
- **Rapier:** Apache 2.0 ([licence](vendor/rapier/LICENSE)).
- **Bungee typeface:** David Jonathan Ross, SIL Open Font License ([licence](assets/fonts/LICENSE-bungee)).
- **Orbital elements:** [JPL Solar System Dynamics](https://ssd.jpl.nasa.gov/planets/approx_pos.html). Rotation models are from the IAU Working Group on Cartographic Coordinates and Rotational Elements.
