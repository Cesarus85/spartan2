// player.js
import { THREE, GLTFLoader } from './deps.js';
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

  // Controllers (map by handedness)
  // Raw controller objects by index:
  const ctrl0 = renderer.xr.getController(0);
  const ctrl1 = renderer.xr.getController(1);
  const grip0 = renderer.xr.getControllerGrip(0);
  const grip1 = renderer.xr.getControllerGrip(1);
  // Mapped references that always point to the *handed* controller:
  let controllerLeft  = ctrl0;
  let controllerRight = ctrl1;
  let gripLeft  = grip0;
  let gripRight = grip1;

  // Handedness mapping on connect/disconnect
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
    ctrl.addEventListener('disconnected', () => {
      // no-op; three.js entfernt den Node, Mapping bleibt bis neuer Connect
    });
  }
  bindHandedness(ctrl0, grip0);
  bindHandedness(ctrl1, grip1);

  group.add(ctrl0, ctrl1, grip0, grip1);

  // Gun
  const gun = new THREE.Group();
  gun.position.set(0, -0.1, -0.3);

  const gltfLoader = new GLTFLoader();
  gltfLoader.load('gewehr.glb', (gltf) => {
    const model = gltf.scene;
    model.scale.setScalar(0.35);
    model.rotation.x = Math.PI;
    model.rotation.y = -Math.PI / 2;
    model.rotation.z = Math.PI;
    gun.add(model);
  });

  function attachGunTo(hand) {
    gun.removeFromParent();
    if (hand === 'right') controllerRight.add(gun);
    else controllerLeft.add(gun);
  }

  // Movement/Physics state
  const velocity = new THREE.Vector3();
  const direction = new THREE.Vector3();
  const moveSpeed = 5;

  // Player status
  let health = 100;

  function getHealth() { return health; }
  function takeDamage(amount) { health = Math.max(0, health - amount); }

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

  function getForward(out = new THREE.Vector3()) {
    out.set(0, 0, -1).applyAxisAngle(new THREE.Vector3(0,1,0), playerYRotation);
    return out.normalize();
  }
  function getRight(out = new THREE.Vector3()) {
    out.set(1, 0, 0).applyAxisAngle(new THREE.Vector3(0,1,0), playerYRotation);
    return out.normalize();
  }

  function sampleGroundHeight(pos, walkables) {
    downRay.set(new THREE.Vector3(pos.x, pos.y + 0.5, pos.z), downDir);
    downRay.far = 3.0;
    const hits = downRay.intersectObjects(walkables, true);
    if (!hits.length) return null;
    return hits[0].point.y;
  }

  function tryStickToGround(pos, dt, walkables) {
    const y = sampleGroundHeight(pos, walkables);
    if (y == null) return false;
    // "Schweben" über Boden ist 0.2 (Capsule bottom)
    const ground = y + 0.2;
    if (vy <= 0 && pos.y - ground <= PROBE) {
      pos.y = ground;
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
      vy = JUMP;
      grounded = false;
      coyoteTimer = 0;
    } else {
      vy += GRAV * dt;
    }

    const newPos = group.position.clone();
    newPos.x += velocity.x * dt;
    newPos.z += velocity.z * dt;
    newPos.y += vy * dt;

    const playerHeight = 1.6;
    const playerRadius = 0.5;
    let finalPos = newPos.clone();

    // Seiten-Kollisionen
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

    // Boden andocken
    const stuck = tryStickToGround(finalPos, dt, walkables);
    if (!stuck) blockCeiling(finalPos, dt, playerHeight, colliders);

    group.position.copy(finalPos);
    group.rotation.set(0, playerYRotation, 0);

    // Kamera leicht versetzen (Kopf)
    camera.position.set(0, 1.6, 0);
    camera.rotation.set(0, 0, 0);
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
    getHealth, takeDamage,
    update, onResize
  };
}
