import { THREE, GLTFLoader } from './deps.js';

export class Enemy {
  constructor(scene, player, position = new THREE.Vector3()) {
    this.scene = scene;
    this.player = player;
    this.hp = 3;
    this.speed = 1;
    this.mixer = null;
    this.walkAction = null;
    this.alive = true;
    this._dir = new THREE.Vector3();
    this._damageCooldown = 0;
    
    // Create placeholder mesh immediately
    this.mesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.5, 0.5, 0.5),
      new THREE.MeshStandardMaterial({ color: 0xff0000 })
    );
    this.mesh.position.copy(position);
    this.mesh.userData.enemy = this;
    this.scene.add(this.mesh);
    
    // Load GLB model asynchronously without blocking
    this._loadModel(position);
  }

  _loadModel(position) {
    const loader = new GLTFLoader();
    const modelUrl = new URL('./assets/enemy1_walk1.glb', import.meta.url).href;
    console.log('Attempting to load enemy model from:', modelUrl);

    loader.load(
      modelUrl,
      (gltf) => {
        console.log('GLB model loaded successfully:', gltf);
        
        // Remove placeholder mesh
        this.scene.remove(this.mesh);
        
        // Replace with GLB model
        this.mesh = gltf.scene;
        this.mesh.position.copy(position);
        this.mesh.userData.enemy = this;
        
        // Ensure proper scale and visibility
        this.mesh.scale.set(1, 1, 1);
        this.mesh.visible = true;
        
        this.scene.add(this.mesh);
        console.log('Enemy model added to scene');
        
        // Setup animations
        if (gltf.animations && gltf.animations.length > 0) {
          console.log('Setting up animations:', gltf.animations.length);
          this.mixer = new THREE.AnimationMixer(this.mesh);
          this.walkAction = this.mixer.clipAction(gltf.animations[0]);
          this.walkAction.play();
        }
      },
      (progress) => {
        console.log('Loading progress:', progress);
      },
      (error) => {
        console.error('Failed to load enemy model:', error);
        console.error('Error details:', error.message);
        // Keep the placeholder mesh if loading fails
      }
    );
  }

  update(dt) {
    if (!this.alive) return;

    if (this.mixer) {
      this.mixer.update(dt);
    }

    if (this.mesh && this.player) {
      const playerPos = this.player.group.position;
      this._dir.subVectors(playerPos, this.mesh.position);
      const dist = this._dir.length();
      if (dist > 0) {
        this._dir.normalize();
        const move = this._dir.clone().multiplyScalar(this.speed * dt);
        this.mesh.position.add(move);
        this.mesh.lookAt(playerPos);
      }

      if (this._damageCooldown > 0) this._damageCooldown -= dt;
      const THRESHOLD = 1.0;
      const DAMAGE = 10;
      if (dist < THRESHOLD && this._damageCooldown <= 0) {
        this.player.takeDamage(DAMAGE);
        this._damageCooldown = 1.0;
      }
    }
  }

  takeDamage(amount) {
    if (!this.alive) return;
    this.hp -= amount;
    if (this.hp <= 0) {
      this.alive = false;
      if (this.mesh) {
        this.scene.remove(this.mesh);
      }
    }
  }
}
