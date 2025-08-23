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
  reloadPressed: false,      // Edge (wird nach getInputState() zurückgesetzt)

  _snapReady: true,
  // Separate Latches für jeden Controller und Button
  _leftXWasDown: false,      // X auf linkem Controller (Jump)
  _leftYWasDown: false,      // Y auf linkem Controller (Reload)
  _rightAWasDown: false,     // A auf rechtem Controller (Jump)
  _rightBWasDown: false,     // B auf rechtem Controller (Reload)
};

// --- Keyboard (Desktop) ------------------------------------------------------
const down = new Set();

export function initKeyboard() {
  window.addEventListener('keydown', (e) => {
    down.add(e.code);

    // Jump als Edge
    if (e.code === 'Space') state.jumpPressed = true;

    // Fire-Hold (optional Desktop)
    if (e.code === 'MouseLeft' || e.code === 'KeyF') state.fireHeld = true;

    // Waffenwechsel als Edge
    if (e.code === 'KeyB') state.cycleWeaponPressed = true;

    // Reload als Edge
    if (e.code === 'KeyR') state.reloadPressed = true;
  });

  window.addEventListener('keyup', (e) => {
    down.delete(e.code);
    if (e.code === 'MouseLeft' || e.code === 'KeyF') state.fireHeld = false;
  });
}

export function readKeyboard() {
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
  // NICHT hier zurücksetzen - das passiert erst in getInputState()
  // Diese Funktion sammelt nur Input-Events

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

  // --- Button-Mapping (korrigiert für Quest Touch Controller) --------------
  // Quest Touch Button-Layout:
  // Linker Controller: X=4, Y=5
  // Rechter Controller: A=4, B=5
  
  // Hilfsfunktion für sicheren Button-Zugriff
  const isButtonPressed = (gamepad, index) => {
    return !!(gamepad && gamepad.buttons && gamepad.buttons[index] && gamepad.buttons[index].pressed);
  };

  // Linker Controller: X (Index 4) = Jump, Y (Index 5) = Reload
  if (left) {
    const leftXNow = isButtonPressed(left, 4);  // X-Button
    const leftYNow = isButtonPressed(left, 5);  // Y-Button
    
    // Rising Edge Detection für X (Jump)
    if (leftXNow && !state._leftXWasDown) {
      state.jumpPressed = true;
    }
    
    // Rising Edge Detection für Y (Reload)
    if (leftYNow && !state._leftYWasDown) {
      state.reloadPressed = true;
    }
    
    // Latches erst am Ende des Frames updaten
    state._leftXWasDown = leftXNow;
    state._leftYWasDown = leftYNow;
  }

  // Rechter Controller: A (Index 4) = Jump, B (Index 5) = Reload
  if (right) {
    const rightANow = isButtonPressed(right, 4);  // A-Button
    const rightBNow = isButtonPressed(right, 5);  // B-Button
    
    // Rising Edge Detection für A (Jump)
    if (rightANow && !state._rightAWasDown) {
      state.jumpPressed = true;
    }
    
    // Rising Edge Detection für B (Reload)
    if (rightBNow && !state._rightBWasDown) {
      state.reloadPressed = true;
    }
    
    // Latches erst am Ende des Frames updaten
    state._rightAWasDown = rightANow;
    state._rightBWasDown = rightBNow;
  }

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
    reloadPressed: state.reloadPressed,               // Edge
  };
  
  // Edge-Flags erst NACH dem Snapshot zurücksetzen
  // Das garantiert, dass alle Update-Zyklen die Events sehen
  state.jumpPressed = false;
  state.cycleWeaponPressed = false;
  state.reloadPressed = false;
  state.turnSnapDeltaRad = 0;
  
  return snapshot;
}