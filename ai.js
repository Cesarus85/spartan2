// ai.js
import { THREE } from './deps.js';
import { makeVariedStandardMaterial, randBetween } from './utils.js';

export function createAIManager(scene, player, staticColliders, walkableMeshes) {
  const enemies = [];
  const bullets = [];
  const bulletPool = [];

  // Map-Bounds (Ground = 20x20 → innen sicher bleiben)
  const BOUNDS_MIN = -9.2, BOUNDS_MAX = 9.2;
  const SAFE_MIN   = -7.0, SAFE_MAX   = 7.0;

  // Tunables
  const DETECT_RANGE = 12;
  const FIRE_RANGE   = 7;
  const MOVE_SPEED   = 2.6;
  const GRAV         = -9.8 * 0.45;

  const ENEMY_H = 1.5;
  const ENEMY_R = 0.45;

  const ENEMY_BULLET_SPEED = 12;
  const ENEMY_FIRE_RATE    = 1.8;
  const ENEMY_BULLET_COLOR = 0xff3b3b;

  const downRay = new THREE.Raycaster();
  const downDir = new THREE.Vector3(0,-1,0);
  const tmpV    = new THREE.Vector3();
  const playerPos = new THREE.Vector3();

  function pickPatrolPoint() {
    return new THREE.Vector3(randBetween(SAFE_MIN, SAFE_MAX), 0, randBetween(SAFE_MIN, SAFE_MAX));
  }

  function groundYAt(x, yStart, z) {
    // Ray nach unten: wir setzen far hoch, damit wir „weit oben“ starten können
    downRay.set(new THREE.Vector3(x, yStart, z), downDir);
    downRay.far = 100; // sicher
    const hits = downRay.intersectObjects(walkableMeshes, true);
    if (!hits.length) return null;
    return hits[0].point.y;
  }

  function spawnEnemyInSafeArea() {
    // Position im sicheren Bereich wählen
    const x = randBetween(SAFE_MIN, SAFE_MAX);
    const z = randBetween(SAFE_MIN, SAFE_MAX);
    // Bodenhöhe ermitteln
    const gy = groundYAt(x, 20, z);
    const y  = (gy !== null ? gy : 0) + 0.05; // minimal über Boden
    const body = new THREE.Mesh(
      new THREE.CapsuleGeometry(ENEMY_R, ENEMY_H - ENEMY_R*2, 4, 8),
      makeVariedStandardMaterial(0x4a6a9b)
    );
    body.position.set(x, y, z);
    scene.add(body);

    enemies.push({
      node: body,
      vel: new THREE.Vector3(),
      vy: 0,
      grounded: true,
      target: pickPatrolPoint(),
      fsm: 'patrol',
      fireCooldown: 0
    });
  }

  // LOS zum Spieler (Collider stoppen Sicht)
  function losToPlayer(origin) {
    player.group.getWorldPosition(playerPos);
    const dir = playerPos.clone().sub(origin);
    const dist = dir.length();
    dir.normalize();
    const ray = new THREE.Raycaster(origin, dir, 0, dist);
    const hit = ray.intersectObjects(staticColliders.map(e=>e.obj), true)[0];
    return !hit;
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
    const muzzle = e.node.getWorldPosition(new THREE.Vector3());
    muzzle.y += ENEMY_H * 0.45; // „Kopfhöhe“
    player.group.getWorldPosition(playerPos);
    const dir = playerPos.clone().sub(muzzle).normalize();
    const b = acquireBullet(0.035, ENEMY_BULLET_COLOR);
    b.position.copy(muzzle);
    b.velocity = dir.multiplyScalar(ENEMY_BULLET_SPEED);
    scene.add(b);
    bullets.push(b);
  }

  // Spawn 3 Gegner
  for (let i=0;i<3;i++) spawnEnemyInSafeArea();

  function clampInsideBounds(pos) {
    // Soft clamp + kleiner Rückstoß wenn zu nah am Rand
    const margin = 0.3;
    if (pos.x < BOUNDS_MIN + margin) pos.x = BOUNDS_MIN + margin;
    if (pos.x > BOUNDS_MAX - margin) pos.x = BOUNDS_MAX - margin;
    if (pos.z < BOUNDS_MIN + margin) pos.z = BOUNDS_MIN + margin;
    if (pos.z > BOUNDS_MAX - margin) pos.z = BOUNDS_MAX - margin;
  }

  function sweptGroundResolve(e, dt) {
    // Wenn nach unten unterwegs, ray.far = Fallweg + Puffer → verhindert „durch Boden tunneln“
    if (e.vy <= 0) {
      const start = e.node.position.clone().add(new THREE.Vector3(0, 0.2, 0));
      const fallDist = Math.abs(e.vy * dt) + 0.5;
      downRay.set(start, downDir);
      downRay.far = fallDist;
      const hits = downRay.intersectObjects(walkableMeshes, true);
      if (hits.length) {
        const hit = hits[0];
        // Aufsetzen
        e.node.position.y = start.y - hit.distance;
        e.vy = 0;
        e.grounded = true;
        return true;
      }
    }
    return false;
  }

  function update(dt) {
    // Enemies
    for (const e of enemies) {
      e.fireCooldown = Math.max(0, e.fireCooldown - dt);

      const myPos = e.node.position.clone();
      player.group.getWorldPosition(playerPos);
      const distToPlayer = myPos.distanceTo(playerPos);

      // FSM
      switch (e.fsm) {
        case 'patrol': {
          const toTarget = e.target.clone().sub(myPos); toTarget.y = 0;
          if (toTarget.length() < 0.5) e.target = pickPatrolPoint();
          toTarget.normalize();
          e.vel.x = toTarget.x * MOVE_SPEED;
          e.vel.z = toTarget.z * MOVE_SPEED;

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

      // Grav
      e.vy += GRAV * dt;

      // Vorschlag neue Pos
      const newPos = e.node.position.clone();
      newPos.x += e.vel.x * dt;
      newPos.z += e.vel.z * dt;
      newPos.y += e.vy * dt;

      // Ränder soft clampen
      clampInsideBounds(newPos);

      // Boden-Korrektur (swept)
      const landed = sweptGroundResolve(e, dt);
      if (!landed) {
        // wenn nicht gelandet, setze Position mit aktueller vy
        e.node.position.copy(newPos);
      } else {
        // schon gelandet → aus horizontalem Vorschlag nur XZ übernehmen
        e.node.position.x = newPos.x;
        e.node.position.z = newPos.z;
      }

      // Blick Richtung Spieler
      tmpV.copy(playerPos).sub(e.node.position); tmpV.y = 0;
      if (tmpV.lengthSq() > 0.001) e.node.lookAt(e.node.position.clone().add(tmpV));
    }

    // Enemy Bullets
    for (let i = bullets.length - 1; i >= 0; i--) {
      const b = bullets[i];
      const old = b.position.clone();
      b.position.addScaledVector(b.velocity, dt);

      const ray = new THREE.Raycaster(old, b.velocity.clone().normalize());
      ray.far = b.velocity.length() * dt;
      const hit = ray.intersectObjects(staticColliders.map(e=>e.obj), true)[0];
      if (hit || b.position.length() > 150) {
        scene.remove(b);
        releaseBullet(b);
        bullets.splice(i,1);
      }
    }
  }

  return { enemies, update };
}
