// main.js
import { THREE, VRButton } from './deps.js';
import { FOG, buildLevel } from './level.js';
import { createPlayer } from './player.js';
import { createCombat } from './combat.js';
import { initKeyboard, initOverlay, initHUD, readXRInput, getInputState, settings, refreshHUD } from './input.js';
import { createAIManager } from './ai.js';


// Renderer/Scene
const scene = new THREE.Scene();
scene.fog = new THREE.Fog(FOG.COLOR, FOG.NEAR, FOG.FAR);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.xr.enabled = true;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.setClearColor(FOG.COLOR, 1);
document.body.appendChild(renderer.domElement);
document.body.appendChild(VRButton.createButton(renderer));

const clock = new THREE.Clock();

// Lights
scene.add(new THREE.AmbientLight(0xffffff, 0.5));
const dirLight = new THREE.DirectionalLight(0xffffff, 1);
dirLight.position.set(5, 10, 5);
scene.add(dirLight);

// Level
const { staticColliders, walkableMeshes } = buildLevel(scene);

// Player
const player = createPlayer(renderer);
scene.add(player.group);

// Combat
const combat = createCombat(scene, player, staticColliders);

// AI Manager
const ai = createAIManager(scene, player, staticColliders, walkableMeshes);

// Input
initKeyboard();
initOverlay((newHand) => { player.attachGunTo(newHand); refreshHUD(); });
initHUD(player.camera, player.controllerRight, () => combat.cycleWeapon(), (newHand) => { player.attachGunTo(newHand); });

// Resize
window.addEventListener('resize', () => {
  player.onResize(window.innerWidth, window.innerHeight);
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// Fixed-Timestep Loop
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
    // Player Update (inkl. Snap-Turn delta aus input)
    player.update(FIXED_DT, input, staticColliders, walkableMeshes, settings.turnMode, settings.snapAngleDeg);
    // Combat Update
    combat.update(FIXED_DT, input, settings);

    // AI Update
    ai.update(FIXED_DT);

    accumulator -= FIXED_DT;
    steps++;
  }

  renderer.render(scene, player.camera);
}

renderer.setAnimationLoop(onRenderFrame);
