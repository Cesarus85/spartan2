import { THREE } from './deps.js';

const GRAVITY = -18.0;         // m/s^2 (a bit Moon-ish once combined with jump)
const JUMP_VELOCITY = 5.8;     // initial jump impulse
const COYOTE_TIME = 0.12;      // seconds after leaving ground you can still jump
const AIR_CONTROL = 0.20;      // lateral control in air
const GROUND_FRICTION = 10.0;  // damp lateral velocity on ground
const MAX_STEP_HEIGHT = 0.25;  // *** Step-Offset height (m) ***
const STEP_FORWARD_PROBE = 0.35; // forward probe distance for stepping (m)
const PLAYER_RADIUS = 0.45;
const PLAYER_HALF_HEIGHT = 0.95; // capsule half height excluding caps

function makeSimpleMat(color) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.7, metalness: 0.0 });
}

export function createPlayer(renderer) {
  const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);

  const group = new THREE.Group();
  group.position.set(0, 3.25 + 1.6, 0);
  group.add(camera);

  // Minimal body for visualization (can be hidden later)
  const body = new THREE.Mesh(
    new THREE.CapsuleGeometry(PLAYER_RADIUS, PLAYER_HALF_HEIGHT * 2 - PLAYER_RADIUS * 2, 4, 8),
    makeSimpleMat(0x146314)
  );
  body.visible = false; // keep off by default to avoid blocking view
  group.add(body);

  // Controllers (for gun parenting)
  const controllerLeft = renderer.xr.getController(0);
  const controllerRight = renderer.xr.getController(1);
  const gripLeft = renderer.xr.getControllerGrip(0);
  const gripRight = renderer.xr.getControllerGrip(1);
  group.add(controllerLeft, controllerRight, gripLeft, gripRight);

  // Very simple “gun” mesh
  const gun = new THREE.Mesh(
    new THREE.BoxGeometry(0.65, 0.18, 0.18),
    makeSimpleMat(0x3ac7ff)
  );
  gun.position.set(0, -0.05, -0.25);
  gun.castShadow = true;

  function attachGunTo(hand) {
    const parent = hand === 'right' ? controllerRight : controllerLeft;
    if (!parent) return;
    parent.add(gun);
  }

  // --- Movement state ---
  const velocity = new THREE.Vector3();
  let onGround = false;
  let timeSinceGrounded = 999;

  // temp objects
  const tmpDir = new THREE.Vector3();
  const tmpPos = new THREE.Vector3();
  const tmpBox = new THREE.Box3();

  function capsuleAABB(center) {
    // expand by player extents
    tmpBox.min.set(center.x - PLAYER_RADIUS, center.y - (PLAYER_HALF_HEIGHT + PLAYER_RADIUS), center.z - PLAYER_RADIUS);
    tmpBox.max.set(center.x + PLAYER_RADIUS, center.y + (PLAYER_HALF_HEIGHT + PLAYER_RADIUS), center.z + PLAYER_RADIUS);
    return tmpBox;
  }

  function sweepResolveHorizontal(start, end, staticColliders) {
    // very cheap: try final pos; if overlaps with any collider AABB, slide back along each axis
    const target = end;
    const box = capsuleAABB(target);
    for (let i = 0; i < staticColliders.length; i++) {
      const c = staticColliders[i];
      if (box.intersectsBox(c.box)) {
        // resolve per-axis (push out smallest overlap axis)
        const overlap = new THREE.Vector3(
          Math.min(box.max.x - c.box.min.x, c.box.max.x - box.min.x),
          Math.min(box.max.y - c.box.min.y, c.box.max.y - box.min.y),
          Math.min(box.max.z - c.box.min.z, c.box.max.z - box.min.z)
        );
        // choose axis with smallest penetration (avoid y here for horizontal)
        if (overlap.x <= overlap.z) {
          // push on X
          if ((start.x <= c.box.min.x)) target.x = c.box.min.x - (box.max.x - target.x); else target.x = c.box.max.x - (box.min.x - target.x);
        } else {
          // push on Z
          if ((start.z <= c.box.min.z)) target.z = c.box.min.z - (box.max.z - target.z); else target.z = c.box.max.z - (box.min.z - target.z);
        }
        // recompute AABB after change
        capsuleAABB(target);
      }
    }
    return target;
  }

  function raycastDownForGround(pos, walkableMeshes, maxDrop = 2.0) {
    const ray = new THREE.Raycaster();
    ray.ray.origin.set(pos.x, pos.y + 0.5, pos.z);
    ray.ray.direction.set(0, -1, 0);
    ray.far = maxDrop + 0.5;
    const meshes = walkableMeshes;
    const hits = ray.intersectObjects(meshes, false);
    if (hits.length > 0) return hits[0].point.y;
    return null;
  }

  function tryStepUp(startPos, wishMove, staticColliders, walkableMeshes) {
    // Probe a short forward move; if blocked, try stepping up by MAX_STEP_HEIGHT
    if (wishMove.lengthSq() === 0) return null;

    // 1) forward probe
    const forwardTarget = tmpPos.copy(startPos).addScaledVector(wishMove, STEP_FORWARD_PROBE);
    const blocked = capsuleAABB(forwardTarget);
    let blockedHit = false;
    for (let i = 0; i < staticColliders.length; i++) if (blocked.intersectsBox(staticColliders[i].box)) { blockedHit = true; break; }
    if (!blockedHit) return null; // nothing to step over

    // 2) raise by step height and test again
    forwardTarget.y += MAX_STEP_HEIGHT;
    capsuleAABB(forwardTarget);
    let stillBlocked = false;
    for (let i = 0; i < staticColliders.length; i++) if (tmpBox.intersectsBox(staticColliders[i].box)) { stillBlocked = true; break; }
    if (stillBlocked) return null; // obstacle is too tall

    // 3) find real ground height after stepping
    const groundY = raycastDownForGround(forwardTarget, walkableMeshes, MAX_STEP_HEIGHT + 0.5);
    if (groundY == null) return null;

    // Only accept if ground is within step height from the original baseline
    if (groundY - startPos.y > MAX_STEP_HEIGHT + 0.05) return null;

    forwardTarget.y = groundY + PLAYER_RADIUS; // stand on ground (account for radius)
    return forwardTarget.clone();
  }

  function update(dt, input, staticColliders, walkableMeshes, turnMode, snapAngleDeg) {
    // Snap-Turn: rotate group in-place before motion
    if (input.turnSnapDeltaRad) group.rotation.y += input.turnSnapDeltaRad;
    else if (turnMode === 'smooth') group.rotation.y += input.turnAxis.x * dt * 1.8; // ~103°/s at full deflection

    // Desired move in local X/Z
    tmpDir.set(input.moveAxis.x, 0, -input.moveAxis.y).normalize();
    // Convert to world relative to player yaw
    const yaw = group.rotation.y;
    const cos = Math.cos(yaw), sin = Math.sin(yaw);
    const wish = new THREE.Vector3(
      tmpDir.x * cos - tmpDir.z * sin,
      0,
      tmpDir.x * sin + tmpDir.z * cos
    );

    // apply acceleration
    const accel = onGround ? 9.5 : 9.5 * AIR_CONTROL;
    velocity.x = THREE.MathUtils.damp(velocity.x, wish.x * 4.0, accel, dt);
    velocity.z = THREE.MathUtils.damp(velocity.z, wish.z * 4.0, accel, dt);

    // gravity
    velocity.y += GRAVITY * dt;

    // Jump
    timeSinceGrounded += dt;
    if (onGround) timeSinceGrounded = 0;
    if (input.jumpPressed && timeSinceGrounded <= COYOTE_TIME) {
      velocity.y = JUMP_VELOCITY;
      onGround = false;
      timeSinceGrounded = 999;
    }

    // Integrate horizontal first with collision + step-offset
    const start = group.position.clone();
    const end = start.clone().addScaledVector(new THREE.Vector3(velocity.x, 0, velocity.z), dt);

    // Attempt step if blocked
    const stepped = tryStepUp(start, new THREE.Vector3().subVectors(end, start).setY(0), staticColliders, walkableMeshes);
    if (stepped) {
      group.position.copy(stepped);
      onGround = true; // we just climbed a tiny step
      velocity.y = 0;
    } else {
      sweepResolveHorizontal(start, end, staticColliders);
      group.position.copy(end);
    }

    // Vertical integration + ground snapping
    group.position.y += velocity.y * dt;

    // Ground detect: cast down to walkable
    const groundY = raycastDownForGround(group.position, walkableMeshes, 2.0);
    if (groundY !== null) {
      const feetY = groundY + PLAYER_RADIUS;
      if (group.position.y <= feetY + 0.05) {
        group.position.y = feetY;
        onGround = true;
        velocity.y = 0;
        // friction on ground
        velocity.x = THREE.MathUtils.damp(velocity.x, 0, GROUND_FRICTION, dt);
        velocity.z = THREE.MathUtils.damp(velocity.z, 0, GROUND_FRICTION, dt);
      } else {
        onGround = false;
      }
    }
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