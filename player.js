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
  body.position.set(0, -1.0, 0);
  body.castShadow = false;
  body.receiveShadow = false;
  group.add(body);

  // Controller/Gun-Halter
  const ctrl0 = renderer.xr.getController(0);
  const ctrl1 = renderer.xr.getController(1);
  const grip0 = renderer.xr.getControllerGrip(0);
  const grip1 = renderer.xr.getControllerGrip(1);
  group.add(ctrl0, ctrl1, grip0, grip1);

  // Dummy-Gun (einfaches Mesh)
  const gun = new THREE.Mesh(
    new THREE.BoxGeometry(0.08, 0.06, 0.35),
    makeVariedStandardMaterial(0x555555)
  );
  gun.position.set(0, -0.03, -0.18);

  // Standard: an der linken Hand befestigen
  ctrl0.addEventListener('connected', (e) => {
    const handed = e?.data?.handedness || e?.target?.inputSource?.handedness || 'unknown';
    if (handed === 'left') { tryAttach(gun, ctrl0); }
  });
  ctrl1.addEventListener('connected', (e) => {
    const handed = e?.data?.handedness || e?.target?.inputSource?.handedness || 'unknown';
    if (handed === 'right') { tryAttach(gun, ctrl1); }
  });

  function tryAttach(obj, parent) {
    if (obj.parent) obj.parent.remove(obj);
    parent.add(obj);
  }

  // Mapped references, die immer auf die tatsächliche linke/rechte Hand zeigen:
  let controllerLeft  = ctrl0;
  let controllerRight = ctrl1;
  let gripLeft  = grip0;
  let gripRight = grip1;

  function bindHandedness(ctrl, grip) {
    ctrl.addEventListener('connected', (e) => {
      const handed = e?.data?.handedness || e?.target?.inputSource?.handedness || 'unknown';
      if (handed === 'left')  controllerLeft  = ctrl;
      if (handed === 'right') controllerRight = ctrl;
    });
    grip.addEventListener('connected', (e) => {
      const handed = e?.data?.handedness || e?.target?.inputSource?.handedness || 'unknown';
      if (handed === 'left')  gripLeft  = grip;
      if (handed === 'right') gripRight = grip;
    });
  }
  bindHandedness(ctrl0, grip0);
  bindHandedness(ctrl1, grip1);

  function attachGunTo(hand) {
    if (hand === 'right')      tryAttach(gun, controllerRight);
    else /* default: left */   tryAttach(gun, controllerLeft);
  }

  // --- Bewegung / Physik (Quest-leicht) -------------------------------------
  const forward = new THREE.Vector3();
  const right = new THREE.Vector3();
  const direction = new THREE.Vector3();
  const velocity = new THREE.Vector3();

  const downRay = new THREE.Raycaster();
  const upRay   = new THREE.Raycaster();
  const downDir = new THREE.Vector3(0, -1, 0);
  const upDir   = new THREE.Vector3(0,  1, 0);

  const tmpEuler = new THREE.Euler(0, 0, 0, 'YXZ');
  let playerYRotation = 0;

  let vy = 0;
  let grounded = false;
  let coyoteTimer = 0;
  const COYOTE_MAX = 0.12;
  const JUMP_VELOCITY = 5.4;
  const GRAVITY = 14.0;
  const moveSpeed = 3.4;

  function getForward() {
    // Blickrichtung aus HMD (nur Yaw) + Spielerrotation kombinieren
    const cam = camera;
    const yaw = (tmpEuler.setFromQuaternion(cam.quaternion), tmpEuler.y);
    forward.set(Math.sin(yaw + playerYRotation), 0, Math.cos(yaw + playerYRotation)).negate();
    return forward;
  }
  function getRight() {
    right.copy(getForward()).cross(new THREE.Vector3(0,1,0)).normalize();
    return right;
  }

  function update(dt, input, colliders, walkables, turnMode, snapAngleDeg) {
    // Turning
    if (turnMode === 'smooth') {
      // Faktor 0.05 als konservative Drehgeschwindigkeit (≈ rad/s bei vollem Ausschlag)
      playerYRotation -= input.turnAxis.x * 0.05;
    } else {
      if (input.turnSnapDeltaRad) {
        playerYRotation -= input.turnSnapDeltaRad;
      }
    }

    // Movement
    direction.set(0,0,0);
    if (input.moveAxis.y !== 0) direction.add(getForward().multiplyScalar(-input.moveAxis.y));
    if (input.moveAxis.x !== 0) direction.add(getRight().multiplyScalar( input.moveAxis.x));
    if (direction.lengthSq() > 0) direction.normalize();

    velocity.copy(direction).multiplyScalar(moveSpeed);

    // Jump/Gravity
    if (grounded) coyoteTimer = Math.min(COYOTE_MAX, coyoteTimer + dt);
    if (input.jumpPressed && (grounded || coyoteTimer > 0)) {
      vy = JUMP_VELOCITY;
      grounded = false;
      coyoteTimer = 0;
    } else {
      vy -= GRAVITY * dt;
    }

    // Integration
    const newPos = group.position.clone();
    newPos.addScaledVector(velocity, dt);
    newPos.y += vy * dt;

    // Kollision (Seiten) gegen statische Boxen
    const playerHeight = 1.6;
    const playerRadius = 0.5;
    let finalPos = newPos.clone();

    for (const { box } of colliders) {
      const pBox = {
        minX: finalPos.x - playerRadius,
        maxX: finalPos.x + playerRadius,
        minZ: finalPos.z - playerRadius,
        maxZ: finalPos.z + playerRadius,
        minY: finalPos.y,
        maxY: finalPos.y + playerHeight
      };
      if (pBox.maxX > box.min.x && pBox.minX < box.max.x &&
          pBox.maxZ > box.min.z && pBox.minZ < box.max.z &&
          pBox.minY < box.max.y && pBox.maxY > box.min.y) {
        // Separationslogik: Korrektur pro Achse relativ zur vorherigen Position
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

    // Boden andocken
    const stuck = tryStickToGround(finalPos, dt, walkables);
    if (!stuck) {
      // Decke blocken
      blockCeiling(finalPos, dt, playerHeight, colliders);
    }

    group.position.copy(finalPos);
    group.rotation.set(0, playerYRotation, 0);
  }

  function tryStickToGround(pos, dt, walkables) {
    const playerHeight = 1.6;
    const footOldY = group.position.y;
    const footNewY = pos.y;
    const footY = Math.max(footOldY, footNewY); // vom höheren Punkt aus casten

    downRay.set(new THREE.Vector3(pos.x, footY + 0.1, pos.z), downDir);
    downRay.far = 0.5 + Math.max(0, -vy * dt) + 0.2;

    const hits = downRay.intersectObjects(walkables, true);
    if (!hits.length) return false;

    const hit = hits[0];
    // Wenn wir fallen oder nur minimal steigen: andocken
    if (vy <= 0 || (footNewY - hit.point.y) < 0.15) {
      pos.y = hit.point.y;
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

  function onResize(w, h) {
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }

  return {
    group, camera,
    controllerLeft, controllerRight, gripLeft, gripRight,
    gun, attachGunTo,
    getController: (hand) => (hand === 'left' ? controllerLeft : controllerRight),
    update, onResize
  };
}
