// input.js
import { THREE } from './deps.js';

export const settings = {
  turnMode: 'smooth',   // 'smooth' | 'snap'
  snapAngleDeg: 30,     // 30 | 45
  weaponHand: 'left',   // 'left' | 'right'
};

// interner State
const state = {
  moveAxis: { x: 0, y: 0 },
  turnAxis: { x: 0, y: 0 },
  jumpPressed: false,
  fireHeld: false,
  // nur für Snap: liefert bei Bedarf ±angle, danach 0 (edge)
  turnSnapDeltaRad: 0,
  _snapCooldown: 0,
  _rightBWasPressed: false
};

let callbacks = {
  onWeaponCycle: () => {},
  onWeaponHandChange: () => {}
};

let hud = null; // {group, btnTurn, btnSnap, btnHand}
let overlayEls = { turnMode: null, snapAngle: null, weaponHand: null };

// ---------- Public API ----------
export function initKeyboard() {
  window.addEventListener('keydown', (e) => {
    if (e.key === 'w') state.moveAxis.y = -1;
    if (e.key === 's') state.moveAxis.y =  1;
    if (e.key === 'a') state.moveAxis.x = -1;
    if (e.key === 'd') state.moveAxis.x =  1;
    if (e.key === 'ArrowLeft')  state.turnAxis.x = -1;
    if (e.key === 'ArrowRight') state.turnAxis.x =  1;
    if (e.key === ' ') { state.jumpPressed = true; state.fireHeld = true; }
  });
  window.addEventListener('keyup', (e) => {
    if (e.key === 'w' || e.key === 's') state.moveAxis.y = 0;
    if (e.key === 'a' || e.key === 'd') state.moveAxis.x = 0;
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') state.turnAxis.x = 0;
    if (e.key === ' ') { state.jumpPressed = false; state.fireHeld = false; }
  });
}

export function initOverlay(onWeaponHandChange) {
  callbacks.onWeaponHandChange = onWeaponHandChange || callbacks.onWeaponHandChange;
  const root = document.getElementById('overlay');
  root.innerHTML = `
    <div style="font-weight:600;margin-bottom:6px;">Settings (Pre-VR)</div>
    <label class="row">
      Turn Mode:
      <select id="ovTurnMode">
        <option value="smooth">Smooth</option>
        <option value="snap">Snap</option>
      </select>
    </label>
    <label class="row">
      Snap Angle:
      <select id="ovSnapAngle">
        <option value="30">30°</option>
        <option value="45">45°</option>
      </select>
    </label>
    <label class="row">
      Weapon Hand:
      <select id="ovWeaponHand">
        <option value="left">Left</option>
        <option value="right">Right</option>
      </select>
    </label>
  `;
  overlayEls.turnMode   = root.querySelector('#ovTurnMode');
  overlayEls.snapAngle  = root.querySelector('#ovSnapAngle');
  overlayEls.weaponHand = root.querySelector('#ovWeaponHand');

  overlayEls.turnMode.value  = settings.turnMode;
  overlayEls.snapAngle.value = String(settings.snapAngleDeg);
  overlayEls.weaponHand.value = settings.weaponHand;

  overlayEls.turnMode.onchange = () => settings.turnMode = overlayEls.turnMode.value;
  overlayEls.snapAngle.onchange = () => settings.snapAngleDeg = parseInt(overlayEls.snapAngle.value, 10);
  overlayEls.weaponHand.onchange = () => {
    settings.weaponHand = overlayEls.weaponHand.value;
    callbacks.onWeaponHandChange(settings.weaponHand);
    updateHudTextures();
  };
}

export function initHUD(camera, controllerRight, onWeaponCycle, onWeaponHandChange) {
  callbacks.onWeaponCycle = onWeaponCycle || callbacks.onWeaponCycle;
  callbacks.onWeaponHandChange = onWeaponHandChange || callbacks.onWeaponHandChange;

  hud = createHUD();
  camera.add(hud.group);

  const uiRay = new THREE.Raycaster();
  controllerRight.addEventListener('selectstart', () => {
    const origin = controllerRight.getWorldPosition(new THREE.Vector3());
    const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(controllerRight.getWorldQuaternion(new THREE.Quaternion())).normalize();
    uiRay.set(origin, dir);
    const hits = uiRay.intersectObjects([hud.btnTurn, hud.btnSnap, hud.btnHand], false);
    if (hits.length) {
      const obj = hits[0].object;
      if (obj === hud.btnTurn) {
        settings.turnMode = (settings.turnMode === 'smooth') ? 'snap' : 'smooth';
        overlayEls.turnMode.value = settings.turnMode;
      } else if (obj === hud.btnSnap) {
        settings.snapAngleDeg = (settings.snapAngleDeg === 30) ? 45 : 30;
        overlayEls.snapAngle.value = String(settings.snapAngleDeg);
      } else if (obj === hud.btnHand) {
        settings.weaponHand = (settings.weaponHand === 'left') ? 'right' : 'left';
        overlayEls.weaponHand.value = settings.weaponHand;
        callbacks.onWeaponHandChange(settings.weaponHand);
      }
      updateHudTextures();
    }
  });
}

