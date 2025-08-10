// input.js
import { THREE } from './deps.js';

export const settings = {
  turnMode: 'smooth',   // 'smooth' | 'snap'
  snapAngleDeg: 30,     // 30 | 45
  weaponHand: 'left',   // 'left' | 'right'
  hudEnabled: false,    // default off (can be toggled in overlay)
  hudScale: 0.8,        // smaller HUD
};

// internal state
const state = {
  moveAxis: { x: 0, y: 0 },
  turnAxis: { x: 0, y: 0 },
  jumpPressed: false,
  fireHeld: false,
  turnSnapDeltaRad: 0,
};

let snapCooldown = 0.0;
const SNAP_COOLDOWN = 0.18;

export function getInputState() {
  const out = {
    moveAxis: { ...state.moveAxis },
    turnAxis: { ...state.turnAxis },
    jumpPressed: state.jumpPressed,
    fireHeld: state.fireHeld,
    turnSnapDeltaRad: state.turnSnapDeltaRad,
  };
  state.turnSnapDeltaRad = 0;
  state.jumpPressed = false;
  return out;
}

// --------------- Keyboard (desktop testing) ---------------
export function initKeyboard() {
  const keys = new Set();
  window.addEventListener('keydown', (e) => {
    keys.add(e.code);
    if (e.code === 'Space') state.jumpPressed = true;
    if (e.code === 'KeyF') state.fireHeld = true;
  });
  window.addEventListener('keyup', (e) => {
    keys.delete(e.code);
    if (e.code === 'KeyF') state.fireHeld = false;
  });
  function updateFromKeyboard(dt) {
    const x = (keys.has('KeyD') ? 1 : 0) + (keys.has('KeyA') ? -1 : 0);
    const y = (keys.has('KeyW') ? 1 : 0) + (keys.has('KeyS') ? -1 : 0);
    state.moveAxis.x = x;
    state.moveAxis.y = y;
    state.turnAxis.x = (keys.has('KeyQ') ? -1 : 0) + (keys.has('KeyE') ? 1 : 0);
  }
  return { updateFromKeyboard };
}

// --------------- XR controllers ----------------
export function readXRInput(xr, dt) {
  snapCooldown = Math.max(0, snapCooldown - dt);
  if (!xr || !xr.isPresenting) return;
  const session = xr.getSession();
  if (!session) return;

  for (const source of session.inputSources) {
    if (!source || !source.gamepad) continue;
    const handed = source.handedness;
    const gp = source.gamepad;
    const [ax, ay] = gp.axes.length >= 2 ? gp.axes : [0,0];
    if (handed === 'left') {
      state.moveAxis.x = ax;
      state.moveAxis.y = -ay;
      if (gp.buttons[4]?.pressed) state.jumpPressed = true;
    } else if (handed === 'right') {
      if (settings.turnMode === 'smooth') {
        state.turnAxis.x = ax;
      } else {
        if (Math.abs(ax) > 0.7 && snapCooldown <= 0) {
          const angle = THREE.MathUtils.degToRad(settings.snapAngleDeg);
          state.turnSnapDeltaRad = ax > 0 ? -angle : angle;
          snapCooldown = SNAP_COOLDOWN;
        }
      }
      if (gp.buttons[0]?.pressed) state.fireHeld = true; else state.fireHeld = false;
      if (gp.buttons[1]?.pressed) state.jumpPressed = true;
    }
  }
}

