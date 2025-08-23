// main.js
import { THREE, VRButton } from './deps.js';
import { FOG, buildLevel, intersectsForbidden } from './level.js';
import { createPlayer } from './player.js';
import { createCombat } from './combat.js';
import { createHUD } from './hud.js';
import { Enemy } from './enemy.js';
import { initKeyboard, initOverlay, readXRInput, readKeyboard, getInputState, settings } from './input.js';

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

// Gun vor Start an aktuell gewählte Hand hängen
player.attachGunTo(settings.weaponHand);

// Gegner-Liste
const enemies = [];

// Combat system
const combat = createCombat(scene, player, staticColliders, enemies);
const hud = createHUD(player, combat);

function spawnEnemy() {
  const MAX_ATTEMPTS = 20;
  const MIN_PLAYER_DIST = 4;
  const RADIUS = 0.5;

  for (let i = 0; i < MAX_ATTEMPTS; i++) {
    const pos = new THREE.Vector3(
      (Math.random() - 0.5) * 10,
      0,
      (Math.random() - 0.5) * 10
    );

    // Abstand zum Spieler prüfen
    if (pos.distanceTo(player.group.position) < MIN_PLAYER_DIST) continue;

    // Box um die Position für Kollisionsprüfungen
    const min = new THREE.Vector3(pos.x - RADIUS, 0, pos.z - RADIUS);
    const max = new THREE.Vector3(pos.x + RADIUS, RADIUS * 2, pos.z + RADIUS);
    const box = new THREE.Box3(min, max);

    if (intersectsForbidden(box)) continue;

    // Optionale Prüfung gegen statische Hindernisse
    let blocked = false;
    for (const c of staticColliders) {
      if (c.box.intersectsBox(box)) {
        blocked = true;
        break;
      }
    }
    if (blocked) continue;

    enemies.push(new Enemy(scene, player, pos));
    return;
  }
}

let enemySpawnTimer = 0;

// Keyboard & Overlay
initKeyboard();

// VR-Button in Overlay mounten und Start-Callbacks verdrahten
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
  // Wenn im Overlay die Hand gewechselt wird, sofort Gun umhängen
  player.attachGunTo(settings.weaponHand);
});

// Overlay automatisch verstecken, sobald XR startet
renderer.xr.addEventListener('sessionstart', () => {
  hideOverlay();
  player.attachGunTo(settings.weaponHand);
  document.body.classList.add('vr');
});

renderer.xr.addEventListener('sessionend', () => {
  document.body.classList.remove('vr');
});

// ESC toggelt Overlay
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    const ov = document.getElementById('overlay');
    ov.classList.toggle('hidden');
  }
});

// Fixed timestep loop
const clock = new THREE.Clock();
const FIXED_DT = 1 / 60;
const MAX_STEPS = 5;
let accumulator = 0;

function onRenderFrame() {
  const rawDt = clock.getDelta();
  const dt = Math.min(rawDt, 0.25);

  if (renderer.xr.isPresenting) {
    const session = renderer.xr.getSession();
    readXRInput(session);
  }
  readKeyboard();

  accumulator += dt;
  let steps = 0;
  while (accumulator >= FIXED_DT && steps < MAX_STEPS) {
    const input = getInputState();

    // Waffenwechsel (Edge)
    if (input.cycleWeaponPressed) {
      combat.cycleWeapon();
    }
    if (input.reloadPressed) {
      combat.reload();
    }

    player.update(
      FIXED_DT,
      input,
      staticColliders,
      walkableMeshes,
      settings.turnMode,
      settings.snapAngleDeg
    );
    combat.update(FIXED_DT, input, settings);

    // Gegner-Spawn & Updates
    enemySpawnTimer -= FIXED_DT;
    if (enemySpawnTimer <= 0) {
      spawnEnemy();
      enemySpawnTimer = 5;
    }
    for (let i = enemies.length - 1; i >= 0; i--) {
      const e = enemies[i];
      e.update(FIXED_DT);
      if (!e.alive) {
        enemies.splice(i, 1);
      }
    }

    accumulator -= FIXED_DT;
    steps++;
  }

  hud.update();
  renderer.render(scene, player.camera);
}

renderer.setAnimationLoop(onRenderFrame);

// Desktop-Start blendet Overlay aus und synchronisiert Gun-Hand
onStartDesktop(() => {
  hideOverlay();
  player.attachGunTo(settings.weaponHand);
});
