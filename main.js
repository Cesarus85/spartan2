// main.js
import { THREE, VRButton } from './deps.js';
import { FOG, buildLevel } from './level.js';
import { createPlayer } from './player.js';
import { createCombat } from './combat.js';
import { initKeyboard, initOverlay, initHUD, readXRInput, getInputState, settings, refreshHUD } from './input.js';

// Renderer/Scene mit erweiterten Einstellungen
const scene = new THREE.Scene();
scene.fog = new THREE.Fog(FOG.COLOR, FOG.NEAR, FOG.FAR);

const renderer = new THREE.WebGLRenderer({ 
  antialias: true,
  powerPreference: "high-performance" // Für Quest-Performance
});
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.xr.enabled = true;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.2; // Leicht erhöht für mehr Brillanz
renderer.setClearColor(FOG.COLOR, 1);

// Schatten aktivieren (Quest-optimiert)
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap; // Weiche Schatten
renderer.shadowMap.autoUpdate = true;

document.body.appendChild(renderer.domElement);
document.body.appendChild(VRButton.createButton(renderer));

const clock = new THREE.Clock();

// Erweiterte Beleuchtung
scene.add(new THREE.AmbientLight(0x404080, 0.3)); // Leicht bläuliches Umgebungslicht

const dirLight = new THREE.DirectionalLight(0xffffff, 1.2);
dirLight.position.set(15, 20, 10);
dirLight.target.position.set(0, 0, 0);
dirLight.castShadow = true;

// Schatten-Optimierung für Quest
dirLight.shadow.mapSize.width = 1024;  // Nicht zu hoch für Performance
dirLight.shadow.mapSize.height = 1024;
dirLight.shadow.camera.near = 0.5;
dirLight.shadow.camera.far = 50;
dirLight.shadow.camera.left = -25;
dirLight.shadow.camera.right = 25;
dirLight.shadow.camera.top = 25;
dirLight.shadow.camera.bottom = -25;
dirLight.shadow.bias = -0.0001;

scene.add(dirLight);
scene.add(dirLight.target);

// Zusätzliches Fill-Light
const fillLight = new THREE.DirectionalLight(0x8899ff, 0.4);
fillLight.position.set(-10, 10, -10);
scene.add(fillLight);

// Rim-Light für dramatischen Effekt
const rimLight = new THREE.DirectionalLight(0xff9944, 0.6);
rimLight.position.set(0, 5, -20);
scene.add(rimLight);

// Level mit erweiterten Features
const { staticColliders, walkableMeshes, refs } = buildLevel(scene);

// Schatten für Level-Objekte aktivieren
staticColliders.forEach(({ obj }) => {
  obj.castShadow = true;
  obj.receiveShadow = true;
});

walkableMeshes.forEach(obj => {
  obj.receiveShadow = true;
});

// Player
const player = createPlayer(renderer);
scene.add(player.group);

// Player-Schatten
player.group.children.forEach(child => {
  if (child.isMesh) {
    child.castShadow = true;
  }
});

// Combat mit erweiterten Features
const combat = createCombat(scene, player, staticColliders);

// Input
initKeyboard();
initOverlay((newHand) => { 
  player.attachGunTo(newHand); 
  refreshHUD(); 
});
initHUD(
  player.camera, 
  player.controllerRight, 
  () => combat.cycleWeapon(), 
  (newHand) => { player.attachGunTo(newHand); }
);

// Performance Monitor (für Development)
let frameCount = 0;
let lastTime = performance.now();
let fps = 60;

function updatePerformanceStats() {
  frameCount++;
  const currentTime = performance.now();
  if (currentTime - lastTime >= 1000) {
    fps = Math.round((frameCount * 1000) / (currentTime - lastTime));
    frameCount = 0;
    lastTime = currentTime;
    
    // Zeige FPS in Console (nur in Development)
    if (fps < 50) {
      console.warn(`Low FPS detected: ${fps}`);
    }
  }
}

