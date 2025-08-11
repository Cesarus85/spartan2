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
  jumpPressed: false,        // Edge: wird nach getInputState() zurückgesetzt
  fireHeld: false,           // Hold
  turnSnapDeltaRad: 0,       // Edge, nur bei snap
  cycleWeaponPressed: false, // Edge: wird nach getInputState() zurückgesetzt
  _snapReady: true,
  _wasFaceTopDown: false     // Latch für B/Y-Edge
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

  // einfache Desktop-Poll-Schleife
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

  // VR-Button in das Overlay montieren
  if (vrButtonEl) {
    vrMount.innerHTML = '';
    vrMount.appendChild(vrButtonEl);
  }

  // UI initial aus Settings befüllen
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
    ov.classList.add('hidden'); // Desktop-Start blendet nur Overlay aus
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

  const sources = session.inputSources || [];
  let left = null, right = null;

  for (const src of sources) {
    const gp = src.gamepad;
    if (!gp) continue;
    const handed = src.handedness || 'unknown';
    if (handed === 'left') left = gp;
    if (handed === 'right') right = gp;
  }

  // Move vom linken Thumbstick (fallback für Browser/Mapping-Varianten)
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

  // --- Buttons --------------------------------------------------------------
  const btnPressed = (gp, idx) => !!(gp && gp.buttons && gp.buttons[idx] && gp.buttons[idx].pressed);

  // Face-Bottom (A / X) → Jump (bevorzugt rechter Controller (A), sonst linker (X))
  const faceBottom = (gp) => (btnPressed(gp, 3)); // Index 3 gängig für A/X
  if ((right && faceBottom(right)) || (left && faceBottom(left))) {
    state.jumpPressed = true;
  }

  // Face-Top (B / Y) → Cycle Weapon (Edge, beide Hände zulassen)
  const faceTop = (gp) => (btnPressed(gp, 4)); // Index 4 gängig für B/Y
  const faceTopDownNow = (right && faceTop(right)) || (left && faceTop(left));
  if (faceTopDownNow && !state._wasFaceTopDown) {
    state.cycleWeaponPressed = true;
  }
  state._wasFaceTopDown = faceTopDownNow;

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
  // Edge-Signale nach dem Auslesen zurücksetzen
  const snapshot = {
    moveAxis: { ...state.moveAxis },
    turnAxis: { ...state.turnAxis },
    jumpPressed: state.jumpPressed,
    fireHeld: state.fireHeld,
    turnSnapDeltaRad: settings.turnMode === 'snap' ? state.turnSnapDeltaRad : 0,
    cycleWeaponPressed: state.cycleWeaponPressed,
  };
  state.jumpPressed = false;
  state.cycleWeaponPressed = false;
  state.turnSnapDeltaRad = 0; // nur relevant in diesem Frame
  return snapshot;
}
