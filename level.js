// level.js
import { THREE } from './deps.js';
import { 
  makeVariedStandardMaterial, 
  makeMetallicMaterial, 
  makeEmissiveMaterial,
  createDetailedGeometry,
  createComplexGround,
  addVertexColors,
  randBetween, 
  randChoice,
  createParticleSystem
} from './utils.js';

export const FOG = {
  COLOR: 0x87CEEB,
  NEAR: 12,
  FAR: 45,
};

export function buildLevel(scene) {
  const staticColliders = [];
  const walkableMeshes  = [];

  const addStaticCollider = (obj) => {
    const box = new THREE.Box3().setFromObject(obj);
    staticColliders.push({ obj, box });
  };
  const addWalkable = (obj) => walkableMeshes.push(obj);

  // Enhanced Ground with vertex colors
  const groundGeo = createComplexGround(25, 25, 0.8);
  addVertexColors(groundGeo, (pos) => {
    // Gradient basierend auf Höhe und Position
    const height = pos.y;
    const distance = Math.sqrt(pos.x * pos.x + pos.z * pos.z);
    
    let baseColor = new THREE.Color(0x8B4513); // Braun
    
    // Höhenbasierte Färbung
    if (height > 0.3) {
      baseColor.lerp(new THREE.Color(0x228B22), 0.6); // Grün für erhöhte Bereiche
    } else if (height < -0.2) {
      baseColor.lerp(new THREE.Color(0x654321), 0.4); // Dunkler für Vertiefungen
    }
    
    // Zentrumsbereich anders färben
    if (distance < 8) {
      baseColor.lerp(new THREE.Color(0x696969), 0.3); // Grauer für Kampfbereich
    }
    
    return baseColor;
  });

  const groundMat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.9,
    metalness: 0.1
  });
  groundMat.side = THREE.DoubleSide;
  
  const ground = new THREE.Mesh(groundGeo, groundMat);
  scene.add(ground);
  addStaticCollider(ground);
  addWalkable(ground);

  // Enhanced Fortress with more details
  const fortressGroup = new THREE.Group();
  
  // Materialien für verschiedene Fortress-Teile
  const wallMaterial = makeVariedStandardMaterial(0x2F2F2F, { 
    roughnessRange: 0.4, 
    metalnessRange: 0.2,
    luminanceRange: 0.2
  });
  const metalMaterial = makeMetallicMaterial(0x555555);
  const accentMaterial = makeEmissiveMaterial(0x0066CC, 0.3);

  // Hauptwände mit mehr Details
  const wall1Left = new THREE.Mesh(
    createDetailedGeometry('barrier', { width: 1.5, height: 3, depth: 0.5 }), 
    wallMaterial.clone()
  );
  wall1Left.position.set(-1.75, 1.5, 2.5);
  fortressGroup.add(wall1Left); addStaticCollider(wall1Left);

  const wall1Right = new THREE.Mesh(
    createDetailedGeometry('barrier', { width: 1.5, height: 3, depth: 0.5 }), 
    wallMaterial.clone()
  );
  wall1Right.position.set(1.75, 1.5, 2.5);
  fortressGroup.add(wall1Right); addStaticCollider(wall1Right);

  // Metallischer Türsturz
  const lintel = new THREE.Mesh(
    new THREE.BoxGeometry(2.2, 0.4, 0.6), 
    metalMaterial.clone()
  );
  lintel.position.set(0, 2.8, 2.5);
  fortressGroup.add(lintel); addStaticCollider(lintel);

  // Verstärkte Rückwand mit Akzenten
  const wallBack = new THREE.Mesh(
    createDetailedGeometry('barrier', { width: 5, height: 3, depth: 0.5 }), 
    wallMaterial.clone()
  );
  wallBack.position.set(0, 1.5, -2.5);
  fortressGroup.add(wallBack); addStaticCollider(wallBack);

  // Akzent-Streifen an der Rückwand
  const backAccent = new THREE.Mesh(
    new THREE.BoxGeometry(4.8, 0.2, 0.1),
    accentMaterial.clone()
  );
  backAccent.position.set(0, 2.5, -2.45);
  fortressGroup.add(backAccent);

  // Seitenwände
  const wallLeft = new THREE.Mesh(
    createDetailedGeometry('barrier', { width: 0.5, height: 3, depth: 5 }), 
    wallMaterial.clone()
  );
  wallLeft.position.set(2.5, 1.5, 0);
  fortressGroup.add(wallLeft); addStaticCollider(wallLeft);

  const wallRight = new THREE.Mesh(
    createDetailedGeometry('barrier', { width: 0.5, height: 3, depth: 5 }), 
    wallMaterial.clone()
  );
  wallRight.position.set(-2.5, 1.5, 0);
  fortressGroup.add(wallRight); addStaticCollider(wallRight);

  // Dach mit metallischen Details
  const roof = new THREE.Mesh(
    createDetailedGeometry('platform', { width: 5, height: 0.5, depth: 5 }), 
    metalMaterial.clone()
  );
  roof.position.set(0, 3.25, 0);
  fortressGroup.add(roof); addStaticCollider(roof); addWalkable(roof);

  // Dach-Akzente
  for (let i = 0; i < 4; i++) {
    const roofLight = new THREE.Mesh(
      new THREE.BoxGeometry(0.3, 0.1, 0.3),
      accentMaterial.clone()
    );
    const angle = (i / 4) * Math.PI * 2;
    roofLight.position.set(
      Math.cos(angle) * 1.8,
      3.55,
      Math.sin(angle) * 1.8
    );
    fortressGroup.add(roofLight);
  }

  // Verbesserter Innenboden
  const interiorMat = makeVariedStandardMaterial(0x7A3E12, {
    roughnessRange: 0.3,
    metalnessRange: 0.15
  });
  const interiorFloor = new THREE.Mesh(
    createDetailedGeometry('platform', { width: 4, height: 0.1, depth: 4 }), 
    interiorMat
  );
  interiorFloor.position.set(0, 0.05, 0);
  fortressGroup.add(interiorFloor); addStaticCollider(interiorFloor); addWalkable(interiorFloor);

  // Säulen in den Ecken der Festung
  for (let x = -1; x <= 1; x += 2) {
    for (let z = -1; z <= 1; z += 2) {
      const pillar = new THREE.Mesh(
        createDetailedGeometry('pillar', { radius: 0.3, height: 3.5, segments: 8 }),
        metalMaterial.clone()
      );
      pillar.position.set(x * 2.2, 1.75, z * 2.2);
      fortressGroup.add(pillar);
      addStaticCollider(pillar);
    }
  }

  scene.add(fortressGroup);

  // No-Spawn-Zones (erweitert)
  const forbiddenZones = [
    new THREE.Box3(new THREE.Vector3(-3.0, 0.0, -3.0), new THREE.Vector3(3.0, 4.5, 3.2)),
    new THREE.Box3(new THREE.Vector3(-1.5, 0.0, 1.0),  new THREE.Vector3(1.5, 3.5, 4.5)),
  ];

  const intersectsForbidden = (box) => forbiddenZones.some(f => box.intersectsBox(f));

  // Vielfältigere Obstacle-Typen
  const obstacleTypes = [
    { type: 'crate', material: 'varied', color: 0xA0522D },
    { type: 'crate', material: 'metallic', color: 0x708090 },
    { type: 'barrier', material: 'varied', color: 0x696969 },
    { type: 'pillar', material: 'metallic', color: 0x2F4F4F },
    { type: 'platform', material: 'varied', color: 0x8B7355 }
  ];

  for (let i = 0; i < 12; i++) {
    const obstacleConfig = randChoice(obstacleTypes);
    
    let geometry, material;
    switch (obstacleConfig.type) {
      case 'crate':
        geometry = createDetailedGeometry('crate', {
          width: randBetween(0.8, 2.5),
          height: randBetween(0.8, 2.8),
          depth: randBetween(0.8, 2.5),
          segments: Math.random() > 0.7 ? 2 : 1
        });
        break;
      case 'barrier':
        geometry = createDetailedGeometry('barrier', {
          width: randBetween(1.5, 3.5),
          height: randBetween(1.2, 2.5),
          depth: randBetween(0.3, 0.8)
        });
        break;
      case 'pillar':
        geometry = createDetailedGeometry('pillar', {
          radius: randBetween(0.4, 0.8),
          height: randBetween(2, 4),
          segments: randChoice([6, 8, 12])
        });
        break;
      case 'platform':
        geometry = createDetailedGeometry('platform', {
          width: randBetween(1.5, 3),
          height: randBetween(0.3, 0.6),
          depth: randBetween(1.5, 3)
        });
        break;
    }

    if (obstacleConfig.material === 'metallic') {
      material = makeMetallicMaterial(obstacleConfig.color);
    } else {
      material = makeVariedStandardMaterial(obstacleConfig.color, {
        roughnessRange: 0.4,
        metalnessRange: 0.2,
        emissiveChance: 0.1,
        emissiveColor: randChoice([0x004400, 0x440000, 0x000044])
      });
    }

    const obstacle = new THREE.Mesh(geometry, material);

    // Berechne Bounding Box korrekt
    geometry.computeBoundingBox();
    const size = geometry.boundingBox;
    const sizeVec = size.getSize(new THREE.Vector3());
    const hx = sizeVec.x / 2;
    const hy = sizeVec.y / 2;
    const hz = sizeVec.z / 2;

    let placed = false;
    for (let a = 0; a < 80 && !placed; a++) {
      const x = randBetween(-12, 12);
      const z = randBetween(-12, 12);
      const y = hy + 0.1; // Leicht über dem Boden
      
      const min = new THREE.Vector3(x - hx, 0, z - hz);
      const max = new THREE.Vector3(x + hx, y + hy, z + hz);
      const candidate = new THREE.Box3(min, max);
      
      if (!intersectsForbidden(candidate)) {
        obstacle.position.set(x, y, z);
        // Zufällige Rotation für mehr Variation
        obstacle.rotation.y = Math.random() * Math.PI * 2;
        placed = true;
      }
    }
    
    if (!placed) {
      obstacle.position.set(
        randBetween(15, 20) * (Math.random() > 0.5 ? 1 : -1), 
        hy, 
        randBetween(15, 20) * (Math.random() > 0.5 ? 1 : -1)
      );
    }
    
    scene.add(obstacle);
    addStaticCollider(obstacle);
    if (obstacleConfig.type === 'platform') {
      addWalkable(obstacle);
    }
  }

  // Atmosphärische Partikel
  const particles = createParticleSystem(200, 0xffffff);
  scene.add(particles);

  // Zusätzliche Beleuchtung mit farbigen Akzenten
  const coloredLights = [
    { color: 0xff4444, intensity: 0.3, position: [-5, 2, -5] },
    { color: 0x4444ff, intensity: 0.3, position: [5, 2, 5] },
    { color: 0x44ff44, intensity: 0.2, position: [0, 4, 8] }
  ];

  const lightHelpers = [];
  coloredLights.forEach(lightConfig => {
    const light = new THREE.PointLight(lightConfig.color, lightConfig.intensity, 12);
    light.position.set(...lightConfig.position);
    scene.add(light);
    
    // Sichtbare Lichtquelle
    const lightGeometry = new THREE.SphereGeometry(0.1, 8, 8);
    const lightMaterial = makeEmissiveMaterial(lightConfig.color, 0.8);
    const lightMesh = new THREE.Mesh(lightGeometry, lightMaterial);
    lightMesh.position.copy(light.position);
    scene.add(lightMesh);
    lightHelpers.push(lightMesh);
  });

  // Sky mit verbessertem Gradient
  const skyGeo = new THREE.SphereGeometry(500, 32, 16);
  addVertexColors(skyGeo, (pos) => {
    const normalizedY = (pos.y + 500) / 1000; // 0 unten, 1 oben
    const skyColor = new THREE.Color(FOG.COLOR);
    const horizonColor = new THREE.Color(0xFFA500); // Orange am Horizont
    
    if (normalizedY < 0.3) {
      return horizonColor.lerp(skyColor, normalizedY / 0.3);
    } else {
      return skyColor.lerp(new THREE.Color(0x000033), (normalizedY - 0.3) / 0.7);
    }
  });
  
  const sky = new THREE.Mesh(
    skyGeo,
    new THREE.MeshBasicMaterial({ 
      vertexColors: true, 
      side: THREE.BackSide, 
      fog: false 
    })
  );
  scene.add(sky);

  // Verbesserter Halo-Ring mit mehr Details
  const haloRing = new THREE.Mesh(
    new THREE.TorusGeometry(100, 5, 16, 100),
    new THREE.MeshBasicMaterial({ 
      color: 0xFFFFFF, 
      fog: false,
      transparent: true,
      opacity: 0.8
    })
  );
  haloRing.rotation.x = Math.PI / 2;
  haloRing.position.set(0, 200, -300);
  scene.add(haloRing);

  // Zusätzlicher kleinerer Ring
  const haloRingSmall = new THREE.Mesh(
    new THREE.TorusGeometry(80, 2, 12, 80),
    new THREE.MeshBasicMaterial({ 
      color: 0x8888FF, 
      fog: false,
      transparent: true,
      opacity: 0.4
    })
  );
  haloRingSmall.rotation.x = Math.PI / 2;
  haloRingSmall.position.set(50, 180, -280);
  scene.add(haloRingSmall);

  return {
    staticColliders,
    walkableMeshes,
    refs: { 
      ground, 
      roof, 
      interiorFloor, 
      sky, 
      haloRing, 
      haloRingSmall,
      particles,
      lightHelpers,
      fortressGroup
    }
  };
}