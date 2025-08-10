// player.js
import { THREE } from './deps.js';
import { makeVariedStandardMaterial } from './utils.js';

export function createPlayer(renderer) {
  const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);

  const group = new THREE.Group();
  group.position.set(0, 3.25 + 1.6, 0);
  group.add(camera);

  // Body
  const body = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.5, 1.5, 4, 8),
    makeVariedStandardMaterial(0x006400)
  );
  body.position.y = -1.6;
  group.add(body);

  // Controllers
  const controllerLeft  = renderer.xr.getController(0);
  const controllerRight = renderer.xr.getController(1);
  const gripLeft  = renderer.xr.getControllerGrip(0);
  const gripRight = renderer.xr.getControllerGrip(1);
  group.add(controllerLeft, controllerRight, gripLeft, gripRight);

  // Gun
  const gun = new THREE.Mesh(
    new THREE.BoxGeometry(0.1, 0.1, 0.5),
    makeVariedStandardMaterial(0x808080)
  );
  gun.position.set(0, -0.1, -0.3);

  function attachGunTo(hand) {
    gun.removeFromParent();
    if (hand === 'right') controllerRight.add(gun);
    else controllerLeft.add(gun);
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

  // --- Auto-Step Tunables ---
  const MAX_STEP_HEIGHT = 0.35;      // max Höhe, die ohne Sprung bestiegen wird
  const STEP_FORWARD_PROBE = 0.6;     // wie weit vor die Füße wir prüfen
  const STEP_EPS = 0.02;              // Sicherheitsmarge

  // Reusable helpers for step test
  const _stepRayDown = new THREE.Raycaster();
  const _stepDown = new THREE.Vector3(0, -1, 0);
  const _stepTmp = new THREE.Vector3();
  const _stepFwd = new THREE.Vector3();

  // Prüft, ob wir eine kleine Kante hochsteigen können; hebt intendedPos.y bei Erfolg an
  function tryStepUp(currentPos, intendedPos, forwardDir, colliders, walkables, playerRadius, playerHeight) {
    // Nur wenn wir uns wirklich nach vorn bewegen
    _stepFwd.copy(forwardDir).setY(0);
    if (_stepFwd.lengthSq() === 0) return false;
    _stepFwd.normalize();

    // Punkt kurz vor der Kante
    const probeBase = _stepTmp.copy(currentPos).addScaledVector(_stepFwd, STEP_FORWARD_PROBE);

    // Von oben nach unten tasten
    const fromY = currentPos.y + MAX_STEP_HEIGHT;
    const toY   = currentPos.y - STEP_EPS;
    _stepRayDown.set(new THREE.Vector3(probeBase.x, fromY, probeBase.z), _stepDown);
    _stepRayDown.far = (fromY - toY) + STEP_EPS;
    const groundHits = _stepRayDown.intersectObjects(walkables, true);
    if (!groundHits.length) return false;
    const g = groundHits[0];
    const steppedY = fromY - g.distance;
    if (steppedY < toY || (steppedY - currentPos.y) > (MAX_STEP_HEIGHT + STEP_EPS)) return false;

    // Prüfen, ob auf der erhöhten Position horizontale Kollisionsfreiheit besteht
    const testPos = intendedPos.clone();
    testPos.y = steppedY;
    const pBoxTop = {
      minX: testPos.x - playerRadius, maxX: testPos.x + playerRadius,
      minZ: testPos.z - playerRadius, maxZ: testPos.z + playerRadius,
      minY: testPos.y, maxY: testPos.y + playerHeight
    };
    for (const { box } of colliders) {
      if (pBoxTop.maxX > box.min.x && pBoxTop.minX < box.max.x &&
          pBoxTop.maxZ > box.min.z && pBoxTop.minZ < box.max.z) {
        if (pBoxTop.y < box.max.y && (pBoxTop.maxY) > box.min.y) {
          return false; // weiterhin Kollisionskonflikt oben
        }
      }
    }

    // Erfolg
    intendedPos.y = steppedY;
    return true;
  }


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

  function update(dt, input, colliders, walkables, turnMode, snapAngleDeg) {
    // Turning
    if (turnMode === 'smooth') {
      playerYRotation -= input.turnAxis.x * 0.05;
    } else {
      // Snap wird per Cooldown in input nicht gesteuert -> wir machen's hier:
      // Der Cooldown steckt sinnvollerweise in main; hier nur Yaw-Anpassung auf Signal:
      // Wir erwarten: input.turnSnapDeltaRad ∈ {0, ±angle} (siehe main)
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
      // simplify: skip floor/roof checks hier? (ok – Level ist „leicht“)
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
          // Auto-Step: Wenn wir am Boden sind und frontal blockiert, versuche kleine Stufe hochzusteigen
          if (grounded) {
            const fwdDir = new THREE.Vector3(direction.x, 0, direction.z);
            if (tryStepUp(group.position, finalPos, fwdDir, colliders, walkables, playerRadius, playerHeight)) {
              // Steigen gelungen -> nächste Kollisionen mit neuer Höhe prüfen
              continue;
            }
          }
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
  }

  function onResize(w, h) {
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }

  return {
    group, camera,
    controllerLeft, controllerRight, gripLeft, gripRight,
    gun, attachGunTo,
    update, onResize
  };
}