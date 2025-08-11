// input.js
import { THREE } from './deps.js';

export const settings = {
  turnMode: 'smooth',   // 'smooth' | 'snap'
  snapAngleDeg: 30,     // 30 | 45
  weaponHand: 'left',   // 'left' | 'right'
};

const state = {
  moveAxis: { x: 0, y: 0 },
  turnAxis: { x: 0, y: 0 },
  jumpPressed: false,
  fireHeld: false,
  // Nur für Snap: liefert bei Bedarf ±angle, danach 0 (edge)
  turnSnapDeltaRad: 0,
  _snapReady: true,
};

// --- Keyboard (Desktop) ------------------------------------------------------
export function initKeyboard() {
  const down = new Set();
  window.addEventListener('keydown', (e) => {
    down.add(e.code);
    if (e.code === 'Space') state.jumpPressed = true;
    if (e.code === 'MouseLeft' || e.code === 'KeyF') state.fireHeld = true;
  });
  window.addEventListener('keyup', (e) => {
    down.delete(e.code);
    if (e.code === 'MouseLeft' || e.code === 'KeyF') state.fireHeld = false;
  });

  function updateFromKeyboard() {
    const x = (down.has('KeyD') || down.has('ArrowRight') ? 1 : 0) - (down.has('KeyA') || down.has('ArrowLeft') ? 1 : 0);
    const y = (down.has('KeyS') || down.has('ArrowDown') ? 1 : 0) - (down.has('KeyW') || down.has('ArrowUp') ? 1 : 0);
    state.moveAxis.x = x;
    state.moveAxis.y = y;
    state.turnAxis.x = (down.has('KeyE') ? 1 : 0) - (down.has('KeyQ') ? 1 : 0);
  }
  // simple desktop poll
  setInterval(updateFromKeyboard, 16);
}

// --- Overlay (Start & Settings) ---------------------------------------------
export function initOverlay(renderer, vrButtonEl, onSettingsChanged) {
  const ov = document.getElementById('overlay');
  const turnMode = ov.querySelector('#turnMode');
  const snapAngle = ov.querySelector('#snapAngle');
  const weaponHand = ov.querySelector('#weaponHand');
  const btnStart = ov.querySelector('#btnStart');
  const vrMount = ov.querySelector('#vrMount');

  // mount VR button into overlay
  if (vrButtonEl) {
    vrMount.innerHTML = '';
    vrMount.appendChild(vrButtonEl);
  }

  // init UI state from settings
  turnMode.value = settings.turnMode;
  snapAngle.value = String(settings.snapAngleDeg);
  weaponHand.value = settings.weaponHand;
  snapAngle.disabled = settings.turnMode !== 'snap';

  function changed() {
    onSettingsChanged && onSettingsChanged();
  }

  turnMode.addEventListener('change', () => {
    settings.turnMode = turnMode.value;
    snapAngle.disabled = settings.turnMode !== 'snap';
    changed();
  });
  snapAngle.addEventListener('change', () => {
    settings.snapAngleDeg = parseInt(snapAngle.value, 10);
    changed();
  });
  weaponHand.addEventListener('change', () => {
    settings.weaponHand = weaponHand.value;
    changed();
  });

  btnStart.addEventListener('click', () => {
    // Desktop start: just hide overlay (loop runs already)
    ov.classList.add('hidden');
  });

  return {
    hideOverlay: () => ov.classList.add('hidden'),
    showOverlay: () => ov.classList.remove('hidden'),
    onStartDesktop: (fn) => btnStart.addEventListener('click', fn),
  };
}

// --- XR Input Reading --------------------------------------------------------
export function readXRInput(session) {
  // reset per-frame signals
  state.jumpPressed = false;
  state.turnSnapDeltaRad = 0;

  const sources = session.inputSources || [];
  let left = null, right = null;

  for (const src of sources) {
    const gp = src.gamepad;
    if (!gp) continue;
    const handed = src.handedness || 'unknown';
    if (handed === 'left') left = gp;
    if (handed === 'right') right = gp;
  }

  // Move from left thumbstick (axes[2]=x, axes[3]=y auf vielen Geräten; Fallback [0],[1])
  if (left) {
    const ax = left.axes;
    const lx = ax[2] ?? ax[0] ?? 0;
    const ly = ax[3] ?? ax[1] ?? 0;
    state.moveAxis.x = dead(lx);
    state.moveAxis.y = dead(ly);
  }

  // Turn from right thumbstick
  if (right) {
    const ax = right.axes;
    const rx = ax[2] ?? ax[0] ?? 0;
    state.turnAxis.x = dead(rx);

    // Snap edge-detect
    if (settings.turnMode === 'snap') {
      const th = 0.6;
      if (state._snapReady && Math.abs(rx) > th) {
        const sign = rx > 0 ? 1 : -1;
        const angleRad = (settings.snapAngleDeg * Math.PI / 180) * sign;
        state.turnSnapDeltaRad = angleRad;
        state._snapReady = false;
      }
      if (Math.abs(rx) < 0.3) state._snapReady = true;
    }
  }

  // Jump: A / south button (meist Button 0/4)
  const btnPressed = (gp, idx) => gp && gp.buttons && gp.buttons[idx] && gp.buttons[idx].pressed;
  if ((right && (btnPressed(right, 0) || btnPressed(right, 4))) || (left && btnPressed(left, 0))) {
    state.jumpPressed = true;
  }

  // Fire: Trigger auf settings.weaponHand
  const handGp = (settings.weaponHand === 'left') ? left : right;
  if (handGp) {
    const trigger = handGp.buttons && handGp.buttons[0] ? handGp.buttons[0] : null; // 0 ist häufig der Trigger
    state.fireHeld = !!(trigger && (trigger.pressed || trigger.value > 0.5));
  } else {
    state.fireHeld = false;
  }
}

function dead(v, dz = 0.15) {
  return Math.abs(v) < dz ? 0 : v;
}

export function getInputState() {
  return {
    moveAxis: { ...state.moveAxis },
    turnAxis: { ...state.turnAxis },
    jumpPressed: state.jumpPressed,
    fireHeld: state.fireHeld,
    turnSnapDeltaRad: settings.turnMode === 'snap' ? state.turnSnapDeltaRad : 0,
  };
}
