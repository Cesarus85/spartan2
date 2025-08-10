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
        new THREE.SphereGeometry(radius, 8, 8),
        new THREE.MeshBasicMaterial({ color })
      );
    } else {
      if (!m.geometry.parameters || m.geometry.parameters.radius !== radius) {
        m.geometry.dispose();
        m.geometry = new THREE.SphereGeometry(radius, 8, 8);
      }
      m.material.color.setHex(color);
    }
    m.visible = true;
    return m;
  }
  function releaseBullet(m) {
    m.visible = false;
    m.position.set(0, -999, 0);
    if (m.velocity) m.velocity.set(0, 0, 0);
    bulletPool.push(m);
  }

  function cycleWeapon() {
    currentWeapon = (currentWeapon + 1) % weapons.length;
  }

  function update(dt, input, settings) {
    fireCooldown = Math.max(0, fireCooldown - dt);

    if (input.fireHeld && fireCooldown === 0) {
      const w = weapons[currentWeapon];
      fireCooldown = 1 / w.fireRate;

      const ctrl = (settings.weaponHand === 'left') ? player.controllerLeft : player.controllerRight;
      const bullet = acquireBullet(w.radius, w.color);
      const origin = ctrl.getWorldPosition(new THREE.Vector3());
      const quat   = ctrl.getWorldQuaternion(new THREE.Quaternion());
      bullet.position.copy(origin);
      bullet.quaternion.copy(quat);

      const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(quat).normalize();
      bullet.velocity = dir.multiplyScalar(w.speed);
      scene.add(bullet);
      bullets.push(bullet);
    }

    const staticObjs = staticColliders.map(e => e.obj);
    for (let i = bullets.length - 1; i >= 0; i--) {
      const b = bullets[i];
      const old = b.position.clone();
      b.position.addScaledVector(b.velocity, dt);

      const ray = new THREE.Raycaster(old, b.velocity.clone().normalize());
      const dist = b.velocity.length() * dt;
      ray.far = dist;
      const hits = ray.intersectObjects(staticObjs);
      if (hits.length || b.position.length() > 150) {
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
