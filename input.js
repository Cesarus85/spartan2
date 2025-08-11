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
  jumpPressed: false,        // Edge (wird nach getInputState() zurückgesetzt)
  fireHeld: false,           // Hold
  turnSnapDeltaRad: 0,       // Edge (nur bei snap)
  cycleWeaponPressed: false, // Edge (wird nach getInputState() zurückgesetzt)

  _snapReady: true,
  _wasFaceTopDown: false,    // Latch (B/Y)
  _wasFaceBottomDown: false, // Latch (A/X)
};

// --- Keyboard (Desktop) ------------------------------------------------------
export function initKeyboard() {
  const down = new Set();

  window.addEventListener('keydown', (e) => {
    down.add(e.code);

    // Jump als Edge
    if (e.code === 'Space') state.jumpPressed = true;

    // Fire-Hold (optional Desktop)
    if (e.code === 'MouseLeft' || e.code === 'KeyF') state.fireHeld = true;

    // Waffenwechsel als Edge
    if (e.code === 'KeyB' || e.code === 'KeyR') state.cycleWeaponPressed = true;
  });

  window.addEventListener('keyup', (e) => {
    down.delete(e.code);
    if (e.code === 'MouseLeft' || e.code === 'KeyF') state.fireHeld = false;
  });

  function updateFromKeyboard() {
    const x =
      (down.has('KeyD') || down.has('ArrowRight') ? 1 : 0) -
      (down.has('KeyA') || down.has('ArrowLeft') ? 1 : 0);
    const y =
      (down.has('KeyS') || down.has('ArrowDown') ? 1 : 0) -
      (down.has('KeyW') || down.has('ArrowUp') ? 1 : 0);
    state.moveAxis.x = x;
    state.moveAxis.y = y;

    // Q/E = smooth turn auf Desktop
    state.turnAxis.x = (down.has('KeyE') ? 1 : 0) - (down.has('KeyQ') ? 1 : 0);
  }

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

  if (vrButtonEl) {
    vrMount.innerHTML = '';
    vrMount.appendChild(vrButtonEl);
  }

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
    ov.classList.add('hidden'); // Desktop-Start: Overlay ausblenden
  });

  return {
    hideOverlay: () => ov.classList.add('hidden'),
    showOverlay: () => ov.classList.remove('hidden'),
    onStartDesktop: (fn) => btnStart.addEventListener('click', fn),
  };
}

// --- XR Input Reading --------------------------------------------------------
export function readXRInput(session) {
  // pro Frame zurücksetzen
  state.jumpPressed = false;
  state.turnSnapDeltaRad = 0;
  state.cycleWeaponPressed = false;

  const sources = session.inputSources || [];
  let left = null, right = null;

  for (const src of sources) {
    const gp = src.gamepad;
    if (!gp) continue;
    const handed = src.handedness || 'unknown';
    if (handed === 'left') left = gp;
    if (handed === 'right') right = gp;
  }

  // Move vom linken Thumbstick (Fallbacks für verschiedene Browser/Profile)
  if (left) {
    const ax = left.axes;
    const lx = ax[2] ?? ax[0] ?? 0;
    const ly = ax[3] ?? ax[1] ?? 0;
    state.moveAxis.x = dead(lx);
    state.moveAxis.y = dead(ly);
  }

  // Turn vom rechten Thumbstick
  if (right) {
    const ax = right.axes;
    const rx = ax[2] ?? ax[0] ?? 0;
    state.turnAxis.x = dead(rx);

    // Snap Edge
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

  // --- Buttons (getauschte Rollen) ------------------------------------------
  const btnPressed = (gp, idx) =>
    !!(gp && gp.buttons && gp.buttons[idx] && gp.buttons[idx].pressed);

  // Kandidaten robust für Quest/WebXR:
  //  - A/X meist 4, B/Y meist 5. Fallback 3/4.
  const faceDownNow = (gp, candidates) => {
    if (!gp || !gp.buttons) return false;
    for (const idx of candidates) {
      if (gp.buttons[idx] && gp.buttons[idx].pressed) return true;
    }
    return false;
  };

  // Unterer Button (A/X) – jetzt: Waffenwechsel
  const bottomCandidates = [4, 3];
  // Oberer Button (B/Y) – jetzt: Springen
  const topCandidates = [5, 4];

  const bottomNow =
    faceDownNow(right, bottomCandidates) || faceDownNow(left, bottomCandidates);
  const topNow =
    faceDownNow(right, topCandidates) || faceDownNow(left, topCandidates);

  // Rising-Edge: Springen auf B/Y (oben)
  if (topNow && !state._wasFaceTopDown) {
    state.jumpPressed = true;
  }
  // Rising-Edge: Waffenwechsel auf A/X (unten)
  if (bottomNow && !state._wasFaceBottomDown) {
    state.cycleWeaponPressed = true;
  }

  state._wasFaceTopDown = topNow;
  state._wasFaceBottomDown = bottomNow;

  // Fire: Trigger auf settings.weaponHand (Index 0)
  const handGp = (settings.weaponHand === 'left') ? left : right;
  if (handGp) {
    const trig = handGp.buttons && handGp.buttons[0];
    state.fireHeld = !!(trig && (trig.pressed || trig.value > 0.5));
  } else {
    state.fireHeld = false;
  }
}

function dead(v, dz = 0.15) {
  return Math.abs(v) < dz ? 0 : v;
}

export function getInputState() {
  const snapshot = {
    moveAxis: { ...state.moveAxis },
    turnAxis: { ...state.turnAxis },
    jumpPressed: state.jumpPressed,                   // Edge
    fireHeld: state.fireHeld,                         // Hold
    turnSnapDeltaRad: settings.turnMode === 'snap' ? state.turnSnapDeltaRad : 0,
    cycleWeaponPressed: state.cycleWeaponPressed,     // Edge
  };
  // Edge-Flags zurücksetzen
  state.jumpPressed = false;
  state.cycleWeaponPressed = false;
  state.turnSnapDeltaRad = 0;
  return snapshot;
}