export function readXRInput(session) {
  // reset
  state.moveAxis.x = state.moveAxis.y = 0;
  state.turnAxis.x = state.turnAxis.y = 0;
  state.jumpPressed = false;
  state.fireHeld = false;

  for (const source of session.inputSources) {
    if (!source.gamepad) continue;
    const { axes, buttons } = source.gamepad;
    const dead = 0.1;
    const axX = Math.abs(axes[2] || 0) > dead ? axes[2] : 0;
    const axY = Math.abs(axes[3] || 0) > dead ? axes[3] : 0;

    if (source.handedness === 'left') {
      state.moveAxis.x = axX; state.moveAxis.y = axY;
    } else if (source.handedness === 'right') {
      state.turnAxis.x = axX; state.turnAxis.y = axY;

      // A (id=4) → Jump
      if (buttons[4] && buttons[4].pressed) state.jumpPressed = true;

      // B (id=5) → Weapon Cycle
      const bPressed = (buttons[5] && buttons[5].pressed) || false;
      if (bPressed && !state._rightBWasPressed) callbacks.onWeaponCycle();
      state._rightBWasPressed = bPressed;
    }

    // Trigger (id=0) nur auf aktiver Waffenhand
    const trigDown = (buttons[0] && buttons[0].pressed) || false;
    if (source.handedness === settings.weaponHand && trigDown) state.fireHeld = true;
  }

  // Snap-Turn Edge
  state.turnSnapDeltaRad = 0;
  if (settings.turnMode === 'snap') {
    if (state._snapCooldown > 0) state._snapCooldown = Math.max(0, state._snapCooldown - 1/90);
    const dead = 0.35;
    if (state._snapCooldown === 0) {
      if (state.turnAxis.x <= -dead) { state.turnSnapDeltaRad =  THREE.MathUtils.degToRad(settings.snapAngleDeg);  state._snapCooldown = 0.22; }
      else if (state.turnAxis.x >=  dead) { state.turnSnapDeltaRad = -THREE.MathUtils.degToRad(settings.snapAngleDeg); state._snapCooldown = 0.22; }
    }
  }
}

export function getInputState() {
  return {
    moveAxis: { ...state.moveAxis },
    turnAxis: { ...state.turnAxis },
    jumpPressed: state.jumpPressed,
    fireHeld: state.fireHeld,
    turnSnapDeltaRad: state.turnSnapDeltaRad
  };
}

function createHUD() {
  const group = new THREE.Group();
  group.position.set(0, -0.2, -0.8);

  const btnGeo = new THREE.PlaneGeometry(0.24, 0.08);
  const mkBtn = (label) => {
    const c = document.createElement('canvas'); c.width = 256; c.height = 128;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#202020'; ctx.fillRect(0,0,c.width,c.height);
    ctx.strokeStyle = '#404040'; ctx.lineWidth = 6; ctx.strokeRect(4,4,c.width-8,c.height-8);
    ctx.fillStyle = '#ffffff'; ctx.font = 'bold 36px system-ui,Arial'; ctx.textAlign='center'; ctx.textBaseline='middle';
    ctx.fillText(label, c.width/2, c.height/2);
    const tex = new THREE.CanvasTexture(c);
    return new THREE.Mesh(btnGeo, new THREE.MeshBasicMaterial({ map: tex, transparent: true, fog: false }));
  };

  const btnTurn = mkBtn('Turn: Smooth');
  const btnSnap = mkBtn('Snap: 30°');
  const btnHand = mkBtn('Hand: Left');
  btnTurn.position.set(-0.26, 0, 0);
  btnSnap.position.set( 0.00, 0, 0);
  btnHand.position.set( 0.26, 0, 0);

  group.add(btnTurn, btnSnap, btnHand);

  return { group, btnTurn, btnSnap, btnHand };
}

function updateHudTextures() {
  if (!hud) return;
  const upd = (mesh, text) => {
    const c = mesh.material.map.image;
    const ctx = c.getContext('2d');
    ctx.clearRect(0,0,c.width,c.height);
    ctx.fillStyle = '#202020'; ctx.fillRect(0,0,c.width,c.height);
    ctx.strokeStyle = '#404040'; ctx.lineWidth = 6; ctx.strokeRect(4,4,c.width-8,c.height-8);
    ctx.fillStyle = '#ffffff'; ctx.font = 'bold 36px system-ui,Arial'; ctx.textAlign='center'; ctx.textBaseline='middle';
    ctx.fillText(text, c.width/2, c.height/2);
    mesh.material.map.needsUpdate = true;
  };
  upd(hud.btnTurn, `Turn: ${settings.turnMode === 'smooth' ? 'Smooth' : 'Snap'}`);
  upd(hud.btnSnap, `Snap: ${settings.snapAngleDeg}°`);
  upd(hud.btnHand, `Hand: ${settings.weaponHand === 'left' ? 'Left' : 'Right'}`);
}

export function refreshHUD() { updateHudTextures(); }
