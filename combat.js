// combat.js
import { THREE } from './deps.js';

export function createCombat(scene, player, staticColliders) {
  // Waffen-Setups
  const weapons = [
    { name: 'AR', speed: 16, radius: 0.04, color: 0x00ffea, fireRate: 10 },
    { name: 'BR', speed: 28, radius: 0.03, color: 0xff6a00, fireRate: 5  },
  ];
  let currentWeapon = 0;
  let fireCooldown = 0;

  // --- Mündungs-Offset (lokal im Gun-Space) ---------------------------------
  // leichte Absenkung + nach vorne (Z negativ in Three.js-Konvention)
  // Feinjustage je nach Gun-Position/Skalierung möglich
  const MUZZLE_LOCAL = new THREE.Vector3(0, -0.03, -0.28);
  // optional: minimaler Vorversatz, um Selbstkollisionen/Flackern zu vermeiden
  const SPAWN_EPS = 0.02;

  // ---------------------------------------------------------------------------
  // Bullet-Pool
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
      // Geometrie ggf. anpassen
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
    // Feuerrate handhaben
    fireCooldown = Math.max(0, fireCooldown - dt);

    if (input.fireHeld && fireCooldown === 0) {
      const w = weapons[currentWeapon];
      fireCooldown = 1 / w.fireRate;

      // Aktiver Controller gemäß Settings (handedness)
      const ctrl = player.getController(settings.weaponHand);

      // --- Mündung im Waffenspace bestimmen ---------------------------------
      // Wichtig: Wir nutzen *player.gun* (am Controller angeheftet)
      const gun = player.gun;

      // Falls die Gun temporär noch nicht an der gewünschten Hand hängt,
      // fallback auf Controller-Mitte (sollte praktisch nicht mehr vorkommen)
      let origin, quat;
      if (gun && gun.parent) {
        // Weltposition der Mündung
        origin = gun.localToWorld(MUZZLE_LOCAL.clone());

        // Weltrotation der Gun → Flugrichtung vorne (-Z)
        quat = gun.getWorldQuaternion(new THREE.Quaternion());
      } else {
        // Fallback: Controller-Transform
        origin = ctrl.getWorldPosition(new THREE.Vector3());
        quat   = ctrl.getWorldQuaternion(new THREE.Quaternion());
      }

      // Richtung aus Weltrotation ableiten
      const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(quat).normalize();

      // Projektil erzeugen
      const bullet = acquireBullet(w.radius, w.color);

      // Leichter Vorversatz entlang der Richtung, um Clipping zu vermeiden
      const spawnPos = origin.clone().addScaledVector(dir, SPAWN_EPS);

      bullet.position.copy(spawnPos);
      bullet.quaternion.copy(quat);
      bullet.velocity = dir.multiplyScalar(w.speed);

      scene.add(bullet);
      bullets.push(bullet);
    }

    // --- Bewegung + sehr einfacher Kollisionscheck via Ray ------------------------------------------------
    const staticObjs = staticColliders.map(e => e.obj);

    for (let i = bullets.length - 1; i >= 0; i--) {
      const b = bullets[i];

      // Integrationsschritt
      const step = b.velocity.clone().multiplyScalar(dt);
      const from = b.position.clone();
      const to   = b.position.clone().add(step);

      // Raycast entlang des Bewegungsvektors
      const rayDir = step.lengthSq() > 0 ? step.clone().normalize() : new THREE.Vector3(0,0,1);
      const ray = new THREE.Raycaster(from, rayDir);
      ray.far = step.length() + 0.05;

      const hits = ray.intersectObjects(staticObjs, true);
      if (hits.length) {
        // Treffer: Projektil entfernen und in Pool zurück
        scene.remove(b);
        releaseBullet(b);
        bullets.splice(i, 1);
        continue;
      }

      // Kein Treffer → Position aktualisieren
      b.position.copy(to);

      // Optional: Lebenszeit-/Entfernungs-Clip (einfach halten)
      if (b.position.lengthSq() > 5000) {
        scene.remove(b);
        releaseBullet(b);
        bullets.splice(i, 1);
      }
    }
  }

  return { update, cycleWeapon };
}
