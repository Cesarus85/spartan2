// combat.js
import { THREE } from './deps.js';

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
        new THREE.SphereGeometry(1, 8, 8),
        new THREE.MeshBasicMaterial({ color })
      );
    }
    m.scale.setScalar(radius);
    m.material.color.setHex(color);
    return m;
  }
  function releaseBullet(m) { bulletPool.push(m); }

  function cycleWeapon() {
    currentWeapon = (currentWeapon + 1) % weapons.length;
  }

  function fire() {
    const w = weapons[currentWeapon];

    // spawn at gun muzzle world pose (fallback to camera)
    const { pos, rot } = player.getMuzzlePose(new THREE.Vector3(), new THREE.Quaternion());

    // forward from muzzle
    const dir = new THREE.Vector3(0,0,-1).applyQuaternion(rot).normalize();

    const b = acquireBullet(w.radius, w.color);
    b.position.copy(pos);
    b.userData.vel = dir.multiplyScalar(w.speed);
    scene.add(b);
    bullets.push(b);

    fireCooldown = 1.0 / w.fireRate;
  }

  function update(dt, input, settings) {
    fireCooldown = Math.max(0, fireCooldown - dt);

    if (input.fireHeld && fireCooldown <= 0) {
      fire();
    }

    // advance bullets
    for (let i = bullets.length - 1; i >= 0; i--) {
      const b = bullets[i];
      b.position.addScaledVector(b.userData.vel, dt);

      // collision vs static colliders (AABB expand by bullet radius)
      let hit = false;
      for (let j = 0; j < staticColliders.length; j++) {
        const { box } = staticColliders[j];
        if (b.position.x >= box.min.x - 0.05 && b.position.x <= box.max.x + 0.05 &&
            b.position.y >= box.min.y - 0.05 && b.position.y <= box.max.y + 0.05 &&
            b.position.z >= box.min.z - 0.05 && b.position.z <= box.max.z + 0.05) {
          hit = true; break;
        }
      }
      if (hit || b.position.length() > 300) {
        scene.remove(b);
        releaseBullet(b);
        bullets.splice(i, 1);
      }
    }
  }

  return {
    update,
    cycleWeapon,
    get currentWeapon() { return currentWeapon; }
  };
}
