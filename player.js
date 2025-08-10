// player.js
import { THREE } from './deps.js';
import { makeVariedStandardMaterial } from './utils.js';

const TMP_MAT4 = new THREE.Matrix4();
const TMP_VEC3 = new THREE.Vector3();
const TMP_BOX3 = new THREE.Box3();

export function createPlayer(renderer) {
  const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);

  // Player root
  const group = new THREE.Group();
  group.position.set(0, 3.25 + 1.6, 0); // start on the fortress roof a bit above ground
  group.add(camera);

  // Visual body (cheap)
  const body = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.5, 1.5, 4, 8),
    makeVariedStandardMaterial(0x006400)
  );
  body.position.y = -1.6;
  group.add(body);

  // XR controllers (indices are fine here; input.js resolves handedness logic)
  const controllerLeft  = renderer.xr.getController(0);
  const controllerRight = renderer.xr.getController(1);
  const gripLeft  = renderer.xr.getControllerGrip(0);
  const gripRight = renderer.xr.getControllerGrip(1);
  group.add(controllerLeft, controllerRight, gripLeft, gripRight);

  // --- Gun + Muzzle ---------------------------------------------------------
  const gun = new THREE.Mesh(
    new THREE.BoxGeometry(0.1, 0.1, 0.5),
    makeVariedStandardMaterial(0x808080)
  );
  // move gun slightly forward & down relative to controller
  gun.position.set(0, -0.04, -0.18);

  // Muzzle: empty at gun's tip (local space)
  const gunMuzzle = new THREE.Object3D();
  gunMuzzle.position.set(0, 0, -0.25);
  gun.add(gunMuzzle);

  function attachGunTo(hand) {
    gun.removeFromParent();
    if (hand === 'right') controllerRight.add(gun);
    else controllerLeft.add(gun);
  }

  // --- Movement / Physics ---------------------------------------------------
  const velocity = new THREE.Vector3(0,0,0);
  const direction = new THREE.Vector3();
  const moveSpeed = 5;

  // simple capsule collision dimensions
  const CAPSULE_RADIUS = 0.4;
  const CAPSULE_HEIGHT = 1.6; // eye to feet

  // vertical motion
  let vy = 0;
  let grounded = false;
  let coyoteTimer = 0;
  const COYOTE_MAX = 0.1;
  const JUMP = 8;
  const GRAV = -9.8 * 0.5;
  const PROBE = 0.25;

  // step offset (small ledges are walkable)
  const STEP_HEIGHT = 0.35;

  // raycasters
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

  function ceilingBlock(pos, walkables) {
    upRay.set(new THREE.Vector3(pos.x, pos.y + CAPSULE_HEIGHT * 0.5, pos.z), upDir);
    const hits = upRay.intersectObjects(walkables, true);
    if (!hits.length) return;
    const hit = hits[0];
    // if head would intersect soon, clamp
    if (hit.distance < 0.05) {
      vy = Math.min(vy, 0);
    }
  }

  function resolveStaticCollision(pos, staticColliders) {
    // very cheap capsule-vs-AABB: treat capsule as vertical cylinder with radius
    let corrected = false;
    const feetY = pos.y - CAPSULE_HEIGHT * 0.5;
    const headY = pos.y + CAPSULE_HEIGHT * 0.5;

    for (let i=0;i<staticColliders.length;i++) {
      const { box } = staticColliders[i];
      // expand box by radius in XZ and by 0 in Y (cylinder)
      TMP_BOX3.min.set(box.min.x - CAPSULE_RADIUS, box.min.y, box.min.z - CAPSULE_RADIUS);
      TMP_BOX3.max.set(box.max.x + CAPSULE_RADIUS, box.max.y, box.max.z + CAPSULE_RADIUS);

      // only consider Y overlap if within object vertical span
      const yOverlap = !(headY < TMP_BOX3.min.y || feetY > TMP_BOX3.max.y);
      if (!yOverlap) continue;

      // clamp XZ into expanded box and push out along smallest axis if inside
      if (pos.x > TMP_BOX3.min.x && pos.x < TMP_BOX3.max.x &&
          pos.z > TMP_BOX3.min.z && pos.z < TMP_BOX3.max.z) {
        const dxMin = pos.x - TMP_BOX3.min.x;
        const dxMax = TMP_BOX3.max.x - pos.x;
        const dzMin = pos.z - TMP_BOX3.min.z;
        const dzMax = TMP_BOX3.max.z - pos.z;
        const minPen = Math.min(dxMin, dxMax, dzMin, dzMax);
        if (minPen === dxMin) pos.x = TMP_BOX3.min.x;
        else if (minPen === dxMax) pos.x = TMP_BOX3.max.x;
        else if (minPen === dzMin) pos.z = TMP_BOX3.min.z;
        else pos.z = TMP_BOX3.max.z;
        corrected = true;
      }
    }
    return corrected;
  }

  function tryStepUp(currentPos, horizDelta, walkables) {
    // Attempt to move horizontally and find a ground a bit higher (<= STEP_HEIGHT)
    if (horizDelta.lengthSq() === 0) return false;

    const testPos = currentPos.clone().add(horizDelta);
    // cast down from above potential step
    const from = new THREE.Vector3(testPos.x, currentPos.y + STEP_HEIGHT + 0.2, testPos.z);
    downRay.set(from, downDir);
    const hits = downRay.intersectObjects(walkables, true);
    if (!hits.length) return false;

    const hit = hits[0];
    const newY = from.y - hit.distance;
    if (newY >= currentPos.y - 0.01 && newY <= currentPos.y + STEP_HEIGHT + 0.01) {
      currentPos.copy(testPos);
      currentPos.y = newY;
      grounded = true; vy = 0; coyoteTimer = 0;
      return true;
    }
    return false;
  }

  function getMuzzlePose(outPos = new THREE.Vector3(), outQuat = new THREE.Quaternion()) {
    // world position of the muzzle (fallback to camera if not in scene yet)
    gunMuzzle.updateWorldMatrix(true, false);
    TMP_MAT4.copy(gunMuzzle.matrixWorld);
    outPos.setFromMatrixPosition(TMP_MAT4);
    TMP_MAT4.decompose(TMP_VEC3, outQuat, new THREE.Vector3());
    return { pos: outPos, rot: outQuat };
  }

  function update(dt, input, staticColliders, walkableMeshes, turnMode, snapAngleDeg) {
    // Turn
    if (turnMode === 'smooth') {
      playerYRotation -= input.turnAxis.x * 0.05;
    } else if (input.turnSnapDeltaRad) {
      playerYRotation += input.turnSnapDeltaRad;
    }
    group.rotation.y = playerYRotation;

    // Movement axes
    let wantMove = false;
    let horizDelta = TMP_VEC3.set(0,0,0);
    if (Math.abs(input.moveAxis.x) > 0 || Math.abs(input.moveAxis.y) > 0) {
      direction.set(input.moveAxis.x, 0, input.moveAxis.y).normalize();
      direction.applyMatrix4(new THREE.Matrix4().makeRotationY(playerYRotation));
      velocity.x = direction.x * moveSpeed;
      velocity.z = direction.z * moveSpeed;
      horizDelta = TMP_VEC3.set(velocity.x * dt, 0, velocity.z * dt);
      wantMove = true;
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

    // vertical integrate
    newPos.y += vy * dt;
    ceilingBlock(newPos, walkableMeshes);

    // horizontal integrate with simple collision
    if (wantMove) {
      newPos.add(horizDelta);
    }

    // resolve collisions in XZ
    resolveStaticCollision(newPos, staticColliders);

    // Step-up pass (only if grounded or near ground and we moved horizontally)
    if (wantMove && (grounded || coyoteTimer > 0.0)) {
      const movedHoriz = TMP_VEC3.set(newPos.x - group.position.x, 0, newPos.z - group.position.z);
      if (movedHoriz.lengthSq() > 1e-6) {
        // try to step up if we got blocked (we can approximate by trying alternate pos)
        const altPos = group.position.clone();
        if (!tryStepUp(altPos, movedHoriz, walkableMeshes)) {
          // no step found; keep current newPos (already collision-resolved)
        } else {
          newPos.copy(altPos);
        }
      }
    }

    // ground snap
    if (!landIfGroundClose(newPos, walkableMeshes)) {
      grounded = false;
    }

    // commit
    group.position.copy(newPos);

    // post-grounding friction for vy
    if (grounded) vy = Math.min(vy, 0);
  }

  function onResize(w, h) {
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }

  return {
    group, camera,
    controllerLeft, controllerRight, gripLeft, gripRight,
    gun, gunMuzzle, attachGunTo,
    getMuzzlePose,
    update, onResize
  };
}
