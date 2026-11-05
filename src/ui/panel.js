// The left-hand HTML panel: a directory of every body, or the selected body's details.
// It's plain DOM layered above the canvas, with no part of it drawn in WebGL.

const AU_KM = 149597870.7;
const LIGHT_SECONDS_PER_AU = 499.005;

function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (key === 'class') node.className = value;
    else if (key === 'style') for (const [k, v] of Object.entries(value)) node.style.setProperty(k, v);
    else if (key.startsWith('on')) node.addEventListener(key.slice(2), value);
    else node.setAttribute(key, value);
  }
  node.append(...children.filter((child) => child != null));
  return node;
}

const number = (value, digits = 0) =>
  value.toLocaleString('en-US', { maximumFractionDigits: digits, minimumFractionDigits: digits });

function formatMass([mantissa, exponent]) {
  return el('span', {}, `${mantissa} × 10`, el('sup', {}, String(exponent)), ' kg');
}

function formatPeriodDays(days) {
  if (days >= 365.25 * 2) return `${number(days / 365.25, 2)} years (${number(days)} days)`;
  if (days < 1) return `${number(days * 24, 1)} hours`;
  return `${number(days, days < 100 ? 2 : 1)} days`;
}

function formatRotation(hours) {
  const size = Math.abs(hours);
  const text = size >= 48 ? `${number(size / 24, 1)} days` : `${number(size, 1)} hours`;
  return hours < 0 ? `${text} (retrograde)` : text;
}

const formatGravity = (g) => {
  const digits = g >= 1 ? 2 : g >= 0.01 ? 3 : 4;
  return `${number(g, digits)} m/s²`;
};

function formatLightTime(au) {
  const seconds = au * LIGHT_SECONDS_PER_AU;
  if (seconds < 3600) return `${number(seconds / 60, 1)} light-minutes`;
  return `${number(seconds / 3600, 2)} light-hours`;
}

function factRows(data, parent) {
  const rows = [];
  const add = (label, value) => { if (value != null) rows.push([label, value]); };
  add('Type', data.type);
  add('Mass', formatMass(data.mass));
  add('Mean radius', `${number(data.radiusKm, data.radiusKm < 100 ? 1 : 0)} km`);
  add('Surface gravity', formatGravity(data.gravity));
  if (data.kind === 'star') {
    add('Galactic orbit', 'About 230 million years');
    add('Rotation', `${number(data.rotHours / 24, 1)} days at the equator`);
  } else if (data.kind === 'planet') {
    add('Orbital period', formatPeriodDays(data.orbitDays));
    add('Mean distance from Sun', data.distance);
    add('Rotation', formatRotation(data.rotHours));
  } else {
    add('Orbital period', `${formatPeriodDays(data.orbitDays)}${data.retrograde ? ' (retrograde)' : ''}`);
    add(`Mean distance from ${parent.name}`, `${number(data.orbit.aKm)} km`);
    add('Rotation', 'Tidally locked');
  }
  if (data.tilt != null) add('Axial tilt', `${number(data.tilt, data.tilt < 1 ? 2 : 1)}°`);
  add('Temperature', data.temperature);
  add(data.kind === 'moon' ? 'Atmosphere' : 'Composition', data.composition);
  if (data.knownMoons != null) add('Known moons', String(data.knownMoons));
  add('Discovered', data.discovered);
  return rows;
}

export class Panel {
  constructor(root, system, { onSelect }) {
    this.root = root;
    this.system = system;
    this.onSelect = onSelect;
    this.content = root.querySelector('#panel-content');
    this.actionSlot = root.querySelector('#panel-action');
    this.toggleButton = root.querySelector('#panel-toggle');
    this.liveFields = null;
    this.selected = null;
    this.open = true;

    this.toggleButton.addEventListener('click', () => this.setOpen(!this.open));
    this.showDirectory();
  }

  setOpen(open) {
    this.open = open;
    this.root.classList.toggle('is-collapsed', !open);
    this.toggleButton.setAttribute('aria-expanded', String(open));
    this.toggleButton.setAttribute('aria-label', open ? 'Hide panel' : 'Show panel');
    this.onLayoutChange?.();
  }

  /**
   * Sets the primary action below the details, such as Warp.
   * @param action {label, onClick, disabled, note}, or null for none
   */
  setAction(action) {
    const key = action ? `${action.label}|${action.disabled}|${action.note}` : '';
    if (key === this.actionKey) {
      this.action = action;
      return;
    }
    this.actionKey = key;
    this.action = action;
    if (!action) {
      this.actionSlot.replaceChildren();
      return;
    }
    this.actionSlot.replaceChildren(...[
      action.note ? el('p', { class: 'action-note' }, action.note) : null,
      action.label ? el('button', {
        class: 'action-button',
        type: 'button',
        ...(action.disabled ? { disabled: '' } : {}),
        onclick: () => this.action?.onClick?.(),
      }, action.label) : null,
    ].filter(Boolean));
  }

