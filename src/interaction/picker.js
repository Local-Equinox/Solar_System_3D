// Turns taps and clicks on the canvas into body selections.
//
// Picking only ever tests `pickables` (the bodies' surfaces and Saturn's rings). Stars,
// constellations, orbit paths, glows and atmospheres are simply never in the list.
//
// A Raycaster alone would make most of the system untappable: seen from the overview, a moon is
// a pixel or two wide. So a direct ray hit always wins, and a miss falls back to the nearest
// body within a fingertip's or cursor's reach on screen.

import { Raycaster, Vector2, Vector3 } from 'three';

const TAP_MAX_TRAVEL_PX = 8;
const TAP_MAX_MS = 500;
const REACH_PX = { mouse: 11, touch: 24, pen: 16 };

const _ndc = new Vector2();
const _projected = new Vector3();

export class Picker {
  constructor(canvas, camera, system, { onSelect, onHover }) {
    Object.assign(this, { canvas, camera, system, onSelect, onHover });
    this.raycaster = new Raycaster();
    this.activePointers = new Map();
    this.wasMultiTouch = false;
    this.hoverEvent = null;
    this.hovered = null;

    canvas.addEventListener('pointerdown', (e) => this._down(e));
    canvas.addEventListener('pointerup', (e) => this._up(e));
    canvas.addEventListener('pointercancel', (e) => this._release(e));
    canvas.addEventListener('pointermove', (e) => {
      if (e.pointerType === 'mouse' && e.buttons === 0) this.hoverEvent = e;
    });
    canvas.addEventListener('pointerleave', () => {
      this.hoverEvent = null;
      this._setHovered(null);
    });
  }

  _down(event) {
    if (this.activePointers.size > 0) this.wasMultiTouch = true;
    else this.wasMultiTouch = false;
    this.activePointers.set(event.pointerId, { x: event.clientX, y: event.clientY, time: performance.now() });
  }

  _release(event) {
    this.activePointers.delete(event.pointerId);
  }

  _up(event) {
    const start = this.activePointers.get(event.pointerId);
    this._release(event);
    if (!start || this.wasMultiTouch || event.button !== 0) return;
    const travel = Math.hypot(event.clientX - start.x, event.clientY - start.y);
    if (travel > TAP_MAX_TRAVEL_PX || performance.now() - start.time > TAP_MAX_MS) return;
    const body = this.pick(event.clientX, event.clientY, REACH_PX[event.pointerType] ?? REACH_PX.mouse);
    if (body) this.onSelect(body);
  }

  /** Runs at most once a frame, however fast the mouse is reporting. */
  updateHover() {
    if (!this.hoverEvent) return;
    const { clientX, clientY } = this.hoverEvent;
    this.hoverEvent = null;
    this._setHovered(this.pick(clientX, clientY, REACH_PX.mouse));
  }

  _setHovered(body) {
    if (body === this.hovered) return;
    this.hovered = body;
    this.canvas.style.cursor = body ? 'pointer' : '';
    this.onHover?.(body);
  }

  pick(clientX, clientY, reachPx) {
    const rect = this.canvas.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    _ndc.set((x / rect.width) * 2 - 1, -(y / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(_ndc, this.camera);
    const [hit] = this.raycaster.intersectObjects(this.system.pickables, false);
    if (hit) return hit.object.userData.body;
    return this._nearestOnScreen(x, y, rect, reachPx);
  }

  _nearestOnScreen(x, y, rect, reachPx) {
    let best = null;
    let bestDistance = reachPx;
    for (const body of this.system.bodies) {
      _projected.copy(body.worldPosition).project(this.camera);
      if (_projected.z > 1) continue; // behind the camera
      const px = ((_projected.x + 1) / 2) * rect.width;
      const py = ((1 - _projected.y) / 2) * rect.height;
      const distance = Math.hypot(px - x, py - y);
      if (distance < bestDistance) {
        best = body;
        bestDistance = distance;
      }
    }
    return best;
  }
}
