// combat.js
import { THREE } from './deps.js';

/**
 * Combat system with simple bullet pooling. Bullets now spawn
 * from the player's gun 'muzzle' transform (see player.getMuzzleWorld()).
 */
export function createCombat(scene, player, staticColliders) {
  const weapons = [
    { name: 'AR', speed: 16, radius: 0.04, color: 0x00ffea, fireRate: 10 },
    { name: 'BR', speed: 28, radius: 0.03, color: 0xff6a00, fireRate: 5  },
  ];
  let currentWeapon = 0;
  let fireCooldown = 0;

  const bulletPool = [];
  const bullets = [];

  function acquireBullet(radius, color) {
    let m = bulletPool.pop();
    if (!m) {
      m = new THREE.Mesh(
        new THREE.SphereGeometry(1, 10, 10),
        new THREE.MeshBasicMaterial({ color })
      );
      m.userData.vel = new THREE.Vector3();
      m.geometry.computeBoundingSphere();
    }
    m.scale.setScalar(radius);
    m.material.color.setHex(color);
    m.userData.radius = radius;
    return m;
  }

  function releaseBullet(m) {
    bulletPool.push(m);
  }

  function cycleWeapon(dir = 1) {
    currentWeapon = (currentWeapon + dir + weapons.length) % weapons.length;
  }

  const ray = new THREE.Raycaster();
  const tmp = new THREE.Vector3();
  const q = new THREE.Quaternion();

  function tryFire(dt, input) {
    const w = weapons[currentWeapon];
    fireCooldown -= dt;
    if (!input.fireHeld || fireCooldown > 0) return;

    // get muzzle transform
    const { pos, quat } = player.getMuzzleWorld(tmp, q);
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(quat).normalize();

    const b = acquireBullet(w.radius, w.color);
    b.position.copy(pos);
    b.userData.vel.copy(forward).multiplyScalar(w.speed);
    scene.add(b);
    bullets.push(b);

    fireCooldown = 1 / w.fireRate;
  }

  // naive bullet vs static colliders check; delete on hit or after distance
  function moveAndCollideBullets(dt) {
    for (let i = bullets.length - 1; i >= 0; i--) {
      const b = bullets[i];
      b.position.addScaledVector(b.userData.vel, dt);

      // ray ahead for hit
      const ahead = tmp.copy(b.userData.vel).normalize().multiplyScalar(b.userData.radius * 1.5);
      ray.set(b.position, ahead.normalize());
      let hit = false;
      for (let j = 0; j < staticColliders.length && !hit; j++) {
        const box = staticColliders[j];
        // simple sphere vs box
        if (box.containsPoint(b.position)) {
          hit = true; break;
        }
      }
      if (hit || b.position.length() > 150) {
        scene.remove(b);
        releaseBullet(b);
        bullets.splice(i, 1);
      }
    }
  }

  function update(dt, input /*, settings*/) {
    tryFire(dt, input);
    moveAndCollideBullets(dt);
  }

  return {
    update,
    cycleWeapon,
    get currentWeapon() { return currentWeapon; }
  };
}
