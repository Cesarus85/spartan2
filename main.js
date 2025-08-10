import { THREE, VRButton } from './deps.js';
import { FOG, buildLevel } from './level.js';
import { createPlayer } from './player.js';
import { createCombat } from './combat.js';
import { initKeyboard, initOverlay, initHUD, readXRInput, getInputState, settings, refreshHUD } from './input.js';

// Scene
const scene = new THREE.Scene();
scene.fog = new THREE.Fog(FOG.COLOR, FOG.NEAR, FOG.FAR);

// Renderer
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.xr.enabled = true;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
// *** Light Shadows (Option A) ***
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);

document.body.appendChild(VRButton.createButton(renderer));

// Lights
const hemi = new THREE.HemisphereLight(0xbadfff, 0x444422, 0.55);
scene.add(hemi);
const dir = new THREE.DirectionalLight(0xffffff, 1.0);
dir.position.set(12, 28, 8);
dir.castShadow = true;
dir.shadow.mapSize.set(512, 512); // low-res, Quest-friendly
const range = 60;
dir.shadow.camera.near = 1;
dir.shadow.camera.far = 120;
dir.shadow.camera.left = -range;
dir.shadow.camera.right = range;
dir.shadow.camera.top = range;
dir.shadow.camera.bottom = -range;
scene.add(dir);

// Level
const { staticColliders, walkableMeshes, refs } = buildLevel(scene);

// Player
const player = createPlayer(renderer);
scene.add(player.group);

// HUD/Overlay/Input
initOverlay((hand) => player.attachGunTo(hand));
initHUD(scene, player, (hand) => { settings.weaponHand = hand; player.attachGunTo(hand); refreshHUD(); });
initKeyboard(settings);

// Combat
const combat = createCombat(scene, player, staticColliders);

// Attach gun to current hand
player.attachGunTo(settings.weaponHand);

// Resize
window.addEventListener('resize', () => {
  renderer.setSize(window.innerWidth, window.innerHeight);
  player.onResize(window.innerWidth, window.innerHeight);
});

// Fixed timestep
const FIXED_DT = 1 / 60;
const MAX_STEPS = 5;
let accumulator = 0;
let lastTime = performance.now() / 1000;

function onRenderFrame() {
  readXRInput(renderer.xr); // fills input state

  const now = performance.now() / 1000;
  let dt = Math.min(0.25, now - lastTime);
  lastTime = now;
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