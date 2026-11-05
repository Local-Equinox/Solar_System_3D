// Keyboard and on-screen joystick state, shared by walking and flying.

const MOVEMENT_CODES = new Set([
  'KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'KeyC', 'KeyX',
  'ShiftLeft', 'ShiftRight',
]);
const JOYSTICK_RADIUS_PX = 42;

const isTextEntry = (target) =>
  target instanceof HTMLTextAreaElement || (target instanceof HTMLInputElement && target.type !== 'range');

export class Input {
  constructor() {
    this.down = new Set();
    this.stick = { x: 0, y: 0 };
    this.jumpQueued = false;
    this.handlers = new Map();

    window.addEventListener('keydown', (event) => this._keyDown(event));
    window.addEventListener('keyup', (event) => this.down.delete(event.code));
    // A released key is never reported to a window that has lost focus.
    window.addEventListener('blur', () => this.down.clear());
    this._bindJoystick();

    const jump = document.getElementById('touch-jump');
    jump.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      this.jumpQueued = true;
      this.down.add('Space');
    });
    for (const type of ['pointerup', 'pointercancel', 'pointerleave']) {
      jump.addEventListener(type, () => this.down.delete('Space'));
    }
  }

  /** Runs `handler` once per key press, ignoring auto-repeat. */
  onPress(code, handler) {
    this.handlers.set(code, handler);
  }

  _keyDown(event) {
    if (isTextEntry(event.target) || event.metaKey || event.ctrlKey || event.altKey) return;
    if (MOVEMENT_CODES.has(event.code)) {
      // Otherwise Space re-clicks whichever button was last used (such as Warp), and arrow keys
      // move the speed slider.
      if (document.activeElement instanceof HTMLElement && document.activeElement !== document.body) {
        document.activeElement.blur();
      }
      event.preventDefault();
    }
    if (event.repeat) return;
    this.down.add(event.code);
    if (event.code === 'Space') this.jumpQueued = true;
    this.handlers.get(event.code)?.();
  }

  /** Movement axes in -1..1: x is right, y is forward. */
  movement() {
    const held = (...codes) => codes.some((code) => this.down.has(code));
    const x = (held('KeyD', 'ArrowRight') ? 1 : 0) - (held('KeyA', 'ArrowLeft') ? 1 : 0) + this.stick.x;
    const y = (held('KeyW', 'ArrowUp') ? 1 : 0) - (held('KeyS', 'ArrowDown') ? 1 : 0) + this.stick.y;
    const length = Math.hypot(x, y);
    return length > 1 ? { x: x / length, y: y / length } : { x, y };
  }

  get boost() {
    return this.down.has('ShiftLeft') || this.down.has('ShiftRight');
  }

  /** True once per jump press. */
  consumeJump() {
    const queued = this.jumpQueued;
    this.jumpQueued = false;
    return queued;
  }

  _bindJoystick() {
    const base = document.getElementById('joystick');
    const knob = document.getElementById('joystick-knob');
    let activePointer = null;
    const move = (event) => {
      const rect = base.getBoundingClientRect();
      let dx = event.clientX - (rect.left + rect.width / 2);
      let dy = event.clientY - (rect.top + rect.height / 2);
      const length = Math.hypot(dx, dy);
      if (length > JOYSTICK_RADIUS_PX) {
        dx *= JOYSTICK_RADIUS_PX / length;
        dy *= JOYSTICK_RADIUS_PX / length;
      }
      this.stick.x = dx / JOYSTICK_RADIUS_PX;
      this.stick.y = -dy / JOYSTICK_RADIUS_PX;
      knob.style.transform = `translate(${dx}px, ${dy}px)`;
    };
    base.addEventListener('pointerdown', (event) => {
      activePointer = event.pointerId;
      base.setPointerCapture(activePointer);
      move(event);
    });
    base.addEventListener('pointermove', (event) => {
      if (event.pointerId === activePointer) move(event);
    });
    const release = (event) => {
      if (event.pointerId !== activePointer) return;
      activePointer = null;
      this.stick.x = 0;
      this.stick.y = 0;
      knob.style.transform = '';
    };
    base.addEventListener('pointerup', release);
    base.addEventListener('pointercancel', release);
  }
}
