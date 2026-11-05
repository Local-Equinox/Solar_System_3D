// HTML name tags that track bodies on screen. Planets are always labelled; a moon gets a label when
// its system is selected or the camera is close to it, which keeps the overview uncluttered.

import { Vector3 } from 'three';

const _projected = new Vector3();
const _toBody = new Vector3();
const _toOccluder = new Vector3();

const LABEL_HEIGHT_PX = 16;
const LABEL_CHAR_WIDTH_PX = 7;

export class Labels {
  constructor(container, system, camera) {
    Object.assign(this, { container, system, camera });
    this.selected = null;
    this.enabled = true;
    this.entries = system.bodies.map((body) => {
      const element = document.createElement('div');
      element.className = `label label-${body.kind}`;
      element.textContent = body.name;
      element.style.setProperty('--accent', body.data.color);
      element.hidden = true;
      container.append(element);
      return { body, element, x: NaN, y: NaN, halfWidth: (body.name.length * LABEL_CHAR_WIDTH_PX) / 2 + 4 };
    });
    this.placed = [];
    this.suppressed = false;
  }

  /** Adds a label for something that isn't a body, such as the player's ship. */
  addMarker(marker) {
    const element = document.createElement('div');
    element.className = 'label label-marker';
    element.textContent = marker.name;
    element.hidden = true;
    this.container.append(element);
    this.entries.unshift({ body: marker, element, x: NaN, y: NaN, halfWidth: (marker.name.length * LABEL_CHAR_WIDTH_PX) / 2 + 4 });
  }

  /** Hides all labels for views where they don't apply, without changing the user's preference. */
  setSuppressed(suppressed) {
    this.suppressed = suppressed;
    this.container.hidden = suppressed || !this.enabled;
  }

  setSelected(body) {
    this.selected = body;
    for (const { body: b, element } of this.entries) element.classList.toggle('is-selected', b === body);
  }

  setEnabled(enabled) {
    this.enabled = enabled;
    this.container.hidden = this.suppressed || !enabled;
  }

  update(width, height) {
    if (!this.enabled || this.suppressed) return;
    const camera = this.camera;
    const pxPerUnit = height / (2 * Math.tan((camera.fov * Math.PI) / 360));
    const placed = this.placed;
    placed.length = 0;

    // The catalog runs Sun, planets, moons, so more important labels claim their space first.
    for (const entry of this._priorityOrder()) {
      const { body, element } = entry;
      const distance = camera.position.distanceTo(body.worldPosition);
      const radiusPx = (body.radius * pxPerUnit) / Math.max(distance, 1e-6);

      let visible = this._isRelevant(body, distance) && !this._isOccluded(body, distance);
      let x = 0;
      let y = 0;
      if (visible) {
        _projected.copy(body.worldPosition).project(camera);
        visible = _projected.z < 1;
        x = Math.round(((_projected.x + 1) / 2) * width);
        y = Math.round(((1 - _projected.y) / 2) * height + radiusPx + 5);
        if (x < -40 || x > width + 40 || y < -20 || y > height + 20) visible = false;
        if (visible && placed.some((p) => Math.abs(p.x - x) < p.halfWidth + entry.halfWidth && Math.abs(p.y - y) < LABEL_HEIGHT_PX)) {
          visible = false;
        }
        if (visible) placed.push({ x, y, halfWidth: entry.halfWidth });
      }

      if (element.hidden === visible) element.hidden = !visible;
      if (visible && (x !== entry.x || y !== entry.y)) {
        entry.x = x;
        entry.y = y;
        element.style.transform = `translate3d(${x}px, ${y}px, 0) translateX(-50%)`;
      }
    }
  }

  /** The selected body's label is never the one to give way. */
  _priorityOrder() {
    const first = this.entries.find(({ body }) => body === this.selected);
    return first ? [first, ...this.entries.filter((entry) => entry !== first)] : this.entries;
  }

  _isRelevant(body, distance) {
    if (body.kind === 'marker') return body.isVisible(distance);
    if (body.kind !== 'moon') return true;
    const selected = this.selected;
    if (selected && (selected === body || selected === body.parent || selected.parent === body.parent)) return true;
    return distance < 28 * body.parent.radius;
  }

  /** Whether the Sun, or the body's parent, is between it and the camera. */
  _isOccluded(body, distance) {
    const position = this.camera.position;
    const sun = this.system.bodies[0];
    _toBody.subVectors(body.worldPosition, position).divideScalar(Math.max(distance, 1e-6));
    const blockedBy = (occluder) => {
      if (occluder === body) return false;
      _toOccluder.subVectors(occluder.worldPosition, position);
      const along = _toOccluder.dot(_toBody);
      if (along <= 0 || along >= distance) return false;
      return _toOccluder.lengthSq() - along * along < occluder.radius * occluder.radius;
    };
    return blockedBy(sun) || (body.parent ? blockedBy(body.parent) : false);
  }
}
