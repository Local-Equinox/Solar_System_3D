// Application entry: wires the renderer, simulation, game, picking and UI into one frame loop.

import { PerspectiveCamera, Scene, SRGBColorSpace, WebGLRenderer } from 'three';
import { daysSinceJ2000, j2000DaysToDate } from './astro.js';
import { SolarSystem } from './scene/solarSystem.js';
import { Starfield } from './scene/starfield.js';
import { CameraRig } from './scene/cameraRig.js';
import { Picker } from './interaction/picker.js';
import { Panel } from './ui/panel.js';
import { Labels } from './ui/labels.js';
import { Input } from './game/input.js';
import { Game } from './game/game.js';

const $ = (selector) => document.querySelector(selector);

const NARROW_WIDTH = 640;
const MAX_PIXEL_RATIO = Math.min(window.devicePixelRatio || 1, 2);
const MIN_PIXEL_RATIO = 0.75;
// The speed slider is logarithmic: position 0-100 maps onto these days-per-second limits.
const RATE_MIN = 0.001;
const RATE_MAX = 100;

function showFatal(title, detail) {
  const notice = $('#fatal');
  notice.querySelector('h1').textContent = title;
  notice.querySelector('p').textContent = detail;
  notice.hidden = false;
  $('#loading').hidden = true;
}

function createRenderer(canvas) {
  const renderer = new WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.setClearColor(0x000000, 1);
  renderer.autoClear = false; // the sky, the system and the foreground are separate passes
  renderer.setPixelRatio(MAX_PIXEL_RATIO);
  return renderer;
}

/** Trades resolution for frame rate on slow GPUs, backing off instead of stuttering. */
class AdaptiveResolution {
  constructor(apply) {
    this.apply = apply;
    this.ratio = MAX_PIXEL_RATIO;
    this.elapsed = 0;
    this.frames = 0;
    this.lastRaise = 0;
  }

  sample(dt, now) {
    this.elapsed += dt;
    this.frames++;
    if (this.elapsed < 1.5) return;
    const msPerFrame = (this.elapsed / this.frames) * 1000;
    this.elapsed = 0;
    this.frames = 0;
    if (msPerFrame > 30 && this.ratio > MIN_PIXEL_RATIO) {
      this.ratio = Math.max(MIN_PIXEL_RATIO, this.ratio * 0.8);
      this.lastRaise = now; // don't climb straight back up into the same trouble
      this.apply(this.ratio);
    } else if (msPerFrame < 18 && this.ratio < MAX_PIXEL_RATIO && now - this.lastRaise > 15000) {
      this.ratio = Math.min(MAX_PIXEL_RATIO, this.ratio * 1.15);
      this.lastRaise = now;
      this.apply(this.ratio);
    }
  }
}

function formatRate(daysPerS) {
  if (daysPerS >= 1) return `${daysPerS >= 10 ? Math.round(daysPerS) : daysPerS.toFixed(1)} days/s`;
  const hours = daysPerS * 24;
  if (hours >= 1) return `${hours.toFixed(1)} hours/s`;
  return `${(hours * 60).toFixed(0)} min/s`;
}

const rateFromSlider = (value) => RATE_MIN * Math.pow(RATE_MAX / RATE_MIN, value / 100);
const sliderFromRate = (rate) => (100 * Math.log(rate / RATE_MIN)) / Math.log(RATE_MAX / RATE_MIN);

