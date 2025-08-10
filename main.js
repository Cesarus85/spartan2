// main.js
import { THREE, VRButton } from './deps.js';
import { FOG, buildLevel } from './level.js';
import { createPlayer } from './player.js';
import { createCombat } from './combat.js';
import { initKeyboard, initOverlay, initHUD, readXRInput, getInputState, settings, refreshHUD } from './input.js';

// Renderer/Scene
const scene = new THREE.Scene();
scene.fog = new THREE.Fog(FOG.COLOR, FOG.NEAR, FOG.FAR);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.xr.enabled = true;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
document.body.appendChild(renderer.domElement);
document.body.appendChild(VRButton.createButton(renderer));

// Lights
const hemi = new THREE.HemisphereLight(0xffffff, 0x333344, 0.8);
scene.add(hemi);
const dir = new THREE.DirectionalLight(0xffffff, 0.6);
dir.position.set(5,10,3);
scene.add(dir);

// Level
const { staticColliders, walkableMeshes, refs } = buildLevel(scene);

// Player & Systems
const player = createPlayer(renderer);
scene.add(player.group);

// Safe spawn: center of interior floor
const spawnY = (refs?.interiorFloor?.position?.y ?? 0.05) + 1.6;
player.teleportTo(0, spawnY, 0, walkableMeshes, staticColliders);

// Systems
const combat = createCombat(scene, player, staticColliders);

// Pre-VR overlay & keyboard
initOverlay(document.getElementById('overlay'), (s)=>{
  player.attachGunTo(s.weaponHand);
  refreshHUD();
});
const { updateFromKeyboard } = initKeyboard();

// In-Game HUD (smaller & default off)
initHUD(scene, player, settings.hudEnabled, settings.hudScale);

// Make sure gun is attached initially
player.attachGunTo(settings.weaponHand);

// Resize
window.addEventListener('resize', () => {
  renderer.setSize(window.innerWidth, window.innerHeight);
  player.onResize(window.innerWidth, window.innerHeight);
});

// Fixed timestep loop
const FIXED_DT = 1/60;
let accumulator = 0;
let lastTime = performance.now();

function onRenderFrame() {
  const now = performance.now();
  const dt = Math.min(0.05, (now - lastTime) / 1000);
  lastTime = now;
  accumulator += dt;

  // poll inputs
  updateFromKeyboard(dt);
  readXRInput(renderer.xr, dt);

  let steps = 0;
  while (accumulator >= FIXED_DT && steps < 3) {
    const input = getInputState();
    // Player Update
    player.update(FIXED_DT, input, staticColliders, walkableMeshes, settings.turnMode, settings.snapAngleDeg);
    // Combat Update
    combat.update(FIXED_DT, input, settings);
    accumulator -= FIXED_DT;
    steps++;
  }

  renderer.render(scene, player.camera);
}

renderer.setAnimationLoop(onRenderFrame);
