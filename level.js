import { THREE } from './deps.js';
import { randBetween } from './utils.js';

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
    staticColliders.push({ box, obj });
  };

  // Ground (20x20 with subtle hills)
  const groundGeo = new THREE.PlaneGeometry(20, 20, 32, 32);
  groundGeo.rotateX(-Math.PI / 2);
  const pos = groundGeo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    const h = Math.sin(x * 0.7) * 0.05 + Math.cos(z * 0.6) * 0.05;
    pos.setY(i, h);
  }
  pos.needsUpdate = true;
  const groundMat = new THREE.MeshStandardMaterial({ color: 0x556b2f, roughness: 0.9, metalness: 0.0 });
  const ground = new THREE.Mesh(groundGeo, groundMat);
  ground.receiveShadow = true; // *** shadows receive
  ground.name = 'ground';
  scene.add(ground);
  walkableMeshes.push(ground);

  // Fortress walls (simple box ring)
  const wallMat = new THREE.MeshStandardMaterial({ color: 0x4a4a4a, roughness: 0.85 });
  const wallThickness = 0.6;
  const wallHeight = 3.2;
  const inner = 6.0;
  const outer = inner + wallThickness;

  function ringBox(w, h, d, x, y, z) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), wallMat);
    m.position.set(x, y, z);
    m.castShadow = true;  // *** cast
    m.receiveShadow = true; // *** receive
    scene.add(m);
    addStaticCollider(m);
    return m;
  }

  // four sides
  ringBox(outer * 2, wallHeight, wallThickness, 0, wallHeight / 2, -inner);
  ringBox(outer * 2, wallHeight, wallThickness, 0, wallHeight / 2, inner);
  // gate opening on +X side
  ringBox(wallThickness, wallHeight, outer * 2, -inner, wallHeight / 2, 0);
  // right segment
  ringBox(wallThickness, wallHeight, outer * 2 - 3.0, inner, wallHeight / 2, -1.5);
  // left short pillar next to gate opening (leaves ~2m gap)
  ringBox(wallThickness, wallHeight, 2.0, inner, wallHeight / 2,  outer - 1.0);

  // Interior floor slightly raised
  const interior = new THREE.Mesh(new THREE.BoxGeometry(inner * 2, 0.2, inner * 2), new THREE.MeshStandardMaterial({ color: 0x5b5b5b, roughness: 0.9 }));
  interior.position.set(0, 0.1, 0);
  interior.receiveShadow = true;
  scene.add(interior);
  walkableMeshes.push(interior);
  addStaticCollider(interior);

  // Decorative blocks
  for (let i = 0; i < 10; i++) {
    const b = new THREE.Mesh(new THREE.BoxGeometry(0.8, randBetween(0.5, 1.4), 0.8), new THREE.MeshStandardMaterial({ color: 0x7f7f7f }));
    b.position.set(randBetween(-8, 8), b.geometry.parameters.height / 2, randBetween(-8, 8));
    b.castShadow = true; b.receiveShadow = true;
    scene.add(b);
    addStaticCollider(b);
  }

  // Sky dome (very cheap)
  const sky = new THREE.Mesh(new THREE.SphereGeometry(200, 16, 12), new THREE.MeshBasicMaterial({ color: 0x87CEEB, side: THREE.BackSide, fog: false }));
  sky.position.y = 0;
  scene.add(sky);

  // Halo ring
  const haloRing = new THREE.Mesh(new THREE.TorusGeometry(100, 5, 16, 100), new THREE.MeshBasicMaterial({ color: 0xffffff, fog: false }));
  haloRing.rotation.x = Math.PI / 2;
  haloRing.position.set(0, 200, -300);
  scene.add(haloRing);

  return { staticColliders, walkableMeshes, refs: { ground, interior, sky, haloRing } };
}
