import { THREE, GLTFLoader } from './deps.js';

export class Enemy {
  constructor(scene, position = new THREE.Vector3()) {
    this.scene = scene;
    this.hp = 3;
    this.speed = 1;
    this.mixer = null;
    this.walkAction = null;
    this.alive = true;
    this._dir = new THREE.Vector3();
    this._changeDirTimer = 0;
    
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
    this._pickDirection();
  }

  _loadModel(position) {
    const loader = new GLTFLoader();
    console.log('Attempting to load enemy model from: spartan2/assets/enemy1_walk1.glb');
    
    loader.load(
      'spartan2/assets/enemy1_walk1.glb',
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

  _pickDirection() {
    const angle = Math.random() * Math.PI * 2;
    this._dir.set(Math.cos(angle), 0, Math.sin(angle));
    this._changeDirTimer = 1 + Math.random() * 2;
  }

  update(dt) {
    if (!this.alive) return;
    
    if (this.mixer) {
      this.mixer.update(dt);
    }
    
    this._changeDirTimer -= dt;
    if (this._changeDirTimer <= 0) {
      this._pickDirection();
    }
    
    if (this.mesh) {
      const move = this._dir.clone().multiplyScalar(this.speed * dt);
      this.mesh.position.add(move);
      
      if (move.length() > 0) {
        this.mesh.lookAt(this.mesh.position.clone().add(this._dir));
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
