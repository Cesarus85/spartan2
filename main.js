// main.js
import { THREE, VRButton } from './deps.js';
import { FOG, buildLevel } from './level.js';
import { createPlayer } from './player.js';
import { createCombat } from './combat.js';
import { initKeyboard, initOverlay, readXRInput, getInputState, settings } from './input.js';

// Scene/Renderer
const scene = new THREE.Scene();
scene.fog = new THREE.Fog(FOG.COLOR, FOG.NEAR, FOG.FAR);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.xr.enabled = true;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
document.body.appendChild(renderer.domElement);

// Resize
window.addEventListener('resize', () => {
  renderer.setSize(window.innerWidth, window.innerHeight);
  player.onResize(window.innerWidth, window.innerHeight);
});

// Build level & player
const { staticColliders, walkableMeshes } = buildLevel(scene);
const player = createPlayer(renderer);
scene.add(player.group);

// attach gun to selected hand before start
player.attachGunTo(settings.weaponHand);

// Combat system
const combat = createCombat(scene, player, staticColliders);

// Overlay & input
initKeyboard();

// Mount VR button into overlay and wire start
const vrBtn = VRButton.createButton(renderer);
vrBtn.id = 'internal-vrbutton';
vrBtn.style.display = 'inline-block';
vrBtn.style.position = 'static';
vrBtn.style.padding = '6px 10px';
vrBtn.style.borderRadius = '8px';
vrBtn.style.border = '1px solid #444';
vrBtn.style.background = '#121212';
vrBtn.style.color = '#fff';
const { hideOverlay, onStartDesktop } = initOverlay(renderer, vrBtn, () => {
  // When settings changed in overlay, sync immediate things
  player.attachGunTo(settings.weaponHand);
});

// Hide overlay automatically once XR starts
renderer.xr.addEventListener('sessionstart', () => {
  hideOverlay();
  // Ensure the gun is on the configured hand in VR as well
  player.attachGunTo(settings.weaponHand);
});

// keyboard Esc toggles overlay
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    const ov = document.getElementById('overlay');
    ov.classList.toggle('hidden');
  }
});

// Fixed timestep loop
const clock = new THREE.Clock();
const FIXED_DT = 1/60;
const MAX_STEPS = 5;
let accumulator = 0;

function onXRFrame() {
  if (renderer.xr.isPresenting) {
    const session = renderer.xr.getSession();
    readXRInput(session);
  }
}

function onRenderFrame() {
  const rawDt = clock.getDelta();
  const dt = Math.min(rawDt, 0.25);
  onXRFrame();

  accumulator += dt;
  let steps = 0;
  while (accumulator >= FIXED_DT && steps < MAX_STEPS) {
    const input = getInputState();
    player.update(FIXED_DT, input, staticColliders, walkableMeshes, settings.turnMode, settings.snapAngleDeg);
    combat.update(FIXED_DT, input, settings);
    accumulator -= FIXED_DT;
    steps++;
  }

  renderer.render(scene, player.camera);
}

renderer.setAnimationLoop(onRenderFrame);

// Desktop Start button fallback (nicht nötig fürs Rendern, blendet nur Overlay aus)
onStartDesktop(() => {
  hideOverlay();
  player.attachGunTo(settings.weaponHand);
});
