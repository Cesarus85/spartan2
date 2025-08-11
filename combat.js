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
    // Fire
    fireCooldown = Math.max(0, fireCooldown - dt);
    if (input.fireHeld && fireCooldown === 0) {
      const w = weapons[currentWeapon];
      fireCooldown = 1 / w.fireRate;

      // NEU: Controller über handedness-Mapping holen
      const ctrl = player.getController(settings.weaponHand);

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
      b.position.add(b.velocity.clone().multiplyScalar(dt));

      // einfacher Kollisionscheck mit Szenengeometrie
      const ray = new THREE.Raycaster(b.position.clone().sub(b.velocity.clone().multiplyScalar(dt)), b.velocity.clone().normalize());
      ray.far = b.velocity.length() * dt + 0.05;
      const hits = ray.intersectObjects(staticObjs, true);
      if (hits.length) {
        scene.remove(b);
        releaseBullet(b);
        bullets.splice(i, 1);
      }
    }
  }

  return { update, cycleWeapon };
}
