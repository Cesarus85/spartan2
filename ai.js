// ai.js
import { THREE } from './deps.js';
import { makeVariedStandardMaterial, randBetween } from './utils.js';

export function createAIManager(scene, player, staticColliders, walkableMeshes) {
  const enemies = [];
  const bullets = [];
  const bulletPool = [];

  // Tunables (sehr Quest-freundlich)
  const DETECT_RANGE = 12;      // wann Player gesehen wird
  const FIRE_RANGE   = 7;       // wann geschossen wird
  const MOVE_SPEED   = 2.6;     // Patrouille/Chase Speed
  const JUMP_GRAV    = -9.8 * 0.45;
  const ENEMY_H      = 1.5;     // "Kapselhöhe"
  const ENEMY_R      = 0.45;

  // Gegner-Projektil
  const ENEMY_BULLET_SPEED = 12;
  const ENEMY_FIRE_RATE    = 1.8; // Schüsse/Sekunde
  const ENEMY_BULLET_COLOR = 0xff3b3b;
  const PROBE              = 0.22;

  const downRay = new THREE.Raycaster();
  const downDir = new THREE.Vector3(0,-1,0);
  const tmpV    = new THREE.Vector3();
  const playerPos = new THREE.Vector3();

  function spawnEnemy(x, z) {
    const body = new THREE.Mesh(
      new THREE.CapsuleGeometry(ENEMY_R, ENEMY_H - ENEMY_R*2, 4, 8),
      makeVariedStandardMaterial(0x4a6a9b)
    );
    body.position.set(x, 3.25 + 1.6, z);  // kommt runter, Bodenfang kümmert sich
    scene.add(body);

    const state = {
      node: body,
      vel: new THREE.Vector3(),
      vy: 0,
      grounded: false,
      coyote: 0,
      target: pickPatrolPoint(),
      fsm: 'patrol',
      fireCooldown: 0
    };
    enemies.push(state);
  }

  function pickPatrolPoint() {
    return new THREE.Vector3(randBetween(-8,8), 0, randBetween(-8,8));
  }

  function landIfGroundClose(pos) {
    downRay.set(new THREE.Vector3(pos.x, pos.y + 0.2, pos.z), downDir);
    const hits = downRay.intersectObjects(walkableMeshes, true);
    if (!hits.length) return false;
    const hit = hits[0];
    if (hit.distance <= (0.2 + PROBE)) {
      pos.y = pos.y + 0.2 - hit.distance;
      return true;
    }
    return false;
  }

  function horizontalPush(pos, prevPos) {
    // Simple „schieb dich weg“ von Boxen (XZ)
    for (const { box } of staticColliders) {
      const minY = pos.y, maxY = pos.y + ENEMY_H;
      const pBox = {
        minX: pos.x - ENEMY_R, maxX: pos.x + ENEMY_R,
        minZ: pos.z - ENEMY_R, maxZ: pos.z + ENEMY_R,
        minY, maxY
      };
      const inter =
        pBox.maxX > box.min.x && pBox.minX < box.max.x &&
        pBox.maxZ > box.min.z && pBox.minZ < box.max.z &&
        pBox.maxY > box.min.y && pBox.minY < box.max.y;

      if (inter) {
        // zurück zum letzten, dann leicht seitlich weg
        const awayX = (pos.x - (box.min.x + box.max.x)/2);
        const awayZ = (pos.z - (box.min.z + box.max.z)/2);
        const len = Math.hypot(awayX, awayZ) || 1;
        pos.x = prevPos.x + (awayX / len) * 0.06;
        pos.z = prevPos.z + (awayZ / len) * 0.06;
      }
    }
  }

  function losToPlayer(enemyPos) {
    // einfacher LOS-Test: Ray zum Spieler, stoppt an nächstem Collider
    player.group.getWorldPosition(playerPos);
    const dir = playerPos.clone().sub(enemyPos);
    const dist = dir.length();
    dir.normalize();
    const ray = new THREE.Raycaster(enemyPos, dir, 0, dist);
    const hit = ray.intersectObjects(staticColliders.map(e=>e.obj), true)[0];
    if (hit) return false;
    return true;
  }

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
    if (m.velocity) m.velocity.set(0,0,0);
    bulletPool.push(m);
  }

  function enemyShoot(e) {
    // Ursprung: leicht unterhalb Augenhöhe
    const muzzle = e.node.getWorldPosition(new THREE.Vector3());
    muzzle.y += ENEMY_H * 0.45;

    player.group.getWorldPosition(playerPos);
    const dir = playerPos.clone().sub(muzzle).normalize();

    const b = acquireBullet(0.035, ENEMY_BULLET_COLOR);
    b.position.copy(muzzle);
    b.velocity = dir.multiplyScalar(ENEMY_BULLET_SPEED);
    scene.add(b);
    bullets.push(b);
  }

  // Spawn 2–3 Gegner (du kannst erhöhen)
  for (let i=0;i<3;i++) spawnEnemy(randBetween(-6,6), randBetween(-6,6));

  function update(dt) {
    // Enemies
    for (const e of enemies) {
      // Cooldowns
      e.fireCooldown = Math.max(0, e.fireCooldown - dt);

      // FSM
      const myPos = e.node.position.clone();
      player.group.getWorldPosition(playerPos);
      const distToPlayer = myPos.clone().sub(playerPos).length();

      switch (e.fsm) {
        case 'patrol': {
          // Ziel erreichen → neues Ziel
          const toTarget = e.target.clone().sub(myPos); toTarget.y = 0;
          if (toTarget.length() < 0.5) e.target = pickPatrolPoint();

          // Richtung & Bewegung
          toTarget.normalize();
          e.vel.x = toTarget.x * MOVE_SPEED;
          e.vel.z = toTarget.z * MOVE_SPEED;

          // Sicht?
          if (distToPlayer <= DETECT_RANGE && losToPlayer(myPos)) e.fsm = 'chase';
          break;
        }
        case 'chase': {
          const toP = playerPos.clone().sub(myPos); toP.y = 0;
          const d = toP.length();
          toP.normalize();
          e.vel.x = toP.x * MOVE_SPEED;
          e.vel.z = toP.z * MOVE_SPEED;

          if (d <= FIRE_RANGE && losToPlayer(myPos)) e.fsm = 'shoot';
          else if (d > DETECT_RANGE * 1.4) e.fsm = 'patrol';
          break;
        }
        case 'shoot': {
          const toP = playerPos.clone().sub(myPos); toP.y = 0;
          const d = toP.length();

          // leicht „in Position“ bleiben
          if (d > FIRE_RANGE * 1.15) {
            toP.normalize();
            e.vel.x = toP.x * (MOVE_SPEED * 0.65);
            e.vel.z = toP.z * (MOVE_SPEED * 0.65);
          } else {
            e.vel.set(0,0,0);
          }

          if (!losToPlayer(myPos)) e.fsm = (d < DETECT_RANGE ? 'chase' : 'patrol');
          else if (e.fireCooldown === 0) {
            e.fireCooldown = 1 / ENEMY_FIRE_RATE;
            enemyShoot(e);
          }
          if (d > DETECT_RANGE * 1.5) e.fsm = 'patrol';
          break;
        }
      }

      // Gravitation
      e.vy += JUMP_GRAV * dt;

      // Bewegung vorschlagen
      const newPos = e.node.position.clone();
      const prevPos = e.node.position.clone();
      newPos.x += e.vel.x * dt;
      newPos.z += e.vel.z * dt;
      newPos.y += e.vy * dt;

      // horizontale Kollisionen: „wegschieben“
      horizontalPush(newPos, prevPos);

      // Bodenfang
      const landed = landIfGroundClose(newPos);
      if (landed) { e.vy = 0; e.grounded = true; }
      else { e.grounded = false; }

      e.node.position.copy(newPos);
      // Blick grob Richtung Bewegung/Spieler
      tmpV.copy(playerPos).sub(newPos); tmpV.y = 0;
      if (tmpV.lengthSq() > 0.001) e.node.lookAt(newPos.clone().add(tmpV));
    }

    // Enemy bullets
    for (let i = bullets.length - 1; i >= 0; i--) {
      const b = bullets[i];
      const old = b.position.clone();
      b.position.addScaledVector(b.velocity, dt);

      const ray = new THREE.Raycaster(old, b.velocity.clone().normalize());
      const dist = b.velocity.length() * dt;
      ray.far = dist;

      // trifft Geometrie?
      const hit = ray.intersectObjects(staticColliders.map(e=>e.obj), true)[0];
      // (Optional: Player-Hitcheck könntest du hier ergänzen)
      if (hit || b.position.length() > 150) {
        scene.remove(b);
        releaseBullet(b);
        bullets.splice(i,1);
      }
    }
  }

  return {
    enemies,
    update
  };
}
