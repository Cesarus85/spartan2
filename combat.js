// combat.js
import { THREE } from './deps.js';
import { makeEmissiveMaterial } from './utils.js';

export function createCombat(scene, player, staticColliders) {
  const weapons = [
    { 
      name: 'AR', 
      speed: 16, 
      radius: 0.04, 
      color: 0x00ffea, 
      fireRate: 12,
      damage: 25,
      trailLength: 0.8,
      sound: 'ar_fire'
    },
    { 
      name: 'BR', 
      speed: 35, 
      radius: 0.03, 
      color: 0xff6a00, 
      fireRate: 4,
      damage: 45,
      trailLength: 1.2,
      sound: 'br_fire'
    },
    { 
      name: 'Pistol', 
      speed: 22, 
      radius: 0.025, 
      color: 0xffff00, 
      fireRate: 8,
      damage: 35,
      trailLength: 0.5,
      sound: 'pistol_fire'
    },
  ];
  
  let currentWeapon = 0;
  let fireCooldown = 0;

  const bulletPool = [];
  const bullets = [];
  const impactEffects = [];
  const muzzleFlashes = [];

  // Impact Effect Pool
  const impactPool = [];
  function acquireImpactEffect() {
    let effect = impactPool.pop();
    if (!effect) {
      const particles = [];
      for (let i = 0; i < 8; i++) {
        const particle = new THREE.Mesh(
          new THREE.SphereGeometry(0.01, 4, 4),
          makeEmissiveMaterial(0xffaa00, 0.8)
        );
        particles.push(particle);
      }
      effect = { particles, age: 0, maxAge: 0.3 };
    }
    effect.age = 0;
    return effect;
  }

  function releaseImpactEffect(effect) {
    effect.particles.forEach(p => {
      p.removeFromParent();
      p.position.set(0, -999, 0);
    });
    impactPool.push(effect);
  }

  function acquireBullet(radius, color, trailLength) {
    let bullet = bulletPool.pop();
    if (!bullet) {
      // Bullet-Geometrie
      const bulletGeo = new THREE.SphereGeometry(radius, 6, 6);
      const bulletMat = makeEmissiveMaterial(color, 0.8);
      const bulletMesh = new THREE.Mesh(bulletGeo, bulletMat);

      // Trail-Geometrie
      const trailGeo = new THREE.CylinderGeometry(radius * 0.3, radius * 0.1, trailLength, 6);
      const trailMat = new THREE.MeshBasicMaterial({
        color: color,
        transparent: true,
        opacity: 0.6
      });
      const trailMesh = new THREE.Mesh(trailGeo, trailMat);
      trailMesh.position.z = trailLength * 0.5;

      const bulletGroup = new THREE.Group();
      bulletGroup.add(bulletMesh);
      bulletGroup.add(trailMesh);

      bullet = {
        group: bulletGroup,
        mesh: bulletMesh,
        trail: trailMesh,
        velocity: new THREE.Vector3(),
        age: 0,
        maxAge: 8.0
      };
    } else {
      // Update existing bullet properties
      if (bullet.mesh.geometry.parameters.radius !== radius) {
        bullet.mesh.geometry.dispose();
        bullet.mesh.geometry = new THREE.SphereGeometry(radius, 6, 6);
      }
      bullet.mesh.material.emissive.setHex(color);
      bullet.trail.material.color.setHex(color);
      
      // Update trail length
      const currentTrailLength = bullet.trail.geometry.parameters.height;
      if (Math.abs(currentTrailLength - trailLength) > 0.1) {
        bullet.trail.geometry.dispose();
        bullet.trail.geometry = new THREE.CylinderGeometry(radius * 0.3, radius * 0.1, trailLength, 6);
        bullet.trail.position.z = trailLength * 0.5;
      }
    }
    
    bullet.group.visible = true;
    bullet.age = 0;
    return bullet;
  }

  function releaseBullet(bullet) {
    bullet.group.visible = false;
    bullet.group.position.set(0, -999, 0);
    if (bullet.velocity) bullet.velocity.set(0, 0, 0);
    bullet.age = 0;
    bulletPool.push(bullet);
  }

  function createImpactEffect(position, normal, color) {
    const effect = acquireImpactEffect();
    
    effect.particles.forEach((particle, i) => {
      // Random scatter direction influenced by surface normal
      const scatter = new THREE.Vector3(
        (Math.random() - 0.5) * 2,
        (Math.random() - 0.5) * 2,
        (Math.random() - 0.5) * 2
      );
      scatter.add(normal.multiplyScalar(Math.random()));
      scatter.normalize();
      
      particle.position.copy(position);
      particle.position.addScaledVector(scatter, Math.random() * 0.1);
      particle.userData.velocity = scatter.multiplyScalar(2 + Math.random() * 3);
      particle.userData.gravity = -15;
      particle.material.emissive.setHex(color);
      particle.material.emissiveIntensity = 0.8;
      
      scene.add(particle);
    });
    
    impactEffects.push(effect);
  }

  function createMuzzleFlash(position, direction, intensity = 1.0) {
    // Erstes Flash - heller Kern
    const flash1 = new THREE.Mesh(
      new THREE.SphereGeometry(0.05 * intensity, 6, 6),
      makeEmissiveMaterial(0xffaa00, 1.5 * intensity)
    );
    flash1.position.copy(position);
    
    // Zweites Flash - äußerer Ring
    const flash2 = new THREE.Mesh(
      new THREE.SphereGeometry(0.08 * intensity, 6, 6),
      new THREE.MeshBasicMaterial({
        color: 0xff6600,
        transparent: true,
        opacity: 0.7 * intensity
      })
    );
    flash2.position.copy(position);
    
    scene.add(flash1);
    scene.add(flash2);
    
    const flashEffect = {
      flash1,
      flash2,
      age: 0,
      maxAge: 0.08 // Sehr kurz
    };
    
    muzzleFlashes.push(flashEffect);
    
    // Auch den Player-Waffen-Flash triggern
    player.showMuzzleFlash();
  }

  function cycleWeapon() {
    const oldWeapon = weapons[currentWeapon].name;
    currentWeapon = (currentWeapon + 1) % weapons.length;
    const newWeapon = weapons[currentWeapon].name;
    
    // Update player weapon model
    player.switchWeapon(newWeapon);
    
    console.log(`Weapon switched: ${oldWeapon} → ${newWeapon}`);
  }

  function update(dt, input, settings) {
    fireCooldown = Math.max(0, fireCooldown - dt);

    if (input.fireHeld && fireCooldown === 0) {
      const w = weapons[currentWeapon];
      fireCooldown = 1 / w.fireRate;

      const ctrl = (settings.weaponHand === 'left') ? player.controllerLeft : player.controllerRight;
      const bullet = acquireBullet(w.radius, w.color, w.trailLength);
      const origin = ctrl.getWorldPosition(new THREE.Vector3());
      const quat = ctrl.getWorldQuaternion(new THREE.Quaternion());
      
      bullet.group.position.copy(origin);
      bullet.group.quaternion.copy(quat);

      const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(quat).normalize();
      bullet.velocity = dir.multiplyScalar(w.speed);
      
      // Trail richtig ausrichten
      bullet.trail.lookAt(bullet.group.position.clone().add(dir));
      bullet.trail.rotateX(Math.PI / 2);
      
      scene.add(bullet.group);
      bullets.push(bullet);

      // Muzzle Flash
      createMuzzleFlash(origin, dir, w.name === 'BR' ? 1.3 : 1.0);
    }

    // Update bullets
    const staticObjs = staticColliders.map(e => e.obj);
    for (let i = bullets.length - 1; i >= 0; i--) {
      const bullet = bullets[i];
      const old = bullet.group.position.clone();
      bullet.group.position.addScaledVector(bullet.velocity, dt);
      bullet.age += dt;

      // Trail-Update für bessere Optik
      const trailDir = bullet.velocity.clone().normalize();
      bullet.trail.lookAt(bullet.group.position.clone().add(trailDir));
      bullet.trail.rotateX(Math.PI / 2);

      // Collision detection
      const ray = new THREE.Raycaster(old, bullet.velocity.clone().normalize());
      const dist = bullet.velocity.length() * dt;
      ray.far = dist;
      const hits = ray.intersectObjects(staticObjs);
      
      let shouldRemove = false;
      
      if (hits.length > 0) {
        const hit = hits[0];
        // Impact effect at hit point
        createImpactEffect(
          hit.point, 
          hit.face ? hit.face.normal : new THREE.Vector3(0, 1, 0),
          weapons[currentWeapon].color
        );
        shouldRemove = true;
      }
      
      // Remove bullet if too old or too far
      if (bullet.age > bullet.maxAge || bullet.group.position.length() > 150) {
        shouldRemove = true;
      }
      
      if (shouldRemove) {
        scene.remove(bullet.group);
        releaseBullet(bullet);
        bullets.splice(i, 1);
      }
    }

    // Update impact effects
    for (let i = impactEffects.length - 1; i >= 0; i--) {
      const effect = impactEffects[i];
      effect.age += dt;
      
      const progress = effect.age / effect.maxAge;
      
      effect.particles.forEach(particle => {
        if (particle.userData.velocity) {
          particle.position.addScaledVector(particle.userData.velocity, dt);
          particle.userData.velocity.y += particle.userData.gravity * dt;
          
          // Fade out
          particle.material.emissiveIntensity = (1 - progress) * 0.8;
          particle.scale.setScalar(1 - progress * 0.5);
        }
      });
      
      if (effect.age >= effect.maxAge) {
        releaseImpactEffect(effect);
        impactEffects.splice(i, 1);
      }
    }

    // Update muzzle flashes
    for (let i = muzzleFlashes.length - 1; i >= 0; i--) {
      const flash = muzzleFlashes[i];
      flash.age += dt;
      
      const progress = flash.age / flash.maxAge;
      const fadeOut = 1 - progress;
      
      // Schnelles Fade-out
      flash.flash1.material.emissiveIntensity = fadeOut * 1.5;
      flash.flash1.scale.setScalar(1 + progress * 0.5);
      
      flash.flash2.material.opacity = fadeOut * 0.7;
      flash.flash2.scale.setScalar(1 + progress * 0.8);
      
      if (flash.age >= flash.maxAge) {
        scene.remove(flash.flash1);
        scene.remove(flash.flash2);
        muzzleFlashes.splice(i, 1);
      }
    }
  }

  return {
    update,
    cycleWeapon,
    get currentWeapon() { return currentWeapon; },
    get currentWeaponName() { return weapons[currentWeapon].name; },
    get weaponInfo() { return weapons[currentWeapon]; }
  };
}