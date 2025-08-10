// player.js
import { THREE } from './deps.js';
import { makeVariedStandardMaterial, makeMetallicMaterial, makeEmissiveMaterial } from './utils.js';

export function createPlayer(renderer) {
  const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);

  const group = new THREE.Group();
  group.position.set(0, 3.25 + 1.6, 0);
  group.add(camera);

  // Detaillierterer Spielerkörper
  const bodyGroup = new THREE.Group();
  bodyGroup.position.y = -1.6;
  
  // Hauptkörper (Torso)
  const torso = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.4, 1.2, 4, 8),
    makeVariedStandardMaterial(0x006400, { 
      roughnessRange: 0.3,
      metalnessRange: 0.1 
    })
  );
  bodyGroup.add(torso);

  // Rüstungsplatten
  const chestPlate = new THREE.Mesh(
    new THREE.BoxGeometry(0.6, 0.8, 0.15),
    makeMetallicMaterial(0x2F4F4F)
  );
  chestPlate.position.set(0, 0.2, 0.35);
  bodyGroup.add(chestPlate);

  // Schulterpolster
  const leftShoulder = new THREE.Mesh(
    new THREE.BoxGeometry(0.25, 0.3, 0.4),
    makeMetallicMaterial(0x696969)
  );
  leftShoulder.position.set(-0.45, 0.4, 0);
  bodyGroup.add(leftShoulder);

  const rightShoulder = new THREE.Mesh(
    new THREE.BoxGeometry(0.25, 0.3, 0.4),
    makeMetallicMaterial(0x696969)
  );
  rightShoulder.position.set(0.45, 0.4, 0);
  bodyGroup.add(rightShoulder);

  // Helm-Andeutung (für VR nicht sichtbar, aber für Multiplayer später)
  const helmet = new THREE.Mesh(
    new THREE.SphereGeometry(0.35, 8, 8),
    makeMetallicMaterial(0x1C1C1C)
  );
  helmet.position.set(0, 0.9, 0);
  bodyGroup.add(helmet);

  // Visor mit Emissive-Effect
  const visor = new THREE.Mesh(
    new THREE.SphereGeometry(0.36, 8, 6, 0, Math.PI * 2, 0, Math.PI * 0.6),
    makeEmissiveMaterial(0x00AAFF, 0.3)
  );
  visor.position.set(0, 0.9, 0);
  visor.material.transparent = true;
  visor.material.opacity = 0.7;
  bodyGroup.add(visor);

  // Status-LEDs auf der Rüstung
  const statusLights = [];
  for (let i = 0; i < 3; i++) {
    const led = new THREE.Mesh(
      new THREE.SphereGeometry(0.03, 6, 6),
      makeEmissiveMaterial(i === 0 ? 0x00FF00 : 0x444444, i === 0 ? 0.8 : 0.2)
    );
    led.position.set(-0.2 + i * 0.2, 0.1, 0.43);
    bodyGroup.add(led);
    statusLights.push(led);
  }

  group.add(bodyGroup);

  // Controllers
  const controllerLeft  = renderer.xr.getController(0);
  const controllerRight = renderer.xr.getController(1);
  const gripLeft  = renderer.xr.getControllerGrip(0);
  const gripRight = renderer.xr.getControllerGrip(1);
  group.add(controllerLeft, controllerRight, gripLeft, gripRight);

  // Erweiterte Waffenmodelle
  const weapons = {
    assaultRifle: createAssaultRifle(),
    battleRifle: createBattleRifle(),
    pistol: createPistol()
  };

  let currentWeapon = weapons.assaultRifle;

  function createAssaultRifle() {
    const weaponGroup = new THREE.Group();
    
    // Hauptkörper
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(0.08, 0.12, 0.6),
      makeMetallicMaterial(0x2F2F2F)
    );
    body.position.set(0, -0.05, -0.3);
    weaponGroup.add(body);

    // Lauf
    const barrel = new THREE.Mesh(
      new THREE.CylinderGeometry(0.02, 0.025, 0.4, 8),
      makeMetallicMaterial(0x1C1C1C)
    );
    barrel.rotation.z = Math.PI / 2;
    barrel.position.set(0, 0.03, -0.5);
    weaponGroup.add(barrel);

    // Mündungsfeuer-Effekt (unsichtbar bis zum Schuss)
    const muzzleFlash = new THREE.Mesh(
      new THREE.SphereGeometry(0.05, 6, 6),
      makeEmissiveMaterial(0xFFAA00, 1.0)
    );
    muzzleFlash.position.set(0, 0.03, -0.7);
    muzzleFlash.visible = false;
    weaponGroup.add(muzzleFlash);

    // Magazin
    const magazine = new THREE.Mesh(
      new THREE.BoxGeometry(0.06, 0.25, 0.08),
      makeMetallicMaterial(0x404040)
    );
    magazine.position.set(0, -0.25, -0.15);
    weaponGroup.add(magazine);

    // Scope/Visier
    const scope = new THREE.Mesh(
      new THREE.CylinderGeometry(0.015, 0.015, 0.15, 8),
      makeMetallicMaterial(0x1A1A1A)
    );
    scope.rotation.z = Math.PI / 2;
    scope.position.set(0, 0.08, -0.2);
    weaponGroup.add(scope);

    // LED-Ammo-Counter
    const ammoDisplay = new THREE.Mesh(
      new THREE.PlaneGeometry(0.04, 0.02),
      makeEmissiveMaterial(0x00FF00, 0.6)
    );
    ammoDisplay.position.set(0.05, 0, -0.1);
    ammoDisplay.rotation.y = -Math.PI / 2;
    weaponGroup.add(ammoDisplay);

    weaponGroup.userData = {
      muzzleFlash,
      ammoDisplay,
      weaponType: 'AR'
    };

    return weaponGroup;
  }

  function createBattleRifle() {
    const weaponGroup = new THREE.Group();
    
    // Größerer, massiverer Körper
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(0.1, 0.14, 0.7),
      makeMetallicMaterial(0x4A4A4A)
    );
    body.position.set(0, -0.05, -0.35);
    weaponGroup.add(body);

    // Dicker Lauf
    const barrel = new THREE.Mesh(
      new THREE.CylinderGeometry(0.025, 0.03, 0.5, 8),
      makeMetallicMaterial(0x2F2F2F)
    );
    barrel.rotation.z = Math.PI / 2;
    barrel.position.set(0, 0.04, -0.6);
    weaponGroup.add(barrel);

    // Muzzle Brake
    const muzzleBrake = new THREE.Mesh(
      new THREE.CylinderGeometry(0.035, 0.03, 0.08, 6),
      makeMetallicMaterial(0x1C1C1C)
    );
    muzzleBrake.rotation.z = Math.PI / 2;
    muzzleBrake.position.set(0, 0.04, -0.82);
    weaponGroup.add(muzzleBrake);

    // Mündungsfeuer
    const muzzleFlash = new THREE.Mesh(
      new THREE.SphereGeometry(0.07, 6, 6),
      makeEmissiveMaterial(0xFF6600, 1.0)
    );
    muzzleFlash.position.set(0, 0.04, -0.86);
    muzzleFlash.visible = false;
    weaponGroup.add(muzzleFlash);

    // Großes Magazin
    const magazine = new THREE.Mesh(
      new THREE.BoxGeometry(0.07, 0.3, 0.1),
      makeMetallicMaterial(0x333333)
    );
    magazine.position.set(0, -0.3, -0.2);
    weaponGroup.add(magazine);

    // Erweiterte Optik
    const scope = new THREE.Mesh(
      new THREE.BoxGeometry(0.06, 0.06, 0.2),
      makeMetallicMaterial(0x0A0A0A)
    );
    scope.position.set(0, 0.1, -0.25);
    weaponGroup.add(scope);

    weaponGroup.userData = {
      muzzleFlash,
      weaponType: 'BR'
    };

    return weaponGroup;
  }

  function createPistol() {
    const weaponGroup = new THREE.Group();
    
    // Kompakter Körper
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(0.06, 0.08, 0.25),
      makeMetallicMaterial(0x404040)
    );
    body.position.set(0, -0.02, -0.15);
    weaponGroup.add(body);

    // Kurzer Lauf
    const barrel = new THREE.Mesh(
      new THREE.CylinderGeometry(0.015, 0.02, 0.15, 8),
      makeMetallicMaterial(0x2A2A2A)
    );
    barrel.rotation.z = Math.PI / 2;
    barrel.position.set(0, 0.02, -0.25);
    weaponGroup.add(barrel);

    // Kleines Magazin
    const magazine = new THREE.Mesh(
      new THREE.BoxGeometry(0.04, 0.15, 0.05),
      makeMetallicMaterial(0x333333)
    );
    magazine.position.set(0, -0.15, -0.08);
    weaponGroup.add(magazine);

    const muzzleFlash = new THREE.Mesh(
      new THREE.SphereGeometry(0.03, 6, 6),
      makeEmissiveMaterial(0xFFAA00, 1.0)
    );
    muzzleFlash.position.set(0, 0.02, -0.32);
    muzzleFlash.visible = false;
    weaponGroup.add(muzzleFlash);

    weaponGroup.userData = {
      muzzleFlash,
      weaponType: 'Pistol'
    };

    return weaponGroup;
  }

  function attachGunTo(hand) {
    // Entferne aktuelle Waffe
    currentWeapon.removeFromParent();
    
    // Füge zu entsprechender Hand hinzu
    if (hand === 'right') {
      controllerRight.add(currentWeapon);
    } else {
      controllerLeft.add(currentWeapon);
    }
  }

  function switchWeapon(weaponType) {
    const wasAttached = currentWeapon.parent;
    currentWeapon.removeFromParent();
    
    switch (weaponType) {
      case 'AR':
        currentWeapon = weapons.assaultRifle;
        break;
      case 'BR':
        currentWeapon = weapons.battleRifle;
        break;
      case 'Pistol':
        currentWeapon = weapons.pistol;
        break;
    }
    
    if (wasAttached) {
      wasAttached.add(currentWeapon);
    }
  }

  function showMuzzleFlash() {
    const muzzleFlash = currentWeapon.userData.muzzleFlash;
    if (muzzleFlash) {
      muzzleFlash.visible = true;
      // Zufällige Rotation für Variation
      muzzleFlash.rotation.z = Math.random() * Math.PI * 2;
      muzzleFlash.scale.setScalar(0.5 + Math.random() * 0.5);
      
      // Flash nach kurzer Zeit ausblenden
      setTimeout(() => {
        muzzleFlash.visible = false;
      }, 50);
    }
  }

  // Movement/Physics state
  const velocity = new THREE.Vector3();
  const direction = new THREE.Vector3();
  const moveSpeed = 5;

  let vy = 0;
  let grounded = false;
  let coyoteTimer = 0;
  const COYOTE_MAX = 0.1;
  const JUMP = 8;
  const GRAV = -9.8 * 0.5;
  const PROBE = 0.25;

  const downRay = new THREE.Raycaster();
  const downDir = new THREE.Vector3(0, -1, 0);
  const upRay   = new THREE.Raycaster();
  const upDir   = new THREE.Vector3(0, 1, 0);

  let playerYRotation = 0;

  function landIfGroundClose(pos, walkables) {
    downRay.set(new THREE.Vector3(pos.x, pos.y + 0.2, pos.z), downDir);
    const hits = downRay.intersectObjects(walkables, true);
    if (!hits.length) return false;
    const hit = hits[0];
    if (vy <= 0 && hit.distance <= (0.2 + PROBE)) {
      pos.y = pos.y + 0.2 - hit.distance;
      vy = 0; grounded = true; coyoteTimer = 0;
      return true;
    }
    return false;
  }

  function blockCeiling(pos, dt, playerHeight, colliders) {
    if (vy <= 0) return;
    const headOldY = group.position.y + playerHeight;
    upRay.set(new THREE.Vector3(pos.x, headOldY, pos.z), upDir);
    upRay.far = (vy * dt) + 0.05;
    const hits = upRay.intersectObjects(colliders.map(e => e.obj), true);
    if (!hits.length) return;
    const hit = hits[0];
    const clampY = hit.point.y - playerHeight;
    if (pos.y > clampY) pos.y = clampY;
    vy = 0;
  }

  function updateStatusLights(health = 100) {
    statusLights.forEach((light, index) => {
      if (health > (index + 1) * 33) {
        light.material.emissive.setHex(0x00FF00);
        light.material.emissiveIntensity = 0.8;
      } else if (health > index * 33) {
        light.material.emissive.setHex(0xFFAA00);
        light.material.emissiveIntensity = 0.6;
      } else {
        light.material.emissive.setHex(0xFF0000);
        light.material.emissiveIntensity = 0.3;
      }
    });
  }

  function update(dt, input, colliders, walkables, turnMode, snapAngleDeg) {
    // Turning
    if (turnMode === 'smooth') {
      playerYRotation -= input.turnAxis.x * 0.05;
    } else {
      if (input.turnSnapDeltaRad) {
        playerYRotation += input.turnSnapDeltaRad;
      }
    }
    group.rotation.y = playerYRotation;

    // Move
    if (Math.abs(input.moveAxis.x) > 0 || Math.abs(input.moveAxis.y) > 0) {
      direction.set(input.moveAxis.x, 0, input.moveAxis.y).normalize();
      direction.applyMatrix4(new THREE.Matrix4().makeRotationY(playerYRotation));
      velocity.x = direction.x * moveSpeed;
      velocity.z = direction.z * moveSpeed;
    } else {
      velocity.set(0, 0, 0);
    }

    // Jump/Gravity
    if (!grounded) coyoteTimer = Math.max(0, coyoteTimer - dt);
    if (input.jumpPressed && (grounded || coyoteTimer > 0)) {
      vy = JUMP; grounded = false; coyoteTimer = 0;
    }
    vy += GRAV * dt;

    const newPos = group.position.clone();
    newPos.x += velocity.x * dt;
    newPos.z += velocity.z * dt;
    newPos.y += vy * dt;

    const playerHeight = 1.6;
    const playerRadius = 0.5;
    let finalPos = newPos.clone();

    // Seiten-Kollisionen
    for (const { box, obj } of colliders) {
      const pBox = {
        minX: finalPos.x - playerRadius,
        maxX: finalPos.x + playerRadius,
        minZ: finalPos.z - playerRadius,
        maxZ: finalPos.z + playerRadius,
        minY: finalPos.y,
        maxY: finalPos.y + playerHeight
      };
      if (pBox.maxX > box.min.x && pBox.minX < box.max.x &&
          pBox.maxZ > box.min.z && pBox.minZ < box.max.z) {
        if (finalPos.y < box.max.y && finalPos.y + playerHeight > box.min.y) {
          const oldBox = {
            minX: group.position.x - playerRadius,
            maxX: group.position.x + playerRadius,
            minZ: group.position.z - playerRadius,
            maxZ: group.position.z + playerRadius
          };
          if (!(oldBox.maxX > box.min.x && oldBox.minX < box.max.x)) finalPos.x = group.position.x;
          if (!(oldBox.maxZ > box.min.z && oldBox.minZ < box.max.z)) finalPos.z = group.position.z;
        }
      }
    }

    // Decke/Boden
    blockCeiling(finalPos, dt, playerHeight, colliders);
    const landed = landIfGroundClose(finalPos, walkables);
    if (!landed && grounded && vy < 0) { grounded = false; coyoteTimer = COYOTE_MAX; }

    group.position.copy(finalPos);

    // Update visual effects
    updateStatusLights(100); // Placeholder für Health-System
  }

  function onResize(w, h) {
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }

  // Initial weapon attachment
  attachGunTo('left');

  return {
    group, camera,
    controllerLeft, controllerRight, gripLeft, gripRight,
    attachGunTo, switchWeapon, showMuzzleFlash,
    update, onResize,
    getCurrentWeapon: () => currentWeapon.userData.weaponType
  };
}