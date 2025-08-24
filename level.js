// level.js
import { THREE } from './deps.js';
import { makeVariedStandardMaterial, randBetween } from './utils.js';

export const FOG = {
  COLOR: 0x87CEEB,
  NEAR: 12,
  FAR: 45,
};

// Spielbereichsgrenzen (x und z Koordinaten)
export const PLAYFIELD_BOUNDS = {
  minX: -10,
  maxX: 10,
  minZ: -10,
  maxZ: 10,
};

export function buildLevel(scene) {

  // Boden-Textur laden
  const groundTex = new THREE.TextureLoader().load('./textures/floor.png');
  groundTex.wrapS = groundTex.wrapT = THREE.RepeatWrapping;
  groundTex.repeat.set(10, 10);

  // --- Licht-Setup (leicht & Quest-tauglich) ---
  const hemi = new THREE.HemisphereLight(0x9ec9ff, 0x2f1f0f, 0.55); // Himmel / Boden, weiches Ambient
  scene.add(hemi);

  const sun = new THREE.DirectionalLight(0xffffff, 0.9);
  sun.position.set(8, 12, 6);
  // sun.castShadow = false; // bewusst ohne Schatten (Budget). Wenn du magst, später low shadows einschalten.
  scene.add(sun);

  const staticColliders = [];
  const walkableMeshes  = [];

  const addStaticCollider = (obj) => {
    const box = new THREE.Box3().setFromObject(obj);
    staticColliders.push({ obj, box });
  };
  const addWalkable = (obj) => walkableMeshes.push(obj);

  // Ground
  const groundGeo = new THREE.PlaneGeometry(20, 20, 20, 20);
  groundGeo.rotateX(-Math.PI / 2);
  const verts = groundGeo.attributes.position.array;
  for (let i = 2; i < verts.length; i += 3) verts[i] += Math.random() * 0.5 - 0.25;
  groundGeo.attributes.position.needsUpdate = true;
  groundGeo.computeVertexNormals();

  const groundMat = new THREE.MeshStandardMaterial({ map: groundTex });
  groundMat.side = THREE.DoubleSide;
  const ground = new THREE.Mesh(groundGeo, groundMat);
  scene.add(ground);
  addStaticCollider(ground);
  addWalkable(ground);

  // Fortress
  const fortressGroup = new THREE.Group();
  const wallBase = makeVariedStandardMaterial(0x333333);

  const wall1Left = new THREE.Mesh(new THREE.BoxGeometry(1.5, 3, 0.5), wallBase.clone());
  wall1Left.position.set(-1.75, 1.5, 2.5);
  fortressGroup.add(wall1Left); addStaticCollider(wall1Left);

  const wall1Right = new THREE.Mesh(new THREE.BoxGeometry(1.5, 3, 0.5), wallBase.clone());
  wall1Right.position.set(1.75, 1.5, 2.5);
  fortressGroup.add(wall1Right); addStaticCollider(wall1Right);

  const lintel = new THREE.Mesh(new THREE.BoxGeometry(2, 0.5, 0.5), wallBase.clone());
  lintel.position.set(0, 2.75, 2.5);
  fortressGroup.add(lintel); addStaticCollider(lintel);

  const wallBack = new THREE.Mesh(new THREE.BoxGeometry(5, 3, 0.5), wallBase.clone());
  wallBack.position.set(0, 1.5, -2.5);
  fortressGroup.add(wallBack); addStaticCollider(wallBack);

  const wallLeft = new THREE.Mesh(new THREE.BoxGeometry(0.5, 3, 5), wallBase.clone());
  wallLeft.position.set(2.5, 1.5, 0);
  fortressGroup.add(wallLeft); addStaticCollider(wallLeft);

  const wallRight = new THREE.Mesh(new THREE.BoxGeometry(0.5, 3, 5), wallBase.clone());
  wallRight.position.set(-2.5, 1.5, 0);
  fortressGroup.add(wallRight); addStaticCollider(wallRight);

  const roof = new THREE.Mesh(new THREE.BoxGeometry(5, 0.5, 5), wallBase.clone());
  roof.position.set(0, 3.25, 0);
  fortressGroup.add(roof); addStaticCollider(roof); addWalkable(roof);

  const interiorMat = makeVariedStandardMaterial(0x7A3E12);
  const interiorFloor = new THREE.Mesh(new THREE.BoxGeometry(4, 0.1, 4), interiorMat);
  interiorFloor.position.set(0, 0.05, 0);
  fortressGroup.add(interiorFloor); addStaticCollider(interiorFloor); addWalkable(interiorFloor);

  scene.add(fortressGroup);

  // No-Spawn-Zones
  const forbiddenZones = [
    new THREE.Box3(new THREE.Vector3(-2.7, 0.0, -2.7), new THREE.Vector3(2.7, 4.5, 2.9)),
    new THREE.Box3(new THREE.Vector3(-1.2, 0.0, 1.2),  new THREE.Vector3(1.2, 3.0, 4.0)),
  ];

  const intersectsForbidden = (box) => forbiddenZones.some(f => box.intersectsBox(f));

  // Obstacles
  for (let i = 0; i < 10; i++) {
    const w = new THREE.Mesh(
      new THREE.BoxGeometry(randBetween(1, 3), randBetween(1, 3), randBetween(1, 3)),
      makeVariedStandardMaterial(0xA9A9A9)
    );

    const size = w.geometry.parameters;
    const hx = (size.width  || 1) / 2;
    const hy = (size.height || 1) / 2;
    const hz = (size.depth  || 1) / 2;

    let placed = false;
    for (let a = 0; a < 60 && !placed; a++) {
      const x = Math.random() * 20 - 10;
      const z = Math.random() * 20 - 10;
      const y = hy;
      const min = new THREE.Vector3(x - hx, 0, z - hz);
      const max = new THREE.Vector3(x + hx, y * 2, z + hz);
      const candidate = new THREE.Box3(min, max);
      if (!intersectsForbidden(candidate)) {
        w.position.set(x, y, z);
        placed = true;
      }
    }
    if (!placed) {
      w.position.set(12 + Math.random() * 6, hy, 12 + Math.random() * 6);
    }
    scene.add(w);
    addStaticCollider(w);
    addWalkable(w);
  }

  // Sky + Ring (fog ausschalten)
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(500, 32, 32),
    new THREE.MeshBasicMaterial({ color: FOG.COLOR, side: THREE.BackSide, fog: false })
  );
  scene.add(sky);

  const haloRing = new THREE.Mesh(
    new THREE.TorusGeometry(100, 5, 16, 100),
    new THREE.MeshBasicMaterial({ color: 0xFFFFFF, fog: false })
  );
  haloRing.rotation.x = Math.PI / 2;
  haloRing.position.set(0, 200, -300);
  scene.add(haloRing);

  return {
    staticColliders,
    walkableMeshes,
    refs: { ground, roof, interiorFloor, sky, haloRing }
  };
}
