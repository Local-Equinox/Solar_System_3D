// The game's state machine: on foot on a world, or flying the ship. The system map can open over
// either. Each owns the camera, the HUD prompts and which panel action is on offer.

import { Vector3 } from 'three';
import { ShipFlight } from './flight.js';
import { JUMP_SPEED, Surface, bodyFixedQuaternion } from './surface.js';

const FADE_MS = 340;

// Default simulation speeds, in days per second. Near a world the sky has to look like a sky; on
// the map, orbits should be visibly moving. Moving the slider changes the current view's speed.
const DEFAULT_RATES = { surface: 0.004, flight: 0.05, map: 10 };

/** The warning for a body with nothing to stand on, or null if it can be landed on. */
export function noSurfaceWarning(data) {
  if (data.kind === 'star') return 'Warning: Star - No surface to land on.';
  if (data.type === 'Gas giant') return 'Warning: Gas Giant - No surface to land on.';
  if (data.type === 'Ice giant') return 'Warning: Ice Giant - No surface to land on.';
  return null;
}

function formatMetres(metres) {
  if (metres < 1000) return `${metres.toFixed(metres < 10 ? 1 : 0)} m`;
  return `${(metres / 1000).toFixed(1)} km`;
}

function formatSeconds(seconds) {
  if (seconds < 60) return `${seconds.toFixed(1)} s`;
  return `${(seconds / 60).toFixed(1)} min`;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export class Game {
  constructor({ system, rig, input, canvas, panel, labels, picker, clock, onRateChange, onViewChange }) {
    Object.assign(this, { system, rig, input, canvas, panel, labels, picker, clock, onRateChange, onViewChange });
    this.mode = 'loading'; // 'surface' or 'flight' once ready
    this.mapOpen = false;
    this.busy = true; // during fades and lift-off
    this.surface = null;
    this.selected = null;
    this.rates = { ...DEFAULT_RATES };
    this.flight = new ShipFlight(system, rig, input);
    labels.addMarker(this.flight);

    this.promptButton = document.getElementById('hud-prompt');
    this.warning = document.getElementById('hud-warning');
    this.stats = document.getElementById('hud-stats');
    this.help = document.getElementById('hud-help');
    this.fade = document.getElementById('fade');
    this.promptButton.addEventListener('click', () => this.promptAction?.());

    input.onPress('KeyE', () => this._boardIfPossible());
    input.onPress('KeyL', () => this._landIfPossible());
    input.onPress('KeyM', () => this.toggleMap());
  }

  async start() {
    const RAPIER = (await import('rapier')).default;
    await RAPIER.init();
    this.RAPIER = RAPIER;
    this._startOnEarth();
  }

  _startOnEarth() {
    // Standing in daylight: partway between the sub-solar point and the north pole.
    const earth = this.system.byId.get('earth');
    const toSun = earth.worldPosition.clone().negate().normalize();
    const pole = new Vector3(0, 1, 0).applyQuaternion(earth.poleQuaternion);
    const site = toSun.multiplyScalar(0.8).addScaledVector(pole, 0.6).normalize();
    this._enterSurface(earth, site);
    this.busy = false;
  }

  /** @param worldNormal unit vector from the body to the landing site, in system axes */
  _enterSurface(body, worldNormal) {
    const inverse = bodyFixedQuaternion(body).invert();
    const siteNormal = worldNormal.clone().applyQuaternion(inverse);
    this.surface = new Surface(this.RAPIER, body, siteNormal, this.input, this.canvas);
    this.surface.setSize(window.innerWidth, window.innerHeight);
    this.mode = 'surface';
    this.flight.frameBody = body;
    this.flight.worldPosition.copy(body.worldPosition);
    this.rig.controls.enabled = false;
    this.picker.enabled = false;
    this.labels.setSuppressed(true);
    this.panel.setOpen(false); // nothing should stand between the player and a new world
    this.onSelect?.(body, { open: false });
    this._applyRate();
    this.onViewChange?.();
    this.refreshPanelAction();
  }

  async _fadeThrough(change) {
    this.busy = true;
    this.fade.classList.add('is-active');
    await sleep(FADE_MS);
    try {
      change();
    } finally {
      this.fade.classList.remove('is-active');
    }
    this.busy = false;
  }

  _boardIfPossible() {
    if (this.busy || this.mapOpen || this.mode !== 'surface' || !this.surface.canBoard) return;
    this.busy = true;
    this.surface.board(() => {
      this._fadeThrough(() => this._leaveSurface());
    });
    this._clearPrompt();
  }

  _leaveSurface() {
    const { surface } = this;
    const { body } = surface;
    const worldNormal = surface.siteNormal.clone().applyQuaternion(bodyFixedQuaternion(body));
    surface.dispose();
    this.surface = null;
    this.mode = 'flight';
    this.flight.placeAbove(body, worldNormal);
    this.picker.enabled = true;
    this.labels.setSuppressed(false);
    this._applyRate();
    this.onViewChange?.();
    this.refreshPanelAction();
  }

  _landIfPossible() {
    if (this.busy || this.mapOpen || this.mode !== 'flight' || this.flight.isWarping) return;
    const body = this.flight.nearbyBody();
    if (!body || noSurfaceWarning(body.data)) return;
    const worldNormal = this.flight.worldPosition.clone().sub(body.worldPosition).normalize();
    this._fadeThrough(() => this._enterSurface(body, worldNormal));
    this._clearPrompt();
  }

  warpTo(body) {
    if (this.busy || this.mode !== 'flight' || this.flight.isWarping) return;
    if (this.mapOpen) this.toggleMap();
    this.flight.warpTo(body);
    this.refreshPanelAction();
  }

  toggleMap() {
    if (this.busy || this.mode === 'loading' || this.flight.isWarping) return;
    this.mapOpen = !this.mapOpen;
    document.getElementById('toggle-map').setAttribute('aria-pressed', String(this.mapOpen));
    if (this.mapOpen) {
      this.picker.enabled = true;
      this.labels.setSuppressed(false);
      this.flightOffset = this.rig.camera.position.clone().sub(this.rig.controls.target);
      this.rig.focus(this.selected);
    } else if (this.mode === 'flight') {
      const distance = Math.min(this.flightOffset.length(), 30);
      this.rig.setFov(42);
      this.rig.follow(this.flight, distance, this.flightOffset.clone().normalize());
    } else {
      this.picker.enabled = false;
      this.labels.setSuppressed(true);
      this.rig.flight = null;
      this.rig.controls.enabled = false;
    }
    this._clearPrompt();
    this._applyRate();
    this.onViewChange?.();
    this.refreshPanelAction();
  }

  get rateKey() {
    return this.mapOpen ? 'map' : this.mode === 'surface' ? 'surface' : 'flight';
  }

  _applyRate() {
    this.clock.rate = this.rates[this.rateKey];
    this.onRateChange?.();
  }

  /** The user moved the speed slider. */
  setRate(rate) {
    this.rates[this.rateKey] = rate;
    this.clock.rate = rate;
  }

  /** Whether the shared OrbitControls camera is the one in use. */
  get usesRig() {
    return this.mode !== 'surface' || this.mapOpen;
  }

  get renderingSurface() {
    return this.mode === 'surface' && !this.mapOpen;
  }

  get renderingShip() {
    return this.mode === 'flight' && !this.mapOpen;
  }

  zoomBy(factor) {
    if (this.renderingSurface) this.surface.zoomBy(factor);
    else this.rig.zoomBy(factor);
  }

  setSelected(body) {
    this.selected = body;
    this.refreshPanelAction();
  }

  /** The Warp button's state follows the mode, the selection and how close the ship is. */
  refreshPanelAction() {
    const body = this.selected;
    if (!body) {
      this.panel.setAction(null);
      return;
    }
    if (this.mode !== 'flight') {
      this.panel.setAction({ note: 'Board your ship to warp from here.' });
      return;
    }
    if (this.flight.isWarping) {
      this.panel.setAction({ label: 'Warping…', disabled: true });
      return;
    }
    const inOrbit = this.flight.frameBody === body;
    this.panel.setAction(inOrbit
      ? { label: `In orbit of ${body.name}`, disabled: true }
      : { label: `Warp to ${body.name}`, onClick: () => this.warpTo(body) });
  }

  update(dt) {
    if (this.mode === 'surface') this.surface.update(dt);
    else if (this.mode === 'flight') this.flight.update(dt);
    if (this.mode !== 'loading') this.frameCounter = (this.frameCounter ?? 0) + 1;
    if (this.frameCounter % 8 === 0) this._updateHud();
  }

  _clearPrompt() {
    this._setPrompt(null, null);
    this._setWarning(null);
  }

  _setPrompt(text, action) {
    this.promptAction = action;
    if (this.promptText === text) return;
    this.promptText = text;
    this.promptButton.hidden = !text;
    if (text) this.promptButton.textContent = text;
  }

  _setWarning(text) {
    if (this.warningText === text) return;
    this.warningText = text;
    this.warning.hidden = !text;
    if (text) this.warning.textContent = text;
  }

  _setText(element, key, value) {
    if (this[key] === value) return;
    this[key] = value;
    element.textContent = value;
  }

  _updateHud() {
    if (this.busy && this.mode === 'loading') return;
    if (this.mapOpen) {
      this._setText(this.stats, 'statsText', 'System map');
      this._setText(this.help, 'helpText', 'M close map · click a body for details · drag orbit · scroll zoom');
      this._clearPrompt();
      return;
    }
    if (this.mode === 'surface') this._updateSurfaceHud();
    else if (this.mode === 'flight') this._updateFlightHud();
    this.refreshPanelAction();
  }

  _updateSurfaceHud() {
    const { surface } = this;
    const g = surface.gravity;
    const jumpHeight = (JUMP_SPEED * JUMP_SPEED) / (2 * g);
    const airTime = (2 * JUMP_SPEED) / g;
    const parts = [
      surface.body.name.toUpperCase(),
      `Gravity ${g >= 1 ? g.toFixed(2) : g.toFixed(4)} m/s²`,
      `Jump ${formatMetres(jumpHeight)} · ${formatSeconds(airTime)} in the air`,
    ];
    if (surface.altitude > 0.3) parts.push(`Height ${formatMetres(surface.altitude)}`);
    if (surface.distanceToShip > 30) parts.push(`Ship ${formatMetres(surface.distanceToShip)}`);
    this._setText(this.stats, 'statsText', parts.join('  ·  '));

    const longJump = airTime > 25 ? ' · hold X suit thrusters' : '';
    this._setText(this.help, 'helpText', `WASD move · Shift run · Space jump · drag to look · M map${longJump}`);

    if (!this.busy && surface.canBoard) {
      this._setPrompt('Press E to board and take off', () => this._boardIfPossible());
    } else {
      this._setPrompt(null, null);
    }
    this._setWarning(null);
  }

  _updateFlightHud() {
    const { flight } = this;
    if (flight.isWarping) {
      this._setText(this.stats, 'statsText', `WARPING TO ${flight.warp.body.name.toUpperCase()}`);
      this._clearPrompt();
      return;
    }
    const frame = flight.frameBody;
    const location = frame.kind === 'star' && flight.altitudeOver(frame) > frame.radius * 6 ? 'Deep space' : `Near ${frame.name}`;
    this._setText(this.stats, 'statsText', location);
    this._setText(this.help, 'helpText', 'W forward · S back · A/D strafe · Space/C up/down · Shift boost · drag to aim · click a body to warp · M map');

    const body = flight.nearbyBody();
    const warning = body && noSurfaceWarning(body.data);
    if (warning) {
      this._setPrompt(null, null);
      this._setWarning(warning);
    } else if (body && !this.busy) {
      this._setWarning(null);
      this._setPrompt(`Press L to land on ${body.name}`, () => this._landIfPossible());
    } else {
      this._clearPrompt();
    }
  }
}
