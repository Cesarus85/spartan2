import { THREE } from './deps.js';

export class Enemy {
  constructor(scene, player, position = new THREE.Vector3()) {
    this.scene = scene;
    this.player = player;
    this.hp = 3;
    this.speed = 1;
    this.attackRadius = 1;
    this.attackDamage = 10;
    this.attackCooldown = 1;
    this._attackTimer = 0;
    this.mesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.5, 0.5, 0.5),
      new THREE.MeshStandardMaterial({ color: 0xff0000 })
    );
    this.mesh.position.copy(position);
    this.mesh.userData.enemy = this;
    this.scene.add(this.mesh);
    this.alive = true;
  }

  update(dt) {
    if (!this.alive) return;

    const playerPos = this.player.group.position;
    const dir = playerPos.clone().sub(this.mesh.position);
    const distance = dir.length();
    if (distance > 0) {
      dir.normalize();
      const move = dir.multiplyScalar(this.speed * dt);
      this.mesh.position.add(move);
    }

    this._attackTimer -= dt;
    if (distance < this.attackRadius && this._attackTimer <= 0) {
      this.player.takeDamage(this.attackDamage);
      this._attackTimer = this.attackCooldown;
    }
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