  _bodyButton(body, extraClass = '') {
    return el('button', {
      class: `body-link ${extraClass}`,
      type: 'button',
      style: { '--accent': body.data.color },
      onclick: () => this.onSelect(body),
    }, el('span', { class: 'swatch', 'aria-hidden': 'true' }), body.name);
  }

  showDirectory() {
    this.selected = null;
    this.liveFields = null;
    const [sun, ...rest] = this.system.bodies;
    const planets = rest.filter((body) => body.kind === 'planet');
    this.content.replaceChildren(
      el('h1', { class: 'directory-title' }, 'The Solar System'),
      el('p', { class: 'hint' }, 'Select any body, here or in the scene. Drag to orbit, scroll or pinch to zoom, right-drag or two-finger drag to pan.'),
      el('nav', { 'aria-label': 'Celestial bodies' },
        el('ul', { class: 'directory' },
          el('li', {}, this._bodyButton(sun, 'is-planet')),
          ...planets.map((planet) => el('li', {},
            this._bodyButton(planet, 'is-planet'),
            planet.moons.length
              ? el('ul', { class: 'moon-list' }, ...planet.moons.map((moon) => el('li', {}, this._bodyButton(moon))))
              : null,
          )),
        ),
      ),
      el('p', { class: 'scale-note' }, 'Sizes and distances are compressed so everything fits on screen, and aren’t to scale. The panel shows true values.'),
    );
    this.root.classList.remove('has-selection');
    this.onLayoutChange?.();
  }

  showBody(body) {
    this.selected = body;
    const { data, parent, moons } = body;
    this.liveFields = {};

    const liveRows = [];
    if (data.kind !== 'star') {
      const live = (label, key) => {
        const value = el('dd', { class: 'mono' }, '—');
        this.liveFields[key] = value;
        liveRows.push(el('div', { class: 'fact' }, el('dt', {}, label), value));
      };
      live('From the Sun', 'fromSun');
      live('Sunlight arrives in', 'lightTime');
      if (body.id !== 'earth' && body.id !== 'moon') live('From Earth', 'fromEarth');
    }

    this.content.replaceChildren(...[
      el('p', { class: 'eyebrow', style: { '--accent': data.color } }, el('span', { class: 'swatch', 'aria-hidden': 'true' }), data.type),
      el('h1', { class: 'body-name' }, body.name),
      el('p', { class: 'blurb' }, data.blurb),
      liveRows.length ? el('section', { 'aria-label': 'Live position' },
        el('h2', {}, 'Right now, in this simulation'),
        el('dl', { class: 'facts' }, ...liveRows),
      ) : null,
      el('section', {},
        el('h2', {}, 'Facts'),
        el('dl', { class: 'facts' }, ...factRows(data, parent).map(([label, value]) =>
          el('div', { class: 'fact' }, el('dt', {}, label), el('dd', {}, value)))),
      ),
      parent ? el('section', {}, el('h2', {}, 'Orbits'), el('div', { class: 'chips' }, this._bodyButton(parent, 'chip'))) : null,
      moons.length ? el('section', {},
        el('h2', {}, moons.length === data.knownMoons ? 'Moons' : 'Major moons'),
        el('div', { class: 'chips' }, ...moons.map((moon) => this._bodyButton(moon, 'chip'))),
      ) : null,
      data.textureNote ? el('p', { class: 'scale-note' }, data.textureNote) : null,
    ].filter(Boolean));
    this.content.scrollTop = 0;
    this.root.classList.add('has-selection');
    this.updateLive();
    this.onLayoutChange?.();
  }

  /** Refreshes the live readouts. They're true distances, not the compressed display ones. */
  updateLive() {
    const fields = this.liveFields;
    if (!fields || !this.selected) return;
    const position = this.selected.positionAU;
    const au = position.length();
    if (fields.fromSun) {
      fields.fromSun.textContent = `${number(au, 3)} AU · ${number((au * AU_KM) / 1e6)}M km`;
    }
    if (fields.lightTime) fields.lightTime.textContent = formatLightTime(au);
    if (fields.fromEarth) {
      const fromEarth = position.distanceTo(this.system.byId.get('earth').positionAU);
      fields.fromEarth.textContent = `${number(fromEarth, 3)} AU`;
    }
  }
}
