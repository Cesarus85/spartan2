// player.js
import { THREE } from './deps.js';
import { makeVariedStandardMaterial } from './utils.js';

/**
 * Player factory. Returns camera rig, controllers and update() loop.
 * Exposes a named 'muzzle' child on the gun so other systems (combat)
 * can fetch its precise world transform for bullet spawning.
 */
export function createPlayer(renderer) {
  const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);

  // XR rig root
  const group = new THREE.Group();
  // Start roughly above the arena center; y will be corrected by safeSpawn on first update
  group.position.set(0, 3.25 + 1.6, 0);
  group.add(camera);

  // Body (capsule visual only)
  const body = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.5, 1.5, 4, 8),
    makeVariedStandardMaterial(0x006400)
  );
  body.castShadow = false; body.receiveShadow = true;
  body.position.set(0, 1.6, 0);
  group.add(body);

  // Controllers
  const controllerLeft  = renderer.xr.getController(0);
  const controllerRight = renderer.xr.getController(1);
  group.add(controllerLeft, controllerRight);

  const gripLeft  = renderer.xr.getControllerGrip(0);
  const gripRight = renderer.xr.getControllerGrip(1);
  group.add(gripLeft, gripRight);

  // Very simple gun as child of a controller (attachable to either hand)
  const gun = new THREE.Group();
  gun.name = 'gun';
  // Base block
  const gunMesh = new THREE.Mesh(
    new THREE.BoxGeometry(0.06, 0.06, 0.34),
    new THREE.MeshStandardMaterial({ color: 0x2b2f33, metalness: 0.1, roughness: 0.7 })
  );
  gunMesh.position.set(0, 0, -0.17);
  gun.add(gunMesh);
  // Barrel cylinder
  const barrel = new THREE.Mesh(
    new THREE.CylinderGeometry(0.015, 0.015, 0.18, 12),
    new THREE.MeshStandardMaterial({ color: 0x3d4349, metalness: 0.2, roughness: 0.5 })
  );
  barrel.rotation.x = Math.PI / 2;
  barrel.position.set(0, 0, -0.35);
  gun.add(barrel);
  // Muzzle empty to be used for bullet spawn
  const muzzle = new THREE.Object3D();
  muzzle.name = 'muzzle';
  // put it right at the barrel exit
  muzzle.position.set(0, 0, -0.44);
  gun.add(muzzle);

  // Which hand holds the gun by default is managed by input/settings; expose helper
  function attachGunTo(handedness) {
    if (handedness === 'left') {
      controllerLeft.add(gun);
    } else {
      controllerRight.add(gun);
    }
  }

  // --- Movement physics (lightweight) ---
  const vel = new THREE.Vector3(0, 0, 0);
  const tmp = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
  const down = new THREE.Vector3(0, -1, 0);
  const quat = new THREE.Quaternion();

  const capsuleHalfHeight = 1.6 * 0.5 + 0.75; // rough visual to collider alignment
  const feetOffset = 0.05; // safety margin above ground when snapping

  let spawnAdjusted = false; // will run safe spawn alignment once
  let snapTurnCooldown = 0;

  function safeSpawn(walkableMeshes) {
    // cast a ray down from the rig's current x/z, find first walkable hit
    const ray = new THREE.Raycaster();
    const origin = new THREE.Vector3(group.position.x, group.position.y + 2.0, group.position.z);
    ray.set(origin, down);
    const hits = ray.intersectObjects(walkableMeshes, false);
    if (hits.length) {
      const y = hits[0].point.y + capsuleHalfHeight + feetOffset;
      group.position.y = y;
    }
  }

  function applySnapOrSmoothTurn(dt, input, turnMode, snapAngleDeg) {
    if (turnMode === 'snap') {
      if (input.snapTurnDelta !== 0 && snapTurnCooldown <= 0) {
        group.rotateOnWorldAxis(up, THREE.MathUtils.degToRad(input.snapTurnDelta));
        snapTurnCooldown = 0.18; // small cooldown to avoid rapid repeat
      }
      if (snapTurnCooldown > 0) snapTurnCooldown -= dt;
    } else {
      // smooth turn with right x-axis
      const yawSpeed = 1.8; // rad/s
      group.rotateOnWorldAxis(up, yawSpeed * input.turnAxis.x * dt);
    }
  }

  // naive collision against static AABBs (boxes)
  const _box = new THREE.Box3();
  function collideCapsuleAABBs(staticColliders) {
    // treat player as cylinder for simplicity
    const radius = 0.45;
    for (let i = 0; i < staticColliders.length; i++) {
      const b = staticColliders[i];
      if (!b) continue;
      if (b.intersectsSphere(new THREE.Sphere(new THREE.Vector3(group.position.x, group.position.y - 0.9, group.position.z), radius))) {
        // push out in the smallest axis direction
        // compute closest point in box to player center at feet height
        _box.copy(b);
        const p = new THREE.Vector3(
          THREE.MathUtils.clamp(group.position.x, _box.min.x, _box.max.x),
          THREE.MathUtils.clamp(group.position.y - 0.9, _box.min.y, _box.max.y),
          THREE.MathUtils.clamp(group.position.z, _box.min.z, _box.max.z),
        );
        const delta = new THREE.Vector3(group.position.x, group.position.y - 0.9, group.position.z).sub(p);
        const len = delta.length() || 1e-6;
        const push = radius - len;
        if (push > 0) {
          delta.multiplyScalar(push / len);
          group.position.x += delta.x;
          group.position.z += delta.z;
        }
      }
    }
  }

  function update(dt, input, staticColliders, walkableMeshes, turnMode, snapAngleDeg) {
    // one-time safe spawn
    if (!spawnAdjusted && walkableMeshes && walkableMeshes.length) {
      safeSpawn(walkableMeshes);
      spawnAdjusted = true;
    }

    // turning
    applySnapOrSmoothTurn(dt, input, turnMode, snapAngleDeg);

    // movement (local to rig yaw)
    const speed = 3.5;
    tmp.set(input.moveAxis.x, 0, -input.moveAxis.y);
    // rotate by current yaw (project camera yaw onto Y)
    camera.getWorldQuaternion(quat);
    const yaw = new THREE.Euler(0, new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().lookAt(new THREE.Vector3(0,0,0), new THREE.Vector3(0,0,-1).applyQuaternion(quat), up)).y, 0);
    tmp.applyEuler(yaw);
    group.position.addScaledVector(tmp, speed * dt);

    // simple gravity/jump
    const GRAV = -9.81;
    if (input.jumpPressed) {
      // check if near ground via small down ray
      const ray = new THREE.Raycaster();
      const origin = new THREE.Vector3(group.position.x, group.position.y, group.position.z);
      ray.set(origin, down);
      const hits = ray.intersectObjects(walkableMeshes, false);
      if (hits.length && (origin.y - hits[0].point.y) <= (capsuleHalfHeight + 0.12)) {
        vel.y = 4.5; // jump impulse
      }
    }
    vel.y += GRAV * dt;
    group.position.y += vel.y * dt;

    // ground snap / land
    const ray = new THREE.Raycaster();
    ray.set(new THREE.Vector3(group.position.x, group.position.y, group.position.z), down);
    const hits = ray.intersectObjects(walkableMeshes, false);
    if (hits.length) {
      const groundY = hits[0].point.y + capsuleHalfHeight;
      if (group.position.y < groundY + feetOffset) {
        group.position.y = groundY + feetOffset;
        vel.y = Math.max(0, vel.y);
      }
    }

    // collide with walls
    if (staticColliders && staticColliders.length) {
      collideCapsuleAABBs(staticColliders);
    }
  }

  function onResize(w, h) {
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }

  // helper for combat
  function getMuzzleWorld(outPos = new THREE.Vector3(), outQuat = new THREE.Quaternion()) {
    const m = gun.getObjectByName('muzzle');
    if (!m) return { pos: outPos.set(0,0,0), quat: outQuat.identity() };
    m.getWorldPosition(outPos);
    m.getWorldQuaternion(outQuat);
    return { pos: outPos, quat: outQuat };
  }

  return {
    group, camera,
    controllerLeft, controllerRight, gripLeft, gripRight,
    gun, attachGunTo,
    getMuzzleWorld,
    update, onResize
  };
}