async function start() {
  const canvas = $('#scene');
  let renderer;
  try {
    renderer = createRenderer(canvas);
  } catch (error) {
    showFatal('WebGL is unavailable', 'This simulation needs WebGL. Try enabling hardware acceleration or using another browser.');
    console.error(error);
    return;
  }
  canvas.addEventListener('webglcontextlost', (event) => {
    event.preventDefault();
    showFatal('The graphics context was lost', 'Reload the page to restart the simulation.');
  });

  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const scene = new Scene();
  const clock = { days: daysSinceJ2000(Date.now()), rate: 0.01, paused: false };

  const system = new SolarSystem(scene, renderer, clock.days);
  const starfield = new Starfield(renderer.getPixelRatio());
  const rig = new CameraRig(canvas, reducedMotion);
  const labels = new Labels($('#labels'), system, rig.camera);
  const input = new Input();

  // The camera that actually renders the system: at the origin, by the floating origin scheme.
  const renderCamera = new PerspectiveCamera();

  // Selection is the single path from any input (scene, panel, URL, keyboard) to every view.
  let selected = null;
  let game = null;
  function select(body, { updateHash = true, open = true } = {}) {
    if (body === selected) {
      // A tap on the current target shouldn't jolt the camera away from where the user put it.
      if (body && open) panel.setOpen(true);
      else if (!body && game?.mapOpen) rig.focus(null); // but the overview button should bring it home
      return;
    }
    selected = body;
    if (game?.mapOpen) rig.focus(body);
    system.setHighlight(body);
    labels.setSelected(body);
    if (body) {
      panel.showBody(body);
      if (open) panel.setOpen(true);
    } else {
      panel.showDirectory();
    }
    game?.setSelected(body);
    if (updateHash) history.replaceState(null, '', body ? `#${body.id}` : location.pathname + location.search);
  }

  const panel = new Panel($('#panel'), system, { onSelect: (body) => select(body) });
  $('#panel-back').addEventListener('click', () => select(null));

  const picker = new Picker(canvas, rig.camera, renderCamera, system, {
    onSelect: (body) => select(body),
    onHover: (body) => {
      for (const { body: b, element } of labels.entries) element.classList.toggle('is-hovered', b === body);
    },
  });

  // Layout: reserve the panel's footprint in the framing.
  function measureInsets() {
    const width = window.innerWidth;
    if (!panel.open) return rig.setInsets(0, 0);
    const rect = panel.root.getBoundingClientRect();
    if (width < NARROW_WIDTH) rig.setInsets(0, window.innerHeight - rect.top);
    else rig.setInsets(rect.right, 0);
  }
  panel.onLayoutChange = measureInsets;

  let drawWidth = 1;
  let drawHeight = 1;
  function resize() {
    drawWidth = window.innerWidth;
    drawHeight = window.innerHeight;
    renderer.setSize(drawWidth, drawHeight, false);
    starfield.setDrawingSize(drawWidth * renderer.getPixelRatio(), drawHeight * renderer.getPixelRatio());
    rig.setSize(drawWidth, drawHeight);
    game?.surface?.setSize(drawWidth, drawHeight);
    measureInsets();
  }
  window.addEventListener('resize', resize);

  // The scene comes first: the panel starts tucked away, one tap from the directory.
  panel.setOpen(false);
  resize();
  rig.focus(null);
  rig.flight.duration = 0;

  const adaptive = new AdaptiveResolution((ratio) => {
    renderer.setPixelRatio(ratio);
    system.setPixelRatio(ratio);
    starfield.setPixelRatio(ratio);
    resize();
  });

  // Time controls
  const slider = $('#rate');
  const rateLabel = $('#rate-label');
  const pauseButton = $('#pause');
  function renderRate() {
    rateLabel.textContent = clock.paused ? 'Paused' : formatRate(clock.rate);
    pauseButton.setAttribute('aria-pressed', String(clock.paused));
    pauseButton.setAttribute('aria-label', clock.paused ? 'Resume' : 'Pause');
    pauseButton.classList.toggle('is-paused', clock.paused);
  }
  function syncSlider() {
    slider.value = sliderFromRate(clock.rate);
    renderRate();
  }
  slider.addEventListener('input', () => {
    game.setRate(rateFromSlider(Number(slider.value)));
    clock.paused = false;
    renderRate();
  });
  pauseButton.addEventListener('click', () => {
    clock.paused = !clock.paused;
    renderRate();
  });
  $('#now').addEventListener('click', () => {
    // Jump back to today. Planets re-derive their position; spins and moons carry on smoothly.
    clock.days = daysSinceJ2000(Date.now());
  });

  // View controls
  const bindToggle = (button, initial, apply) => {
    let on = initial;
    button.setAttribute('aria-pressed', String(on));
    button.addEventListener('click', () => {
      on = !on;
      button.setAttribute('aria-pressed', String(on));
      apply(on);
    });
  };
  bindToggle($('#toggle-constellations'), true, (on) => starfield.setConstellationsVisible(on));
  bindToggle($('#toggle-labels'), true, (on) => labels.setEnabled(on));
  $('#toggle-map').addEventListener('click', () => game.toggleMap());
  $('#zoom-in').addEventListener('click', () => game.zoomBy(0.7));
  $('#zoom-out').addEventListener('click', () => game.zoomBy(1 / 0.7));
  $('#reset-view').addEventListener('click', () => select(null));

  game = new Game({
    system, rig, input, canvas, panel, labels, picker, clock,
    onRateChange: syncSlider,
    onViewChange: measureInsets,
  });
  game.onSelect = (body, options) => select(body, { updateHash: false, ...options });
  input.onPress('KeyP', () => pauseButton.click());

  // Keyboard and URL
  window.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    if (game.mapOpen && !selected) game.toggleMap();
    else select(null);
  });
  const selectFromHash = () => {
    const body = system.byId.get(location.hash.slice(1).toLowerCase());
    select(body ?? null, { updateHash: false });
  };
  window.addEventListener('hashchange', selectFromHash);

  // Assets: these fill in as they arrive.
  const progressBar = $('#loading-bar');
  system.loadTextures((done, total, failed) => {
    progressBar.style.setProperty('--progress', done / total);
    if (done === total) {
      $('#loading').hidden = true;
      if (failed) console.warn(`${failed} of ${total} textures failed; those bodies show flat colours.`);
    }
  });
  starfield.load().catch((error) => {
    // The sky is scenery. Lose it, keep the simulation.
    console.error(error);
  });

  // Rendering. All passes share one black clear; each later pass clears depth only.
  function clearDepth() {
    // A pass can end on a material with depthWrite off, and with the depth mask off, the clear
    // does nothing. The next pass would then be hidden behind the last one's depth values.
    renderer.state.buffers.depth.setMask(true);
    renderer.clearDepth();
  }

  function drawSkyAndSystem(eye, quaternion, projectionSource) {
    system.setOrigin(eye);
    renderCamera.position.set(0, 0, 0);
    renderCamera.quaternion.copy(quaternion);
    renderCamera.projectionMatrix.copy(projectionSource.projectionMatrix);
    renderCamera.projectionMatrixInverse.copy(projectionSource.projectionMatrixInverse);
    renderCamera.updateMatrixWorld();
    starfield.syncTo(renderCamera);
    renderer.render(starfield.scene, starfield.camera);
    clearDepth();
    renderer.render(scene, renderCamera);
    clearDepth();
  }

  function draw() {
    renderer.clear();
    starfield.setGroundView(game.renderingSurface);
    if (game.renderingSurface) {
      const { surface } = game;
      const { eye, quaternion } = surface.skyPose();
      system.setSkyOf(surface.body);
      drawSkyAndSystem(eye, quaternion, surface.skyCamera);
      system.setSkyOf(null);
      renderer.render(surface.scene, surface.camera);
    } else {
      drawSkyAndSystem(rig.camera.position, rig.camera.quaternion, rig.camera);
      if (game.renderingShip) game.flight.render(renderer);
    }
  }

  // Frame loop
  const dateLabel = $('#date');
  let lastFrame = performance.now();
  let lastTextRefresh = 0;
  let shownDate = '';

  function frame(now) {
    requestAnimationFrame(frame);
    // A background tab pauses rAF, so cap the step instead of leaping years when it returns. The
    // first timestamp can predate slow startup work, so the step must not go negative either.
    const dt = Math.max(0, Math.min((now - lastFrame) / 1000, 0.1));
    lastFrame = now;

    const rate = clock.paused ? 0 : clock.rate;
    clock.days += rate * dt;
    system.update(clock.days, dt, rate);
    game.update(dt);
    if (game.usesRig) {
      rig.update(dt);
      rig.fitClippingPlanes(system.bodies);
      rig.camera.updateMatrixWorld();
    }
    draw();
    if (game.usesRig) labels.update(drawWidth, drawHeight);
    picker.updateHover();

    if (now - lastTextRefresh > 200) {
      lastTextRefresh = now;
      panel.updateLive();
      const date = j2000DaysToDate(clock.days).toISOString().slice(0, 10);
      if (date !== shownDate) {
        shownDate = date;
        dateLabel.textContent = date;
        dateLabel.dateTime = date;
      }
    }
    adaptive.sample(dt, now);
  }
  requestAnimationFrame(frame);

  // A small handle for debugging from the console.
  window.solarSystem = { system, rig, clock, starfield, picker, renderer, select, game, input, renderCamera };

  if (location.hash) selectFromHash();
  await game.start();
}

start().catch((error) => {
  console.error(error);
  showFatal('Something went wrong starting the simulation', String(error.message ?? error));
});
