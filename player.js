// player.js
import { THREE } from './deps.js';
import { makeVariedStandardMaterial } from './utils.js';

const TMP_MAT4 = new THREE.Matrix4();
const TMP_VEC3 = new THREE.Vector3();
const TMP_QUAT = new THREE.Quaternion();
const TMP_BOX3 = new THREE.Box3();

export function createPlayer(renderer) {
  const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);

  const group = new THREE.Group();
  // Start low; the caller will teleportTo() to a safe spawn
  group.position.set(0, 1.65, 0);
  group.add(camera);

  // Body (cheap visual)
  const body = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.5, 1.5, 4, 8),
    makeVariedStandardMaterial(0x006400)
  );
  body.position.y = -1.6;
  group.add(body);

  // XR controllers (we attach gun to chosen hand from main.js)
  const controllerLeft  = renderer.xr.getController(0);
  const controllerRight = renderer.xr.getController(1);
  const gripLeft  = renderer.xr.getControllerGrip(0);
  const gripRight = renderer.xr.getControllerGrip(1);
  group.add(controllerLeft, controllerRight, gripLeft, gripRight);

  // ---- Gun + muzzle --------------------------------------------------------
  const gun = new THREE.Mesh(
    new THREE.BoxGeometry(0.1, 0.1, 0.5),
    makeVariedStandardMaterial(0x808080)
  );
  gun.position.set(0, -0.04, -0.18);
  const gunMuzzle = new THREE.Object3D();
  gunMuzzle.position.set(0, 0, -0.25);
  gun.add(gunMuzzle);

  function attachGunTo(hand) {
    gun.removeFromParent();
    if (hand === 'right') controllerRight.add(gun);
    else controllerLeft.add(gun);
  }

  function getMuzzlePose(outPos = new THREE.Vector3(), outQuat = new THREE.Quaternion()) {
    // If gun is not attached yet, fallback to camera forward
    if (!gun.parent) {
      camera.updateWorldMatrix(true, false);
      outPos.copy(camera.getWorldPosition(TMP_VEC3));
      outQuat.copy(camera.getWorldQuaternion(TMP_QUAT));
      return { pos: outPos, rot: outQuat };
    }
    gunMuzzle.updateWorldMatrix(true, false);
    const mw = gunMuzzle.matrixWorld;
    outPos.setFromMatrixPosition(mw);
    mw.decompose(TMP_VEC3, outQuat, new THREE.Vector3());
    return { pos: outPos, rot: outQuat };
  }

  // ---- Movement / physics (Quest-light) -----------------------------------
  const velocity = new THREE.Vector3(0,0,0);
  const direction = new THREE.Vector3();
  const moveSpeed = 5;

  const CAPSULE_RADIUS = 0.4;
  const CAPSULE_HEIGHT = 1.6; // eye to feet

  let vy = 0;
  let grounded = false;
  let coyoteTimer = 0;
  const COYOTE_MAX = 0.1;
  const JUMP = 8;
  const GRAV = -9.8 * 0.5;
  const PROBE = 0.25;

  const STEP_HEIGHT = 0.35;

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
      vy = 0; grounded = true; coyoteTimer = COYOTE_MAX;
      return true;
    }
    return false;
  }

  function ceilingBlock(pos, walkables) {
    upRay.set(new THREE.Vector3(pos.x, pos.y + CAPSULE_HEIGHT * 0.5, pos.z), upDir);
    const hits = upRay.intersectObjects(walkables, true);
    if (!hits.length) return;
    const hit = hits[0];
    if (hit.distance < 0.05) vy = Math.min(vy, 0);
  }

  function resolveStaticCollision(pos, staticColliders) {
    let corrected = false;
    const feetY = pos.y - CAPSULE_HEIGHT * 0.5;
    const headY = pos.y + CAPSULE_HEIGHT * 0.5;
    for (let i=0;i<staticColliders.length;i++) {
      const { box } = staticColliders[i];
      TMP_BOX3.min.set(box.min.x - CAPSULE_RADIUS, box.min.y, box.min.z - CAPSULE_RADIUS);
      TMP_BOX3.max.set(box.max.x + CAPSULE_RADIUS, box.max.y, box.max.z + CAPSULE_RADIUS);
      const yOverlap = !(headY < TMP_BOX3.min.y || feetY > TMP_BOX3.max.y);
      if (!yOverlap) continue;
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
    if (horizDelta.lengthSq() === 0) return false;
    const testPos = currentPos.clone().add(horizDelta);
    const from = new THREE.Vector3(testPos.x, currentPos.y + STEP_HEIGHT + 0.2, testPos.z);
    downRay.set(from, downDir);
    const hits = downRay.intersectObjects(walkables, true);
    if (!hits.length) return false;
    const hit = hits[0];
    const newY = from.y - hit.distance;
    if (newY >= currentPos.y - 0.01 && newY <= currentPos.y + STEP_HEIGHT + 0.01) {
      currentPos.copy(testPos);
      currentPos.y = newY;
      grounded = true; vy = 0; coyoteTimer = COYOTE_MAX;
      return true;
    }
    return false;
  }

  function update(dt, input, staticColliders, walkableMeshes, turnMode, snapAngleDeg) {
    if (turnMode === 'smooth') {
      playerYRotation -= input.turnAxis.x * 0.05;
    } else if (input.turnSnapDeltaRad) {
      playerYRotation += input.turnSnapDeltaRad;
    }
    group.rotation.y = playerYRotation;

    // Movement
    let wantMove = false;
    let horizDelta = TMP_VEC3.set(0,0,0);
    if (Math.abs(input.moveAxis.x) > 0 || Math.abs(input.moveAxis.y
