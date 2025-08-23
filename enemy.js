import { THREE } from './deps.js';

export class Enemy {
  constructor(scene, position = new THREE.Vector3()) {
    this.scene = scene;
    this.hp = 3;
    this.speed = 1;
    this.mesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.5, 0.5, 0.5),
      new THREE.MeshStandardMaterial({ color: 0xff0000 })
    );
    this.mesh.position.copy(position);
    this.mesh.userData.enemy = this;
    this.scene.add(this.mesh);
    this.alive = true;
    this._dir = new THREE.Vector3();
    this._changeDirTimer = 0;
    this._pickDirection();
  }

  _pickDirection() {
    const angle = Math.random() * Math.PI * 2;
    this._dir.set(Math.cos(angle), 0, Math.sin(angle));
    this._changeDirTimer = 1 + Math.random() * 2;
  }

  update(dt) {
    if (!this.alive) return;
    this._changeDirTimer -= dt;
    if (this._changeDirTimer <= 0) {
      this._pickDirection();
    }
    const move = this._dir.clone().multiplyScalar(this.speed * dt);
    this.mesh.position.add(move);
  }

  takeDamage(amount) {
    if (!this.alive) return;
    this.hp -= amount;
    if (this.hp <= 0) {
      this.alive = false;
      this.scene.remove(this.mesh);
    }
  }
}
