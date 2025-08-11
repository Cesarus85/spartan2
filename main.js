// main.js
import { THREE, VRButton } from './deps.js';
import { FOG, buildLevel } from './level.js';
import { createPlayer } from './player.js';
import { createCombat } from './combat.js';
import { InputSystem } from './input.js';

// --- Scene / Renderer --------------------------------------------------------
const scene = new THREE.Scene();
scene.fog = new THREE.Fog(FOG.COLOR, FOG.NEAR, FOG.FAR);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.xr.enabled = true;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
document.body.appendChild(renderer.domElement);
document.body.appendChild(VRButton.createButton(renderer));

// --- Level -------------------------------------------------------------------
const { staticColliders, walkableMeshes } = buildLevel(scene);

// --- Player & Combat ---------------------------------------------------------
const player = createPlayer(renderer);
scene.add(player.group);

const combat = createCombat(scene, player, staticColliders);

// --- Input -------------------------------------------------------------------
const input = new InputSystem({
  snapTurnEnabled: true,
  snapTurnAngleDeg: 30,
  weaponHand: 'left',
});

// Snapshot für Player/Combat im bisherigen Format bauen
function buildInputSnapshot() {
  return {
    moveAxis: { x: input.moveX, y: input.moveY },
    turnAxis: { x: input.turnX, y: 0 },
    turnSnapDeltaRad: input.consumeSnapTurnDelta(),
    jumpPressed: !!input.jumpDown,
    fireHeld: !!input.fireHeld,
    fireDown: !!input.fireDown,
    cycleWeaponPressed: !!input.switchWeaponDown,
  };
}

// Settings-Proxy (damit bestehende Module weiter funktionieren)
function getSettings() {
  return {
    turnMode: input.snapTurnEnabled ? 'snap' : 'smooth',
    snapAngleDeg: input.snapTurnAngleDeg,
    weaponHand: input.weaponHand,
  };
}

// --- Fixed timestep loop -----------------------------------------------------
const FIXED_DT = 1 / 60;
let accumulator = 0;
let lastTime = performance.now() / 1000;

function onRenderFrame(now) {
  const t = now / 1000;
  const dt = Math.min(0.1, t - lastTime); // clamp
  lastTime = t;
  accumulator += dt;

  // XR-Input lesen
  const session = renderer.xr.getSession ? renderer.xr.getSession() : null;
  input.update(session);

  const inputSnap = buildInputSnapshot();
  const settings = getSettings();

  // Fixed Steps
  let steps = 0;
  while (accumulator >= FIXED_DT && steps < 5) {
    if (inputSnap.cycleWeaponPressed) {
      combat.cycleWeapon();
    }

    player.update(
      FIXED_DT,
      inputSnap,
      staticColliders,
      walkableMeshes,
      settings.turnMode,
      settings.snapAngleDeg
    );

    combat.update(FIXED_DT, inputSnap, { weaponHand: settings.weaponHand });

    accumulator -= FIXED_DT;
    steps++;
  }

  renderer.render(scene, player.camera);
}

renderer.setAnimationLoop(onRenderFrame);

// --- Resize ------------------------------------------------------------------
window.addEventListener('resize', () => {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h);
  player.onResize(w, h);
});

// Anfangszustand: Waffe an die gewählte Hand hängen
player.attachGunTo(input.weaponHand);