// Erweiterte Resize-Behandlung
window.addEventListener('resize', () => {
  player.onResize(window.innerWidth, window.innerHeight);
  renderer.setSize(window.innerWidth, window.innerHeight);
  
  // Aspect-Ratio für Schatten-Kamera anpassen
  const aspect = window.innerWidth / window.innerHeight;
  if (aspect > 1) {
    dirLight.shadow.camera.left = -25 * aspect;
    dirLight.shadow.camera.right = 25 * aspect;
  } else {
    dirLight.shadow.camera.top = 25 / aspect;
    dirLight.shadow.camera.bottom = -25 / aspect;
  }
  dirLight.shadow.camera.updateProjectionMatrix();
});

// Adaptive Qualitätseinstellungen basierend auf Performance
function adaptiveQuality() {
  if (fps < 45) {
    // Reduziere Schatten-Qualität
    if (dirLight.shadow.mapSize.width > 512) {
      dirLight.shadow.mapSize.setScalar(512);
      console.log("Reduced shadow quality for better performance");
    }
    
    // Reduziere Tone-Mapping-Exposure
    renderer.toneMappingExposure = Math.max(0.8, renderer.toneMappingExposure - 0.1);
  } else if (fps > 55 && dirLight.shadow.mapSize.width < 1024) {
    // Erhöhe Qualität wieder wenn Performance gut ist
    dirLight.shadow.mapSize.setScalar(1024);
    renderer.toneMappingExposure = Math.min(1.2, renderer.toneMappingExposure + 0.05);
  }
}

// Fixed-Timestep Loop mit Performance-Monitoring
const FIXED_DT = 1/60;
const MAX_STEPS = 5;
let accumulator = 0;
let performanceCheckTimer = 0;

function onXRFrame() {
  if (renderer.xr.isPresenting) {
    const session = renderer.xr.getSession();
    readXRInput(session);
  }
}

function animateParticles(dt) {
  // Animiere die atmosphärischen Partikel
  if (refs.particles) {
    refs.particles.rotation.y += dt * 0.1;
    
    // Sanfte Auf-und-Ab-Bewegung
    const positions = refs.particles.geometry.attributes.position.array;
    for (let i = 1; i < positions.length; i += 3) {
      positions[i] += Math.sin(Date.now() * 0.001 + i) * 0.01;
    }
    refs.particles.geometry.attributes.position.needsUpdate = true;
  }
  
  // Animiere Licht-Helper
  if (refs.lightHelpers) {
    refs.lightHelpers.forEach((helper, index) => {
      const time = Date.now() * 0.001;
      helper.material.emissiveIntensity = 0.5 + Math.sin(time * 2 + index) * 0.3;
    });
  }
}

function onRenderFrame() {
  const rawDt = clock.getDelta();
  const dt = Math.min(rawDt, 0.25);
  onXRFrame();

  // Performance-Monitoring
  updatePerformanceStats();
  performanceCheckTimer += dt;
  if (performanceCheckTimer > 5.0) { // Alle 5 Sekunden prüfen
    adaptiveQuality();
    performanceCheckTimer = 0;
  }

  accumulator += dt;
  let steps = 0;
  while (accumulator >= FIXED_DT && steps < MAX_STEPS) {
    const input = getInputState();
    
    // Player Update (inkl. Snap-Turn delta aus input)
    player.update(FIXED_DT, input, staticColliders, walkableMeshes, settings.turnMode, settings.snapAngleDeg);
    
    // Combat Update
    combat.update(FIXED_DT, input, settings);

    accumulator -= FIXED_DT;
    steps++;
  }
  
  // Visual-only updates (außerhalb des Fixed-Timestep)
  animateParticles(dt);

  renderer.render(scene, player.camera);
}

renderer.setAnimationLoop(onRenderFrame);

// Debug-Informationen (können später entfernt werden)
console.log("🎮 Halo-Style WebXR Shooter initialized");
console.log("📊 Enhanced graphics with shadows, particles, and adaptive quality");
console.log("🔫 Multiple weapon types with visual effects");
console.log("🎯 Use controllers to aim and shoot, B-button to cycle weapons");

// Keyboard shortcuts für Development/Testing
window.addEventListener('keydown', (e) => {
  if (e.key === 'q') combat.cycleWeapon();
  if (e.key === 'r') {
    console.log(`Current weapon: ${combat.currentWeaponName}`);
    console.log(`FPS: ${fps}`);
    console.log(`Shadow map size: ${dirLight.shadow.mapSize.width}`);
  }
});