// --------------- Pre-VR Overlay ----------------
export function initOverlay(rootEl, onChange) {
  if (!rootEl) return;
  rootEl.innerHTML = '';

  const h = document.createElement('div');
  h.innerHTML = `
    <div style="font-weight:600;margin-bottom:6px">Einstellungen</div>
    <div class="row">
      <label>Turn:</label>
      <button id="btnTurn">Smooth</button>
    </div>
    <div class="row">
      <label>Snap:</label>
      <select id="selSnap">
        <option value="30">30°</option>
        <option value="45">45°</option>
        <option value="60">60°</option>
      </select>
    </div>
    <div class="row">
      <label>Waffenhand:</label>
      <button id="btnHand">Links</button>
    </div>
    <div class="row">
      <label>In-Game HUD:</label>
      <button id="btnHUD">Aus</button>
    </div>
    <div style="margin-top:8px;color:#aaa">Änderungen wirken sofort.</div>
  `;
  rootEl.appendChild(h);

  const btnTurn = h.querySelector('#btnTurn');
  const selSnap = h.querySelector('#selSnap');
  const btnHand = h.querySelector('#btnHand');
  const btnHUD  = h.querySelector('#btnHUD');

  const refresh = () => {
    btnTurn.textContent = settings.turnMode === 'smooth' ? 'Smooth' : 'Snap';
    selSnap.value = String(settings.snapAngleDeg);
    btnHand.textContent = settings.weaponHand === 'left' ? 'Links' : 'Rechts';
    btnHUD.textContent = settings.hudEnabled ? 'An' : 'Aus';
    if (onChange) onChange(settings);
  };

  btnTurn.addEventListener('click', () => {
    settings.turnMode = settings.turnMode === 'smooth' ? 'snap' : 'smooth';
    refresh();
  });
  selSnap.addEventListener('change', () => {
    settings.snapAngleDeg = parseInt(selSnap.value, 10);
    refresh();
  });
  btnHand.addEventListener('click', () => {
    settings.weaponHand = settings.weaponHand === 'left' ? 'right' : 'left';
    refresh();
  });
  btnHUD.addEventListener('click', () => {
    settings.hudEnabled = !settings.hudEnabled;
    refresh();
  });

  refresh();
}

// --------------- Minimal in-game HUD ----------------
let hud = null;

export function initHUD(scene, player, enabled = true, scale = 1) {
  if (!enabled) { hud = null; return; }

  const group = new THREE.Group();
  group.name = 'HUD';
  scene.add(group);

  const makeLabel = (w=256, h=96, text='') => {
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#202020'; ctx.fillRect(0,0,w,h);
    ctx.strokeStyle = '#404040'; ctx.lineWidth = 6; ctx.strokeRect(4,4,w-8,h-8);
    ctx.fillStyle = '#ffffff'; ctx.font = 'bold 24px system-ui,Arial'; ctx.textAlign='center'; ctx.textBaseline='middle';
    ctx.fillText(text, w/2, h/2);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    const m = new THREE.MeshBasicMaterial({ map: tex, transparent: true });
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(0.22, 0.08), m);
    (plane.userData).canvas = canvas;
    (plane.userData).ctx = ctx;
    return plane;
  };

  hud = {
    root: group,
    btnTurn: makeLabel(280, 90, `Turn: ${settings.turnMode}`),
    btnSnap: makeLabel(280, 90, `Snap: ${settings.snapAngleDeg}°`),
    btnHand: makeLabel(280, 90, `Hand: ${settings.weaponHand}`),
  };

  hud.root.scale.setScalar(scale);
  hud.btnTurn.position.set(0.15, -0.10, -0.35);
  hud.btnSnap.position.set(0.15, -0.20, -0.35);
  hud.btnHand.position.set(0.15, -0.30, -0.35);

  player.camera.add(hud.root);
  hud.root.add(hud.btnTurn, hud.btnSnap, hud.btnHand);

  updateHudTextures();
}

function updateHudTextures() {
  if (!hud) return;
  const upd = (mesh, text) => {
    const c = mesh.userData.canvas;
    const ctx = mesh.userData.ctx;
    ctx.clearRect(0,0,c.width,c.height);
    ctx.fillStyle = '#202020'; ctx.fillRect(0,0,c.width,c.height);
    ctx.strokeStyle = '#404040'; ctx.lineWidth = 6; ctx.strokeRect(4,4,c.width-8,c.height-8);
    ctx.fillStyle = '#ffffff'; ctx.font = 'bold 24px system-ui,Arial'; ctx.textAlign='center'; ctx.textBaseline='middle';
    ctx.fillText(text, c.width/2, c.height/2);
    mesh.material.map.needsUpdate = true;
  };
  upd(hud.btnTurn, `Turn: ${settings.turnMode === 'smooth' ? 'Smooth' : 'Snap'}`);
  upd(hud.btnSnap, `Snap: ${settings.snapAngleDeg}°`);
  upd(hud.btnHand, `Hand: ${settings.weaponHand === 'left' ? 'Links' : 'Rechts'}`);
}

export function refreshHUD() { updateHudTextures(); }
