// player.js
import { THREE } from './deps.js';
import { makeVariedStandardMaterial } from './utils.js';

export function createPlayer(renderer) {
  const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);

  // XR rig root (dies ist die "Fußposition" in Weltkoordinaten)
  const group = new THREE.Group();
  group.position.set(0, 3.25 /*wird gleich korrigiert*/ + 0.05, 0);
  group.add(camera);

  // rein visuelles "Körper"-Mesh
  const body = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.5, 1.5, 4, 8),
    makeVariedStandardMaterial(0x006400)
  );
  body.castShadow = false; body.receiveShadow = true;
  body.position.set(0, 1.0, 0);
  group.add(body);

  // Controller anlegen (Handedness wird per 'connected' bestimmt)
  const c0 = renderer.xr.getController(0);
  const c1 = renderer.xr.getController(1);
  const g0 = renderer.xr.getControllerGrip(0);
  const g1 = renderer.xr.getControllerGrip(1);
  group.add(c0, c1, g0, g1);

  const controllersByHand = { left: null, right: null };
  function hookController(ctrl) {
    ctrl.addEventListener('connected', (ev) => {
      const hand = (ev && ev.data && ev.data.handedness)
        ? ev.data.handedness
        : (ev.data && ev.data.inputSource && ev.data.inputSource.handedness) || '';
      if (hand === 'left' || hand === 'right') {
        controllersByHand[hand] = ctrl;
        // Default: Gun an die linke Hand, sobald verbunden
        if (!gun.parent && hand === 'left') ctrl.add(gun);
      }
    });
  }
  hookController(c0); hookController(c1);

  // Simple Gun + benannte 'muzzle'
  const gun = new THREE.Group(); gun.name = 'gun';
  const gunMesh = new THREE.Mesh(
    new THREE.BoxGeometry(0.06, 0.06, 0.34),
    new THREE.MeshStandardMaterial({ color: 0x2b2f33, metalness: 0.1, roughness: 0.7 })
  );
  gunMesh.position.set(0, 0, -0.17); gun.add(gunMesh);
  const barrel = new THREE.Mesh(
    new THREE.CylinderGeometry(0.015, 0.015, 0.18, 12),
    new THREE.MeshStandardMaterial({ color: 0x3d4349, metalness: 0.2, roughness: 0.5 })
  );
  barrel.rotation.x = Math.PI / 2; barrel.position.set(0, 0, -0.35); gun.add(barrel);
  const muzzle = new THREE.Object3D(); muzzle.name = 'muzzle'; muzzle.position.set(0, 0, -0.44); gun.add(muzzle);

  function attachGunTo(handedness) {
    gun.removeFromParent();
    const target = controllersByHand[handedness] || (handedness === 'left' ? c0 : c1);
    target.add(gun);
  }
  // Falls die Controller schon verbunden sind:
  attachGunTo('left');

  // --- Bewegung/Physik (leicht) ---
  const vel = new THREE.Vector3(0, 0, 0);
  const tmp = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
  const down = new THREE.Vector3(0, -1, 0);
  const forward = new THREE.Vector3();
  const right = new THREE.Vector3();

  const feetOffset = 0.05;
  let spawnAdjusted = false;
  let snapTurnCooldown = 0;

  function safeSpawn(walkableMeshes) {
    const ray = new THREE.Raycaster();
    const origin = new THREE.Vector3(group.position.x, group.position.y + 2.0, group.position.z);
    ray.set(origin, down);
    const hits = ray.intersectObjects(walkableMeshes, false);
    if (hits.length) {
      group.position.y = hits[0].point.y + feetOffset; // keine Spielerhöhe addieren!
    }
  }

  function applySnapOrSmoothTurn(dt, input, turnMode) {
    if (turnMode === 'snap') {
      if (input.turnSnapDeltaRad !== 0 && snapTurnCooldown <= 0) {
        group.rotateOnWorldAxis(up, input.turnSnapDeltaRad);
        snapTurnCooldown = 0.18;
      }
      if (snapTurnCooldown > 0) snapTurnCooldown -= dt;
    } else {
      const yawSpeed = 1.8; // rad/s
      group.rotateOnWorldAxis(up, yawSpeed * input.turnAxis.x * dt);
    }
  }

  // 2D-Kollision (nur XZ) gegen AABBs → günstig & stabil
  function collideXZ(staticColliders) {
    const r = 0.45; // Spieler-"Radius"
    for (let i = 0; i < staticColliders.length; i++) {
      const entry = staticColliders[i]; if (!entry || !entry.box) continue;
      const b = entry.box;

      // Nur Boxen in vertikaler Nähe berücksichtigen
      if (group.position.y > b.max.y + 1.5 || group.position.y < b.min.y - 1.5) continue;

      const minX = b.min.x - r, maxX = b.max.x + r;
      const minZ = b.min.z - r, maxZ = b.max.z + r;

      if (group.position.x >= minX && group.position.x <= maxX &&
          group.position.z >= minZ && group.position.z <= maxZ) {

        const dxMin = Math.abs(group.position.x - minX);
        const dxMax = Math.abs(maxX - group.position.x);
        const dzMin = Math.abs(group.position.z - minZ);
        const dzMax = Math.abs(maxZ - group.position.z);

        const pushX = Math.min(dxMin, dxMax);
        const pushZ = Math.min(dzMin, dzMax);

        if (pushX < pushZ) {
          group.position.x += (dxMin < dxMax) ? (-(pushX)) : (pushX);
        } else {
          group.position.z += (dzMin < dzMax) ? (-(pushZ)) : (pushZ);
        }
      }
    }
  }

  function update(dt, input, staticColliders, walkableMeshes, turnMode /*snapAngle ignored here*/) {
    if (!spawnAdjusted && walkableMeshes && walkableMeshes.length) {
      safeSpawn(walkableMeshes);
      spawnAdjusted = true;
    }

    // Turn
    applySnapOrSmoothTurn(dt, input, turnMode);

    // Bewegung: Kamera-Forward/Right → auf Boden projiziert
    camera.getWorldDirection(forward);
    forward.y = 0; forward.normalize();
    right.crossVectors(forward, up).normalize(); // richtige Rechtshändigkeit

    // Viele XR-Controller liefern Up = -Y → invertieren
    tmp.set(0,0,0)
      .addScaledVector(forward, -input.moveAxis.y)
      .addScaledVector(right,   -input.moveAxis.x);

    const speed = 3.5;
    group.position.addScaledVector(tmp, speed * dt);

    // „Mond“-Gravitation + Sprung
    const GRAV = -4.2;
    if (input.jumpPressed) {
      const ray = new THREE.Raycaster();
      const origin = new THREE.Vector3(group.position.x, group.position.y + 0.1, group.position.z);
      ray.set(origin, down);
      const hits = ray.intersectObjects(walkableMeshes, false);
      if (hits.length && (origin.y - hits[0].point.y) <= 0.2) {
        vel.y = 6.0;
      }
    }
    vel.y += GRAV * dt;
    group.position.y += vel.y * dt;

    // Boden-Snap/Clamp
    {
      const ray = new THREE.Raycaster();
      ray.set(new THREE.Vector3(group.position.x, group.position.y + 0.1, group.position.z), down);
      const hits = ray.intersectObjects(walkableMeshes, false);
      if (hits.length) {
        const gY = hits[0].point.y + feetOffset;
        if (group.position.y < gY) {
          group.position.y = gY;
          vel.y = Math.max(0, vel.y);
        }
      }
    }

    // Wände/Objekte (XZ) abstoßen
    if (staticColliders && staticColliders.length) {
      collideXZ(staticColliders);
    }
  }

  function onResize(w, h) {
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }

  // Mündungs-Transform für Combat
  function getMuzzleWorld(outPos = new THREE.Vector3(), outQuat = new THREE.Quaternion()) {
    const m = gun.getObjectByName('muzzle');
    if (!m) return { pos: outPos.set(0,0,0), quat: outQuat.identity() };
    m.getWorldPosition(outPos);
    m.getWorldQuaternion(outQuat);
    return { pos: outPos, quat: outQuat };
  }

  return {
    group, camera,
    controllerLeft: c0, controllerRight: c1, gripLeft: g0, gripRight: g1,
    gun, attachGunTo,
    getMuzzleWorld,
    update, onResize
  };
}
